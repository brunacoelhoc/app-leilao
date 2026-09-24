import { EXTENSAO_ANTI_SNIPING_MS, JANELA_ANTI_SNIPING_MS, calcularNovoFim, segundosAteOFim } from './anti-sniping';

describe('anti-sniping (regra pura)', () => {
  const agora = new Date('2026-09-24T20:00:00.000Z');
  const em = (ms: number) => new Date(agora.getTime() + ms);

  it('lance com mais tempo que a janela NAO estende o prazo', () => {
    expect(calcularNovoFim(em(JANELA_ANTI_SNIPING_MS + 1000), agora)).toBeNull();
    expect(calcularNovoFim(em(JANELA_ANTI_SNIPING_MS), agora)).toBeNull(); // exatamente na borda: fora da janela
    expect(calcularNovoFim(em(3_600_000), agora)).toBeNull();
  });

  it('lance dentro da janela estende: o novo fim e "agora + extensao"', () => {
    const novo = calcularNovoFim(em(30_000), agora);
    expect(novo?.getTime()).toBe(agora.getTime() + EXTENSAO_ANTI_SNIPING_MS);
  });

  it('nunca encurta o prazo (fim ja alem de agora + extensao nao muda)', () => {
    // Se a extensao fosse maior que a janela, um fim intermediario poderia "encolher": aqui garante que nao
    expect(calcularNovoFim(em(JANELA_ANTI_SNIPING_MS - 1), agora)?.getTime()).toBeGreaterThan(em(JANELA_ANTI_SNIPING_MS - 1).getTime());
  });

  it('segundosAteOFim arredonda para cima e nunca fica negativo', () => {
    expect(segundosAteOFim(em(1500), agora)).toBe(2);
    expect(segundosAteOFim(em(-5000), agora)).toBe(0);
  });
});
