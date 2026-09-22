import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Response } from 'express';
import type { RequisicaoComId } from '../interfaces/requisicao-com-id.interface';

// Roda ANTES de tudo (antes dos guards): da um id unico para cada requisicao
@Injectable()
export class IdRequisicaoMiddleware implements NestMiddleware {
  use(requisicao: RequisicaoComId, resposta: Response, next: NextFunction) {
    const id = randomUUID();

    // Fica guardado na requisicao para o resto da aplicacao usar
    requisicao.idRequisicao = id;
    // E volta para quem chamou, no cabecalho da resposta
    resposta.setHeader('X-Request-Id', id);

    next();
  }
}
