import { Transform } from 'class-transformer';
import { aparar } from '../../common/utils/aparar-texto.util';
import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CriarCategoriaDto {
  // Ordem de baixo para cima (por causa do stopAtFirstError): obrigatorio,
  // depois tipo, depois tamanho minimo, depois tamanho maximo
  @Transform(aparar)
  @MaxLength(60, { message: 'nome deve ter no maximo 60 caracteres' })
  @MinLength(2, { message: 'nome deve ter no minimo 2 caracteres' })
  @IsString({ message: 'nome deve ser um texto' })
  @IsNotEmpty({ message: 'nome e obrigatorio' })
  nome: string;

  @MaxLength(300, { message: 'descricao deve ter no maximo 300 caracteres' })
  @IsString({ message: 'descricao deve ser um texto' })
  @IsOptional()
  descricao?: string;
}
