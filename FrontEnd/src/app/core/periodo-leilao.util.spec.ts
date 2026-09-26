import { describe, expect, it } from 'vitest';
import { erroDoFim, erroDoInicio } from './periodo-leilao.util';

// Datas no formato do campo datetime-local (sem fuso), como a tela as recebe
const AGORA = new Date('2026-09-26T12:00:00').getTime();

describe('erroDoInicio', () => {
  it('vazio pede a data', () => {
    expect(erroDoInicio('', AGORA)).toBe('Por favor, escolha a data de início.');
  });

  it('data no passado (ontem) é recusada, com a mesma mensagem da API', () => {
    expect(erroDoInicio('2026-09-25T12:00', AGORA)).toBe('A data de início não pode estar no passado.');
  });

  it('há 4 minutos ainda passa (tolerância do relógio); há 6 minutos não', () => {
    expect(erroDoInicio('2026-09-26T11:56', AGORA)).toBeNull();
    expect(erroDoInicio('2026-09-26T11:54', AGORA)).toBe('A data de início não pode estar no passado.');
  });

  it('agora e o futuro passam', () => {
    expect(erroDoInicio('2026-09-26T12:00', AGORA)).toBeNull();
    expect(erroDoInicio('2026-10-01T09:00', AGORA)).toBeNull();
  });
});

describe('erroDoFim', () => {
  const inicio = '2026-09-27T10:00';

  it('vazio pede a data', () => {
    expect(erroDoFim(inicio, '')).toBe('Por favor, escolha a data de término.');
  });

  it('fim igual ou antes do início é recusado', () => {
    expect(erroDoFim(inicio, '2026-09-27T10:00')).toBe('O término precisa ser depois do início.');
    expect(erroDoFim(inicio, '2026-09-27T09:00')).toBe('O término precisa ser depois do início.');
  });

  it('exatamente 48 horas passa; 48 horas e 1 minuto não', () => {
    expect(erroDoFim(inicio, '2026-09-29T10:00')).toBeNull();
    expect(erroDoFim(inicio, '2026-09-29T10:01')).toBe('O leilão pode durar no máximo 48 horas (2 dias).');
  });

  it('sem início preenchido não reclama do período (a tela cobra o início antes)', () => {
    expect(erroDoFim('', '2026-09-29T10:00')).toBeNull();
  });
});
