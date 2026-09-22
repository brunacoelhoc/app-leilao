import { EventEmitter } from 'events';
import { Logger } from '@nestjs/common';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LogRequisicaoInterceptor } from './log-requisicao.interceptor';

const SEGREDO = 'SEGREDO-DE-TESTE';

// Monta um contexto falso; a resposta e um EventEmitter para podermos disparar o "finish"
function montarContexto(tipo: string, status: number) {
  const resposta = Object.assign(new EventEmitter(), { statusCode: status });
  const requisicao = {
    idRequisicao: 'id-123',
    method: 'POST',
    path: '/saude',
    url: `/saude?token=${SEGREDO}`,
    headers: { 'x-api-key': SEGREDO, authorization: `Bearer ${SEGREDO}` },
    body: { senha: SEGREDO },
  };
  const contexto = {
    getType: () => tipo,
    switchToHttp: () => ({
      getRequest: () => requisicao,
      getResponse: () => resposta,
    }),
  } as unknown as ExecutionContext;

  return { contexto, resposta };
}

const proximo: CallHandler = { handle: () => of('resposta do handler') };

describe('LogRequisicaoInterceptor', () => {
  let espiaLog: jest.SpyInstance;
  let espiaAviso: jest.SpyInstance;
  let espiaErro: jest.SpyInstance;

  beforeEach(() => {
    espiaLog = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    espiaAviso = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    espiaErro = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // Roda o interceptor e termina a resposta, como o Express faz
  function rodar(status: number) {
    const { contexto, resposta } = montarContexto('http', status);
    new LogRequisicaoInterceptor().intercept(contexto, proximo);
    resposta.emit('finish');
  }

  it('registra uma linha JSON com id, metodo, rota, status e tempo', () => {
    rodar(200);

    expect(espiaLog).toHaveBeenCalledTimes(1);
    const registro = JSON.parse(String(espiaLog.mock.calls[0][0])) as Record<
      string,
      unknown
    >;

    expect(Object.keys(registro).sort()).toEqual([
      'idRequisicao',
      'metodo',
      'rota',
      'status',
      'tempoMs',
    ]);
    expect(registro.idRequisicao).toBe('id-123');
    expect(registro.metodo).toBe('POST');
    expect(registro.rota).toBe('/saude');
    expect(registro.status).toBe(200);
    expect(typeof registro.tempoMs).toBe('number');
  });

  it('so registra quando a resposta termina, nao antes', () => {
    const { contexto } = montarContexto('http', 200);

    new LogRequisicaoInterceptor().intercept(contexto, proximo);

    expect(espiaLog).not.toHaveBeenCalled();
  });

  it('usa o nivel certo: 2xx log, 4xx aviso, 5xx erro', () => {
    rodar(201);
    rodar(404);
    rodar(500);

    expect(espiaLog).toHaveBeenCalledTimes(1);
    expect(espiaAviso).toHaveBeenCalledTimes(1);
    expect(espiaErro).toHaveBeenCalledTimes(1);
  });

  it('NAO registra cabecalhos, corpo nem query string (segredos)', () => {
    rodar(200);

    const tudo = JSON.stringify([
      ...espiaLog.mock.calls,
      ...espiaAviso.mock.calls,
      ...espiaErro.mock.calls,
    ]);

    expect(tudo).not.toContain(SEGREDO);
    expect(tudo).not.toContain('token=');
  });

  it('ignora o que nao for HTTP e deixa o handler seguir', () => {
    const { contexto, resposta } = montarContexto('rpc', 200);
    const handle = jest.fn().mockReturnValue(of('ok'));

    new LogRequisicaoInterceptor().intercept(contexto, { handle });

    expect(handle).toHaveBeenCalledTimes(1);
    expect(resposta.listenerCount('finish')).toBe(0);
  });
});
