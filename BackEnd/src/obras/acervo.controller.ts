import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { ObraAcervoResposta } from './dto/obra-acervo-resposta.dto';
import { ObrasService } from './obras.service';

@ApiExcludeController()
@ApiTags('Obras')
@ApiSecurity('api-key')
@Controller('obras')
export class AcervoController {
  constructor(private readonly obrasService: ObrasService) {}

  @Get('acervo')
  @ApiOperation({
    summary: 'Lista as obras do acervo de domínio público (livre, sem login)',
    description: 'Fonte única do catálogo: a tela só exibe. As imagens em si ficam na pasta /acervo do front.',
  })
  @ApiOkResponse({ type: [ObraAcervoResposta] })
  acervo(): ObraAcervoResposta[] {
    return this.obrasService.acervo();
  }
}
