import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Query params de paginacao aceitos em toda listagem. Os dois sao opcionais
// (sem eles, usa pagina 1 e o limite padrao -- ver calcularPaginacao)
export class PaginacaoQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Página atual (começa em 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'página deve ser um número inteiro' })
  @Max(100000, { message: 'página deve ser no máximo 100000' })
  @Min(1, { message: 'página deve ser no mínimo 1' })
  pagina?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: 'Itens por página (máximo 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite deve ser um número inteiro' })
  @Min(1, { message: 'limite deve ser no mínimo 1' })
  @Max(100, { message: 'limite deve ser no máximo 100' })
  limite?: number;
}
