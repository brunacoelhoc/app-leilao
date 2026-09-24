import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { DestaqueResposta } from './destaque-resposta.dto';
import { DestaquesService } from './destaques.service';

@ApiTags('Destaques')
@Controller('destaques')
export class DestaquesController {
  constructor(private readonly destaquesService: DestaquesService) {}

  @Get()
  @ApiOperation({
    summary: 'Leiloes em destaque para o carrossel da pagina inicial (livre, sem login)',
    description: 'Ordem: abertos (encerram primeiro), em breve (abrem primeiro), encerrados (mais recentes). Nunca rascunho nem cancelado.',
  })
  @ApiQuery({ name: 'limite', required: false, description: 'Quantidade maxima (1 a 10, padrao 10)' })
  @ApiOkResponse({ type: DestaqueResposta, isArray: true })
  listar(@Query('limite') limite?: string): Promise<DestaqueResposta[]> {
    const n = Number.parseInt(limite ?? '', 10);
    return this.destaquesService.listar(Number.isNaN(n) ? 10 : Math.min(10, Math.max(1, n)));
  }
}
