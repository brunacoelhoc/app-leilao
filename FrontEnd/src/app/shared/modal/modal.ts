import { Component, HostListener, input, output } from '@angular/core';

// Janela modal reutilizavel (perfil, detalhes de card...). O pai controla se
// ela existe com @if e escuta (fechar) para remove-la
@Component({
  selector: 'app-modal',
  template: `
    <div class="fundo" (click)="fechar.emit()"></div>
    <div class="janela" role="dialog" aria-modal="true" [attr.aria-label]="titulo()" [style.max-width.px]="largura()">
      <header>
        <h2>{{ titulo() }}</h2>
        <button type="button" class="x" (click)="fechar.emit()" aria-label="Fechar">✕</button>
      </header>
      <div class="corpo"><ng-content /></div>
    </div>
  `,
  styleUrl: './modal.css',
})
export class Modal {
  readonly titulo = input('');
  readonly largura = input(640);
  readonly fechar = output<void>();

  @HostListener('document:keydown.escape')
  aoApertarEsc(): void {
    this.fechar.emit();
  }
}
