import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Papel } from './models';

// So deixa passar quem esta logado (a seguranca de verdade e sempre
// conferida de novo no backend -- isto aqui e so pra nao mostrar a tela)
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estaLogado()) return true;
  return router.createUrlTree(['/login']);
};

// Fabrica de guard: so libera se o usuario logado tiver um dos papeis
export function papelGuard(...papeisPermitidos: Papel[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.estaLogado()) return router.createUrlTree(['/login']);
    if (papeisPermitidos.includes(auth.papel()!)) return true;
    return router.createUrlTree(['/']);
  };
}
