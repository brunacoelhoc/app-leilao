import { Transform } from 'class-transformer';
import { normalizarEmail } from '../../common/utils/normalizar-email.util';
import { aparar } from '../../common/utils/aparar-texto.util';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Dados exigidos para criar uma conta. Note que NAO tem campo "papel":
// toda conta criada por aqui nasce como BIDDER (regra fica no AuthService)
export class RegistrarUsuarioDto {
  @Transform(aparar)
  @IsString({ message: 'nome deve ser um texto' })
  @MinLength(3, { message: 'nome deve ter no mínimo 3 caracteres' })
  @MaxLength(120, { message: 'nome deve ter no máximo 120 caracteres' })
  nome: string;

  // Tira espacos e deixa minusculo, para "Ana@X.com" e "ana@x.com" serem o mesmo usuario
  @Transform(normalizarEmail)
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(180, { message: 'email deve ter no máximo 180 caracteres' })
  email: string;

  // ATENCAO: com "stopAtFirstError" ligado, os decorators sao conferidos de
  // baixo para cima. Por isso o IsNotEmpty (obrigatorio) fica por ultimo,
  // para ser o primeiro a ser checado
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'A senha não segue o padrão exigido: use letra maiúscula, minúscula, número e caractere especial',
  })
  @MinLength(8, { message: 'senha deve ter no mínimo 8 caracteres' })
  @IsNotEmpty({ message: 'Por favor, preencha o campo senha (obrigatório)' })
  senha: string;

  // O aceite dos termos e regra do servidor (que grava a data): a tela so envia a caixa marcada
  @Equals(true, { message: 'É preciso aceitar os termos de uso para criar a conta' })
  @IsBoolean({ message: 'aceiteTermos deve ser verdadeiro ou falso' })
  aceiteTermos: boolean;
}
