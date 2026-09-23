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
import { decimalParaString } from '../common/utils/decimal.util';
import {
  calcularPaginacao,
  paginar,
  type ParametrosPaginacao,
  type RespostaPaginada,
} from '../common/utils/paginacao.util';
import {
  AuctionStatus,
  AuditResult,
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
import { transicaoEhValida } from './transicoes-status';

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
  ): Promise<RespostaPaginada<Auction>> {
    const paginacao = calcularPaginacao(params);
    const where: Prisma.AuctionWhereInput = {
      vendedorId: params.vendedorId,
      status: params.status,
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
    return paginar(dados, total, paginacao);
  }

  async buscarPorId(id: string): Promise<Auction> {
    const leilao = await this.prisma.auction.findUnique({ where: { id } });
    if (!leilao) {
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

      const atualizado = await this.prisma.auction.update({
        where: { id },
        data: {
          titulo: dto.titulo,
          descricao: dto.descricao,
          dataInicio: dto.dataInicio ? new Date(dto.dataInicio) : undefined,
          dataFim: dto.dataFim ? new Date(dto.dataFim) : undefined,
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

  // Grava o novo estado + historico na mesma transacao. Usado pela mudanca
  // manual (mudarStatus) e pelo encerramento automatico por horario
  async aplicarMudancaStatus(
    leilao: Auction,
    novoStatus: AuctionStatus,
    alteradoPorId: string,
    motivo?: string,
  ): Promise<Auction> {
    const atualizado = await this.prisma.$transaction(async (tx) => {
      // Ao fechar, trava os itens ANTES de mudar o status: um lance em
      // andamento termina primeiro (ou espera e ja ve o leilao fechado),
      // entao o vencedor calculado nunca fica desatualizado
      if (novoStatus === AuctionStatus.CLOSED) {
        await tx.$queryRaw`
          SELECT id FROM "AuctionItem" WHERE "leilaoId" = ${leilao.id} FOR UPDATE
        `;
      }

      const resultado = await tx.auction.update({
        where: { id: leilao.id },
        data: { status: novoStatus },
      });

      await tx.auctionStatusHistory.create({
        data: {
          leilaoId: leilao.id,
          statusAnterior: leilao.status,
          statusNovo: novoStatus,
          alteradoPorId,
          motivo,
        },
      });

      // Ao fechar o leilao, cada item precisa de um destino: vendido (com
      // vencedor) ou nao vendido. O banco exige as duas coisas juntas
      // (CHECK "status = SOLD" <=> "vencedorId IS NOT NULL"), entao as duas
      // sao sempre gravadas no mesmo UPDATE
      if (novoStatus === AuctionStatus.CLOSED) {
        await this.definirVencedoresDosItens(tx, leilao.id);
      }

      return resultado;
    });

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
  // Para cada item: quem deu o maior lance vence (SOLD); sem nenhum lance,
  // o item fica sem vender (UNSOLD)
  private async definirVencedoresDosItens(
    tx: Prisma.TransactionClient,
    leilaoId: string,
  ): Promise<void> {
    const itens = await tx.auctionItem.findMany({ where: { leilaoId } });

    for (const item of itens) {
      if (item.lanceAtual === null) {
        await tx.auctionItem.update({
          where: { id: item.id },
          data: { status: ItemStatus.UNSOLD },
        });
        continue;
      }

      // O lance vencedor e o de maior valor (unico, gracas ao
      // @@unique([itemId, valor]) do model Bid)
      const lanceVencedor = await tx.bid.findFirst({
        where: { itemId: item.id, valor: item.lanceAtual },
      });
      // Nunca deveria acontecer (todo item com lanceAtual tem um Bid
      // correspondente) -- se acontecer, e melhor travar a transacao inteira
      // do que gravar um SOLD sem vencedor (o CHECK do banco ia recusar mesmo)
      if (!lanceVencedor) {
        throw new ConflictException(
          `Inconsistencia: item ${item.id} tem lanceAtual mas nenhum lance correspondente`,
        );
      }

      await tx.auctionItem.update({
        where: { id: item.id },
        data: {
          status: ItemStatus.SOLD,
          vencedorId: lanceVencedor.licitanteId,
        },
      });
    }
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
