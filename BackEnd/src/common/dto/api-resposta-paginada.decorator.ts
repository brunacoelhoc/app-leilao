import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiQuery, getSchemaPath } from '@nestjs/swagger';
import { HEADER_REQUEST_ID } from '../swagger-headers';

// Documenta os dois query params de paginacao (pagina/limite), aceitos por
// toda listagem -- reaproveitado pra nao repetir os mesmos dois @ApiQuery
// em cada endpoint
export function ApiPaginacaoQuery() {
  return applyDecorators(
    ApiQuery({ name: 'pagina', required: false, type: Number, description: 'Página atual (começa em 1, padrão 1)' }),
    ApiQuery({ name: 'limite', required: false, type: Number, description: 'Itens por página (padrão 20, máximo 100)' }),
  );
}

// Decorator generico: documenta uma resposta de listagem paginada
// ({ dados: Modelo[], total, pagina, limite, totalPaginas }) reaproveitando
// o schema real do modelo passado, sem precisar criar uma classe nova pra
// cada listagem
export function ApiRespostaPaginada<TModel extends Type<unknown>>(modelo: TModel) {
  return applyDecorators(
    ApiExtraModels(modelo),
    ApiOkResponse({
      description: 'Lista paginada',
      headers: HEADER_REQUEST_ID,
      schema: {
        properties: {
          dados: { type: 'array', items: { $ref: getSchemaPath(modelo) } },
          total: { type: 'integer', example: 42, description: 'Total de itens (sem paginar)' },
          pagina: { type: 'integer', example: 1 },
          limite: { type: 'integer', example: 20 },
          totalPaginas: { type: 'integer', example: 3 },
        },
      },
    }),
  );
}
