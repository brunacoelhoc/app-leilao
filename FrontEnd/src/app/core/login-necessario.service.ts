import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

// 🔎 Visitante que tenta participar de um leilao: em vez de bater numa tela de erro, abre o
// pop-up "Entre ou cadastre-se" e, depois do login, volta para onde ele estava
@Injectable({ providedIn: 'root' })
export class LoginNecessario {
  private readonly auth = inject(AuthService);

  readonly aberto = signal(false);
  readonly destino = signal('/');

  // true = pode seguir; false = abriu o pop-up (quem chamou deve parar)
  exigir(destino: string): boolean {
    if (this.auth.estaLogado()) return true;
    this.abrir(destino);
    return false;
  }

  abrir(destino = '/'): void {
    this.destino.set(destino);
    this.aberto.set(true);
  }

  fechar(): void {
    this.aberto.set(false);
  }
}
