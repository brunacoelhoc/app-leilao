import { Component, computed, input } from '@angular/core';
import { acharAvatarPronto, ehImagemUpload } from '../../core/avatares';

// Mostra o avatar de alguem: imagem enviada, animal pronto ou, se nao tiver
// nada escolhido, a inicial do nome
@Component({
  selector: 'app-avatar',
  template: `
    @if (imagem(); as src) {
      <img class="avatar" [src]="src" [alt]="'Avatar de ' + nome()" [style.width.px]="tamanho()" [style.height.px]="tamanho()" />
    } @else if (pronto(); as p) {
      @if (p.imagem) {
        <img class="avatar ilustracao" [src]="p.imagem" [alt]="p.nome" [style.width.px]="tamanho()" [style.height.px]="tamanho()" />
      } @else {
      <span class="avatar emoji" [style.background]="p.cor" [style.width.px]="tamanho()" [style.height.px]="tamanho()" [style.font-size.px]="tamanho() * 0.55" [attr.aria-label]="p.nome">{{ p.emoji }}</span>
      }
    } @else {
      <span class="avatar inicial" [style.width.px]="tamanho()" [style.height.px]="tamanho()" [style.font-size.px]="tamanho() * 0.45">{{ nome().charAt(0) }}</span>
    }
  `,
  styles: `
    .avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      border: 2px solid var(--cor-dourado-suave);
    }
    /* As ilustracoes SVG ja trazem o proprio medalhao */
    .ilustracao {
      border: none;
    }
    /* Medalhao vintage: tom sepia, aro dourado duplo e brilho suave de camafeu */
    .emoji {
      filter: sepia(0.35) saturate(0.9);
      box-shadow:
        inset 0 0 0 3px rgba(255, 248, 230, 0.75),
        inset 0 0 12px rgba(74, 46, 31, 0.35);
      outline: 1px solid var(--cor-dourado);
      outline-offset: 2px;
    }
    .inicial {
      background: var(--cor-dourado);
      color: var(--cor-marrom-escuro);
      font-family: var(--fonte-titulo);
      font-weight: 700;
      text-transform: uppercase;
    }
  `,
})
export class Avatar {
  readonly avatarUrl = input<string | null | undefined>(null);
  readonly nome = input('?');
  readonly tamanho = input(40);

  protected readonly imagem = computed(() => (ehImagemUpload(this.avatarUrl()) ? this.avatarUrl() : null));
  protected readonly pronto = computed(() => acharAvatarPronto(this.avatarUrl()));
}
