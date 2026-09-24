// 🔎 Anti-sniping: impede o "lance de ultima hora". Se um lance chega quando faltam MENOS de
// JANELA_ANTI_SNIPING_MS para o fim do leilao, o prazo passa a ser "agora + EXTENSAO_ANTI_SNIPING_MS".
// Cada novo lance dentro da janela empurra o fim de novo; o leilao so termina quando ninguem
// mais da lance nos minutos finais. A regra e do servidor (dentro da transacao do lance).
export const JANELA_ANTI_SNIPING_MS = 2 * 60_000; // ultimos 2 minutos
export const EXTENSAO_ANTI_SNIPING_MS = 2 * 60_000; // o prazo passa a ser "agora + 2 minutos"

// Devolve o novo fim do leilao, ou null se o lance NAO esta na janela final (nada muda)
export function calcularNovoFim(dataFim: Date, agora: Date): Date | null {
  const restante = dataFim.getTime() - agora.getTime();
  if (restante >= JANELA_ANTI_SNIPING_MS) return null;
  const novoFim = new Date(agora.getTime() + EXTENSAO_ANTI_SNIPING_MS);
  return novoFim > dataFim ? novoFim : null; // nunca encurta o prazo
}

export function segundosAteOFim(dataFim: Date, agora: Date = new Date()): number {
  return Math.max(0, Math.ceil((dataFim.getTime() - agora.getTime()) / 1000));
}
