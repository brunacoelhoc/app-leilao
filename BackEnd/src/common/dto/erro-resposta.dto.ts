import { ApiProperty } from '@nestjs/swagger';

// Formato real de TODO erro da API -- o FiltroExcecoes global garante que
// e sempre este mesmo formato, nunca varia (ver src/common/filters/filtro-excecoes.ts)
export class ErroResposta {
  @ApiProperty({ example: 400, description: 'O mesmo código HTTP da resposta' })
  statusCode: number;

  @ApiProperty({ example: 'Requisição inválida', description: 'Nome do erro em português' })
  erro: string;

  @ApiProperty({
    description:
      'Uma string na maioria dos casos; um array de strings (uma mensagem ' +
      'por campo) quando o erro vem da validação do corpo (400)',
    oneOf: [
      { type: 'string', example: 'Categoria não encontrada' },
      { type: 'array', items: { type: 'string' }, example: ['nome e obrigatório', 'email deve ser um e-mail válido'] },
    ],
  })
  mensagem: string | string[];

  @ApiProperty({ example: '/api/auctions', description: 'Rota chamada, sem a query string (pode ter segredos)' })
  caminho: string;

  @ApiProperty({ example: '2026-09-22T18:00:00.000Z' })
  dataHora: string;
}
