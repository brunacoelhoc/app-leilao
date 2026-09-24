import { cpfValido } from './cpf.util';

// 🔎 Perfil completo = telefone, CPF valido e endereco. Exigido para DAR LANCE e para CRIAR LEILAO.
// A regra fica so no servidor: a tela apenas exibe a mensagem que ele devolve.
export function camposFaltandoNoPerfil(u: { telefone: string | null; cpf: string | null; endereco: string | null }): string[] {
  const faltando: string[] = [];
  if (!u.telefone) faltando.push('telefone');
  if (!u.cpf) faltando.push('CPF');
  else if (!cpfValido(u.cpf)) faltando.push('CPF válido');
  if (!u.endereco) faltando.push('endereço');
  return faltando;
}

export function mensagemPerfilIncompleto(faltando: string[], acao: string): string {
  return `Complete seu perfil para ${acao}: falta ${faltando.join(', ')}. Acesse "Meu perfil" no menu.`;
}

// O que falta no perfil de uma conta (ADMIN nao precisa de perfil completo: nao compra nem vende)
export function camposFaltandoDaConta(u: { papel: string; telefone: string | null; cpf: string | null; endereco: string | null }): string[] {
  return u.papel === 'ADMIN' ? [] : camposFaltandoNoPerfil(u);
}
