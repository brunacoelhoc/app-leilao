import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ItemStatus } from '../../generated/prisma/client';
import type { SituacaoItem } from '../situacao-item';

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

  @ApiProperty({
    enum: ['EM_BREVE', 'ABERTO', 'ENCERRANDO', 'VENDIDO', 'NAO_VENDIDO', 'CANCELADO'],
    example: 'ABERTO',
    description: 'Situacao calculada pelo servidor (a tela so exibe)',
  })
  situacao: SituacaoItem;

  @ApiProperty({ example: '110.00', description: 'Menor lance aceito agora (preco inicial ou lance atual + incremento)' })
  lanceMinimo: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 3600,
    description: 'Segundos ate a proxima mudanca (abertura se EM_BREVE, encerramento se ABERTO); null nos demais casos',
  })
  segundosParaMudanca: number | null;

  @ApiProperty({ example: 0, description: 'Quantas vezes o prazo do leilao foi estendido pelo anti-sniping (lance nos ultimos 2 minutos)' })
  prorrogacoes: number;

  @ApiPropertyOptional({ nullable: true, example: 'Vincent van Gogh', description: 'Ficha tecnica: Artista, autor ou fabricante' })
  autor: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'c. 1880', description: 'Ficha tecnica: Epoca ou ano da peca' })
  periodo: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Óleo sobre tela', description: 'Ficha tecnica: Tecnica e material' })
  tecnica: string | null;

  @ApiPropertyOptional({ nullable: true, example: '60 x 80 cm', description: 'Ficha tecnica: Medidas da peca' })
  dimensoes: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Excelente', description: 'Ficha tecnica: Estado de conservacao' })
  conservacao: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Coleção particular europeia', description: 'Ficha tecnica: Origem e historico da peca' })
  procedencia: string | null;

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

  @ApiPropertyOptional({ nullable: true, example: 'Maria Silva', description: 'Nome de quem ganhou (so preenchido se status=SOLD)' })
  vencedorNome: string | null;

  @ApiProperty({ type: [String], example: ['110.00', '120.00', '130.00', '160.00'], description: 'Valores prontos para o campo de lance (minimo, +1, +2 e +5 incrementos); vazio quando o lote nao recebe lances' })
  lancesSugeridos: string[];

  @ApiProperty({ example: 'Participar', description: 'Texto do botao do card, decidido pelo servidor' })
  rotuloAcao: string;

  @ApiProperty({ description: 'Caminho de uma obra do acervo para usar quando nao ha foto enviada' })
  capaPadrao: string;

  @ApiPropertyOptional({ nullable: true, description: 'Id da primeira foto (so na listagem); baixe em GET /documents/:id/download' })
  capaDocumentoId?: string | null;

  @ApiProperty({ description: 'Id do leilao a que este item pertence' })
  leilaoId: string;

  @ApiProperty({ description: 'Id da categoria deste item' })
  categoriaId: string;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;
}
