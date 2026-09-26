import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AlertaService } from '../../core/alerta.service';
import { mensagemDeErro } from '../../core/erro.util';
import { formatarCep, somenteDigitos } from '../../core/mascara.util';
import { AuctionStatus, Categoria, ItemLeilao, Leilao, RespostaPaginada } from '../../core/models';
import {
  ROTULO_STATUS_ITEM,
  ROTULO_STATUS_LEILAO,
  classeSeloItem,
  classeSeloLeilao,
} from '../../core/status.util';
import { CategoriasService } from '../../services/categorias.service';
import { DocumentosService } from '../../services/documentos.service';
import { ItensService } from '../../services/itens.service';
import { LeiloesService } from '../../services/leiloes.service';
import { AcervoFotos } from '../../shared/acervo-fotos/acervo-fotos';
import { Modal } from '../../shared/modal/modal';
import { Paginacao } from '../../shared/paginacao/paginacao';

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

@Component({
  selector: 'app-vendedor-leilao',
  imports: [Voltar, AcervoFotos, DatePipe, FormsModule, RouterLink, Modal, Paginacao],
  templateUrl: './vendedor-leilao.html',
  styleUrl: './vendedor-leilao.css',
})
export class VendedorLeilao {
  private readonly route = inject(ActivatedRoute);
  private readonly leiloesService = inject(LeiloesService);
  private readonly itensService = inject(ItensService);
  private readonly categoriasService = inject(CategoriasService);
  private readonly documentosService = inject(DocumentosService);
  private readonly alerta = inject(AlertaService);

  protected readonly ROTULO_STATUS_LEILAO = ROTULO_STATUS_LEILAO;
  protected readonly ROTULO_STATUS_ITEM = ROTULO_STATUS_ITEM;
  protected readonly classeSeloLeilao = classeSeloLeilao;
  protected readonly classeSeloItem = classeSeloItem;

  private readonly leilaoId: string;

  readonly leilao = signal<Leilao | null>(null);
  readonly itens = signal<RespostaPaginada<ItemLeilao> | null>(null);
  readonly categorias = signal<Categoria[]>([]);
  readonly mudandoStatus = signal(false);
  private pagina = 1;
  limite = 5;

  // ---- modal "novo item" ----
  readonly modalItem = signal(false);
  itemEditandoId: string | null = null; // preenchido = editando; vazio = cadastrando
  itemTitulo = '';
  itemDescricao = '';
  itemPrecoInicial: number | null = null;
  itemIncremento: number | null = null;
  itemCep = '';
  itemCategoriaId = '';
  foto: File | null = null;
  readonly fotoPreview = signal<string | null>(null);
  readonly criandoItem = signal(false);
  readonly erroItem = signal<string | null>(null);

  // ---- modal "editar leilao" ----
  readonly modalLeilao = signal(false);
  readonly salvandoLeilao = signal(false);
  readonly erroLeilao = signal<string | null>(null);
  leilaoTitulo = '';
  leilaoDescricao = '';
  leilaoInicio = '';
  leilaoFim = '';

  // ---- foto avulsa para um item ja existente ----
  readonly enviandoFoto = signal<string | null>(null);

  constructor() {
    this.leilaoId = this.route.snapshot.paramMap.get('id')!;
    this.carregarLeilao();
    this.carregarItens();
    this.categoriasService.listar(1, 100).subscribe({ next: (r) => this.categorias.set(r.dados) });
  }

  private carregarLeilao(): void {
    this.leiloesService.buscarPorId(this.leilaoId).subscribe({
      next: (l) => this.leilao.set(l),
      error: (e) => void this.alerta.erro('Leilão não encontrado', mensagemDeErro(e)),
    });
  }

  carregarItens(): void {
    this.itensService.listar({ leilaoId: this.leilaoId, pagina: this.pagina, limite: this.limite }).subscribe({
      next: (r) => this.itens.set(r),
    });
  }

  mudarPagina(pagina: number): void {
    this.pagina = pagina;
    this.carregarItens();
  }

  mudarLimite(limite: number): void {
    this.limite = limite;
    this.pagina = 1;
    this.carregarItens();
  }

  async mudarStatus(status: AuctionStatus): Promise<void> {
    let motivo: string | undefined;
    if (status === 'CANCELED') {
      const texto = await this.alerta.pedirTexto('Cancelar leilão', 'Informe o motivo do cancelamento');
      if (!texto) return;
      motivo = texto;
    } else {
      const ok = await this.alerta.confirmar(`Mudar para “${ROTULO_STATUS_LEILAO[status]}”?`);
      if (!ok) return;
    }
    this.mudandoStatus.set(true);
    this.leiloesService.mudarStatus(this.leilaoId, status, motivo).subscribe({
      next: (l) => {
        this.leilao.set(l);
        this.mudandoStatus.set(false);
        this.carregarItens();
        void this.alerta.sucesso('Status atualizado');
      },
      error: (e) => {
        this.mudandoStatus.set(false);
        void this.alerta.erro('Não foi possível mudar o status', mensagemDeErro(e));
      },
    });
  }

  // ===== novo item =====
  abrirModalItem(): void {
    this.itemEditandoId = null;
    this.itemTitulo = this.itemDescricao = this.itemCep = this.itemCategoriaId = '';
    this.itemPrecoInicial = this.itemIncremento = null;
    this.foto = null;
    this.fotoPreview.set(null);
    this.erroItem.set(null);
    this.modalItem.set(true);
  }

  abrirEdicaoItem(item: ItemLeilao): void {
    this.itemEditandoId = item.id;
    this.itemTitulo = item.titulo;
    this.itemDescricao = item.descricao ?? '';
    this.itemPrecoInicial = Number(item.precoInicial);
    this.itemIncremento = Number(item.incrementoMinimo);
    this.itemCep = formatarCep(item.cep);
    this.itemCategoriaId = item.categoriaId;
    this.foto = null;
    this.fotoPreview.set(null);
    this.erroItem.set(null);
    this.modalItem.set(true);
  }

  // Cadastro e edicao usam o mesmo formulario
  async salvarItem(): Promise<void> {
    if (!this.itemEditandoId) {
      await this.criarItem();
      return;
    }
    this.erroItem.set(null);
    this.criandoItem.set(true);
    try {
      await firstValueFrom(
        this.itensService.atualizar(this.itemEditandoId, {
          titulo: this.itemTitulo.trim(),
          descricao: this.itemDescricao.trim(),
          precoInicial: this.itemPrecoInicial!,
          incrementoMinimo: this.itemIncremento!,
          cep: somenteDigitos(this.itemCep),
          categoriaId: this.itemCategoriaId,
        }),
      );
      // Foto nova (opcional) junto com a edicao
      if (this.foto) {
        await firstValueFrom(this.documentosService.enviar(this.itemEditandoId, 'PHOTO', this.foto));
      }
      this.modalItem.set(false);
      this.carregarItens();
      void this.alerta.sucesso('Item atualizado!');
    } catch (erro) {
      this.erroItem.set(mensagemDeErro(erro, 'Não foi possível atualizar o item'));
    } finally {
      this.criandoItem.set(false);
    }
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
    this.erroItem.set(null);
    if (!arquivo) return;
    this.foto = arquivo;
    this.fotoPreview.set(URL.createObjectURL(arquivo));
  }

  async criarItem(): Promise<void> {
    this.erroItem.set(null);
    this.criandoItem.set(true);
    let itemId: string | null = null;
    try {
      const item = await firstValueFrom(
        this.itensService.criar({
          titulo: this.itemTitulo.trim(),
          descricao: this.itemDescricao.trim() || undefined, // opcional
          precoInicial: this.itemPrecoInicial!,
          incrementoMinimo: this.itemIncremento!,
          cep: somenteDigitos(this.itemCep),
          leilaoId: this.leilaoId,
          categoriaId: this.itemCategoriaId,
        }),
      );
      itemId = item.id;
      // Foto opcional: sem ela, o servidor usa uma capa padrao
      if (this.foto) await firstValueFrom(this.documentosService.enviar(item.id, 'PHOTO', this.foto));
      this.modalItem.set(false);
      this.carregarItens();
      void this.alerta.sucesso('Item cadastrado!', this.foto ? 'A foto foi enviada junto.' : 'Você pode enviar uma foto depois, pelo botão do item.');
    } catch (erro) {
      const mensagem = mensagemDeErro(erro, 'Não foi possível cadastrar o item');
      if (itemId) {
        this.modalItem.set(false);
        this.carregarItens();
        void this.alerta.erro('Item criado, mas a foto falhou', `${mensagem}. Envie a foto pelo botão do item.`);
      } else {
        this.erroItem.set(mensagem);
      }
    } finally {
      this.criandoItem.set(false);
    }
  }

  // ===== editar leilao =====
  private paraCampoData(iso: string): string {
    // datetime-local espera "AAAA-MM-DDTHH:mm" no horario local
    const d = new Date(iso);
    const dois = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
  }

  abrirEdicaoLeilao(): void {
    const l = this.leilao();
    if (!l) return;
    this.leilaoTitulo = l.titulo;
    this.leilaoDescricao = l.descricao ?? '';
    this.leilaoInicio = this.paraCampoData(l.dataInicio);
    this.leilaoFim = this.paraCampoData(l.dataFim);
    this.erroLeilao.set(null);
    this.modalLeilao.set(true);
  }

  salvarLeilao(): void {
    this.erroLeilao.set(null);
    this.salvandoLeilao.set(true);
    this.leiloesService
      .atualizar(this.leilaoId, {
        titulo: this.leilaoTitulo.trim(),
        descricao: this.leilaoDescricao.trim(),
        // Só envia a data que mudou: a API não aceita início no passado, e o rascunho pode ter sido criado há dias
        ...(this.leilaoInicio !== this.paraCampoData(this.leilao()!.dataInicio) ? { dataInicio: new Date(this.leilaoInicio).toISOString() } : {}),
        ...(this.leilaoFim !== this.paraCampoData(this.leilao()!.dataFim) ? { dataFim: new Date(this.leilaoFim).toISOString() } : {}),
      })
      .subscribe({
        next: (l) => {
          this.leilao.set(l);
          this.salvandoLeilao.set(false);
          this.modalLeilao.set(false);
          void this.alerta.sucesso('Leilão atualizado!');
        },
        error: (e) => {
          this.salvandoLeilao.set(false);
          this.erroLeilao.set(mensagemDeErro(e, 'Não foi possível atualizar o leilão'));
        },
      });
  }

  async removerItem(item: ItemLeilao): Promise<void> {
    const ok = await this.alerta.confirmar(`Remover “${item.titulo}”?`, 'Só é possível com o leilão em rascunho.', 'Remover');
    if (!ok) return;
    this.itensService.remover(item.id).subscribe({
      next: () => {
        this.carregarItens();
        void this.alerta.sucesso('Item removido');
      },
      error: (e) => void this.alerta.erro('Não foi possível remover', mensagemDeErro(e)),
    });
  }

  // ===== foto avulsa =====
  aoEscolherFotoAvulsa(itemId: string, evento: Event): void {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    (evento.target as HTMLInputElement).value = '';
    if (!arquivo) return;
    this.enviandoFoto.set(itemId);
    this.documentosService.enviar(itemId, 'PHOTO', arquivo).subscribe({
      next: () => {
        this.enviandoFoto.set(null);
        void this.alerta.sucesso('Foto enviada!');
      },
      error: (e) => {
        this.enviandoFoto.set(null);
        void this.alerta.erro('Não foi possível enviar a foto', mensagemDeErro(e));
      },
    });
  }
}
