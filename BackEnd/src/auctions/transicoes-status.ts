import { AuctionStatus } from '../generated/prisma/client';

// Mapa central: de qual estado, para quais estados e permitido ir.
// Nada sai de CLOSED ou CANCELED (sao estados finais)
const TRANSICOES_PERMITIDAS: Record<AuctionStatus, AuctionStatus[]> = {
  DRAFT: [AuctionStatus.SCHEDULED, AuctionStatus.CANCELED],
  SCHEDULED: [AuctionStatus.OPEN, AuctionStatus.CANCELED],
  OPEN: [AuctionStatus.CLOSED, AuctionStatus.CANCELED],
  CLOSED: [],
  CANCELED: [],
};

// Confere se a transicao de um estado para outro e permitida
export function transicaoEhValida(
  statusAtual: AuctionStatus,
  statusNovo: AuctionStatus,
): boolean {
  return TRANSICOES_PERMITIDAS[statusAtual].includes(statusNovo);
}
