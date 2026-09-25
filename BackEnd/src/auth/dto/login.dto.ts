import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { normalizarEmail } from '../../common/utils/normalizar-email.util';

// Dados exigidos para fazer login. So confere o formato; a senha em si
// e checada pelo AuthService (que compara o hash)
export class LoginDto {
  @Transform(normalizarEmail)
  @IsEmail({}, { message: 'email deve ser um e-mail valido' })
  @MaxLength(180, { message: 'email deve ter no maximo 180 caracteres' })
  email: string;

  // Precisa ser texto (um numero ou objeto quebrava o bcrypt) e tem teto de tamanho (o bcrypt so usa 72 bytes)
  @MaxLength(128, { message: 'senha deve ter no maximo 128 caracteres' })
  @IsString({ message: 'senha deve ser um texto' })
  @IsNotEmpty({ message: 'Por favor, preencha o campo senha (obrigatorio)' })
  senha: string;
}
