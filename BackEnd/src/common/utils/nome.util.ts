// 🔎 O historico de lances e o evento em tempo real sao PUBLICOS (sem login): so o primeiro nome
// e a inicial do segundo saem daqui ("Maria Silva Santos" -> "Maria S."). A tela nao decide isso.
export function nomeAbreviado(nome?: string | null): string {
  if (!nome) return 'Licitante';
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes[1][0]}.` : partes[0];
}
