import {
  ConflictException,
  HttpException,
  Injectable,
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
  type Bid,
  type Role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { BidResposta } from './dto/bid-resposta.dto';
import type { CriarBidDto } from './dto/criar-bid.dto';

function paraResposta(bid: Bid): BidResposta {
  return {
    ...bid,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async darLance(
    itemId: string,
    dto: CriarBidDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<BidResposta> {
    try {
      const bid = await this.prisma.$transaction(async (tx) => {
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

        // Regra obrigatoria: vendedor nao lanca no proprio item
        if (leilao.vendedorId === usuario.id) {
          throw new ConflictException(
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
        const minimoAceito = item.lanceAtual
          ? item.lanceAtual.plus(item.incrementoMinimo)
          : item.precoInicial;
        if (minimoAceito.greaterThan(dto.valor)) {
          throw new ConflictException(
            `O lance deve ser de pelo menos ${minimoAceito.toString()}`,
          );
        }

        await tx.auctionItem.update({
          where: { id: itemId },
          data: { lanceAtual: dto.valor },
        });

        return tx.bid.create({
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

      return paraResposta(bid);
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
        orderBy: { valor: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.bid.count({ where: { itemId } }),
    ]);
    return paginar(lances.map(paraResposta), total, paginacao);
  }

  // Consulta por relacionamento: os lances do proprio usuario logado
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
