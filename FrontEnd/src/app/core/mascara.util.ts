// Mascaras de digitacao (formatam enquanto a pessoa digita) e mascaras de
// OCULTACAO (escondem o dado ate um clique). O backend sempre recebe/guarda
// so os numeros -- use somenteDigitos() antes de enviar

export function somenteDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

export function formatarTelefone(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function formatarCpf(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function formatarCep(valor: string | null | undefined): string {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

// ---- Ocultacao (mostrado no lugar do dado real ate o clique) ----

export function ocultarEmail(email: string | null | undefined): string {
  if (!email) return '—';
  const [usuario, dominio] = email.split('@');
  if (!dominio) return '••••••';
  return `${usuario.charAt(0)}${'•'.repeat(Math.max(usuario.length - 1, 3))}@${dominio}`;
}

export function ocultarTelefone(telefone: string | null | undefined): string {
  if (!telefone) return '—';
  const d = somenteDigitos(telefone);
  return `(••) •••••-${d.slice(-4)}`;
}

export function ocultarCpf(cpf: string | null | undefined): string {
  if (!cpf) return '—';
  const d = somenteDigitos(cpf);
  return `•••.•••.•••-${d.slice(-2)}`;
}

export function ocultarEndereco(endereco: string | null | undefined): string {
  if (!endereco) return '—';
  return `${endereco.slice(0, 4)}••••••••••`;
}
