// Limite de itens por pagina quando o cliente nao informa nenhum
export const LIMITE_PADRAO = 20;

export interface ParametrosPaginacao {
  pagina?: number;
  limite?: number;
}

export interface PaginacaoCalculada {
  pagina: number;
  limite: number;
  skip: number;
  take: number;
}

// Traduz pagina/limite (1-based, como o usuario pensa) para skip/take (como
// o Prisma espera), aplicando o padrao quando nao informados. Reaproveitado
// por toda listagem do projeto -- e por isso que fica num so lugar
export function calcularPaginacao(params: ParametrosPaginacao): PaginacaoCalculada {
  const pagina = params.pagina ?? 1;
  const limite = params.limite ?? LIMITE_PADRAO;
  return {
    pagina,
    limite,
    skip: (pagina - 1) * limite,
    take: limite,
  };
}

export interface RespostaPaginada<T> {
  dados: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

// Monta a resposta padrao de toda listagem paginada do projeto
export function paginar<T>(
  dados: T[],
  total: number,
  paginacao: Pick<PaginacaoCalculada, 'pagina' | 'limite'>,
): RespostaPaginada<T> {
  return {
    dados,
    total,
    pagina: paginacao.pagina,
    limite: paginacao.limite,
    totalPaginas: total === 0 ? 0 : Math.ceil(total / paginacao.limite),
  };
}
