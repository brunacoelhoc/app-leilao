import { AuctionStatus, type Prisma } from '../../generated/prisma/client';
import type { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';

// 🔎 Leilão cancelado não aparece nas listas dos compradores nem de visitantes:
// só o ADMIN (vê todos) e o próprio vendedor (vê os dele) enxergam os cancelados.
// Devolve o filtro do Prisma para ser combinado (AND) com os demais filtros da lista
export function filtroDeLeiloesVisiveis(usuario?: UsuarioAutenticado): Prisma.AuctionWhereInput {
  if (usuario?.papel === 'ADMIN') return {};
  if (!usuario) return { status: { not: AuctionStatus.CANCELED } };
  return { OR: [{ status: { not: AuctionStatus.CANCELED } }, { vendedorId: usuario.id }] };
}
