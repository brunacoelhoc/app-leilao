import { AuctionStatus, type Prisma } from '../../generated/prisma/client';
import type { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';

// Leilão em RASCUNHO (ainda em montagem) e CANCELADO não aparecem nas listas dos compradores nem de visitantes:
// só o ADMIN (vê todos) e o próprio vendedor (vê os dele) enxergam esses dois estados.
const ESTADOS_RESTRITOS = [AuctionStatus.CANCELED, AuctionStatus.DRAFT];

// Devolve o filtro do Prisma para ser combinado (AND) com os demais filtros da lista
export function filtroDeLeiloesVisiveis(usuario?: UsuarioAutenticado): Prisma.AuctionWhereInput {
  if (usuario?.papel === 'ADMIN') return {};
  if (!usuario) return { status: { notIn: ESTADOS_RESTRITOS } };
  return { OR: [{ status: { notIn: ESTADOS_RESTRITOS } }, { vendedorId: usuario.id }] };
}

// Pelo link direto: o rascunho é privado (só o dono e o ADMIN abrem; os demais recebem 404, como se não existisse).
// O cancelado continua abrindo, mostrando "Cancelado" (quem já deu lance precisa ver o que houve)
export function rascunhoOculto(leilao: { status: AuctionStatus; vendedorId: string }, usuario?: UsuarioAutenticado): boolean {
  if (leilao.status !== AuctionStatus.DRAFT) return false;
  return !(usuario?.papel === 'ADMIN' || usuario?.id === leilao.vendedorId);
}
