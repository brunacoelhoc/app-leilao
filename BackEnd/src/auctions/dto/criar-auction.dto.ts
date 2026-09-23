import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DataDepoisDe } from './periodo-valido.validator';

export class CriarAuctionDto {
  @MaxLength(120, { message: 'titulo deve ter no maximo 120 caracteres' })
  @MinLength(3, { message: 'titulo deve ter no minimo 3 caracteres' })
  @IsString({ message: 'titulo deve ser um texto' })
  @IsNotEmpty({ message: 'titulo e obrigatorio' })
  titulo: string;

  @MaxLength(500, { message: 'descricao deve ter no maximo 500 caracteres' })
  @IsString({ message: 'descricao deve ser um texto' })
  @IsOptional()
  descricao?: string;

  @IsDateString(
    {},
    { message: 'dataInicio deve ser uma data valida (ISO 8601)' },
  )
  @IsNotEmpty({ message: 'dataInicio e obrigatoria' })
  dataInicio: string;

  // O validador customizado confere que dataFim vem depois de dataInicio
  @DataDepoisDe('dataInicio', {
    message: 'dataFim deve ser uma data depois de dataInicio',
  })
  @IsDateString({}, { message: 'dataFim deve ser uma data valida (ISO 8601)' })
  @IsNotEmpty({ message: 'dataFim e obrigatoria' })
  dataFim: string;
}
