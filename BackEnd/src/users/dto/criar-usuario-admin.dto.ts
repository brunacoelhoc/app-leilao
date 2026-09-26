import { OmitType } from '@nestjs/mapped-types';
import { IsIn, IsNotEmpty } from 'class-validator';
import { RegistrarUsuarioDto } from '../../auth/dto/registrar-usuario.dto';

// O ADMIN cria contas ja com o papel escolhido (o cadastro publico so cria BIDDER).
// ADMIN nao entra na lista de proposito: virar administrador nao se faz por aqui
// (sem "aceiteTermos": o aceite e do cadastro publico, feito pela propria pessoa)
export class CriarUsuarioAdminDto extends OmitType(RegistrarUsuarioDto, ['aceiteTermos'] as const) {
  @IsIn(['BIDDER', 'SELLER'], { message: 'papel deve ser BIDDER ou SELLER' })
  @IsNotEmpty({ message: 'papel e obrigatório' })
  papel: 'BIDDER' | 'SELLER';
}
