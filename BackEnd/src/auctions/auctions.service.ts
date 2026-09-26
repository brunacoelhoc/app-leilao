import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { capaPadrao } from '../common/utils/capa-padrao.util';
import { decimalParaString } from '../common/utils/decimal.util';
import { filtroDeLeiloesVisiveis, rascunhoOculto } from '../common/utils/visibilidade-leiloes.util';
import { camposFaltandoNoPerfil, mensagemPerfilIncompleto } from '../common/utils/perfil-completo.util';
import {
  calcularPaginacao,
  paginar,
  type ParametrosPaginacao,
  type RespostaPaginada,
} from '../common/utils/paginacao.util';
import {
  AuctionStatus,
  AuditResult,
  DocumentType,
  ItemStatus,
  Prisma,
  type Auction,
  type Role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LancesGateway } from '../realtime/lances.gateway';
import type { AtualizarAuctionDto } from './dto/atualizar-auction.dto';
import type { CriarAuctionDto } from './dto/criar-auction.dto';
import type { IndicadoresAuctionResposta } from './dto/indicadores-auction-resposta.dto';
import type { MudarStatusDto } from './dto/mudar-status.dto';
import type { ReativarAuctionDto } from './dto/reativar-auction.dto';
import { DURACAO_MAXIMA_HORAS, excedeDuracaoMaxima } from './dto/periodo-valido.validator';
import { transicaoEhValida } from './transicoes-status';

// Percentual com uma casa decimal (0 quando nao ha itens)
function percentual(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;
}

// Quando quem liderava foi desativado: o lance dele e pulado no fechamento (ver definirVencedoresDosItens)
interface SubstituicaoDeVencedor {
  itemId: string;
  valorDoLider: string;
  novoVencedorId: string | null; // null = todos os licitantes desativados (peca nao vendida)
  valorFinal: string | null;
}

@Injectable()
export class AuctionsService {
  private readonly logger = new Logger(AuctionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly lancesGateway: LancesGateway,
  ) {}

  // Cria o leilao ja como DRAFT. NAO grava linha no historico aqui: criar
  // nao e uma "mudanca de estado" (nao ha estado anterior), so o nascimento
  // do leilao. O historico so registra transicoes de verdade (mudarStatus).
  // Importante: se gravassemos aqui, o leilao ficaria "preso" para sempre
  // (o historico tem onDelete: Restrict e nunca pode ser apagado)
  async criar(
    dto: CriarAuctionDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<Auction> {
    try {
      // Regra: so cria leilao quem tem o perfil completo (telefone, CPF valido e endereco)
      const dono = await this.prisma.user.findUnique({
        where: { id: usuario.id },
        select: { telefone: true, cpf: true, endereco: true },
      });
      const faltando = dono ? camposFaltandoNoPerfil(dono) : [];
      if (faltando.length > 0) {
        throw new ForbiddenException(mensagemPerfilIncompleto(faltando, 'criar leilões'));
      }
      const leilao = await this.prisma.auction.create({
        data: {
          titulo: dto.titulo,
          descricao: dto.descricao,
          dataInicio: new Date(dto.dataInicio),
          dataFim: new Date(dto.dataFim),
          vendedorId: usuario.id,
        },
      });
      await this.registrarAuditoria(
        'LEILAO_CRIADO',
        leilao.id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        201,
      );
      return leilao;
    } catch (erro) {
      await this.registrarAuditoria(
        'LEILAO_CRIADO',
        undefined,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  // Filtro por vendedorId e a consulta por relacionamento "leiloes do vendedor".
  // "busca" procura o trecho no titulo ou na descricao (contains + insensitive)
  async listarTodos(
    params: ParametrosPaginacao & {
      vendedorId?: string;
      busca?: string;
      status?: AuctionStatus;
    },
    usuario?: UsuarioAutenticado,
  ): Promise<RespostaPaginada<Auction & { capaDocumentoId: string | null; capaPadrao: string }>> {
    const paginacao = calcularPaginacao(params);
    const where: Prisma.AuctionWhereInput = {
      vendedorId: params.vendedorId,
      status: params.status,
      AND: [filtroDeLeiloesVisiveis(usuario)],
      ...(params.busca
        ? {
            OR: [
              { titulo: { contains: params.busca, mode: 'insensitive' } },
              { descricao: { contains: params.busca, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [dados, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.auction.count({ where }),
    ]);

    // Capa do card: a primeira foto de qualquer item do leilao (uma consulta so)
    const fotos = await this.prisma.document.findMany({
      where: { tipo: DocumentType.PHOTO, item: { leilaoId: { in: dados.map((l) => l.id) } } },
      orderBy: { criadoEm: 'asc' },
      select: { id: true, item: { select: { leilaoId: true } } },
    });
    const capas = new Map<string, string>();
    for (const foto of fotos) {
      if (!capas.has(foto.item.leilaoId)) capas.set(foto.item.leilaoId, foto.id);
    }

    return paginar(
      dados.map((leilao) => ({
        ...leilao,
        capaDocumentoId: capas.get(leilao.id) ?? null,
        capaPadrao: capaPadrao(leilao.id),
      })),
      total,
      paginacao,
    );
  }

  // Quantos leiloes existem em cada status (opcionalmente so de um vendedor).
  // Alimenta os paineis: a tela nao precisa mais somar listagens
  async resumoPorStatus(vendedorId?: string, usuario?: UsuarioAutenticado): Promise<Record<AuctionStatus | 'total', number>> {
    const grupos = await this.prisma.auction.groupBy({
      by: ['status'],
      where: { vendedorId, AND: [filtroDeLeiloesVisiveis(usuario)] },
      _count: { _all: true },
    });
    const resumo = { DRAFT: 0, SCHEDULED: 0, OPEN: 0, CLOSED: 0, CANCELED: 0, total: 0 };
    for (const g of grupos) {
      resumo[g.status] = g._count._all;
      resumo.total += g._count._all;
    }
    return resumo;
  }

  // Foto de capa do leilao: a primeira foto de qualquer item dele
  async capaDoLeilao(leilaoId: string): Promise<string | null> {
    const foto = await this.prisma.document.findFirst({
      where: { tipo: DocumentType.PHOTO, item: { leilaoId } },
      orderBy: { criadoEm: 'asc' },
      select: { id: true },
    });
    return foto?.id ?? null;
  }

  async buscarPorId(id: string): Promise<Auction> {
    const leilao = await this.prisma.auction.findUnique({ where: { id } });
    if (!leilao) {
      throw new NotFoundException('Leilao nao encontrado');
    }
    return leilao;
  }

  // Para a rota PUBLICA de detalhe: o rascunho só abre para o dono e o ADMIN (os demais recebem 404).
  // As demais telas do sistema seguem usando buscarPorId (que não filtra por quem pergunta)
  async buscarVisivelPorId(id: string, usuario?: UsuarioAutenticado): Promise<Auction> {
    const leilao = await this.buscarPorId(id);
    if (rascunhoOculto(leilao, usuario)) {
      throw new NotFoundException('Leilao nao encontrado');
    }
    return leilao;
  }

  // Indicadores do dominio: resumo calculado na hora a partir dos itens/lances
  // do leilao (nao existe tabela propria para isso)
  async obterIndicadores(id: string): Promise<IndicadoresAuctionResposta> {
    await this.buscarPorId(id); // 404 se o leilao nao existir

    const itens = await this.prisma.auctionItem.findMany({
      where: { leilaoId: id },
      include: { _count: { select: { lances: true } } },
    });

    const totalLances = itens.reduce(
      (soma, item) => soma + item._count.lances,
      0,
    );
    const maiorLance = itens.reduce<Prisma.Decimal | null>((maior, item) => {
      if (!item.lanceAtual) return maior;
      return !maior || item.lanceAtual.greaterThan(maior)
        ? item.lanceAtual
        : maior;
    }, null);
    const itensVendidos = itens.filter(
      (item) => item.status === ItemStatus.SOLD,
    );
    const arrecadadoTotal = itensVendidos.reduce(
      (soma, item) => soma.plus(item.lanceAtual ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );

    return {
      totalItens: itens.length,
      totalLances,
      maiorLance: decimalParaString(maiorLance),
      itensVendidos: itensVendidos.length,
      itensNaoVendidos: itens.filter((item) => item.status === ItemStatus.UNSOLD)
        .length,
      itensDisponiveis: itens.filter(
        (item) => item.status === ItemStatus.AVAILABLE,
      ).length,
      arrecadadoTotal: decimalParaString(arrecadadoTotal)!,
      percentuais: {
        vendidos: percentual(itensVendidos.length, itens.length),
        disponiveis: percentual(itens.filter((i) => i.status === ItemStatus.AVAILABLE).length, itens.length),
        naoVendidos: percentual(itens.filter((i) => i.status === ItemStatus.UNSOLD).length, itens.length),
      },
    };
  }

  // So o dono (vendedorId) ou um ADMIN podem mexer no leilao. Isso e o que
  // impede alguem de manipular o leilao de outro so trocando o id na URL
  private garantirDono(leilao: Auction, usuario: UsuarioAutenticado): void {
    if (usuario.papel === 'ADMIN') return;
    if (leilao.vendedorId !== usuario.id) {
      throw new ForbiddenException(
        'Voce so pode gerenciar os seus proprios leiloes',
      );
    }
  }

  async atualizar(
    id: string,
    dto: AtualizarAuctionDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<Auction> {
    try {
      const leilao = await this.buscarPorId(id);
      this.garantirDono(leilao, usuario);

      // So faz sentido editar titulo/descricao/datas enquanto o leilao
      // ainda nao foi publicado (DRAFT)
      if (leilao.status !== AuctionStatus.DRAFT) {
        throw new ConflictException(
          'So e possivel editar um leilao que ainda esta em rascunho (DRAFT)',
        );
      }

      // Numa edicao parcial so uma das datas pode vir: compara com a que ja esta
      // gravada, para nunca sobrar um periodo invertido (o CHECK do banco e so a ultima defesa)
      const novoInicio = dto.dataInicio ? new Date(dto.dataInicio) : leilao.dataInicio;
      const novoFim = dto.dataFim ? new Date(dto.dataFim) : leilao.dataFim;
      if (novoFim <= novoInicio) {
        throw new ConflictException('dataFim deve ser depois de dataInicio');
      }
      if (excedeDuracaoMaxima(novoInicio, novoFim)) {
        throw new ConflictException(`O leilao pode durar no maximo ${DURACAO_MAXIMA_HORAS} horas (2 dias)`);
      }

      const atualizado = await this.prisma.auction.update({
        where: { id },
        data: {
          titulo: dto.titulo,
          descricao: dto.descricao,
          dataInicio: dto.dataInicio ? novoInicio : undefined,
          dataFim: dto.dataFim ? novoFim : undefined,
        },
      });
      await this.registrarAuditoria(
        'LEILAO_ATUALIZADO',
        id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        200,
      );
      return atualizado;
    } catch (erro) {
      await this.registrarAuditoria(
        'LEILAO_ATUALIZADO',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  // Muda o estado do leilao e grava a mudanca no historico, na mesma transacao
  async mudarStatus(
    id: string,
    dto: MudarStatusDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<Auction> {
    try {
      const leilao = await this.buscarPorId(id);
      this.garantirDono(leilao, usuario);

      if (!transicaoEhValida(leilao.status, dto.status)) {
        throw new ConflictException(
          `Nao e possivel mudar de ${leilao.status} para ${dto.status}`,
        );
      }

      await this.conferirCoerenciaDaPublicacao(leilao, dto.status);
      await this.conferirCancelamentoComLances(leilao, dto.status, usuario);

      const atualizado = await this.aplicarMudancaStatus(
        leilao,
        dto.status,
        usuario.id,
        dto.motivo,
      );

      // Auditoria FORA da transacao (que ja comitou): mudanca de estado e um
      // evento de negocio importante, vale ficar registrado independente do
      // AuctionStatusHistory (que so guarda o estado, nao o "quem"/"quando"
      // da requisicao/IP)
      await this.registrarAuditoria(
        `LEILAO_STATUS_${dto.status}`,
        id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        200,
      );
      return atualizado;
    } catch (erro) {
      await this.registrarAuditoria(
        'LEILAO_MUDANCA_STATUS_REJEITADA',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  // 🔎 Reativar um leilão cancelado (só o ADMIN, com motivo): ele volta ao estado em que estava ANTES de ser
  // cancelado (lido do histórico). Se estava aberto/agendado e o prazo já venceu, ganha mais 48h, como uma prorrogação.
  // Os itens que o cancelamento deixou indisponíveis voltam a ficar disponíveis; os lances continuam guardados
  async reativar(
    id: string,
    dto: ReativarAuctionDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<Auction> {
    try {
      const leilao = await this.buscarPorId(id);
      if (leilao.status !== AuctionStatus.CANCELED) {
        throw new ConflictException('Só é possível reativar um leilão cancelado');
      }

      // Estado anterior ao cancelamento; sem histórico (ex.: dado antigo), volta como rascunho
      const cancelamento = await this.prisma.auctionStatusHistory.findFirst({
        where: { leilaoId: id, statusNovo: AuctionStatus.CANCELED },
        orderBy: { criadoEm: 'desc' },
        select: { statusAnterior: true },
      });
      const alvo = cancelamento?.statusAnterior ?? AuctionStatus.DRAFT;

      const agora = new Date();
      const prazoVencido =
        (alvo === AuctionStatus.OPEN || alvo === AuctionStatus.SCHEDULED) && leilao.dataFim <= agora;
      const novoFim = prazoVencido ? new Date(agora.getTime() + DURACAO_MAXIMA_HORAS * 3_600_000) : leilao.dataFim;

      const atualizado = await this.prisma.$transaction(async (tx) => {
        // Mesma ordem de travas do lance e do cancelamento (itens -> leilão), para nunca haver deadlock
        await tx.$queryRaw`
          SELECT id FROM "AuctionItem" WHERE "leilaoId" = ${id} ORDER BY id FOR UPDATE
        `;
        // Troca "compare-and-swap": só reativa se ainda está cancelado (duas reativações juntas: só uma vale)
        const { count } = await tx.auction.updateMany({
          where: { id, status: AuctionStatus.CANCELED },
          data: { status: alvo, dataFim: novoFim },
        });
        if (count === 0) {
          throw new ConflictException('O leilão mudou de estado enquanto você agia; recarregue e tente de novo');
        }
        // Num leilão cancelado, todo item UNSOLD foi deixado assim pelo cancelamento
        await tx.auctionItem.updateMany({
          where: { leilaoId: id, status: ItemStatus.UNSOLD },
          data: { status: ItemStatus.AVAILABLE },
        });
        await tx.auctionStatusHistory.create({
          data: {
            leilaoId: id,
            statusAnterior: AuctionStatus.CANCELED,
            statusNovo: alvo,
            alteradoPorId: usuario.id,
            motivo: prazoVencido
              ? `Reativado: ${dto.motivo} (prazo vencido: novo fim ${novoFim.toISOString()})`
              : `Reativado: ${dto.motivo}`,
          },
        });
        return tx.auction.findUniqueOrThrow({ where: { id } });
      });

      await this.registrarAuditoria('LEILAO_REATIVADO', id, usuario, contexto, AuditResult.SUCCESS, 200, dto.motivo);

      // Tempo real: só depois do commit avisamos quem está olhando cada item (a tela busca o estado novo)
      try {
        const itens = await this.prisma.auctionItem.findMany({ where: { leilaoId: id }, select: { id: true } });
        for (const item of itens) this.lancesGateway.emitirLeilaoReativado(item.id, atualizado.dataFim.toISOString());
      } catch (erroAviso) {
        // A reativação já foi gravada: falha no aviso não pode virar erro
        this.logger.error(`Falha ao avisar reativação: ${(erroAviso as Error).message}`);
      }
      return atualizado;
    } catch (erro) {
      await this.registrarAuditoria(
        'LEILAO_REATIVACAO_REJEITADA',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  // 🔎 Cancelar um leilao ABERTO que ja recebeu lances: so o ADMIN (com motivo, auditado). Se o vendedor
  // pudesse, cancelaria quando o preco nao agrada, prejudicando quem ja deu lance. Os lances ficam
  // guardados (imutaveis); o leilao so muda de estado
  private async conferirCancelamentoComLances(
    leilao: Auction,
    novoStatus: AuctionStatus,
    usuario: UsuarioAutenticado,
  ): Promise<void> {
    if (novoStatus !== AuctionStatus.CANCELED || leilao.status !== AuctionStatus.OPEN) return;
    if (usuario.papel === 'ADMIN') return;

    const lances = await this.prisma.bid.count({ where: { item: { leilaoId: leilao.id } } });
    if (lances > 0) {
      throw new ForbiddenException(
        `Este leilao ja recebeu ${lances} lance(s) e nao pode ser cancelado pelo vendedor. Peca ao administrador (com o motivo).`,
      );
    }
  }

  // 🔎 Publicar (agendar/abrir) so faz sentido com o leilao pronto: nao se agenda um leilao
  // vazio nem um que ja deveria ter terminado (ele ficaria preso, sem nunca fechar)
  private async conferirCoerenciaDaPublicacao(
    leilao: Auction,
    novoStatus: AuctionStatus,
  ): Promise<void> {
    if (novoStatus !== AuctionStatus.SCHEDULED && novoStatus !== AuctionStatus.OPEN) return;

    if (leilao.dataFim <= new Date()) {
      throw new ConflictException('A data de fim deste leilao ja passou');
    }
    if (novoStatus === AuctionStatus.SCHEDULED) {
      const itens = await this.prisma.auctionItem.count({ where: { leilaoId: leilao.id } });
      if (itens === 0) {
        throw new ConflictException('Adicione ao menos um item antes de agendar o leilao');
      }
    }
  }

  // Grava o novo estado + historico na mesma transacao. Usado pela mudanca
  // manual (mudarStatus) e pelo encerramento automatico por horario
  async aplicarMudancaStatus(
    leilao: Auction,
    novoStatus: AuctionStatus,
    alteradoPorId: string,
    motivo?: string,
    // Encerramento por horario: so fecha se o PRAZO continua o mesmo que o robo leu (o anti-sniping pode ter estendido)
    exigirMesmoPrazo = false,
  ): Promise<Auction> {
    let substituicoes: SubstituicaoDeVencedor[] = [];
    const atualizado = await this.prisma.$transaction(async (tx) => {
      // Ao fechar, trava os itens ANTES de mudar o status: um lance em
      // andamento termina primeiro (ou espera e ja ve o leilao fechado),
      // entao o vencedor calculado nunca fica desatualizado.
      // 🔎 Ao CANCELAR tambem: o lance trava o item e depois grava no leilao (anti-sniping); se o cancelamento
      // travasse o leilao primeiro e os itens depois, as duas transacoes se esperariam (deadlock, erro 500).
      // Todo mundo trava na mesma ordem (itens -> leilao), e "ORDER BY id" mantem a ordem entre os proprios itens
      if (novoStatus === AuctionStatus.CLOSED || novoStatus === AuctionStatus.CANCELED) {
        await tx.$queryRaw`
          SELECT id FROM "AuctionItem" WHERE "leilaoId" = ${leilao.id} ORDER BY id FOR UPDATE
        `;
      }

      // 🔎 Troca "compare-and-swap": so muda se o leilao AINDA esta no estado que lemos.
      // Se outra requisicao (ou o robo de encerramento) mudou antes, nada e gravado
      // e devolvemos 409 -- assim nunca ha historico duplicado nem CANCELED depois de CLOSED
      const { count } = await tx.auction.updateMany({
        where: { id: leilao.id, status: leilao.status, ...(exigirMesmoPrazo ? { dataFim: leilao.dataFim } : {}) },
        data: { status: novoStatus },
      });
      if (count === 0) {
        throw new ConflictException('O leilao mudou de estado enquanto voce agia; recarregue e tente de novo');
      }
      const resultado = await tx.auction.findUniqueOrThrow({ where: { id: leilao.id } });

      await tx.auctionStatusHistory.create({
        data: {
          leilaoId: leilao.id,
          statusAnterior: leilao.status,
          statusNovo: novoStatus,
          alteradoPorId,
          motivo,
        },
      });

      // 🔎 Leilão cancelado: os itens ainda "disponíveis" ficam indisponíveis (UNSOLD); não faz sentido
      // mostrar "Disponível" para uma peça cujo leilão não vai acontecer
      if (novoStatus === AuctionStatus.CANCELED) {
        await tx.auctionItem.updateMany({
          where: { leilaoId: leilao.id, status: ItemStatus.AVAILABLE },
          data: { status: ItemStatus.UNSOLD },
        });
      }

      // Ao fechar o leilao, cada item precisa de um destino: vendido (com
      // vencedor) ou nao vendido. O banco exige as duas coisas juntas
      // (CHECK "status = SOLD" <=> "vencedorId IS NOT NULL"), entao as duas
      // sao sempre gravadas no mesmo UPDATE
      if (novoStatus === AuctionStatus.CLOSED) {
        substituicoes = await this.definirVencedoresDosItens(tx, leilao.id);
      }

      return resultado;
    });

    // O lider foi pulado (conta desativada): fica na auditoria, para explicar por que o vencedor nao foi quem liderava
    for (const troca of substituicoes) {
      await this.auditLogService.registrar({
        usuarioId: alteradoPorId,
        acao: 'ITEM_VENCEDOR_SUBSTITUIDO',
        entidade: 'AuctionItem',
        entidadeId: troca.itemId,
        resultado: AuditResult.SUCCESS,
        motivo: troca.novoVencedorId
          ? `Lider (lance ${troca.valorDoLider}) estava desativado: vence o proximo lance ativo (${troca.valorFinal})`
          : `Todos os licitantes estavam desativados (maior lance ${troca.valorDoLider}): peca nao vendida`,
        statusHttp: 200,
      });
    }

    // Tempo real: so depois do commit avisamos quem esta na sala de cada item
    if (novoStatus === AuctionStatus.CLOSED) {
      try {
        await this.avisarItensFinalizados(leilao.id);
      } catch (erroAviso) {
        // O fechamento ja foi gravado: falha no aviso nao pode virar erro
        this.logger.error(`Falha ao avisar itens finalizados: ${(erroAviso as Error).message}`);
      }
    }
    return atualizado;
  }

  // Envia "item-finalizado" (com o nome do ganhador) para cada item do leilao
  private async avisarItensFinalizados(leilaoId: string): Promise<void> {
    const itens = await this.prisma.auctionItem.findMany({
      where: { leilaoId },
      include: { vencedor: { select: { nome: true } } },
    });
    for (const item of itens) {
      this.lancesGateway.emitirItemFinalizado({
        itemId: item.id,
        status: item.status === ItemStatus.SOLD ? 'SOLD' : 'UNSOLD',
        vencedorId: item.vencedorId,
        vencedorNome: item.vencedor?.nome ?? null,
        valorFinal: decimalParaString(item.lanceAtual),
      });
    }
  }

  // So chamado de dentro da transacao de mudarStatus, ao fechar o leilao.
  // 🔎 Para cada item: vence o MAIOR lance de uma conta ATIVA (SOLD). Se quem liderava foi desativado, o
  // lance dele e pulado e a peca vai para o proximo maior lance ativo, pelo valor desse lance. Sem nenhum
  // lance ativo (ou sem lances), o item fica sem vender (UNSOLD). Devolve as trocas, para auditar depois do commit
  private async definirVencedoresDosItens(
    tx: Prisma.TransactionClient,
    leilaoId: string,
  ): Promise<SubstituicaoDeVencedor[]> {
    const itens = await tx.auctionItem.findMany({ where: { leilaoId } });
    const substituicoes: SubstituicaoDeVencedor[] = [];

    for (const item of itens) {
      if (item.lanceAtual === null) {
        await tx.auctionItem.update({
          where: { id: item.id },
          data: { status: ItemStatus.UNSOLD },
        });
        continue;
      }

      // Do maior para o menor (o valor e unico por item, gracas ao @@unique([itemId, valor]) do model Bid)
      const lances = await tx.bid.findMany({
        where: { itemId: item.id },
        orderBy: { valor: 'desc' },
        include: { licitante: { select: { ativo: true } } },
      });
      // Nunca deveria acontecer (todo item com lanceAtual tem um Bid correspondente) -- se acontecer,
      // e melhor travar a transacao inteira do que gravar um SOLD sem vencedor
      if (lances.length === 0) {
        throw new ConflictException(
          `Inconsistencia: item ${item.id} tem lanceAtual mas nenhum lance correspondente`,
        );
      }

      const vencedor = lances.find((l) => l.licitante.ativo);
      const lider = lances[0];

      if (!vencedor) {
        // Todos os licitantes foram desativados: ninguem pode levar a peca
        await tx.auctionItem.update({ where: { id: item.id }, data: { status: ItemStatus.UNSOLD } });
        substituicoes.push({ itemId: item.id, valorDoLider: lider.valor.toString(), novoVencedorId: null, valorFinal: null });
        continue;
      }

      await tx.auctionItem.update({
        where: { id: item.id },
        data: {
          status: ItemStatus.SOLD,
          vencedorId: vencedor.licitanteId,
          // O valor final e o do lance vencedor (pode ser menor que o do lider desativado)
          lanceAtual: vencedor.valor,
        },
      });
      if (vencedor.id !== lider.id) {
        substituicoes.push({
          itemId: item.id,
          valorDoLider: lider.valor.toString(),
          novoVencedorId: vencedor.licitanteId,
          valorFinal: vencedor.valor.toString(),
        });
      }
    }
    return substituicoes;
  }

  async remover(
    id: string,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<void> {
    try {
      const leilao = await this.buscarPorId(id);
      this.garantirDono(leilao, usuario);

      // Nunca apagar um leilao que ja saiu do rascunho (pode ter itens/lances)
      if (leilao.status !== AuctionStatus.DRAFT) {
        throw new ConflictException(
          'So e possivel remover um leilao que ainda esta em rascunho (DRAFT)',
        );
      }

      await this.prisma.auction.delete({ where: { id } });
      await this.registrarAuditoria(
        'LEILAO_REMOVIDO',
        id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        204,
      );
    } catch (erro) {
      await this.registrarAuditoria(
        'LEILAO_REMOVIDO',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  private statusDoErro(erro: unknown): number {
    return erro instanceof HttpException ? erro.getStatus() : 500;
  }

  private motivoDoErro(erro: unknown): string {
    return erro instanceof HttpException
      ? erro.message
      : 'Erro interno ao processar o leilao';
  }

  private registrarAuditoria(
    acao: string,
    leilaoId: string | undefined,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
    resultado: AuditResult,
    statusHttp: number,
    motivo?: string,
  ): Promise<void> {
    return this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel as Role,
      acao,
      entidade: 'Auction',
      entidadeId: leilaoId,
      resultado,
      motivo,
      statusHttp,
      ...contexto,
    });
  }
}
