import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CriarAuctionItemDto {
  @MaxLength(120, { message: 'titulo deve ter no maximo 120 caracteres' })
  @MinLength(3, { message: 'titulo deve ter no minimo 3 caracteres' })
  @IsString({ message: 'titulo deve ser um texto' })
  @IsNotEmpty({ message: 'titulo e obrigatorio' })
  titulo: string;

  @MaxLength(500, { message: 'descricao deve ter no maximo 500 caracteres' })
  @IsString({ message: 'descricao deve ser um texto' })
  @IsOptional()
  descricao?: string;

  // Ficha tecnica (todos opcionais)
  @MaxLength(120, { message: 'autor deve ter no maximo 120 caracteres' })
  @IsString({ message: 'autor deve ser um texto' })
  @IsOptional()
  autor?: string;

  @MaxLength(80, { message: 'periodo deve ter no maximo 80 caracteres' })
  @IsString({ message: 'periodo deve ser um texto' })
  @IsOptional()
  periodo?: string;

  @MaxLength(120, { message: 'tecnica deve ter no maximo 120 caracteres' })
  @IsString({ message: 'tecnica deve ser um texto' })
  @IsOptional()
  tecnica?: string;

  @MaxLength(80, { message: 'dimensoes deve ter no maximo 80 caracteres' })
  @IsString({ message: 'dimensoes deve ser um texto' })
  @IsOptional()
  dimensoes?: string;

  @MaxLength(80, { message: 'conservacao deve ter no maximo 80 caracteres' })
  @IsString({ message: 'conservacao deve ser um texto' })
  @IsOptional()
  conservacao?: string;

  @MaxLength(300, { message: 'procedencia deve ter no maximo 300 caracteres' })
  @IsString({ message: 'procedencia deve ser um texto' })
  @IsOptional()
  procedencia?: string;

  // O valor de partida do item. Positivo (o banco tambem confere isso com um CHECK)
  @IsPositive({ message: 'precoInicial deve ser maior que zero' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'precoInicial deve ser um numero com ate 2 casas decimais' },
  )
  precoInicial: number;

  @IsPositive({ message: 'incrementoMinimo deve ser maior que zero' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'incrementoMinimo deve ser um numero com ate 2 casas decimais' },
  )
  incrementoMinimo: number;

  // So o numero do CEP; o endereco (rua, cidade, uf) e preenchido depois,
  // pela integracao com o ViaCEP (HttpService), ainda nao implementada
  @Matches(/^\d{8}$/, { message: 'cep deve ter exatamente 8 digitos numericos' })
  @IsNotEmpty({ message: 'cep e obrigatorio' })
  cep: string;

  @IsUUID('4', { message: 'leilaoId deve ser um uuid valido' })
  @IsNotEmpty({ message: 'leilaoId e obrigatorio' })
  leilaoId: string;

  @IsUUID('4', { message: 'categoriaId deve ser um uuid valido' })
  @IsNotEmpty({ message: 'categoriaId e obrigatorio' })
  categoriaId: string;
}
