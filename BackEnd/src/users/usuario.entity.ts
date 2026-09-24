import { Exclude } from 'class-transformer';
import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({ nullable: true, example: '11987654321', description: 'So numeros, com DDD' })
  telefone: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Rua das Antiguidades, 120 - Sao Paulo/SP' })
  endereco: string | null;

  @ApiPropertyOptional({ nullable: true, example: '12345678900', description: 'So numeros (11 digitos)' })
  cpf: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Identificador de um avatar pronto, ou uma imagem pequena em base64' })
  avatarUrl: string | null;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;

  constructor(parcial: Partial<UsuarioEntity>) {
    Object.assign(this, parcial);
  }
}
