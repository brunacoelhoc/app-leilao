import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable } from 'rxjs';
import type { RequisicaoComId } from '../interfaces/requisicao-com-id.interface';

// Registra uma linha de log estruturado (JSON) para cada requisicao, com o tempo gasto.
// Nao tem regra de negocio e nunca registra cabecalhos, corpo nem query string (podem ter segredos)
@Injectable()
export class LogRequisicaoInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Requisicao');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // So trabalha com requisicoes HTTP
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const requisicao = http.getRequest<RequisicaoComId>();
    const resposta = http.getResponse<Response>();
    const inicio = performance.now();

    // "finish" acontece quando a resposta terminou de ser enviada:
    // nessa hora ja sabemos o status final (inclusive o dos erros tratados pelo filtro)
    resposta.once('finish', () => {
      const registro = {
        idRequisicao: requisicao.idRequisicao,
        metodo: requisicao.method,
        rota: requisicao.path,
        status: resposta.statusCode,
        tempoMs: Math.round(performance.now() - inicio),
      };
      const linha = JSON.stringify(registro);

      if (registro.status >= 500) this.logger.error(linha);
      else if (registro.status >= 400) this.logger.warn(linha);
      else this.logger.log(linha);
    });

    return next.handle();
  }
}
