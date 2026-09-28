// 🔎 Anti-sniping: impede o "lance de ultima hora". Se um lance chega quando faltam MENOS de
// JANELA_ANTI_SNIPING_MS para o fim do leilao, o prazo passa a ser "agora + EXTENSAO_ANTI_SNIPING_MS".
// Cada novo lance dentro da janela empurra o fim de novo; o leilao so termina quando ninguem
// mais da lance nos segundos finais. A regra e do servidor (dentro da transacao do lance).
// Janela e extensao sao iguais de proposito: se a extensao fosse menor que a janela, um lance logo
// no inicio da janela calcularia um novoFim MENOR que o dataFim atual, e a guarda "nunca encurta"
// (abaixo) cancelaria a prorrogacao inteira -- so lances nos ultimos segundos da janela extenderiam de verdade
export const JANELA_ANTI_SNIPING_MS = 30_000; // ultimos 30 segundos
export const EXTENSAO_ANTI_SNIPING_MS = 30_000; // o prazo passa a ser "agora + 30 segundos"

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
