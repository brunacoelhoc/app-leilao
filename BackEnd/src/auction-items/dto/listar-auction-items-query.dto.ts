import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto/paginacao-query.dto';

// Filtros de GET /auction-items: paginacao (herdada) + as duas consultas por
// relacionamento (itens de um leilao e/ou itens de uma categoria) + busca por texto
export class ListarAuctionItemsQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ description: 'Filtra pelos itens de um leilão' })
  @IsOptional()
  @IsUUID('4', { message: 'leilaoId deve ser um uuid válido' })
  leilaoId?: string;

  @ApiPropertyOptional({ description: 'Filtra pelos itens de uma categoria' })
  @IsOptional()
  @IsUUID('4', { message: 'categoriaId deve ser um uuid válido' })
  categoriaId?: string;

  @ApiPropertyOptional({
    description: 'Busca por trecho do título ou da descrição (sem diferenciar maiúsculas)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100, { message: 'busca deve ter no máximo 100 caracteres' })
  busca?: string;
}
