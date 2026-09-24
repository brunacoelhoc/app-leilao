import {
  AuctionStatus,
  ItemStatus,
  Prisma,
} from '../generated/prisma/client';

// 🔎 Situacao do lote para a tela. E REGRA DE NEGOCIO, por isso mora aqui no
// backend: o front so exibe o que esta neste valor
export type SituacaoItem =
  | 'EM_BREVE' // leilao ainda nao abriu
  | 'ABERTO' // recebendo lances
  | 'ENCERRANDO' // o prazo acabou e o servidor esta apurando o vencedor
  | 'VENDIDO'
  | 'NAO_VENDIDO'
  | 'CANCELADO';

interface DadosLeilao {
  status: AuctionStatus;
  dataInicio: Date;
  dataFim: Date;
}

// Menor lance aceito agora: preco inicial (sem lances) ou lance atual + incremento
export function calcularLanceMinimo(item: {
  precoInicial: Prisma.Decimal;
  incrementoMinimo: Prisma.Decimal;
  lanceAtual: Prisma.Decimal | null;
}): Prisma.Decimal {
  return item.lanceAtual
    ? item.lanceAtual.plus(item.incrementoMinimo)
    : item.precoInicial;
}

// Atalhos de lance para a tela: o minimo aceito e mais 1, 2 e 5 incrementos
export function lancesSugeridosDe(
  minimo: Prisma.Decimal,
  incremento: Prisma.Decimal,
): string[] {
  return [0, 1, 2, 5].map((n) => minimo.plus(incremento.times(n)).toFixed(2));
}

export function calcularSituacao(
  itemStatus: ItemStatus,
  leilao: DadosLeilao | undefined,
  agora: Date,
): { situacao: SituacaoItem; segundosParaMudanca: number | null } {
  if (itemStatus === ItemStatus.SOLD) {
    return { situacao: 'VENDIDO', segundosParaMudanca: null };
  }
  if (itemStatus === ItemStatus.UNSOLD) {
    return { situacao: 'NAO_VENDIDO', segundosParaMudanca: null };
  }
  if (!leilao || leilao.status === AuctionStatus.CLOSED) {
    // Sem leilao carregado (item recem criado) ou leilao fechado sem item apurado
    return { situacao: 'EM_BREVE', segundosParaMudanca: null };
  }
  if (leilao.status === AuctionStatus.CANCELED) {
    return { situacao: 'CANCELADO', segundosParaMudanca: null };
  }

  const segundosAte = (data: Date) =>
    Math.max(0, Math.ceil((data.getTime() - agora.getTime()) / 1000));

  if (leilao.status === AuctionStatus.OPEN) {
    if (agora >= leilao.dataFim) {
      return { situacao: 'ENCERRANDO', segundosParaMudanca: null };
    }
    if (agora >= leilao.dataInicio) {
      return {
        situacao: 'ABERTO',
        segundosParaMudanca: segundosAte(leilao.dataFim),
      };
    }
  }
  // DRAFT/SCHEDULED (ou OPEN antes da dataInicio): conta ate a abertura
  return {
    situacao: 'EM_BREVE',
    segundosParaMudanca: segundosAte(leilao.dataInicio),
  };
}
