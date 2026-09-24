import { registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import { ApplicationConfig, LOCALE_ID, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';
import { routes } from './app.routes';

// Datas e moedas dos pipes (date, currency) em portugues do Brasil (ex.: "setembro", "R$ 1.234,50")
registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useValue: 'pt-BR' },
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Antes da primeira tela: se ha token, carrega o usuario do servidor (nada de dados pessoais no navegador)
    provideAppInitializer(() => inject(AuthService).carregarSessao()),
  ],
};
