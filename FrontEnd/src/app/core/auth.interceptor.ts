import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { environment } from './environment';
import { AuthService } from './auth.service';

// Toda requisicao pra API precisa da X-API-KEY (exigencia do backend, sem
// excecao nenhuma rota). O token JWT so e anexado se o usuario estiver logado
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Nao mexe em requisicoes pra fora da nossa API (ex.: nenhuma hoje, mas
  // evita anexar a chave/token em chamadas externas no futuro)
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.token();

  const headers: Record<string, string> = {
    'X-API-KEY': environment.apiKey,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return next(req.clone({ setHeaders: headers }));
};
