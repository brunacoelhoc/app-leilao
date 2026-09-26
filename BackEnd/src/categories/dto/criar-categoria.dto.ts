import { Transform } from 'class-transformer';
import { aparar } from '../../common/utils/aparar-texto.util';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CriarCategoriaDto {
  // Ordem de baixo para cima (por causa do stopAtFirstError): obrigatorio,
  // depois tipo, depois tamanho minimo, depois tamanho maximo
  @Transform(aparar)
  @MaxLength(60, { message: 'nome deve ter no máximo 60 caracteres' })
  @MinLength(2, { message: 'nome deve ter no mínimo 2 caracteres' })
  @IsString({ message: 'nome deve ser um texto' })
  @IsNotEmpty({ message: 'nome e obrigatório' })
  nome: string;

  @MaxLength(300, { message: 'descrição deve ter no máximo 300 caracteres' })
  @IsString({ message: 'descrição deve ser um texto' })
  @IsOptional()
  descricao?: string;
}
