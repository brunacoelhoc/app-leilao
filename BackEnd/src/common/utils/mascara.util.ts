// Mascaras de dados sensiveis aplicadas NO BACKEND: o dado real so sai da API
// quando ha um pedido explicito (ex.: ADMIN abrindo o detalhe de um usuario).
// O front so exibe o que recebe -- ele nunca "esconde" um dado que ja chegou

function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function mascararEmail(email: string): string {
  const [usuario, dominio] = email.split('@');
  if (!dominio) return '••••••';
  return `${usuario.charAt(0)}${'•'.repeat(Math.max(usuario.length - 1, 3))}@${dominio}`;
}

export function mascararTelefone(telefone: string | null): string | null {
  if (!telefone) return null;
  return `(••) •••••-${somenteDigitos(telefone).slice(-4)}`;
}

export function mascararCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  return `•••.•••.•••-${somenteDigitos(cpf).slice(-2)}`;
}

export function mascararEndereco(endereco: string | null): string | null {
  if (!endereco) return null;
  return `${endereco.slice(0, 4)}••••••••••`;
}
