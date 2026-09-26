// Regras do período de um leilão, iguais às da API (assim a tela avisa ANTES de enviar e a mensagem é a mesma):
// o início não pode estar no passado (com 5 minutos de tolerância para o relógio do aparelho), o fim precisa vir
// depois do início e o leilão dura no máximo 48 horas
export const TOLERANCIA_INICIO_MS = 5 * 60_000;
export const DURACAO_MAXIMA_MS = 48 * 3_600_000;

// Devolve a mensagem do problema ou null se está tudo certo. Datas no formato do campo datetime-local
export function erroDoInicio(inicio: string, agora = Date.now()): string | null {
  if (!inicio) return 'Por favor, escolha a data de início.';
  if (new Date(inicio).getTime() < agora - TOLERANCIA_INICIO_MS) return 'A data de início não pode estar no passado.';
  return null;
}

export function erroDoFim(inicio: string, fim: string): string | null {
  if (!fim) return 'Por favor, escolha a data de término.';
  if (!inicio) return null;
  const duracao = new Date(fim).getTime() - new Date(inicio).getTime();
  if (duracao <= 0) return 'O término precisa ser depois do início.';
  if (duracao > DURACAO_MAXIMA_MS) return 'O leilão pode durar no máximo 48 horas (2 dias).';
  return null;
}
