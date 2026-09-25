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
    summary: 'Historia da obra e contexto da epoca de uma peca (livre, sem login)',
    description: 'Se a foto da peca e uma obra do acervo: artista, ano, movimento, historia, contexto historico/filosofico/social e curiosidade. Senao, so a ficha da peca.',
  })
  @ApiParam({ name: 'id', description: 'Id (uuid) da peca' })
  @ApiOkResponse({ type: HistoriaPecaResposta })
  @ApiNotFoundResponse({ description: 'Peca inexistente', type: ErroResposta })
  historia(@Param('id', ParseUuidPipePt) id: string): Promise<HistoriaPecaResposta> {
    return this.obrasService.historiaDaPeca(id);
  }
}
