import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LoginNecessario } from '../../core/login-necessario.service';
import { mensagemDeErro } from '../../core/erro.util';
import { IndicadoresLeilao, ItemLeilao, Leilao, RespostaPaginada } from '../../core/models';
import { ROTULO_STATUS_ITEM, ROTULO_STATUS_LEILAO, classeSeloItem, classeSeloLeilao } from '../../core/status.util';
import { DocumentosService } from '../../services/documentos.service';
import { ItensService } from '../../services/itens.service';
import { LeiloesService } from '../../services/leiloes.service';
import { ChatLeilao } from '../../shared/chat-leilao/chat-leilao';

const DURACAO_CONTAGEM_MS = 900;
const INTERVALO_STATUS_MS = 10000;

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

@Component({
  selector: 'app-leilao-detalhe',
  imports: [Voltar, RouterLink, DatePipe, FormsModule, ChatLeilao],
  templateUrl: './leilao-detalhe.html',
  styleUrl: './leilao-detalhe.css',
})
export class LeilaoDetalhe {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly login = inject(LoginNecessario);
  private readonly leiloesService = inject(LeiloesService);
  private readonly itensService = inject(ItensService);
  private readonly documentosService = inject(DocumentosService);

  protected readonly ROTULO_STATUS_LEILAO = ROTULO_STATUS_LEILAO;
  protected readonly ROTULO_STATUS_ITEM = ROTULO_STATUS_ITEM;
  protected readonly classeSeloLeilao = classeSeloLeilao;
  protected readonly classeSeloItem = classeSeloItem;

  readonly leilao = signal<Leilao | null>(null);
  readonly indicadores = signal<IndicadoresLeilao | null>(null);
  readonly itens = signal<RespostaPaginada<ItemLeilao> | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);


  // 0 -> 1: faz os numeros dos indicadores "subirem" ate o valor final
  readonly progresso = signal(0);

  // Fundo do cabecalho: a capa que o servidor indica para o leilao (foto enviada ou obra do acervo)
  readonly capaDoLeilao = computed(() => {
    const l = this.leilao();
    if (!l) return null;
    return l.capaDocumentoId ? this.documentosService.urlFoto(l.capaDocumentoId) : (l.capaPadrao ?? null);
  });

  // Barra de andamento: os percentuais chegam prontos do servidor
  readonly fatias = computed(() => this.indicadores()?.percentuais ?? null);

  busca = '';
  private readonly leilaoId = this.route.snapshot.paramMap.get('id')!;
  protected readonly idDoLeilao = this.leilaoId;
  private temporizadorBusca?: ReturnType<typeof setTimeout>;

  constructor() {
    const id = this.leilaoId;

    this.leiloesService.buscarPorId(id).subscribe({
      next: (leilao) => {
        this.leilao.set(leilao);
      },
      error: (erro) => this.erro.set(mensagemDeErro(erro, 'Leilão não encontrado')),
    });
    this.leiloesService.indicadores(id).subscribe({
      next: (indicadores) => {
        this.indicadores.set(indicadores);
        this.contarAte();
      },
    });
    this.carregarItens();

    // O status so muda no servidor (o robo fecha/abre a cada 5s). Enquanto o leilao
    // esta aberto ou agendado, reconfere de tempos em tempos para o chat e os
    // selos deixarem de mostrar "Ao vivo" depois que ele encerra
    const acompanhar = setInterval(() => {
      const status = this.leilao()?.status;
      if (status !== 'OPEN' && status !== 'SCHEDULED') return;
      this.leiloesService.buscarPorId(id).subscribe({
        next: (atual) => {
          if (atual.status === status) return;
          this.leilao.set(atual);
          this.carregarItens();
        },
      });
    }, INTERVALO_STATUS_MS);

    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.temporizadorBusca);
      clearInterval(acompanhar);
    });
  }

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

  // "Participar" exige conta: visitante ve o pop-up de login
  participar(item: ItemLeilao): void {
    if (this.login.exigir(`/itens/${item.id}`)) void this.router.navigate(['/itens', item.id]);
  }

  capaDe(item: ItemLeilao): string | null {
    // Sem foto enviada: obra do acervo; com foto ainda baixando: null (mostra o placeholder)
    return item.capaDocumentoId ? this.documentosService.urlFoto(item.capaDocumentoId) : item.capaPadrao;
  }

  // Ficha tecnica: so os campos que existem
  ficha(item: ItemLeilao): { rotulo: string; valor: string }[] {
    const campos: [string, string | null][] = [
      ['Autor', item.autor],
      ['Época', item.periodo],
      ['Técnica', item.tecnica],
      ['Dimensões', item.dimensoes],
      ['Conservação', item.conservacao],
    ];
    return campos.filter((c): c is [string, string] => !!c[1]).map(([rotulo, valor]) => ({ rotulo, valor }));
  }

  // Numero do indicador na animacao de contagem
  n(valor: number): string {
    return Math.round(valor * this.progresso()).toLocaleString('pt-BR');
  }

  // Dinheiro dos indicadores (acompanha a animacao de contagem)
  moedaAnimada(valor: string | number | null): string {
    const numero = Number(valor ?? 0) * this.progresso();
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
  }

  moeda(valor: string | number | null): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0));
  }

  private contarAte(): void {
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
      this.progresso.set(1 - Math.pow(1 - t, 3)); // desacelera no final
      if (t < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
}
