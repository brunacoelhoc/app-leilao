import { Transform } from 'class-transformer';
import { normalizarEmail } from '../../common/utils/normalizar-email.util';
import { IsEmail, MaxLength } from 'class-validator';

export class EsqueciSenhaDto {
  @Transform(normalizarEmail)
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(180, { message: 'email deve ter no máximo 180 caracteres' })
  email: string;
}
