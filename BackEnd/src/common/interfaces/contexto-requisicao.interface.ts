// Dados da requisicao usados so para auditoria/log (nunca para regras de negocio)
export interface ContextoRequisicao {
  ipOrigem?: string;
  userAgent?: string;
  idRequisicao?: string;
}
