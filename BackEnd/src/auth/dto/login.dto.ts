import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

// Dados exigidos para fazer login. So confere o formato; a senha em si
// e checada pelo AuthService (que compara o hash)
export class LoginDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'email deve ser um e-mail valido' })
  email: string;

  @IsNotEmpty({ message: 'Por favor, preencha o campo senha (obrigatorio)' })
  senha: string;
}
