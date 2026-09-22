import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';

// Pega o usuario logado (colocado pelo JwtAuthGuard). Uso: @CurrentUser() ou @CurrentUser('id')
export const CurrentUser = createParamDecorator(
  (campo: keyof UsuarioAutenticado | undefined, contexto: ExecutionContext) => {
    const requisicao = contexto
      .switchToHttp()
      .getRequest<{ user: UsuarioAutenticado }>();
    return campo ? requisicao.user[campo] : requisicao.user;
  },
);
