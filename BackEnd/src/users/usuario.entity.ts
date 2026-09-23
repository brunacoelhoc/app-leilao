import { Exclude } from 'class-transformer';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import type { Role, User } from '../generated/prisma/client';

// Formato de usuario seguro para respostas da API. A senha nunca sai daqui,
// mesmo que um service esqueça de remove-la manualmente
export class UsuarioEntity implements User {
  @ApiProperty()
  id: string;

  @ApiProperty()
  nome: string;

  @ApiProperty()
  email: string;

  // @Exclude() tira a senha da RESPOSTA de verdade (via ClassSerializerInterceptor).
  // @ApiHideProperty() tira do SCHEMA do Swagger tambem -- sem ela, o campo
  // aparecia na documentacao mesmo nunca saindo na pratica (achado real)
  @Exclude()
  @ApiHideProperty()
  senha: string;

  @ApiProperty({ enum: ['BIDDER', 'SELLER', 'ADMIN'] })
  papel: Role;

  @ApiProperty()
  ativo: boolean;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;

  constructor(parcial: Partial<UsuarioEntity>) {
    Object.assign(this, parcial);
  }
}
