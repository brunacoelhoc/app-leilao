import type { Response } from 'express';
import type { RequisicaoComId } from '../interfaces/requisicao-com-id.interface';
import { IdRequisicaoMiddleware } from './id-requisicao.middleware';

// Roda o middleware com uma requisicao e uma resposta falsas
function executar() {
  const cabecalhos: Record<string, string> = {};
  const resposta = {
    setHeader: (nome: string, valor: string) => {
      cabecalhos[nome] = valor;
    },
  } as unknown as Response;
  const requisicao = {} as RequisicaoComId;
  const proximo = jest.fn();

  new IdRequisicaoMiddleware().use(requisicao, resposta, proximo);

  return { requisicao, cabecalhos, proximo };
}

describe('IdRequisicaoMiddleware', () => {
  it('guarda um UUID na requisicao e devolve o mesmo no cabecalho X-Request-Id', () => {
    const { requisicao, cabecalhos } = executar();

    expect(requisicao.idRequisicao).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(cabecalhos['X-Request-Id']).toBe(requisicao.idRequisicao);
  });

  it('gera um id diferente a cada requisicao', () => {
    const primeira = executar();
    const segunda = executar();

    expect(primeira.requisicao.idRequisicao).not.toBe(
      segunda.requisicao.idRequisicao,
    );
  });

  it('chama o next() para a requisicao seguir', () => {
    const { proximo } = executar();

    expect(proximo).toHaveBeenCalledTimes(1);
  });
});
