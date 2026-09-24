import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiParam, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import { CepService, type EnderecoPorCep } from './cep.service';

@ApiTags('CEP')
@Controller('cep')
export class CepController {
  constructor(private readonly cepService: CepService) {}

  @Get(':cep')
  @ApiOperation({
    summary: 'Consulta um CEP (ViaCEP) e devolve rua, cidade e UF (livre, sem login)',
    description: 'Aceita com ou sem hifen (01310-100 ou 01310100). Usado no cadastro de endereco do perfil.',
  })
  @ApiParam({ name: 'cep', example: '01310100' })
  @ApiOkResponse({ description: 'Endereco do CEP' })
  @ApiBadRequestResponse({ description: 'CEP mal formado ou inexistente', type: ErroResposta })
  @ApiServiceUnavailableResponse({ description: 'ViaCEP fora do ar', type: ErroResposta })
  buscar(@Param('cep') cepInformado: string): Promise<EnderecoPorCep> {
    const cep = cepInformado.replace(/\D/g, '');
    if (!/^\d{8}$/.test(cep)) {
      throw new BadRequestException('CEP deve ter 8 digitos numericos');
    }
    return this.cepService.buscar(cep);
  }
}
