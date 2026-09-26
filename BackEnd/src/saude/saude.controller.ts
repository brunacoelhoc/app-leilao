import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiExcludeController, ApiTags,
} from '@nestjs/swagger';
import { HEADER_REQUEST_ID } from '../common/swagger-headers';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import { SaudeService } from './saude.service';

// Rota GET /saude (tambem exige o X-API-KEY, como todas as outras)
@ApiExcludeController()
@ApiTags('Saúde')
@ApiSecurity('api-key')
@Controller('saude')
export class SaudeController {
  constructor(private readonly saudeService: SaudeService) {}

  @Get()
  @ApiOperation({ summary: 'Confere se a API e o banco de dados estão no ar' })
  @ApiOkResponse({ description: '{ status: "ok", banco: "conectado", dataHora }', headers: HEADER_REQUEST_ID })
  @ApiServiceUnavailableResponse({ description: 'Banco de dados fora do ar', type: ErroResposta })
  verificar() {
    // O controller so repassa; quem trabalha e o service
    return this.saudeService.verificar();
  }
}
