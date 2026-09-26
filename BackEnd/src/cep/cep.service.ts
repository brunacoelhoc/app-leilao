import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

// O que a gente usa da resposta do ViaCEP (o resto do JSON e ignorado).
// O ViaCEP manda "erro": "true" (string, nao booleano) quando o CEP nao existe
interface RespostaViaCep {
  erro?: unknown;
  logradouro?: string;
  localidade?: string; // e a cidade
  uf?: string;
}

// So os 3 campos de endereco que o AuctionItem precisa
export interface EnderecoPorCep {
  logradouro: string;
  cidade: string;
  uf: string;
}

// Integracao externa (HttpService) exigida pelo enunciado: consulta o CEP e
// preenche o endereco de retirada do item. A URL base e o timeout ja vem
// configurados no HttpService pelo CepModule (HttpModule.registerAsync),
// lidos do .env -- aqui so usamos o caminho relativo
@Injectable()
export class CepService {
  private readonly logger = new Logger(CepService.name);

  constructor(private readonly httpService: HttpService) {}

  async buscar(cep: string): Promise<EnderecoPorCep> {
    let resposta: RespostaViaCep;
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<RespostaViaCep>(`/${cep}/json/`),
      );
      resposta = data;
    } catch (erro) {
      // Timeout ou servico fora do ar: nao e culpa de quem esta usando a
      // API, e um problema de infraestrutura externa -- 503, nunca deixa a
      // requisicao pendurada esperando (o timeout ja esta configurado no
      // HttpService)
      const motivo =
        erro instanceof AxiosError
          ? (erro.code ?? erro.message)
          : erro instanceof Error
            ? erro.message
            : 'erro desconhecido';
      this.logger.error(`Falha ao consultar CEP ${cep}: ${motivo}`);
      throw new ServiceUnavailableException(
        'Serviço de consulta de CEP indisponível no momento. Tente novamente mais tarde',
      );
    }

    // CEP com formato valido mas que nao existe de verdade. Atencao: CEP "geral" de cidade pequena e VALIDO e
    // vem sem rua (logradouro vazio, ex.: 68590000 Jacundá/PA), entao o que prova que o CEP existe e ter cidade
    if (resposta.erro || !resposta.localidade) {
      throw new BadRequestException('CEP não encontrado');
    }

    return {
      logradouro: resposta.logradouro ?? '',
      cidade: resposta.localidade,
      uf: resposta.uf ?? '',
    };
  }
}
