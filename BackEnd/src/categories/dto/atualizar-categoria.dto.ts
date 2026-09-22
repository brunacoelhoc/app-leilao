import { PartialType } from '@nestjs/mapped-types';
import { CriarCategoriaDto } from './criar-categoria.dto';

// Todos os campos do CriarCategoriaDto, mas opcionais. As mesmas regras
// (tipo, tamanho, whitelist) continuam valendo quando o campo e enviado
export class AtualizarCategoriaDto extends PartialType(CriarCategoriaDto) {}
