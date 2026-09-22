// Identidade minima que fica disponivel em request.user apos o token ser validado
export interface UsuarioAutenticado {
  id: string;
  papel: string;
}
