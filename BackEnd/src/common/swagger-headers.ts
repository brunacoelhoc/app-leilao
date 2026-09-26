// Cabecalho presente em TODA resposta da API, sucesso ou erro (gerado pelo
// IdRequisicaoMiddleware, ver src/common/middlewares/id-requisicao.middleware.ts).
// Reaproveitado nas respostas de sucesso de cada rota, para o Swagger documentar
export const HEADER_REQUEST_ID = {
  'X-Request-Id': {
    description: 'Id único desta requisição, para cruzar com os logs do servidor',
    schema: { type: 'string', format: 'uuid' },
  },
};

// So nas respostas 429 (rate limit excedido)
export const HEADER_RETRY_AFTER = {
  'Retry-After': {
    description: 'Segundos até poder tentar de novo',
    schema: { type: 'integer', example: 60 },
  },
};
