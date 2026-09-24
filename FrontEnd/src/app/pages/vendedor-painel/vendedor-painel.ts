import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro.util';
import { formatarCep, somenteDigitos } from '../../core/mascara.util';
import { AuctionStatus, Categoria, Leilao, RespostaPaginada } from '../../core/models';
import { ROTULO_STATUS_LEILAO, classeSeloLeilao } from '../../core/status.util';
import { CategoriasService } from '../../services/categorias.service';
import { DocumentosService } from '../../services/documentos.service';
import { ItensService } from '../../services/itens.service';
import { LeiloesService } from '../../services/leiloes.service';
import { AcervoFotos } from '../../shared/acervo-fotos/acervo-fotos';
import { Modal } from '../../shared/modal/modal';
import { Paginacao } from '../../shared/paginacao/paginacao';

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

@Component({
  selector: 'app-vendedor-painel',
  imports: [Voltar, AcervoFotos, RouterLink, DatePipe, FormsModule, Modal, Paginacao],
  templateUrl: './vendedor-painel.html',
  styleUrl: './vendedor-painel.css',
})
export class VendedorPainel {
  private readonly leiloesService = inject(LeiloesService);
  private readonly itensService = inject(ItensService);
  private readonly categoriasService = inject(CategoriasService);
  private readonly documentosService = inject(DocumentosService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alerta = inject(AlertaService);

  protected readonly ROTULO_STATUS_LEILAO = ROTULO_STATUS_LEILAO;
  protected readonly classeSeloLeilao = classeSeloLeilao;

  readonly leiloes = signal<RespostaPaginada<Leilao> | null>(null);
  readonly primeiroNome = computed(() => (this.auth.usuario()?.nome ?? '').split(' ')[0]);

  // Quantos leiloes o vendedor tem em cada status (alimenta o painel e os filtros)
  readonly contagens = signal<Record<string, number> | null>(null);
  readonly total = computed(() => this.contagens()?.['total'] ?? 0);

  readonly carregando = signal(true);
  private pagina = 1;
  limite = 5;
  busca = '';
  status: AuctionStatus | '' = '';
  protected readonly statusOpcoes = Object.entries(ROTULO_STATUS_LEILAO) as [AuctionStatus, string][];
  private temporizadorBusca?: ReturnType<typeof setTimeout>;

  // ---- Modal "novo leilao" (leilao + primeiro item + foto) ----
  readonly modalAberto = signal(false);
  readonly categorias = signal<Categoria[]>([]);
  readonly criando = signal(false);
  readonly erroForm = signal<string | null>(null);

  // Validacao por campo: a mensagem so aparece depois de sair do campo ou de tentar criar
  private readonly tocados = signal<Record<string, boolean>>({});
  readonly tentou = signal(false);

  titulo = '';
  descricao = '';
  dataInicio = '';
  dataFim = '';
  itemTitulo = '';
  itemDescricao = '';
  itemPrecoInicial: number | null = null;
  itemIncremento: number | null = null;
  itemCep = '';
  itemCategoriaId = '';
  foto: File | null = null;
  readonly fotoPreview = signal<string | null>(null);

  constructor() {
    this.carregar();
    this.carregarContagens();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.temporizadorBusca);
    });
    this.categoriasService.listar(1, 100).subscribe({ next: (r) => this.categorias.set(r.dados) });
  }

  // As contagens vem prontas do servidor (uma consulta so)
  private carregarContagens(): void {
    this.leiloesService.resumo(this.auth.usuario()?.id).subscribe({ next: (r) => this.contagens.set(r) });
  }

  escolherStatus(status: AuctionStatus | ''): void {
    this.status = status;
    this.aplicarFiltros();
  }

  capaDe(leilao: Leilao): string | null {
    // Sem foto enviada: obra do acervo; foto ainda baixando: null (mostra o placeholder)
    return leilao.capaDocumentoId ? this.documentosService.urlFoto(leilao.capaDocumentoId) : (leilao.capaPadrao ?? null);
  }

  carregar(): void {
    this.carregando.set(true);
    this.leiloesService
      .listar({
        vendedorId: this.auth.usuario()?.id,
        pagina: this.pagina,
        limite: this.limite,
        busca: this.busca.trim(),
        status: this.status,
      })
      .subscribe({
        next: (r) => {
          this.leiloes.set(r);
          this.carregando.set(false);
        },
        error: (e) => {
          this.carregando.set(false);
          void this.alerta.erro('Erro ao carregar seus leilões', mensagemDeErro(e));
        },
      });
  }

  // Espera o usuario parar de digitar (300ms) antes de buscar
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

  tocar(campo: string): void {
    this.tocados.update((atual) => ({ ...atual, [campo]: true }));
  }

  // 🔎 Cada campo tem a sua mensagem; null = campo ok (ou ainda nao tocado)
  erro(campo: string): string | null {
    if (!this.tentou() && !this.tocados()[campo]) return null;
    const vazio = (v: string) => v.trim() === '';
    switch (campo) {
      case 'titulo':
        return vazio(this.titulo) ? 'Por favor, insira o título do leilão.' : null;
      case 'dataInicio':
        return !this.dataInicio ? 'Por favor, escolha a data de início.' : null;
      case 'dataFim':
        if (!this.dataFim) return 'Por favor, escolha a data de término.';
        if (this.dataInicio && new Date(this.dataFim) <= new Date(this.dataInicio)) {
          return 'O término precisa ser depois do início.';
        }
        return null;
      case 'itemTitulo':
        return vazio(this.itemTitulo) ? 'Por favor, dê um nome à peça.' : null;
      case 'itemPreco':
        if (this.itemPrecoInicial === null) return 'Por favor, informe o preço inicial.';
        return this.itemPrecoInicial <= 0 ? 'O preço inicial deve ser maior que zero.' : null;
      case 'itemIncremento':
        if (this.itemIncremento === null) return 'Por favor, informe o incremento mínimo.';
        return this.itemIncremento <= 0 ? 'O incremento deve ser maior que zero.' : null;
      case 'itemCep': {
        const digitos = somenteDigitos(this.itemCep);
        if (digitos.length === 0) return 'Por favor, insira o CEP de retirada.';
        return digitos.length !== 8 ? 'O CEP precisa ter 8 números.' : null;
      }
      case 'itemCategoria':
        return !this.itemCategoriaId ? 'Por favor, escolha uma categoria.' : null;
      default:
        return null;
    }
  }

  private readonly CAMPOS = ['titulo', 'dataInicio', 'dataFim', 'itemTitulo', 'itemPreco', 'itemIncremento', 'itemCep', 'itemCategoria'];

  abrirModal(): void {
    this.tocados.set({});
    this.tentou.set(false);
    this.titulo = this.descricao = this.dataInicio = this.dataFim = '';
    this.itemTitulo = this.itemDescricao = this.itemCep = this.itemCategoriaId = '';
    this.itemPrecoInicial = this.itemIncremento = null;
    this.foto = null;
    this.fotoPreview.set(null);
    this.erroForm.set(null);
    this.modalAberto.set(true);
  }

  mascararCep(): void {
    this.itemCep = formatarCep(this.itemCep);
  }

  // Foto escolhida no acervo: segue o mesmo caminho de um arquivo do computador
  usarFotoDoAcervo(arquivo: File): void {
    this.foto = arquivo;
    this.fotoPreview.set(URL.createObjectURL(arquivo));
  }

  aoEscolherFoto(evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0] ?? null;
    this.erroForm.set(null);
    if (!arquivo) return;
    this.tocar('foto');
    this.foto = arquivo;
    this.fotoPreview.set(URL.createObjectURL(arquivo));
  }

  async criar(): Promise<void> {
    // Mostra a mensagem de todos os campos com problema e leva a tela ate o primeiro
    this.tentou.set(true);
    if (this.CAMPOS.some((c) => this.erro(c))) {
      this.erroForm.set('Falta pouco! Confira os campos destacados.');
      setTimeout(() =>
        document.querySelector<HTMLElement>('.modal-leilao .invalido')?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
      );
      return;
    }

    this.erroForm.set(null);
    this.criando.set(true);
    let leilaoId: string | null = null;
    try {
      // 1) o leilao (nasce como rascunho)
      const leilao = await firstValueFrom(
        this.leiloesService.criar({
          titulo: this.titulo.trim(),
          descricao: this.descricao.trim() || undefined, // opcional
          dataInicio: new Date(this.dataInicio).toISOString(),
          dataFim: new Date(this.dataFim).toISOString(),
        }),
      );
      leilaoId = leilao.id;

      // 2) o primeiro item do leilao (o endereco vem do ViaCEP no backend)
      const item = await firstValueFrom(
        this.itensService.criar({
          titulo: this.itemTitulo.trim(),
          descricao: this.itemDescricao.trim() || undefined, // opcional
          precoInicial: this.itemPrecoInicial!,
          incrementoMinimo: this.itemIncremento!,
          cep: somenteDigitos(this.itemCep),
          leilaoId: leilao.id,
          categoriaId: this.itemCategoriaId,
        }),
      );

      // 3) a foto do item (opcional: sem foto, o servidor usa uma capa padrao)
      if (this.foto) await firstValueFrom(this.documentosService.enviar(item.id, 'PHOTO', this.foto));

      this.modalAberto.set(false);
      await this.alerta.sucesso('Leilão criado!', 'Ele está como rascunho. Agende quando estiver pronto.');
      await this.router.navigate(['/vendedor/leiloes', leilao.id]);
    } catch (erro) {
      const mensagem = mensagemDeErro(erro, 'Não foi possível concluir o cadastro');
      if (leilaoId) {
        // o leilao ja existe (rascunho): leva a pessoa la para completar
        this.modalAberto.set(false);
        await this.alerta.erro('Leilão criado, mas faltou um passo', `${mensagem}. Complete o cadastro do item na tela do leilão.`);
        await this.router.navigate(['/vendedor/leiloes', leilaoId]);
      } else {
        this.erroForm.set(mensagem);
      }
    } finally {
      this.criando.set(false);
    }
  }
}
