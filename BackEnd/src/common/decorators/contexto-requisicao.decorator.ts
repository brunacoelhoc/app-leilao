import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ContextoRequisicao } from '../interfaces/contexto-requisicao.interface';
import type { RequisicaoComId } from '../interfaces/requisicao-com-id.interface';

// Pega o IP, o navegador e o id da requisicao, so para gravar na auditoria/no lance.
// Uso: @ContextoDaRequisicao() contexto: ContextoRequisicao
export const ContextoDaRequisicao = createParamDecorator(
  (_dado: unknown, execucao: ExecutionContext): ContextoRequisicao => {
    const requisicao = execucao
      .switchToHttp()
      .getRequest<RequisicaoComId>();

    return {
      ipOrigem: requisicao.ip,
      userAgent: requisicao.headers['user-agent'],
      idRequisicao: requisicao.idRequisicao,
    };
  },
);
