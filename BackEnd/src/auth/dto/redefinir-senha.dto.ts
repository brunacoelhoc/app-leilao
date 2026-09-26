import { Transform } from 'class-transformer';
import { normalizarEmail } from '../../common/utils/normalizar-email.util';
import { IsEmail, IsNotEmpty, Matches, MaxLength, MinLength } from 'class-validator';

export class RedefinirSenhaDto {
  @Transform(normalizarEmail)
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(180, { message: 'email deve ter no máximo 180 caracteres' })
  email: string;

  @Matches(/^\d{6}$/, { message: 'código deve ter 6 dígitos' })
  @IsNotEmpty({ message: 'código e obrigatório' })
  codigo: string;

  // Mesma regra de senha do cadastro (o IsNotEmpty fica por ultimo: e o primeiro a ser checado)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'A senha não segue o padrão exigido: use letra maiúscula, minúscula, número e caractere especial',
  })
  @MinLength(8, { message: 'novaSenha deve ter no mínimo 8 caracteres' })
  @IsNotEmpty({ message: 'novaSenha e obrigatória' })
  novaSenha: string;
}
