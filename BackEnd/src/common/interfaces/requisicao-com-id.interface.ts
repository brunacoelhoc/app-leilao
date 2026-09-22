import type { Request } from 'express';

// A requisicao do Express, com o id unico que nos acrescentamos
export interface RequisicaoComId extends Request {
  idRequisicao?: string;
}
