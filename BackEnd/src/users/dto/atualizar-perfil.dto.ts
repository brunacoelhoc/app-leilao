import { Transform } from 'class-transformer';
import { aparar } from '../../common/utils/aparar-texto.util';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { normalizarEmail } from '../../common/utils/normalizar-email.util';

// Autoedicao do proprio perfil (PATCH /users/me). Nunca inclui "papel" nem
// "ativo" -- ninguem se promove ou reativa sozinho por aqui
export class AtualizarPerfilDto {
  @Transform(aparar)
  @IsOptional()
  @IsString({ message: 'nome deve ser um texto' })
  @MinLength(3, { message: 'nome deve ter no mínimo 3 caracteres' })
  @MaxLength(120, { message: 'nome deve ter no máximo 120 caracteres' })
  nome?: string;

  // Trocar o e-mail troca a identidade de login: exige a senha atual (abaixo)
  @Transform(normalizarEmail) // sem isso "Ana@X.com" era gravado com maiuscula e o login (que procura em minuscula) nunca mais achava a conta
  @IsOptional()
  @IsEmail({}, { message: 'email deve ser um e-mail válido' })
  @MaxLength(180, { message: 'email deve ter no máximo 180 caracteres' })
  email?: string;

  // So e usada (e obrigatoria) quando o e-mail muda; nunca e gravada
  @IsOptional()
  @IsString({ message: 'senhaAtual deve ser um texto' })
  senhaAtual?: string;

  @IsOptional()
  @Matches(/^\d{10,11}$/, { message: 'telefone deve ter 10 ou 11 dígitos numéricos (com DDD)' })
  telefone?: string;

  @IsOptional()
  @IsString({ message: 'endereço deve ser um texto' })
  @MaxLength(200, { message: 'endereço deve ter no máximo 200 caracteres' })
  endereco?: string;

  @IsOptional()
  @Matches(/^\d{11}$/, { message: 'cpf deve ter exatamente 11 dígitos numéricos' })
  cpf?: string;

  // Identificador de um avatar pronto (ex.: "raposa") ou uma imagem pequena
  // em base64 (data URL) -- o front redimensiona antes de enviar
  @IsOptional()
  @IsString({ message: 'avatarUrl deve ser um texto' })
  @MaxLength(300_000, { message: 'avatarUrl é grande demais' })
  avatarUrl?: string;
}
