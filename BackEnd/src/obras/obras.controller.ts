import { Controller, Get, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiSecurity, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import { ParseUuidPipePt } from '../common/pipes/parse-uuid.pipe';
import { HistoriaPecaResposta } from './dto/historia-resposta.dto';
import { ObrasService } from './obras.service';

@ApiExcludeController()
@ApiTags('Obras')
@ApiSecurity('api-key')
@Controller('auction-items')
export class ObrasController {
  constructor(private readonly obrasService: ObrasService) {}

  @Get(':id/historia')
  @ApiOperation({
    summary: 'História da obra e contexto da época de uma peça (livre, sem login)',
    description: 'Se a foto da peça é uma obra do acervo: artista, ano, movimento, história, contexto histórico/filosófico/social e curiosidade. Senão, só a ficha da peça.',
  })
  @ApiParam({ name: 'id', description: 'Id (uuid) da peça' })
  @ApiOkResponse({ type: HistoriaPecaResposta })
  @ApiNotFoundResponse({ description: 'Peça inexistente', type: ErroResposta })
  historia(@Param('id', ParseUuidPipePt) id: string): Promise<HistoriaPecaResposta> {
    return this.obrasService.historiaDaPeca(id);
  }
}
