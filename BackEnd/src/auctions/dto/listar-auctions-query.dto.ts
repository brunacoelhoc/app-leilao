import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto/paginacao-query.dto';

// Filtros de GET /auctions: paginacao (herdada) + consulta por
// relacionamento (leiloes de um vendedor)
export class ListarAuctionsQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ description: 'Filtra pelos leiloes de um vendedor' })
  @IsOptional()
  @IsUUID('4', { message: 'vendedorId deve ser um uuid valido' })
  vendedorId?: string;
}
