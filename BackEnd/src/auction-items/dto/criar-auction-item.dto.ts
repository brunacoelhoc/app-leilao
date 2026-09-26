import { Transform } from 'class-transformer';
import { aparar } from '../../common/utils/aparar-texto.util';
import { VALOR_MAXIMO } from '../../common/utils/valor-maximo';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  Max,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CriarAuctionItemDto {
  @Transform(aparar)
  @MaxLength(120, { message: 'título deve ter no máximo 120 caracteres' })
  @MinLength(3, { message: 'título deve ter no mínimo 3 caracteres' })
  @IsString({ message: 'título deve ser um texto' })
  @IsNotEmpty({ message: 'título e obrigatório' })
  titulo: string;

  @MaxLength(500, { message: 'descrição deve ter no máximo 500 caracteres' })
  @IsString({ message: 'descrição deve ser um texto' })
  @IsOptional()
  descricao?: string;

  // Ficha tecnica (todos opcionais)
  @MaxLength(120, { message: 'autor deve ter no máximo 120 caracteres' })
  @IsString({ message: 'autor deve ser um texto' })
  @IsOptional()
  autor?: string;

  @MaxLength(80, { message: 'período deve ter no máximo 80 caracteres' })
  @IsString({ message: 'período deve ser um texto' })
  @IsOptional()
  periodo?: string;

  @MaxLength(120, { message: 'técnica deve ter no máximo 120 caracteres' })
  @IsString({ message: 'técnica deve ser um texto' })
  @IsOptional()
  tecnica?: string;

  @MaxLength(80, { message: 'dimensões deve ter no máximo 80 caracteres' })
  @IsString({ message: 'dimensões deve ser um texto' })
  @IsOptional()
  dimensoes?: string;

  @MaxLength(80, { message: 'conservação deve ter no máximo 80 caracteres' })
  @IsString({ message: 'conservação deve ser um texto' })
  @IsOptional()
  conservacao?: string;

  @MaxLength(300, { message: 'procedência deve ter no máximo 300 caracteres' })
  @IsString({ message: 'procedência deve ser um texto' })
  @IsOptional()
  procedencia?: string;

  // O valor de partida do item. Positivo (o banco tambem confere isso com um CHECK)
  @Max(VALOR_MAXIMO, { message: 'precoInicial deve ser no máximo 9.999.999.999,99' })
  @IsPositive({ message: 'precoInicial deve ser maior que zero' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'precoInicial deve ser um número com até 2 casas decimais' },
  )
  precoInicial: number;

  @Max(VALOR_MAXIMO, { message: 'incrementoMinimo deve ser no máximo 9.999.999.999,99' })
  @IsPositive({ message: 'incrementoMinimo deve ser maior que zero' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'incrementoMinimo deve ser um número com até 2 casas decimais' },
  )
  incrementoMinimo: number;

  // So o numero do CEP; o endereco (rua, cidade, uf) e preenchido depois,
  // pela integracao com o ViaCEP (HttpService), ainda nao implementada
  @Matches(/^\d{8}$/, { message: 'cep deve ter exatamente 8 dígitos numéricos' })
  @IsNotEmpty({ message: 'cep e obrigatório' })
  cep: string;

  @IsUUID('4', { message: 'leilaoId deve ser um uuid válido' })
  @IsNotEmpty({ message: 'leilaoId e obrigatório' })
  leilaoId: string;

  @IsUUID('4', { message: 'categoriaId deve ser um uuid válido' })
  @IsNotEmpty({ message: 'categoriaId e obrigatório' })
  categoriaId: string;
}
