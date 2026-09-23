import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemStatus } from '../../generated/prisma/client';

// Formato real da resposta de um item -- so para o Swagger documentar o
// schema. Os campos de dinheiro saem como STRING (nunca number), porque o
// Decimal do Prisma nao serializa direito pelo ClassSerializerInterceptor
// (ver src/common/utils/decimal.util.ts)
export class AuctionItemResposta {
  @ApiProperty({ example: 'b9e2a0f4-25a4-44b0-a33e-f804a9a8d0e7' })
  id: string;

  @ApiProperty({ example: 'Quadro raro' })
  titulo: string;

  @ApiPropertyOptional({ nullable: true, example: 'Oleo sobre tela, seculo XIX' })
  descricao: string | null;

  @ApiProperty({ enum: ItemStatus, example: ItemStatus.AVAILABLE })
  status: ItemStatus;

  @ApiProperty({ example: '150.50', description: 'Decimal(12,2) do banco, sempre como string' })
  precoInicial: string;

  @ApiProperty({ example: '10.00', description: 'Decimal(12,2) do banco, sempre como string' })
  incrementoMinimo: string;

  @ApiPropertyOptional({ nullable: true, example: '160.00', description: 'null se ainda nao houve lance' })
  lanceAtual: string | null;

  @ApiProperty({ example: 3, description: 'Indicador do dominio: quantidade total de lances recebidos por este item' })
  totalLances: number;

  @ApiProperty({ example: '01310100' })
  cep: string;

  @ApiPropertyOptional({ nullable: true, example: 'Avenida Paulista' })
  logradouro: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'São Paulo' })
  cidade: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'SP' })
  uf: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Id de quem ganhou (so preenchido se status=SOLD)' })
  vencedorId: string | null;

  @ApiProperty({ description: 'Id do leilao a que este item pertence' })
  leilaoId: string;

  @ApiProperty({ description: 'Id da categoria deste item' })
  categoriaId: string;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;
}
