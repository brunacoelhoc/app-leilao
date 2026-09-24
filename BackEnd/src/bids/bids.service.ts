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
  type Bid,
  type Role,
} from '../generated/prisma/client';
import { calcularLanceMinimo, lancesSugeridosDe } from '../auction-items/situacao-item';
import { PrismaService } from '../prisma/prisma.service';
import { LancesGateway } from '../realtime/lances.gateway';
import type { BidResposta } from './dto/bid-resposta.dto';
import type { MinhaPecaResposta, MinhasPecasResposta } from './dto/minha-peca-resposta.dto';
import type { MinhaSituacaoResposta } from './dto/minha-situacao-resposta.dto';
import type { CriarBidDto } from './dto/criar-bid.dto';

function paraResposta(
  bid: Bid & { licitante?: { nome: string } },
): BidResposta {
  // "licitante" (objeto) nao sai na resposta: so o nome
  const { licitante, ...dados } = bid;
  return {
    ...dados,
    ...(licitante ? { licitanteNome: licitante.nome } : {}),
    valor: decimalParaString(bid.valor)!,
    lanceAnterior: decimalParaString(bid.lanceAnterior),
  };
}

// So os campos que precisamos da linha travada (SELECT ... FOR UPDATE)
interface ItemTravado {
  precoInicial: Prisma.Decimal;
  incrementoMinimo: Prisma.Decimal;
  lanceAtual: Prisma.Decimal | null;
  status: ItemStatus;
  leilaoId: string;
}

@Injectable()
export class BidsService {
  private readonly logger = new Logger(BidsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly lancesGateway: LancesGateway,
  ) {}

  async darLance(
    itemId: string,
    dto: CriarBidDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<BidResposta> {
    try {
      const { bid, proximoMinimo, incremento } = await this.prisma.$transaction(async (tx) => {
        // Trava a linha do item ate o fim desta transacao: um lance
        // concorrente no MESMO item espera aqui, e so ve o valor ja atualizado
        // (evita dois lances "vencerem" ao mesmo tempo)
        const linhas = await tx.$queryRaw<ItemTravado[]>`
          SELECT "precoInicial", "incrementoMinimo", "lanceAtual", status, "leilaoId"
          FROM "AuctionItem" WHERE id = ${itemId} FOR UPDATE
        `;
        const item = linhas[0];
        if (!item) {
          throw new NotFoundException('Item nao encontrado');
        }

        const leilao = await tx.auction.findUnique({
          where: { id: item.leilaoId },
        });
        if (!leilao) {
          throw new NotFoundException('Leilao nao encontrado');
        }

        // 🔎 Regra obrigatoria: NINGUEM lanca no proprio leilao, seja qual for o papel
        // (uma mesma conta pode comprar e vender, mas nunca nos seus proprios itens)
        if (leilao.vendedorId === usuario.id) {
          throw new ForbiddenException(
            'Voce nao pode dar lance no seu proprio item',
          );
        }

        // Regra obrigatoria: lance so dentro do periodo. Conferimos o status
        // E as datas -- nunca confiamos so no status gravado
        if (leilao.status !== AuctionStatus.OPEN) {
          throw new ConflictException(
            'Este leilao nao esta aberto para lances',
          );
        }
        const agora = new Date();
        if (agora < leilao.dataInicio || agora > leilao.dataFim) {
          throw new ConflictException('Fora do periodo do leilao');
        }

        if (item.status !== ItemStatus.AVAILABLE) {
          throw new ConflictException(
            'Este item nao esta disponivel para lances',
          );
        }

        // Regra obrigatoria: supera o lance atual + incremento (ou o preco
        // inicial, se ainda nao houver lance)
        const minimoAceito = calcularLanceMinimo(item);
        if (minimoAceito.greaterThan(dto.valor)) {
          throw new ConflictException(
            `O lance deve ser de pelo menos ${minimoAceito.toString()}`,
          );
        }

        await tx.auctionItem.update({
          where: { id: itemId },
          data: { lanceAtual: dto.valor },
        });

        const criado = await tx.bid.create({
          data: {
            valor: dto.valor,
            lanceAnterior: item.lanceAtual,
            itemId,
            licitanteId: usuario.id,
            ipOrigem: contexto.ipOrigem,
            userAgent: contexto.userAgent,
            idRequisicao: contexto.idRequisicao,
          },
        });
        // Depois deste lance, o proximo precisa superar ele + incremento
        return {
          bid: criado,
          proximoMinimo: new Prisma.Decimal(dto.valor).plus(
            item.incrementoMinimo,
          ),
          incremento: item.incrementoMinimo,
        };
      });

      // Sucesso: audita FORA da transacao (que ja foi commitada). Se a
      // auditoria fosse gravada DENTRO da transacao de uma rejeicao, ela
      // seria desfeita junto com o resto quando a excecao fosse lancada
      await this.auditLogService.registrar({
        usuarioId: usuario.id,
        papel: usuario.papel as Role,
        acao: 'LANCE_CRIADO',
        entidade: 'AuctionItem',
        entidadeId: itemId,
        resultado: AuditResult.SUCCESS,
        statusHttp: 201,
        ...contexto,
      });

      // Tempo real: avisa quem esta vendo este item (nao pode derrubar o lance se falhar)
      const resposta = paraResposta(bid);
      try {
        const licitante = await this.prisma.user.findUnique({
          where: { id: usuario.id },
          select: { nome: true },
        });
        this.lancesGateway.emitirLanceNovo(itemId, {
          lance: resposta,
          licitanteNome: licitante?.nome ?? 'Licitante',
          lanceAtual: resposta.valor,
          lanceMinimo: proximoMinimo.toString(),
          lancesSugeridos: lancesSugeridosDe(proximoMinimo, incremento),
        });
      } catch (erroAviso) {
        // O lance ja foi gravado: falha no aviso nao pode virar erro para quem lancou
        this.logger.error(`Falha ao avisar lance em tempo real: ${(erroAviso as Error).message}`);
      }

      return resposta;
    } catch (erro) {
      // Qualquer rejeicao (item/leilao inexistente, dono, fora do periodo,
      // valor abaixo do minimo...): audita FORA de qualquer transacao,
      // porque a transacao de negocio ja foi desfeita
      if (erro instanceof HttpException) {
        await this.auditLogService.registrar({
          usuarioId: usuario.id,
          papel: usuario.papel as Role,
          acao: 'LANCE_REJEITADO',
          entidade: 'AuctionItem',
          entidadeId: itemId,
          resultado: AuditResult.REJECTED,
          motivo: erro.message,
          statusHttp: erro.getStatus(),
          ...contexto,
        });
      }
      throw erro;
    }
  }

  // Consulta por relacionamento: lances de um item, do maior para o menor
  async listarPorItem(
    itemId: string,
    params: ParametrosPaginacao,
  ): Promise<RespostaPaginada<BidResposta>> {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id: itemId },
    });
    if (!item) {
      throw new NotFoundException('Item nao encontrado');
    }

    const paginacao = calcularPaginacao(params);
    const [lances, total] = await Promise.all([
      this.prisma.bid.findMany({
        where: { itemId },
        include: { licitante: { select: { nome: true } } },
        orderBy: { valor: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.bid.count({ where: { itemId } }),
    ]);
    return paginar(lances.map(paraResposta), total, paginacao);
  }

  // Consulta por relacionamento: os lances do proprio usuario logado
  // 🔎 Tela "Meus lances": um resumo por PECA (nao por lance). A situacao de cada peca
  // (arrematei, liderando, superado, perdi) e decidida aqui; a tela so exibe
  async minhasPecas(usuarioId: string): Promise<MinhasPecasResposta> {
    const lances = await this.prisma.bid.findMany({
      where: { licitanteId: usuarioId },
      orderBy: { criadoEm: 'desc' },
      take: 500,
      include: {
        item: {
          include: {
            documentos: { where: { tipo: DocumentType.PHOTO }, orderBy: { criadoEm: 'asc' }, take: 1, select: { id: true } },
            leilao: {
              select: {
                id: true,
                titulo: true,
                status: true,
                dataInicio: true,
                dataFim: true,
                historico: { where: { statusNovo: AuctionStatus.CLOSED }, orderBy: { criadoEm: 'asc' }, take: 1, select: { criadoEm: true } },
              },
            },
          },
        },
      },
    });

    const porItem = new Map<string, typeof lances>();
    for (const lance of lances) {
      const lista = porItem.get(lance.itemId) ?? [];
      lista.push(lance);
      porItem.set(lance.itemId, lista);
    }

    const resultado: MinhaPecaResposta[] = [];
    for (const grupo of porItem.values()) {
      const { item } = grupo[0];
      const leilao = item.leilao;
      const maior = grupo.reduce((m, l) => (l.valor.greaterThan(m.valor) ? l : m));

      let situacaoDoLance: MinhaPecaResposta['situacaoDoLance'];
      if (item.status === ItemStatus.SOLD) {
        situacaoDoLance = item.vencedorId === usuarioId ? 'VENCEDOR' : 'PERDIDO';
      } else if (leilao.status === AuctionStatus.CANCELED) {
        situacaoDoLance = 'CANCELADO';
      } else {
        situacaoDoLance = item.lanceAtual && maior.valor.equals(item.lanceAtual) ? 'LIDERANDO' : 'SUPERADO';
      }

      // Hora da aquisicao = fim do leilao (o que vier primeiro: fechamento manual ou prazo)
      const fechouEm = leilao.historico[0]?.criadoEm;
      const adquiridoEm =
        situacaoDoLance === 'VENCEDOR' ? (fechouEm && fechouEm < leilao.dataFim ? fechouEm : leilao.dataFim) : null;

      const aba: MinhaPecaResposta['grupo'] =
        situacaoDoLance === 'VENCEDOR' ? 'ADQUIRIDAS' : situacaoDoLance === 'LIDERANDO' || situacaoDoLance === 'SUPERADO' ? 'EM_DISPUTA' : 'ENCERRADAS';

      resultado.push({
        grupo: aba,
        item: {
          id: item.id,
          titulo: item.titulo,
          descricao: item.descricao,
          leilaoTitulo: leilao.titulo,
          leilaoId: leilao.id,
          lanceAtual: decimalParaString(item.lanceAtual),
          capaDocumentoId: item.documentos[0]?.id ?? null,
          capaPadrao: capaPadrao(item.id),
        },
        meuMaiorLance: maior.valor.toFixed(2),
        totalMeusLances: grupo.length,
        ultimoLanceEm: grupo[0].criadoEm,
        situacaoDoLance,
        adquiridoEm,
        valorAquisicao: situacaoDoLance === 'VENCEDOR' ? decimalParaString(item.lanceAtual) : null,
      });
    }

    // Resumo da colecao: as contas ficam aqui (dinheiro em Decimal, nunca number)
    const totalInvestido = resultado
      .filter((p) => p.grupo === 'ADQUIRIDAS')
      .reduce((soma, p) => soma.plus(new Prisma.Decimal(p.valorAquisicao ?? 0)), new Prisma.Decimal(0));
    return {
      resumo: {
        adquiridas: resultado.filter((p) => p.grupo === 'ADQUIRIDAS').length,
        emDisputa: resultado.filter((p) => p.grupo === 'EM_DISPUTA').length,
        encerradas: resultado.filter((p) => p.grupo === 'ENCERRADAS').length,
        liderando: resultado.filter((p) => p.situacaoDoLance === 'LIDERANDO').length,
        disputadas: resultado.length,
        totalInvestido: totalInvestido.toFixed(2),
      },
      pecas: resultado,
    };
  }

  // 🔎 "Posso dar lance nesta peca?": as MESMAS regras do darLance (papel, dono, leilao aberto e
  // dentro do periodo, peca disponivel), so que respondidas antes, para a tela nao ter que adivinhar
  async minhaSituacao(itemId: string, usuario: UsuarioAutenticado): Promise<MinhaSituacaoResposta> {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id: itemId },
      include: { leilao: { select: { vendedorId: true, status: true, dataInicio: true, dataFim: true } } },
    });
    if (!item) throw new NotFoundException('Item nao encontrado');

    const euSouDono = item.leilao.vendedorId === usuario.id;
    const euSouVencedor = item.vencedorId === usuario.id;
    const agora = new Date();

    let motivo: MinhaSituacaoResposta['motivo'] = null;
    let mensagem: string | null = null;
    if (usuario.papel === 'ADMIN') {
      motivo = 'ADMIN';
      mensagem = 'Administradores moderam a plataforma e não dão lances.';
    } else if (euSouDono) {
      motivo = 'DONO';
      mensagem = 'Você é o dono deste leilão e não pode dar lances nele.';
    } else if (item.leilao.status !== AuctionStatus.OPEN || agora < item.leilao.dataInicio || agora >= item.leilao.dataFim) {
      motivo = 'LEILAO_FECHADO';
      mensagem = 'Este leilão não está recebendo lances agora.';
    } else if (item.status !== ItemStatus.AVAILABLE) {
      motivo = 'ITEM_INDISPONIVEL';
      mensagem = 'Esta peça não está mais disponível.';
    }
    return { permitido: motivo === null, motivo, mensagem, euSouDono, euSouVencedor };
  }

  async listarMeusLances(
    usuarioId: string,
    params: ParametrosPaginacao,
  ): Promise<RespostaPaginada<BidResposta>> {
    const paginacao = calcularPaginacao(params);
    const [lances, total] = await Promise.all([
      this.prisma.bid.findMany({
        where: { licitanteId: usuarioId },
        orderBy: { criadoEm: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.bid.count({ where: { licitanteId: usuarioId } }),
    ]);
    return paginar(lances.map(paraResposta), total, paginacao);
  }
}
