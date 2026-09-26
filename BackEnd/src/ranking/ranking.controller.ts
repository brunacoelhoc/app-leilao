import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiSecurity, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { RankingVendedorResposta } from './ranking-vendedor-resposta.dto';
import { RankingService } from './ranking.service';

@ApiExcludeController()
@ApiTags('Ranking')
@ApiSecurity('api-key')
@Controller('ranking')
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get('vendedores')
  @ApiOperation({
    summary: 'Ranking dos melhores vendedores (livre, sem login)',
    description: 'Ordenado pelo total arrecadado em peças vendidas. Só dados públicos: nome, avatar e números de venda.',
  })
  @ApiQuery({ name: 'limite', required: false, description: 'Quantidade máxima (1 a 20, padrão 10)' })
  @ApiOkResponse({ type: RankingVendedorResposta, isArray: true })
  vendedores(@Query('limite') limite?: string): Promise<RankingVendedorResposta[]> {
    const n = Number.parseInt(limite ?? '', 10);
    return this.rankingService.vendedores(Number.isNaN(n) ? 10 : Math.min(20, Math.max(1, n)));
  }
}
