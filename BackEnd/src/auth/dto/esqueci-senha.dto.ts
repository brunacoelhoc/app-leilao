import { Transform } from 'class-transformer';
import { normalizarEmail } from '../../common/utils/normalizar-email.util';
import { IsEmail, MaxLength } from 'class-validator';

export class EsqueciSenhaDto {
  @Transform(normalizarEmail)
  @IsEmail({}, { message: 'email deve ser um e-mail valido' })
  @MaxLength(180, { message: 'email deve ter no maximo 180 caracteres' })
  email: string;
}
