import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Institucional } from '../../core/models';
import { InstitucionalService } from '../../services/institucional.service';

const ATUALIZAR_A_CADA_MS = 60_000;

// 🔎 O rodape so exibe: endereco, contato e "atendendo agora" vem do servidor
@Component({
  selector: 'app-footer',
  imports: [RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css',
})
export class Footer {
  private readonly institucionalService = inject(InstitucionalService);

  protected readonly anoAtual = new Date().getFullYear();
  protected readonly casa = signal<Institucional | null>(null);

  constructor() {
    this.carregar();
    // O "atendendo agora" muda com o horario: pergunta de novo a cada minuto
    const relogio = setInterval(() => this.carregar(), ATUALIZAR_A_CADA_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(relogio));
  }

  private carregar(): void {
    this.institucionalService.obter().subscribe({ next: (c) => this.casa.set(c) });
  }

  protected paraOTopo(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
