import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from './environment';
import { AuthService } from './auth.service';

// Marca a requisicao que ja foi refeita depois de renovar o token (evita repetir para sempre)
const JA_RENOVOU = new HttpContextToken<boolean>(() => false);

// Toda requisicao pra API precisa da X-API-KEY (exigencia do backend, sem
// excecao nenhuma rota). O token JWT so e anexado se o usuario estiver logado.
// Se o acesso vencer (401), a tela pede um par novo com o refresh token e refaz a chamada uma vez;
// se nao der (sessao encerrada ou expirada), volta ao login. Quem decide tudo isso e o servidor.
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Nao mexe em requisicoes pra fora da nossa API (ex.: nenhuma hoje, mas
  // evita anexar a chave/token em chamadas externas no futuro)
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);

  const comCredenciais = (token: string | null) =>
    req.clone({ setHeaders: { 'X-API-KEY': environment.apiKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });

  return next(comCredenciais(auth.token())).pipe(
    catchError((erro: unknown) => {
      const rotaDeAuth = req.url.startsWith(`${environment.apiUrl}/auth/`);
      const podeRenovar =
        erro instanceof HttpErrorResponse && erro.status === 401 && !rotaDeAuth && auth.temRefreshToken() && !req.context.get(JA_RENOVOU);
      if (!podeRenovar) return throwError(() => erro);

      return from(auth.renovar()).pipe(
        switchMap((renovou) => {
          if (!renovou) {
            auth.limparSessao();
            void router.navigateByUrl('/login');
            return throwError(() => erro);
          }
          return next(comCredenciais(auth.token()).clone({ context: req.context.set(JA_RENOVOU, true) }));
        }),
      );
    }),
  );
};
