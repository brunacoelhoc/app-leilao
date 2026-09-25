import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequisicaoComId } from '../interfaces/requisicao-com-id.interface';
import { Prisma } from '../../generated/prisma/client';

// Nome em portugues de cada codigo HTTP
const NOMES_DOS_ERROS: Record<number, string> = {
  400: 'Requisicao invalida',
  401: 'Nao autorizado',
  403: 'Acesso negado',
  404: 'Nao encontrado',
  409: 'Conflito',
  413: 'Corpo grande demais',
  429: 'Muitas requisicoes',
  500: 'Erro interno do servidor',
  503: 'Servico indisponivel',
};

// O que o filtro decidiu responder: o codigo HTTP e a mensagem
interface ErroTraduzido {
  statusCode: number;
  mensagem: string | string[];
}

// Onde o driver adapter guarda o detalhe do erro do Postgres
interface MetaDoPrisma {
  driverAdapterError?: {
    cause?: { kind?: string; originalCode?: string };
  };
}

// Pega TODOS os erros da API e responde sempre no mesmo formato
@Catch()
export class FiltroExcecoes implements ExceptionFilter {
  private readonly logger = new Logger(FiltroExcecoes.name);

  catch(excecao: unknown, host: ArgumentsHost): void {
    const contexto = host.switchToHttp();
    const resposta = contexto.getResponse<Response>();
    const requisicao = contexto.getRequest<RequisicaoComId>();
    // Caminho completo (com /api) e sem a query string, que pode ter segredos
    const caminho = requisicao.originalUrl.split('?')[0];

    const { statusCode, mensagem } = this.traduzir(excecao);

    // Erro do servidor (5xx): os detalhes vao so para o log, nunca para a resposta
    if (statusCode >= 500) {
      this.logger.error(
        `[${requisicao.idRequisicao ?? '-'}] ${requisicao.method} ${caminho} -> ${statusCode} | ${this.resumirParaLog(excecao)}`,
      );
    }

    resposta.status(statusCode).json({
      statusCode,
      erro: NOMES_DOS_ERROS[statusCode] ?? 'Erro',
      mensagem,
      caminho,
      dataHora: new Date().toISOString(),
    });
  }

  // Escolhe o codigo HTTP e a mensagem conforme o tipo do erro
  private traduzir(excecao: unknown): ErroTraduzido {
    if (excecao instanceof HttpException) {
      return this.traduzirErroHttp(excecao);
    }
    if (excecao instanceof Prisma.PrismaClientKnownRequestError) {
      return this.traduzirErroDoPrisma(excecao);
    }
    // Erros de leitura do corpo (ex.: JSON quebrado, corpo grande demais) chegam com o codigo 4xx pronto:
    // sao culpa de quem enviou, nao do servidor
    const erroDoCliente = this.traduzirErroDeLeituraDoCorpo(excecao);
    if (erroDoCliente) return erroDoCliente;
    // Qualquer outro erro e um problema nosso: mensagem generica, sem detalhes
    return {
      statusCode: 500,
      mensagem: 'Ocorreu um erro interno. Tente novamente mais tarde.',
    };
  }

  private traduzirErroDeLeituraDoCorpo(excecao: unknown): ErroTraduzido | null {
    const codigo = (excecao as { status?: unknown; statusCode?: unknown } | null) ?? {};
    const status = typeof codigo.status === 'number' ? codigo.status : codigo.statusCode;
    if (typeof status !== 'number' || status < 400 || status > 499) return null;
    if (status === 413) return { statusCode: 413, mensagem: 'O corpo da requisicao e grande demais' };
    if (status === 400) return { statusCode: 400, mensagem: 'Corpo da requisicao invalido (JSON malformado)' };
    return null; // outros 4xx inesperados continuam como erro interno, para nao esconder um problema nosso
  }

  // Erros que o Nest e a nossa API lancam (400, 401, 403, 404, 409...)
  private traduzirErroHttp(excecao: HttpException): ErroTraduzido {
    const statusCode = excecao.getStatus();
    const corpo = excecao.getResponse();

    let mensagem: string | string[] = excecao.message;
    if (typeof corpo === 'string') {
      mensagem = corpo;
    } else if (typeof corpo === 'object' && 'message' in corpo) {
      mensagem = (corpo as { message: string | string[] }).message;
    }

    // O Nest responde "Cannot GET /rota" em ingles quando a rota nao existe
    if (
      statusCode === 404 &&
      typeof mensagem === 'string' &&
      mensagem.startsWith('Cannot ')
    ) {
      mensagem = 'Rota nao encontrada';
    }

    return { statusCode, mensagem };
  }

  // Erros do banco de dados, traduzidos para respostas HTTP
  private traduzirErroDoPrisma(
    erro: Prisma.PrismaClientKnownRequestError,
  ): ErroTraduzido {
    const causa = (erro.meta as MetaDoPrisma | undefined)?.driverAdapterError
      ?.cause;

    switch (erro.code) {
      case 'P2002': // valor unico repetido (ex.: e-mail ja cadastrado)
        return {
          statusCode: 409,
          mensagem: 'Ja existe um registro com estes dados',
        };
      case 'P2003': // problema de chave estrangeira
        if (causa?.kind === 'RestrictViolation') {
          // tentou apagar algo que outro registro usa
          return {
            statusCode: 409,
            mensagem:
              'Este registro esta em uso por outros registros e nao pode ser removido',
          };
        }
        // tentou ligar a um registro que nao existe
        return {
          statusCode: 404,
          mensagem: 'Um dos registros informados nao existe',
        };
      case 'P2025': // registro nao encontrado
        return { statusCode: 404, mensagem: 'Registro nao encontrado' };
      case 'P2039': // erro do banco; 23514 = regra CHECK violada
        if (causa?.originalCode === '23514') {
          return {
            statusCode: 400,
            mensagem: 'Os dados informados violam uma regra de integridade',
          };
        }
        break;
      case 'ECONNREFUSED': // banco fora do ar
      case 'ETIMEDOUT':
      case 'P1001':
      case 'P1002':
        return { statusCode: 503, mensagem: 'Banco de dados indisponivel' };
    }

    return {
      statusCode: 500,
      mensagem: 'Ocorreu um erro interno. Tente novamente mais tarde.',
    };
  }

  // Resumo seguro para o log: NAO inclui a mensagem completa, porque as mensagens do
  // Prisma trazem os dados da chamada (podem conter senha, e-mail etc.)
  private resumirParaLog(excecao: unknown): string {
    if (!(excecao instanceof Error)) return 'erro desconhecido';

    // So codigos, nunca dados: o do Prisma e, se houver, o original do Postgres
    const { code, meta } = excecao as { code?: string; meta?: MetaDoPrisma };
    const original = meta?.driverAdapterError?.cause?.originalCode;
    const codigos = [code, original].filter(Boolean).join('/');

    // So as linhas da pilha que sao do nosso codigo
    const pilha = (excecao.stack ?? '')
      .split('\n')
      .map((linha) => linha.trim())
      .filter(
        (linha) =>
          linha.startsWith('at ') &&
          !linha.includes('node_modules') &&
          !linha.includes('node:internal'),
      )
      .slice(0, 3)
      .join(' <- ');

    return `${excecao.name}${codigos ? ` [${codigos}]` : ''} ${pilha}`;
  }
}
