import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

// Query params de paginacao aceitos em toda listagem. Os dois sao opcionais
// (sem eles, usa pagina 1 e o limite padrao -- ver calcularPaginacao)
export class PaginacaoQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: 'Pagina atual (comeca em 1)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pagina deve ser um numero inteiro' })
  @Min(1, { message: 'pagina deve ser no minimo 1' })
  pagina?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20, description: 'Itens por pagina (maximo 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limite deve ser um numero inteiro' })
  @Min(1, { message: 'limite deve ser no minimo 1' })
  @Max(100, { message: 'limite deve ser no maximo 100' })
  limite?: number;
}
