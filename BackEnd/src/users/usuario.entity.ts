import { Exclude } from 'class-transformer';
import type { Role, User } from '../generated/prisma/client';

// Formato de usuario seguro para respostas da API. A senha nunca sai daqui,
// mesmo que um service esqueça de remove-la manualmente
export class UsuarioEntity implements User {
  id: string;
  nome: string;
  email: string;

  @Exclude()
  senha: string;

  papel: Role;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;

  constructor(parcial: Partial<UsuarioEntity>) {
    Object.assign(this, parcial);
  }
}
