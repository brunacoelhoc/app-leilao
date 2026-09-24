// Identidade minima que fica disponivel em request.user apos o token ser validado
export interface UsuarioAutenticado {
  id: string;
  papel: string;
  sessaoId: string; // sessao de login do token (logout e troca de senha revogam a sessao)
}
