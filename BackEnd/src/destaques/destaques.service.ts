import { Injectable } from '@nestjs/common';
import { decimalParaString } from '../common/utils/decimal.util';
import { AuctionStatus, DocumentType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { DestaqueResposta } from './destaque-resposta.dto';

const ETIQUETA: Partial<Record<AuctionStatus, string>> = {
  [AuctionStatus.OPEN]: 'Aberto',
  [AuctionStatus.SCHEDULED]: 'Em breve',
  [AuctionStatus.CLOSED]: 'Encerrado',
};

const INCLUIR = {
  itens: {
    orderBy: { criadoEm: 'asc' },
    select: {
      id: true,
      lanceAtual: true,
      _count: { select: { lances: true } },
      documentos: {
        where: { tipo: DocumentType.PHOTO },
        orderBy: { criadoEm: 'asc' },
        take: 1,
        select: { id: true },
      },
    },
  },
} satisfies Prisma.AuctionInclude;

// 🔎 Quais leiloes aparecem no carrossel da home e em que ordem. Regra:
// 1) abertos, os que encerram primeiro; 2) em breve (agendados), os que
// abrem primeiro; 3) encerrados, os mais recentes. Rascunho e cancelado nunca
@Injectable()
export class DestaquesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(limite: number): Promise<DestaqueResposta[]> {
    const [abertos, emBreve, encerrados] = await Promise.all([
      this.prisma.auction.findMany({
        where: { status: AuctionStatus.OPEN },
        orderBy: { dataFim: 'asc' },
        take: limite,
        include: INCLUIR,
      }),
      this.prisma.auction.findMany({
        where: { status: AuctionStatus.SCHEDULED },
        orderBy: { dataInicio: 'asc' },
        take: limite,
        include: INCLUIR,
      }),
      this.prisma.auction.findMany({
        where: { status: AuctionStatus.CLOSED },
        orderBy: { dataFim: 'desc' },
        take: limite,
        include: INCLUIR,
      }),
    ]);

    return [...abertos, ...emBreve, ...encerrados].slice(0, limite).map((leilao) => {
      let maior: Prisma.Decimal | null = null;
      for (const item of leilao.itens) {
        if (item.lanceAtual && (!maior || item.lanceAtual.greaterThan(maior))) maior = item.lanceAtual;
      }
      return {
        id: leilao.id,
        titulo: leilao.titulo,
        descricao: leilao.descricao,
        status: leilao.status,
        etiqueta: ETIQUETA[leilao.status] ?? leilao.status,
        dataInicio: leilao.dataInicio,
        dataFim: leilao.dataFim,
        totalItens: leilao.itens.length,
        totalLances: leilao.itens.reduce((soma, item) => soma + item._count.lances, 0),
        maiorLance: decimalParaString(maior),
        capaDocumentoId: leilao.itens.find((item) => item.documentos.length > 0)?.documentos[0].id ?? null,
        itemUnicoId: leilao.itens.length === 1 ? leilao.itens[0].id : null,
      };
    });
  }
}
