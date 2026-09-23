import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
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

@Component({
  selector: 'app-vendedor-painel',
  imports: [AcervoFotos, RouterLink, DatePipe, FormsModule, Modal, Paginacao],
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
    this.categoriasService.listar(1, 100).subscribe({ next: (r) => this.categorias.set(r.dados) });
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

  abrirModal(): void {
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
    this.foto = arquivo;
    this.fotoPreview.set(URL.createObjectURL(arquivo));
  }

  async criar(): Promise<void> {
    if (!this.foto) {
      this.erroForm.set('A foto do item é obrigatória.');
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
          descricao: this.descricao.trim(),
          dataInicio: new Date(this.dataInicio).toISOString(),
          dataFim: new Date(this.dataFim).toISOString(),
        }),
      );
      leilaoId = leilao.id;

      // 2) o primeiro item do leilao (o endereco vem do ViaCEP no backend)
      const item = await firstValueFrom(
        this.itensService.criar({
          titulo: this.itemTitulo.trim(),
          descricao: this.itemDescricao.trim(),
          precoInicial: this.itemPrecoInicial!,
          incrementoMinimo: this.itemIncremento!,
          cep: somenteDigitos(this.itemCep),
          leilaoId: leilao.id,
          categoriaId: this.itemCategoriaId,
        }),
      );

      // 3) a foto do item
      await firstValueFrom(this.documentosService.enviar(item.id, 'PHOTO', this.foto));

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
