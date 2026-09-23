import { AuctionStatus, ItemStatus } from './models';

// So traducao pra tela -- os valores que trafegam com a API continuam
// identicos aos do backend (DRAFT, OPEN...), nunca inventamos um novo
export const ROTULO_STATUS_LEILAO: Record<AuctionStatus, string> = {
  DRAFT: 'Rascunho',
  SCHEDULED: 'Agendado',
  OPEN: 'Aberto',
  CLOSED: 'Encerrado',
  CANCELED: 'Cancelado',
};

export const ROTULO_STATUS_ITEM: Record<ItemStatus, string> = {
  AVAILABLE: 'Disponível',
  SOLD: 'Vendido',
  UNSOLD: 'Não vendido',
};

export function classeSeloLeilao(status: AuctionStatus): string {
  return `selo status-${status.toLowerCase()}`;
}

export function classeSeloItem(status: ItemStatus): string {
  return `selo status-${status.toLowerCase()}`;
}
