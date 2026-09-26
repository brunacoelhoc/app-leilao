import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Indicadores agregados do leilao (resumo do negocio, calculado na hora a
// partir dos itens/lances -- nao existe tabela propria para isso)
export class IndicadoresAuctionResposta {
  @ApiProperty({ example: 5, description: 'Quantidade de itens deste leilão' })
  totalItens: number;

  @ApiProperty({ example: 12, description: 'Soma de lances recebidos por todos os itens do leilão' })
  totalLances: number;

  @ApiPropertyOptional({ nullable: true, example: '350.00', description: 'Maior lance entre todos os itens do leilão (Decimal(12,2) como string), null se nenhum item recebeu lance' })
  maiorLance: string | null;

  @ApiProperty({ example: 2, description: 'Itens vendidos (status SOLD)' })
  itensVendidos: number;

  @ApiProperty({ example: 1, description: 'Itens que fecharam sem comprador (status UNSOLD)' })
  itensNaoVendidos: number;

  @ApiProperty({ example: 2, description: 'Itens ainda disponíveis, sem decisão de venda (status AVAILABLE)' })
  itensDisponiveis: number;

  @ApiProperty({ example: { vendidos: 50, disponiveis: 30, naoVendidos: 20 }, description: 'Percentual de cada situação sobre o total de itens (0 a 100), para a barra de andamento' })
  percentuais: { vendidos: number; disponiveis: number; naoVendidos: number };

  @ApiProperty({ example: '620.00', description: 'Soma do lance vencedor dos itens vendidos (Decimal(12,2) como string)' })
  arrecadadoTotal: string;
}
