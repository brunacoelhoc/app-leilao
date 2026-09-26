import {
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { FiltroExcecoes } from './filtro-excecoes';

// Roda o filtro com uma resposta falsa e devolve o que ele respondeu
function executar(excecao: unknown, idRequisicao?: string) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({
        method: 'POST',
        originalUrl: '/api/teste?token=SEGREDO-NA-URL',
        idRequisicao,
      }),
    }),
  } as unknown as ArgumentsHost;

  new FiltroExcecoes().catch(excecao, host);

  return {
    statusCode: status.mock.calls[0][0] as number,
    corpo: json.mock.calls[0][0] as Record<string, unknown>,
  };
}

// Cria um erro do Prisma igual aos que o banco gera
function erroDoPrisma(
  code: string,
  causa?: { kind?: string; originalCode?: string },
) {
  return new Prisma.PrismaClientKnownRequestError(
    'mensagem interna com senha=SEGREDO-DE-TESTE',
    {
      code,
      clientVersion: '7.10.0',
      meta: causa ? { driverAdapterError: { cause: causa } } : undefined,
    },
  );
}

describe('FiltroExcecoes', () => {
  describe('formato da resposta', () => {
    it('sempre devolve os 5 campos padrao', () => {
      const { corpo } = executar(new NotFoundException('Leilao nao encontrado'));

      expect(Object.keys(corpo).sort()).toEqual([
        'caminho',
        'dataHora',
        'erro',
        'mensagem',
        'statusCode',
      ]);
      // Caminho completo (com /api) e sem a query string
      expect(corpo.caminho).toBe('/api/teste');
    });
  });

  describe('erros HTTP do Nest e da nossa API', () => {
    it('mantem a lista de mensagens da validacao (400)', () => {
      const { statusCode, corpo } = executar(
        new BadRequestException(['email inválido', 'senha muito curta']),
      );

      expect(statusCode).toBe(400);
      expect(corpo.erro).toBe('Requisição inválida');
      expect(corpo.mensagem).toEqual(['email inválido', 'senha muito curta']);
    });

    it('traduz a rota inexistente para portugues (404)', () => {
      const { statusCode, corpo } = executar(
        new NotFoundException('Cannot GET /xyz'),
      );

      expect(statusCode).toBe(404);
      expect(corpo.mensagem).toBe('Rota não encontrada');
    });

    it('mantem a mensagem propria da API (409)', () => {
      const { statusCode, corpo } = executar(
        new ConflictException('Lance abaixo do mínimo'),
      );

      expect(statusCode).toBe(409);
      expect(corpo.erro).toBe('Conflito');
      expect(corpo.mensagem).toBe('Lance abaixo do mínimo');
    });
  });

  describe('erros do banco (Prisma)', () => {
    const casos: Array<{
      nome: string;
      erro: Prisma.PrismaClientKnownRequestError;
      status: number;
      mensagem: string;
    }> = [
      {
        nome: 'valor unico repetido (P2002)',
        erro: erroDoPrisma('P2002'),
        status: 409,
        mensagem: 'Já existe um registro com estes dados',
      },
      {
        nome: 'apagar registro em uso (P2003 Restrict)',
        erro: erroDoPrisma('P2003', { kind: 'RestrictViolation' }),
        status: 409,
        mensagem:
          'Este registro está em uso por outros registros e não pode ser removido',
      },
      {
        nome: 'ligar a registro inexistente (P2003 FK)',
        erro: erroDoPrisma('P2003', { kind: 'ForeignKeyConstraintViolation' }),
        status: 404,
        mensagem: 'Um dos registros informados não existe',
      },
      {
        nome: 'registro nao encontrado (P2025)',
        erro: erroDoPrisma('P2025'),
        status: 404,
        mensagem: 'Registro não encontrado',
      },
      {
        nome: 'regra CHECK violada (P2039 / 23514)',
        erro: erroDoPrisma('P2039', { originalCode: '23514' }),
        status: 400,
        mensagem: 'Os dados informados violam uma regra de integridade',
      },
      {
        nome: 'banco fora do ar (ECONNREFUSED)',
        erro: erroDoPrisma('ECONNREFUSED'),
        status: 503,
        mensagem: 'Banco de dados indisponível',
      },
    ];

    it.each(casos)('$nome -> $status', ({ erro, status, mensagem }) => {
      const resultado = executar(erro);

      expect(resultado.statusCode).toBe(status);
      expect(resultado.corpo.mensagem).toBe(mensagem);
    });
  });

  describe('erros inesperados e seguranca', () => {
    // Espia o que o filtro manda para o log de erro
    let espiaDoLog: jest.SpyInstance;

    beforeEach(() => {
      espiaDoLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('trigger de imutabilidade (P2039 / P0001) vira 500, pois seria um bug', () => {
      const { statusCode } = executar(
        erroDoPrisma('P2039', { originalCode: 'P0001' }),
      );

      expect(statusCode).toBe(500);
    });

    it('codigo do Prisma desconhecido vira 500 generico', () => {
      const { statusCode, corpo } = executar(erroDoPrisma('P9999'));

      expect(statusCode).toBe(500);
      expect(corpo.erro).toBe('Erro interno do servidor');
    });

    it('erro qualquer vira 500 e NAO mostra a mensagem interna na resposta', () => {
      const { statusCode, corpo } = executar(
        new Error('senha=SEGREDO-DE-TESTE'),
      );

      expect(statusCode).toBe(500);
      expect(JSON.stringify(corpo)).not.toContain('SEGREDO-DE-TESTE');
    });

    it('NAO grava a mensagem interna no log (so codigo e local do erro)', () => {
      executar(erroDoPrisma('P2039', { originalCode: 'P0001' }));

      const logado = espiaDoLog.mock.calls
        .map((chamada: unknown[]) => String(chamada[0]))
        .join('\n');

      expect(logado).toContain('P2039/P0001');
      expect(logado).not.toContain('SEGREDO-DE-TESTE');
    });

    it('inclui o id da requisicao no log de erro (ou "-" se nao houver)', () => {
      executar(new Error('falha'), 'id-abc');
      executar(new Error('falha'));

      const logado = espiaDoLog.mock.calls
        .map((chamada: unknown[]) => String(chamada[0]))
        .join('\n');

      expect(logado).toContain('[id-abc] POST /api/teste');
      expect(logado).toContain('[-] POST /api/teste');
    });

    it('erros 4xx nao vao para o log de erro', () => {
      executar(new NotFoundException('Leilao nao encontrado'));

      expect(espiaDoLog).not.toHaveBeenCalled();
    });
  });
});
