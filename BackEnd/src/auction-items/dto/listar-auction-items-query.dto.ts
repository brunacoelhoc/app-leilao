import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto/paginacao-query.dto';

// Filtros de GET /auction-items: paginacao (herdada) + as duas consultas por
// relacionamento (itens de um leilao e/ou itens de uma categoria)
export class ListarAuctionItemsQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ description: 'Filtra pelos itens de um leilao' })
  @IsOptional()
  @IsUUID('4', { message: 'leilaoId deve ser um uuid valido' })
  leilaoId?: string;

  @ApiPropertyOptional({ description: 'Filtra pelos itens de uma categoria' })
  @IsOptional()
  @IsUUID('4', { message: 'categoriaId deve ser um uuid valido' })
  categoriaId?: string;
}
