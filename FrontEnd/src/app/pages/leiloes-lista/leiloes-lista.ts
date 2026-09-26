import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro.util';
import { AuctionStatus, Leilao, RespostaPaginada } from '../../core/models';
import { ROTULO_STATUS_LEILAO, classeSeloLeilao } from '../../core/status.util';
import { DocumentosService } from '../../services/documentos.service';
import { LeiloesService } from '../../services/leiloes.service';
import { CarrosselDestaques } from '../../shared/carrossel-destaques/carrossel-destaques';
import { Hero } from '../../shared/hero/hero';
import { Paginacao } from '../../shared/paginacao/paginacao';
import { RankingVendedores } from '../../shared/ranking-vendedores/ranking-vendedores';

@Component({
  selector: 'app-leiloes-lista',
  imports: [RouterLink, DatePipe, FormsModule, Paginacao, Hero, CarrosselDestaques, RankingVendedores],
  templateUrl: './leiloes-lista.html',
  styleUrl: './leiloes-lista.css',
})
export class LeiloesLista {
  private readonly leiloesService = inject(LeiloesService);
  private readonly documentosService = inject(DocumentosService);


  protected readonly ROTULO_STATUS_LEILAO = ROTULO_STATUS_LEILAO;
  protected readonly classeSeloLeilao = classeSeloLeilao;

  readonly resposta = signal<RespostaPaginada<Leilao> | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  private pagina = 1;
  limite = 5;

  // Filtros da tela (busca por texto e status)
  busca = '';
  status: AuctionStatus | '' = '';
  private readonly auth = inject(AuthService);
  // Rascunho e Cancelado são privados (a API só devolve para o dono e o ADMIN): não adianta oferecer o filtro a visitantes e compradores
  protected get statusOpcoes(): [AuctionStatus, string][] {
    const podeVerRestritos = ['SELLER', 'ADMIN'].includes(this.auth.usuario()?.papel ?? '');
    return (Object.entries(ROTULO_STATUS_LEILAO) as [AuctionStatus, string][]).filter(
      ([status]) => podeVerRestritos || (status !== 'DRAFT' && status !== 'CANCELED'),
    );
  }
  private temporizadorBusca?: ReturnType<typeof setTimeout>;

  constructor() {
    this.carregar();
    inject(DestroyRef).onDestroy(() => {
    });
  }

  capaDe(leilao: Leilao): string | null {
    return leilao.capaDocumentoId ? this.documentosService.urlFoto(leilao.capaDocumentoId) : (leilao.capaPadrao ?? null);
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.leiloesService
      .listar({ pagina: this.pagina, limite: this.limite, busca: this.busca.trim(), status: this.status })
      .subscribe({
      next: (resposta) => {
        this.resposta.set(resposta);
        this.carregando.set(false);
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro, 'Nao foi possivel carregar os leiloes'));
        this.carregando.set(false);
      },
    });
  }

  // Espera o usuario parar de digitar (300ms) antes de buscar, pra nao
  // chamar a API a cada letra
  aoDigitarBusca(texto: string): void {
    this.busca = texto;
    clearTimeout(this.temporizadorBusca);
    this.temporizadorBusca = setTimeout(() => this.aplicarFiltros(), 300);
  }

  aplicarFiltros(): void {
    this.pagina = 1;
    this.carregar();
  }

  limparFiltros(): void {
    this.busca = '';
    this.status = '';
    this.aplicarFiltros();
  }

  mudarPagina(pagina: number): void {
    this.pagina = pagina;
    this.carregar();
  }

  mudarLimite(limite: number): void {
    this.limite = limite;
    this.pagina = 1;
    this.carregar();
  }
}
