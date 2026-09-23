import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { mensagemDeErro } from '../../core/erro.util';
import { IndicadoresLeilao, ItemLeilao, Leilao, RespostaPaginada } from '../../core/models';
import { ROTULO_STATUS_ITEM, ROTULO_STATUS_LEILAO, classeSeloItem, classeSeloLeilao } from '../../core/status.util';
import { ItensService } from '../../services/itens.service';
import { LeiloesService } from '../../services/leiloes.service';

@Component({
  selector: 'app-leilao-detalhe',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './leilao-detalhe.html',
})
export class LeilaoDetalhe {
  private readonly route = inject(ActivatedRoute);
  private readonly leiloesService = inject(LeiloesService);
  private readonly itensService = inject(ItensService);

  protected readonly ROTULO_STATUS_LEILAO = ROTULO_STATUS_LEILAO;
  protected readonly ROTULO_STATUS_ITEM = ROTULO_STATUS_ITEM;
  protected readonly classeSeloLeilao = classeSeloLeilao;
  protected readonly classeSeloItem = classeSeloItem;

  readonly leilao = signal<Leilao | null>(null);
  readonly indicadores = signal<IndicadoresLeilao | null>(null);
  readonly itens = signal<RespostaPaginada<ItemLeilao> | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  busca = '';
  private readonly leilaoId = this.route.snapshot.paramMap.get('id')!;
  private temporizadorBusca?: ReturnType<typeof setTimeout>;

  // Espera o usuario parar de digitar (300ms) antes de buscar os itens
  aoDigitarBusca(texto: string): void {
    this.busca = texto;
    clearTimeout(this.temporizadorBusca);
    this.temporizadorBusca = setTimeout(() => this.carregarItens(), 300);
  }

  carregarItens(): void {
    this.itensService.listar({ leilaoId: this.leilaoId, limite: 50, busca: this.busca.trim() }).subscribe({
      next: (itens) => {
        this.itens.set(itens);
        this.carregando.set(false);
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro));
        this.carregando.set(false);
      },
    });
  }

  constructor() {
    const id = this.leilaoId;

    this.leiloesService.buscarPorId(id).subscribe({
      next: (leilao) => this.leilao.set(leilao),
      error: (erro) => this.erro.set(mensagemDeErro(erro, 'Leilão não encontrado')),
    });
    this.leiloesService.indicadores(id).subscribe({
      next: (indicadores) => this.indicadores.set(indicadores),
    });
    this.carregarItens();
  }
}
