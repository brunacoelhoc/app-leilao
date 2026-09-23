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

// Quais estados sao permitidos a partir de um estado. A API devolve isso em
// cada leilao ("transicoesPermitidas") para o front so mostrar os botoes,
// sem precisar conhecer a maquina de estados
export function proximosStatus(statusAtual: AuctionStatus): AuctionStatus[] {
  return TRANSICOES_PERMITIDAS[statusAtual];
}
