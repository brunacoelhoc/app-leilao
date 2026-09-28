import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { RegistrarUsuarioDto } from '../../auth/dto/registrar-usuario.dto';

// O ADMIN cria contas ja com o papel escolhido (o cadastro publico so cria BIDDER).
// ADMIN nao entra na lista de proposito: virar administrador nao se faz por aqui
// (sem "aceiteTermos": o aceite e do cadastro publico, feito pela propria pessoa)
//
// 🔎 telefone/endereco/cpf/avatarUrl sao opcionais e iguais aos do PATCH /users/me
// (AtualizarPerfilDto): permitem o ADMIN ja entregar o perfil completo na criacao,
// sem precisar de um PATCH /users/me depois (util pra demonstracao no Swagger)
export class CriarUsuarioAdminDto extends OmitType(RegistrarUsuarioDto, ['aceiteTermos'] as const) {
  @ApiProperty({ example: 'SELLER', enum: ['BIDDER', 'SELLER'] })
  @IsIn(['BIDDER', 'SELLER'], { message: 'papel deve ser BIDDER ou SELLER' })
  @IsNotEmpty({ message: 'papel e obrigatório' })
  papel: 'BIDDER' | 'SELLER';

  @ApiProperty({ example: '11987654321', description: '10 ou 11 dígitos numéricos (com DDD), sem formatação', required: false })
  @IsOptional()
  @Matches(/^\d{10,11}$/, { message: 'telefone deve ter 10 ou 11 dígitos numéricos (com DDD)' })
  telefone?: string;

  @ApiProperty({ example: 'Rua das Flores, 123 - São Paulo/SP', required: false })
  @IsOptional()
  @IsString({ message: 'endereço deve ser um texto' })
  @MaxLength(200, { message: 'endereço deve ter no máximo 200 caracteres' })
  endereco?: string;

  @ApiProperty({ example: '12345678909', description: 'Exatamente 11 dígitos numéricos, sem formatação', required: false })
  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'cpf deve ter exatamente 11 dígitos numéricos' })
  cpf?: string;

  @ApiProperty({ example: 'coruja', description: 'Identificador de um avatar pronto (ex.: "coruja") ou uma imagem em base64', required: false })
  @IsOptional()
  @IsString({ message: 'avatarUrl deve ser um texto' })
  @MaxLength(300_000, { message: 'avatarUrl é grande demais' })
  avatarUrl?: string;
}
