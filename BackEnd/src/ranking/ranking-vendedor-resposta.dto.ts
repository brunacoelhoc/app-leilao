import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Uma linha do ranking de vendedores (so dados publicos: nada de e-mail, CPF ou telefone)
export class RankingVendedorResposta {
  @ApiProperty({ example: 1 })
  posicao: number;

  @ApiProperty()
  vendedorId: string;

  @ApiProperty({ example: 'Marcos Antônio Vilela' })
  nome: string;

  @ApiPropertyOptional({ nullable: true, example: 'leao', description: 'Avatar pronto (imagens enviadas não saem aqui)' })
  avatarUrl: string | null;

  @ApiProperty({ example: '48250.00', description: 'Soma dos lances vencedores das peças vendidas (string)' })
  arrecadado: string;

  @ApiProperty({ example: 12 })
  vendidas: number;

  @ApiProperty({ example: 15, description: 'Peças que já terminaram (vendidas + não vendidas)' })
  finalizadas: number;

  @ApiProperty({ example: 80, description: 'Percentual de peças vendidas entre as finalizadas' })
  taxaVenda: number;

  @ApiProperty({ example: '9800.00', description: 'Maior venda individual (string)' })
  maiorVenda: string;

  @ApiProperty({ example: 4 })
  leiloesEncerrados: number;

  @ApiProperty({ example: 62.5, description: 'Quanto este vendedor representa do líder (líder = 100), para a barra do ranking' })
  participacao: number;

  @ApiProperty()
  membroDesde: Date;
}
