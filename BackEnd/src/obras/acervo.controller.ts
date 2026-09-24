import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { ObraAcervoResposta } from './dto/obra-acervo-resposta.dto';
import { ObrasService } from './obras.service';

@ApiTags('Obras')
@ApiSecurity('api-key')
@Controller('obras')
export class AcervoController {
  constructor(private readonly obrasService: ObrasService) {}

  @Get('acervo')
  @ApiOperation({
    summary: 'Lista as obras do acervo de dominio publico (livre, sem login)',
    description: 'Fonte unica do catalogo: a tela so exibe. As imagens em si ficam na pasta /acervo do front.',
  })
  @ApiOkResponse({ type: [ObraAcervoResposta] })
  acervo(): ObraAcervoResposta[] {
    return this.obrasService.acervo();
  }
}
