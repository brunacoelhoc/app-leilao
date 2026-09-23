// O HttpClient reclama se um valor do "params" for undefined/null -- esta
// funcao filtra antes de montar a query string. Reaproveitada por todo service
export function paramsSemVazios(obj: Record<string, unknown>): Record<string, string | number> {
  const limpo: Record<string, string | number> = {};
  for (const [chave, valor] of Object.entries(obj)) {
    if (valor !== undefined && valor !== null && valor !== '') {
      limpo[chave] = valor as string | number;
    }
  }
  return limpo;
}
