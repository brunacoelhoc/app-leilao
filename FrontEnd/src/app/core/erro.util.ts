import { HttpErrorResponse } from '@angular/common/http';
import { ErroApi } from './models';

// A API sempre devolve o mesmo formato de erro (ver FiltroExcecoes no
// backend); "mensagem" pode ser uma string ou uma lista (erro de validacao)
export function mensagemDeErro(erro: unknown, padrao = 'Ocorreu um erro inesperado'): string {
  if (erro instanceof HttpErrorResponse) {
    const corpo = erro.error as ErroApi | undefined;
    if (corpo?.mensagem) {
      return Array.isArray(corpo.mensagem) ? corpo.mensagem.join('; ') : corpo.mensagem;
    }
    if (erro.status === 0) return 'Nao foi possivel conectar com a API';
  }
  return padrao;
}
