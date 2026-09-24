import { Exclude } from 'class-transformer';
import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { camposFaltandoDaConta } from '../common/utils/perfil-completo.util';
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

  @ApiPropertyOptional({ nullable: true, description: 'Quando aceitou os termos de uso (null em contas criadas pelo ADMIN)' })
  termosAceitosEm: Date | null;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;

  @ApiProperty({
    type: [String],
    example: ['telefone', 'CPF', 'endereço'],
    description: 'O que falta no perfil para dar lances e criar leiloes (vazio = perfil completo). Calculado pelo servidor',
  })
  camposFaltando: string[];

  constructor(parcial: Partial<UsuarioEntity>) {
    Object.assign(this, parcial);
    // Na listagem mascarada o chamador ja manda o valor calculado com os dados reais
    this.camposFaltando = parcial.camposFaltando ?? camposFaltandoDaConta(this);
  }
}
