import { Location } from '@angular/common';
import { Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';

// "Voltar" para a tela anterior. Se a pessoa chegou direto por um link (sem historico
// dentro do app), leva para o inicio em vez de sair do site
@Component({
  selector: 'app-voltar',
  template: `
    <button type="button" class="voltar-btn" [class.claro]="claro()" (click)="voltar()" aria-label="Voltar para a tela anterior">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
      Voltar
    </button>
  `,
  styles: `
    :host {
      display: inline-block;
    }
    .voltar-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.4rem 0.95rem 0.4rem 0.7rem;
      border: 1px solid var(--cor-dourado);
      border-radius: 999px;
      background: var(--cor-superficie);
      color: var(--cor-marrom);
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: var(--sombra-suave);
    }
    .voltar-btn:hover {
      background: var(--cor-marrom);
      border-color: var(--cor-marrom);
      color: #fff;
      transform: translateX(-2px);
    }
    .voltar-btn:focus-visible {
      outline: 3px solid var(--cor-dourado);
      outline-offset: 2px;
    }
    /* Sobre fundo escuro (login e cadastro) */
    .claro {
      background: rgba(20, 8, 6, 0.55);
      border-color: rgba(229, 200, 133, 0.6);
      color: #f1d894;
    }
    .claro:hover {
      background: var(--cor-dourado-suave);
      border-color: var(--cor-dourado-suave);
      color: var(--cor-marrom-escuro);
    }
  `,
})
export class Voltar {
  readonly claro = input(false);
  private readonly location = inject(Location);
  private readonly router = inject(Router);

  voltar(): void {
    // navigationId > 1: houve pelo menos uma navegacao dentro do app antes desta
    const navegouAntes = ((window.history.state as { navigationId?: number } | null)?.navigationId ?? 0) > 1;
    if (navegouAntes) this.location.back();
    else void this.router.navigateByUrl('/');
  }
}
