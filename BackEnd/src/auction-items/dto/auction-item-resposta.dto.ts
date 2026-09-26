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

  @ApiPropertyOptional({ nullable: true, example: 'Óleo sobre tela, século XIX' })
  descricao: string | null;

  @ApiProperty({ enum: ItemStatus, example: ItemStatus.AVAILABLE })
  status: ItemStatus;

  @ApiProperty({ example: '150.50', description: 'Decimal(12,2) do banco, sempre como string' })
  precoInicial: string;

  @ApiProperty({ example: '10.00', description: 'Decimal(12,2) do banco, sempre como string' })
  incrementoMinimo: string;

  @ApiPropertyOptional({ nullable: true, example: '160.00', description: 'null se ainda não houve lance' })
  lanceAtual: string | null;

  @ApiProperty({ example: 3, description: 'Indicador do domínio: quantidade total de lances recebidos por este item' })
  totalLances: number;

  @ApiProperty({
    enum: ['EM_BREVE', 'ABERTO', 'ENCERRANDO', 'VENDIDO', 'NAO_VENDIDO', 'CANCELADO'],
    example: 'ABERTO',
    description: 'Situação calculada pelo servidor (a tela só exibe)',
  })
  situacao: SituacaoItem;

  @ApiProperty({ example: '110.00', description: 'Menor lance aceito agora (preço inicial ou lance atual + incremento)' })
  lanceMinimo: string;

  @ApiPropertyOptional({
    nullable: true,
    example: 3600,
    description: 'Segundos até a próxima mudança (abertura se EM_BREVE, encerramento se ABERTO); null nos demais casos',
  })
  segundosParaMudanca: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Só no detalhe da peça vendida: explica quando o maior lance foi desconsiderado (conta desativada) e o valor final é menor. null nos demais casos' })
  avisoResultado: string | null;

  @ApiProperty({ example: 0, description: 'Quantas vezes o prazo do leilão foi estendido pelo anti-sniping (lance nos últimos 2 minutos)' })
  prorrogacoes: number;

  @ApiPropertyOptional({ nullable: true, example: 'Vincent van Gogh', description: 'Ficha técnica: Artista, autor ou fabricante' })
  autor: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'c. 1880', description: 'Ficha técnica: Época ou ano da peça' })
  periodo: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Óleo sobre tela', description: 'Ficha técnica: Técnica e material' })
  tecnica: string | null;

  @ApiPropertyOptional({ nullable: true, example: '60 x 80 cm', description: 'Ficha técnica: Medidas da peça' })
  dimensoes: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Excelente', description: 'Ficha técnica: Estado de conservação' })
  conservacao: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Coleção particular europeia', description: 'Ficha técnica: Origem e histórico da peça' })
  procedencia: string | null;

  @ApiProperty({ example: '01310100' })
  cep: string;

  @ApiPropertyOptional({ nullable: true, example: 'Avenida Paulista' })
  logradouro: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'São Paulo' })
  cidade: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'SP' })
  uf: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Id de quem ganhou (só preenchido se status=SOLD)' })
  vencedorId: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'Maria Silva', description: 'Nome de quem ganhou (só preenchido se status=SOLD)' })
  vencedorNome: string | null;

  @ApiProperty({ type: [String], example: ['110.00', '120.00', '130.00', '160.00'], description: 'Valores prontos para o campo de lance (mínimo, +1, +2 e +5 incrementos); vazio quando o lote não recebe lances' })
  lancesSugeridos: string[];

  @ApiProperty({ example: 'Participar', description: 'Texto do botão do card, decidido pelo servidor' })
  rotuloAcao: string;

  @ApiProperty({ description: 'Caminho de uma obra do acervo para usar quando não há foto enviada' })
  capaPadrao: string;

  @ApiPropertyOptional({ nullable: true, description: 'Id da primeira foto (só na listagem); baixe em GET /documents/:id/download' })
  capaDocumentoId?: string | null;

  @ApiProperty({ description: 'Id do leilão a que este item pertence' })
  leilaoId: string;

  @ApiProperty({ description: 'Id da categoria deste item' })
  categoriaId: string;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;
}
