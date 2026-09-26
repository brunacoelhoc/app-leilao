import { Transform } from 'class-transformer';
import { aparar } from '../../common/utils/aparar-texto.util';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DataDepoisDe, DuracaoMaximaDe, NaoNoPassado } from './periodo-valido.validator';

export class CriarAuctionDto {
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

  @NaoNoPassado()
  @IsDateString(
    {},
    { message: 'dataInicio deve ser uma data válida (ISO 8601)' },
  )
  @IsNotEmpty({ message: 'dataInicio e obrigatória' })
  dataInicio: string;

  // Os validadores customizados conferem que dataFim vem depois de dataInicio e
  // que o periodo nao passa de 48 horas
  @DuracaoMaximaDe('dataInicio')
  @DataDepoisDe('dataInicio', {
    message: 'dataFim deve ser uma data depois de dataInicio',
  })
  @IsDateString({}, { message: 'dataFim deve ser uma data válida (ISO 8601)' })
  @IsNotEmpty({ message: 'dataFim e obrigatória' })
  dataFim: string;
}
