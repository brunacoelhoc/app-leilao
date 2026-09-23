import { Component } from '@angular/core';

// Seção de abertura da página inicial: fundo de galeria/antiquário com
// overlay escuro, título, texto e botão que rola até o carrossel de destaques
@Component({
  selector: 'app-hero',
  templateUrl: './hero.html',
  styleUrl: './hero.css',
})
export class Hero {
  irParaDestaques(): void {
    const alvo = document.getElementById('destaques');
    const semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    alvo?.scrollIntoView({ behavior: semMovimento ? 'auto' : 'smooth', block: 'start' });
    alvo?.querySelector<HTMLElement>('.palco')?.focus({ preventScroll: true });
  }
}
