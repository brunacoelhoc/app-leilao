import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LoginNecessario } from '../../core/login-necessario.service';
import { Modal } from '../modal/modal';

@Component({
  selector: 'app-login-necessario',
  imports: [Modal, RouterLink],
  template: `
    @if (login.aberto()) {
      <app-modal titulo="Entre para participar" [largura]="460" (fechar)="login.fechar()">
        <div class="conteudo">
          <div class="medalhao" aria-hidden="true">⚖</div>
          <p class="texto">
            Para dar lances, acompanhar seus leilões e conversar no chat, você precisa de uma conta.
            <strong>É rápido e gratuito.</strong>
          </p>
          <div class="botoes">
            <a routerLink="/login" [queryParams]="{ returnUrl: login.destino() }" class="ouro" (click)="login.fechar()">Entrar</a>
            <a routerLink="/registrar" [queryParams]="{ returnUrl: login.destino() }" class="borda" (click)="login.fechar()">Criar conta</a>
          </div>
          <button type="button" class="depois" (click)="login.fechar()">Agora não, continuar explorando</button>
        </div>
      </app-modal>
    }
  `,
  styles: `
    .conteudo {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      text-align: center;
    }
    .medalhao {
      display: grid;
      place-items: center;
      width: 4.2rem;
      height: 4.2rem;
      border-radius: 50%;
      font-size: 2rem;
      color: var(--cor-dourado-suave);
      background: radial-gradient(circle, #6b1420, #2f1c11);
      border: 3px solid var(--cor-dourado-suave);
      box-shadow: 0 0 0 6px color-mix(in srgb, var(--cor-dourado-suave) 22%, transparent);
    }
    .texto {
      margin: 0;
      font-size: 1.05rem;
      line-height: 1.5;
    }
    .botoes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.6rem;
      width: 100%;
    }
    .botoes a {
      flex: 1 1 9rem;
      padding: 0.7rem 1rem;
      border-radius: 999px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
    }
    .ouro {
      color: #fff;
      background: linear-gradient(135deg, var(--cor-dourado), var(--cor-marrom));
    }
    .borda {
      color: var(--cor-bordo);
      border: 1px solid var(--cor-bordo);
    }
    .depois {
      border: none;
      background: none;
      color: var(--cor-texto-suave);
      font-size: 0.85rem;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
})
export class LoginNecessarioPopup {
  protected readonly login = inject(LoginNecessario);
}
