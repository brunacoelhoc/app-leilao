import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/client';

export const CHAVE_PAPEIS = 'papeis';

// Marca quais papeis podem acessar a rota (usa o mesmo enum Role do Prisma)
export const Roles = (...papeis: Role[]) => SetMetadata(CHAVE_PAPEIS, papeis);
