import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { RankingVendedor } from '../../core/models';
import { RankingService } from '../../services/ranking.service';
import { Avatar } from '../avatar/avatar';

const DURACAO_CONTAGEM_MS = 1200;

// 🔎 "Hall da Fama": pódio com os 3 primeiros e lista com os demais. O backend
// ordena pelo total arrecadado; aqui só se desenha. Os números "sobem" quando
// a seção aparece na tela (e ficam parados se a pessoa pediu menos movimento).
@Component({
  selector: 'app-ranking-vendedores',
  imports: [Avatar],
  templateUrl: './ranking-vendedores.html',
  styleUrl: './ranking-vendedores.css',
})
export class RankingVendedores {
  private readonly rankingService = inject(RankingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly secao = viewChild<ElementRef<HTMLElement>>('secao');

  readonly ranking = signal<RankingVendedor[]>([]);
  readonly carregando = signal(true);
  readonly progresso = signal(0); // 0 -> 1

  readonly podio = computed(() => this.ranking().slice(0, 3));
  readonly demais = computed(() => this.ranking().slice(3));
  private animou = false;

  constructor() {
    this.rankingService.vendedores(10).subscribe({
      next: (lista) => {
        this.ranking.set(lista);
        this.carregando.set(false);
      },
      error: () => this.carregando.set(false),
    });
    // A seção só existe depois que a lista chega: quando ela aparece, começa a observar
    effect(() => {
      if (this.secao()) this.observarEntradaNaTela();
    });
  }

  // Dispara a contagem quando a seção entra na tela (uma vez só)
  private observarEntradaNaTela(): void {
    const el = this.secao()?.nativeElement;
    if (!el || this.animou || this.ranking().length === 0) return;
    if (typeof IntersectionObserver === 'undefined') {
      this.contar();
      return;
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          observador.disconnect();
          this.contar();
        }
      },
      { threshold: 0.25 },
    );
    observador.observe(el);
    this.destroyRef.onDestroy(() => observador.disconnect());
  }

  private contar(): void {
    if (this.animou) return;
    this.animou = true;
    const semMovimento =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.hasAttribute('data-sem-animacoes');
    if (semMovimento) {
      this.progresso.set(1);
      return;
    }
    const inicio = performance.now();
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - inicio) / DURACAO_CONTAGEM_MS);
      this.progresso.set(1 - Math.pow(1 - t, 3));
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  moeda(valor: string | number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(Number(valor) * this.progresso());
  }

  moedaExata(valor: string | number): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor));
  }

  desde(v: RankingVendedor): string {
    return new Date(v.membroDesde).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
  }
}
