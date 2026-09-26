import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LoginNecessario } from '../../core/login-necessario.service';
import { Destaque } from '../../core/models';
import { DestaquesService } from '../../services/destaques.service';
import { DocumentosService } from '../../services/documentos.service';
import { Modal } from '../modal/modal';

const VISIVEIS_DE_CADA_LADO = 2; // 2 à esquerda + centro + 2 à direita = 5 cards

interface CardPosicionado {
  destaque: Destaque;
  deslocamento: number; // -2..2 (0 = card central)
}

// 🔎 Carrossel 3D: até 5 cards ao mesmo tempo, o do centro em destaque (zoom)
// e os das pontas menores e inclinados. Clicar num card abre o modal do evento.
@Component({
  selector: 'app-carrossel-destaques',
  imports: [RouterLink, DatePipe, CurrencyPipe, Modal],
  templateUrl: './carrossel-destaques.html',
  styleUrl: './carrossel-destaques.css',
})
export class CarrosselDestaques {
  private readonly destaquesService = inject(DestaquesService);
  private readonly documentosService = inject(DocumentosService);
  private readonly router = inject(Router);
  private readonly login = inject(LoginNecessario);

  readonly destaques = signal<Destaque[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly centro = signal(0);
  readonly aberto = signal<Destaque | null>(null);
  // Capas já baixadas: id do documento -> URL local (blob)

  readonly visiveis = computed<CardPosicionado[]>(() => {
    const lista = this.destaques();
    const centro = this.centro();
    const saida: CardPosicionado[] = [];
    for (let d = -VISIVEIS_DE_CADA_LADO; d <= VISIVEIS_DE_CADA_LADO; d++) {
      const destaque = lista[this.indiceReal(centro + d)];
      // Sem volta: fora dos limites da lista nao ha card
      if (destaque && (this.circular() || (centro + d >= 0 && centro + d < lista.length))) {
        saida.push({ destaque, deslocamento: d });
      }
    }
    return saida;
  });

  // Com 5 ou mais leiloes o carrossel da a volta (sempre 5 cards na tela)
  readonly circular = computed(() => this.destaques().length >= 2 * VISIVEIS_DE_CADA_LADO + 1);
  readonly temAnterior = computed(() => this.circular() || this.centro() > 0);
  readonly temProximo = computed(() => this.circular() || this.centro() < this.destaques().length - 1);

  private indiceReal(indice: number): number {
    const n = this.destaques().length;
    return this.circular() ? ((indice % n) + n) % n : indice;
  }

  constructor() {
    this.destaquesService.listar().subscribe({
      next: (lista) => {
        this.destaques.set(lista);
        // Começa no meio dos "abertos"/primeiros: o primeiro da lista é o mais relevante
        this.centro.set(0);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
    inject(DestroyRef).onDestroy(() => {
    });
  }

  anterior(): void {
    if (this.temAnterior()) this.irPara(this.centro() - 1);
  }

  proximo(): void {
    if (this.temProximo()) this.irPara(this.centro() + 1);
  }

  irPara(indice: number): void {
    this.centro.set(this.indiceReal(indice));
  }

  // Card do meio: abre os detalhes. Card das pontas: vem para o centro (facilita navegar
  // sem depender so das setas); um segundo clique nele abre os detalhes
  aoClicarCard(item: CardPosicionado): void {
    if (item.deslocamento === 0) {
      this.aberto.set(item.destaque);
    } else {
      this.irPara(this.centro() + item.deslocamento);
    }
  }

  aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'ArrowLeft') {
      evento.preventDefault();
      this.anterior();
    } else if (evento.key === 'ArrowRight') {
      evento.preventDefault();
      this.proximo();
    }
  }

  capaDe(destaque: Destaque): string | null {
    return destaque.capaDocumentoId ? this.documentosService.urlFoto(destaque.capaDocumentoId) : destaque.capaPadrao;
  }

  // "Participar" vai direto para a sala se o leilão tem um item só; senão, para a lista de itens
  destinoParticipar(destaque: Destaque): string[] {
    return destaque.itemUnicoId ? ['/itens', destaque.itemUnicoId] : ['/leiloes', destaque.id];
  }

  // "Participar" exige conta: visitante ve o pop-up de login; quem ja entrou segue para a sala
  participar(destaque: Destaque): void {
    const destino = this.destinoParticipar(destaque);
    if (destaque.rotuloAcao === 'Participar' && !this.login.exigir(this.router.createUrlTree(destino).toString())) return;
    this.aberto.set(null);
    void this.router.navigate(destino);
  }

  classeEtiqueta(destaque: Destaque): string {
    return `etiqueta etiqueta-${destaque.status.toLowerCase()}`;
  }
}
