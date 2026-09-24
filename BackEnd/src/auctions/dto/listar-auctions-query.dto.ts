import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto/paginacao-query.dto';
import { AuctionStatus } from '../../generated/prisma/client';

// Filtros de GET /auctions: paginacao (herdada) + consulta por
// relacionamento (leiloes de um vendedor) + busca por texto e status
export class ListarAuctionsQueryDto extends PaginacaoQueryDto {
  @ApiPropertyOptional({ description: 'Filtra pelos leiloes de um vendedor' })
  @IsOptional()
  @IsUUID('4', { message: 'vendedorId deve ser um uuid valido' })
  vendedorId?: string;

  @ApiPropertyOptional({
    description: 'Busca por trecho do titulo ou da descricao (sem diferenciar maiusculas)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100, { message: 'busca deve ter no maximo 100 caracteres' })
  busca?: string;

  @ApiPropertyOptional({ enum: AuctionStatus, description: 'Filtra pelo status do leilao' })
  @IsOptional()
  @IsEnum(AuctionStatus, {
    message: `status deve ser um de: ${Object.values(AuctionStatus).join(', ')}`,
  })
  status?: AuctionStatus;
}
