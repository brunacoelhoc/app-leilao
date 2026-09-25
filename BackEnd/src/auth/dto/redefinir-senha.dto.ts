import { Transform } from 'class-transformer';
import { normalizarEmail } from '../../common/utils/normalizar-email.util';
import { IsEmail, IsNotEmpty, Matches, MaxLength, MinLength } from 'class-validator';

export class RedefinirSenhaDto {
  @Transform(normalizarEmail)
  @IsEmail({}, { message: 'email deve ser um e-mail valido' })
  @MaxLength(180, { message: 'email deve ter no maximo 180 caracteres' })
  email: string;

  @Matches(/^\d{6}$/, { message: 'codigo deve ter 6 digitos' })
  @IsNotEmpty({ message: 'codigo e obrigatorio' })
  codigo: string;

  // Mesma regra de senha do cadastro (o IsNotEmpty fica por ultimo: e o primeiro a ser checado)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message: 'A senha nao segue o padrao exigido: use letra maiuscula, minuscula, numero e caractere especial',
  })
  @MinLength(8, { message: 'novaSenha deve ter no minimo 8 caracteres' })
  @IsNotEmpty({ message: 'novaSenha e obrigatoria' })
  novaSenha: string;
}
