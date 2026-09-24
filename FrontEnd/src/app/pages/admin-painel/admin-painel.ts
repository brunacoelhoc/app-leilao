import { DatePipe } from '@angular/common';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AlertaService } from '../../core/alerta.service';
import { mensagemDeErro } from '../../core/erro.util';
import {
  formatarCpf,
  formatarTelefone,
} from '../../core/mascara.util';
import { AuctionStatus, Categoria, Leilao, Papel, RespostaPaginada, Usuario } from '../../core/models';
import {
  ROTULO_STATUS_LEILAO,
  classeSeloLeilao,
} from '../../core/status.util';
import { AdminService } from '../../services/admin.service';
import { CategoriasService } from '../../services/categorias.service';
import { DocumentosService } from '../../services/documentos.service';
import { LeiloesService } from '../../services/leiloes.service';
import { UsuariosService } from '../../services/usuarios.service';
import { Avatar } from '../../shared/avatar/avatar';
import { Modal } from '../../shared/modal/modal';
import { Paginacao } from '../../shared/paginacao/paginacao';

type Aba = 'categorias' | 'usuarios' | 'leiloes';

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

@Component({
  selector: 'app-admin-painel',
  imports: [Voltar, FormsModule, DatePipe, RouterLink, Avatar, Modal, Paginacao],
  templateUrl: './admin-painel.html',
  styleUrl: './admin-painel.css',
})
export class AdminPainel {
  private readonly categoriasService = inject(CategoriasService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly adminService = inject(AdminService);
  private readonly leiloesService = inject(LeiloesService);
  private readonly alerta = inject(AlertaService);
  private readonly documentosService = inject(DocumentosService);

  protected readonly ROTULO_STATUS_LEILAO = ROTULO_STATUS_LEILAO;
  protected readonly classeSeloLeilao = classeSeloLeilao;
  protected readonly formatarTelefone = formatarTelefone;
  protected readonly formatarCpf = formatarCpf;

  readonly aba = signal<Aba>('categorias');

  // ---------------- Categorias ----------------
  readonly categorias = signal<RespostaPaginada<Categoria> | null>(null);
  private paginaCategorias = 1;
  limiteCategorias = 10;

  readonly modalCategoria = signal(false);
  categoriaEditandoId: string | null = null;
  catNome = '';
  catDescricao = '';
  readonly salvandoCategoria = signal(false);
  readonly erroCategoria = signal<string | null>(null);

  // ---------------- Usuarios ----------------
  readonly usuarios = signal<RespostaPaginada<Usuario> | null>(null);
  private paginaUsuarios = 1;
  limiteUsuarios = 6;
  filtroPapel: Papel | '' = '';
  buscaUsuarios = '';
  private temporizadorBuscaUsuarios?: ReturnType<typeof setTimeout>;
  readonly usuarioAberto = signal<Usuario | null>(null);

  // ---------------- Leiloes ----------------
  readonly leiloes = signal<RespostaPaginada<Leilao> | null>(null);
  private paginaLeiloes = 1;
  limiteLeiloes = 5;
  buscaLeiloes = '';
  statusLeiloes: AuctionStatus | '' = '';
  protected readonly statusOpcoes = Object.entries(ROTULO_STATUS_LEILAO) as [AuctionStatus, string][];
  private temporizadorBuscaLeiloes?: ReturnType<typeof setTimeout>;

  // Totais das tres areas (as abas mostram o numero)
  readonly resumo = signal<{ categorias: number; usuarios: number; leiloes: number } | null>(null);


  protected readonly papeis: { valor: Papel | ''; rotulo: string }[] = [
    { valor: '', rotulo: 'Todos' },
    { valor: 'BIDDER', rotulo: 'Licitantes' },
    { valor: 'SELLER', rotulo: 'Vendedores' },
    { valor: 'ADMIN', rotulo: 'Admins' },
  ];

  constructor() {
    this.carregarCategorias();
    this.carregarResumo();
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.temporizadorBuscaLeiloes);
      clearTimeout(this.temporizadorBuscaUsuarios);
    });
  }

  // Os totais vem prontos do servidor (uma consulta so)
  carregarResumo(): void {
    this.adminService.resumo().subscribe({ next: (r) => this.resumo.set(r) });
  }

  escolherPapel(papel: Papel | ''): void {
    this.filtroPapel = papel;
    this.mudarFiltroPapel();
  }

  escolherStatusLeiloes(status: AuctionStatus | ''): void {
    this.statusLeiloes = status;
    this.aplicarFiltrosLeiloes();
  }

  capaDe(leilao: Leilao): string | null {
    return leilao.capaDocumentoId ? this.documentosService.urlFoto(leilao.capaDocumentoId) : (leilao.capaPadrao ?? null);
  }

  inicial(nome: string): string {
    return nome.trim().charAt(0).toUpperCase();
  }

  trocarAba(aba: Aba): void {
    this.aba.set(aba);
    if (aba === 'categorias') this.carregarCategorias();
    if (aba === 'usuarios') this.carregarUsuarios();
    if (aba === 'leiloes') this.carregarLeiloes();
  }

  // ===== Categorias =====
  carregarCategorias(): void {
    this.categoriasService.listar(this.paginaCategorias, this.limiteCategorias).subscribe({
      next: (r) => this.categorias.set(r),
      error: (e) => void this.alerta.erro('Erro ao carregar categorias', mensagemDeErro(e)),
    });
  }

  mudarPaginaCategorias(pagina: number): void {
    this.paginaCategorias = pagina;
    this.carregarCategorias();
  }

  mudarLimiteCategorias(limite: number): void {
    this.limiteCategorias = limite;
    this.paginaCategorias = 1;
    this.carregarCategorias();
  }

  novaCategoria(): void {
    this.categoriaEditandoId = null;
    this.catNome = '';
    this.catDescricao = '';
    this.erroCategoria.set(null);
    this.modalCategoria.set(true);
  }

  editarCategoria(c: Categoria): void {
    this.categoriaEditandoId = c.id;
    this.catNome = c.nome;
    this.catDescricao = c.descricao ?? '';
    this.erroCategoria.set(null);
    this.modalCategoria.set(true);
  }

  salvarCategoria(): void {
    this.salvandoCategoria.set(true);
    this.erroCategoria.set(null);
    const dto = { nome: this.catNome.trim(), descricao: this.catDescricao.trim() };
    const chamada = this.categoriaEditandoId
      ? this.categoriasService.atualizar(this.categoriaEditandoId, dto)
      : this.categoriasService.criar(dto);
    chamada.subscribe({
      next: () => {
        const editou = !!this.categoriaEditandoId;
        this.salvandoCategoria.set(false);
        this.modalCategoria.set(false);
        this.carregarCategorias();
        void this.alerta.sucesso(editou ? 'Categoria atualizada!' : 'Categoria criada!');
      },
      error: (e) => {
        this.erroCategoria.set(mensagemDeErro(e, 'Não foi possível salvar a categoria'));
        this.salvandoCategoria.set(false);
      },
    });
  }

  async removerCategoria(c: Categoria): Promise<void> {
    const ok = await this.alerta.confirmar(
      `Remover “${c.nome}”?`,
      'Só é possível remover categorias sem itens vinculados.',
      'Remover',
    );
    if (!ok) return;
    this.categoriasService.remover(c.id).subscribe({
      next: () => {
        this.carregarCategorias();
        void this.alerta.sucesso('Categoria removida');
      },
      error: (e) => void this.alerta.erro('Não foi possível remover', mensagemDeErro(e)),
    });
  }

  // ===== Usuarios =====
  carregarUsuarios(): void {
    this.usuariosService
      .listar({
        pagina: this.paginaUsuarios,
        limite: this.limiteUsuarios,
        papel: this.filtroPapel || undefined,
        busca: this.buscaUsuarios.trim(),
      })
      .subscribe({
        next: (r) => this.usuarios.set(r),
        error: (e) => void this.alerta.erro('Erro ao carregar usuários', mensagemDeErro(e)),
      });
  }

  mudarPaginaUsuarios(pagina: number): void {
    this.paginaUsuarios = pagina;
    this.carregarUsuarios();
  }

  mudarLimiteUsuarios(limite: number): void {
    this.limiteUsuarios = limite;
    this.paginaUsuarios = 1;
    this.carregarUsuarios();
  }

  // Espera o usuario parar de digitar (300ms) antes de buscar
  aoDigitarBuscaUsuarios(texto: string): void {
    this.buscaUsuarios = texto;
    clearTimeout(this.temporizadorBuscaUsuarios);
    this.temporizadorBuscaUsuarios = setTimeout(() => this.mudarFiltroPapel(), 300);
  }

  mudarFiltroPapel(): void {
    this.paginaUsuarios = 1;
    this.carregarUsuarios();
  }

  // O clique busca o dado COMPLETO no backend (so ADMIN, auditado);
  // a listagem so recebe os dados ja mascarados
  abrirUsuario(u: Usuario): void {
    this.usuariosService.detalhe(u.id).subscribe({
      next: (completo) => this.usuarioAberto.set(completo),
      error: (e) => void this.alerta.erro('Não foi possível abrir o usuário', mensagemDeErro(e)),
    });
  }

  async alternarAtivo(u: Usuario): Promise<void> {
    const ok = await this.alerta.confirmar(
      u.ativo ? `Desativar ${u.nome}?` : `Reativar ${u.nome}?`,
      u.ativo ? 'A pessoa não conseguirá mais entrar na plataforma.' : 'A pessoa voltará a poder entrar.',
      u.ativo ? 'Desativar' : 'Reativar',
    );
    if (!ok) return;
    const chamada = u.ativo ? this.usuariosService.desativar(u.id) : this.usuariosService.reativar(u.id);
    chamada.subscribe({
      next: (atualizado) => {
        this.usuarioAberto.set(null);
        this.carregarUsuarios();
        void this.alerta.sucesso(atualizado.ativo ? 'Usuário reativado' : 'Usuário desativado');
      },
      error: (e) => void this.alerta.erro('Não foi possível atualizar', mensagemDeErro(e)),
    });
  }

  // ===== Leiloes =====
  carregarLeiloes(): void {
    this.leiloesService
      .listar({
        pagina: this.paginaLeiloes,
        limite: this.limiteLeiloes,
        busca: this.buscaLeiloes.trim(),
        status: this.statusLeiloes,
      })
      .subscribe({
        next: (r) => {
          this.leiloes.set(r);
        },
        error: (e) => void this.alerta.erro('Erro ao carregar leilões', mensagemDeErro(e)),
      });
  }

  // Espera o usuario parar de digitar (300ms) antes de buscar
  aoDigitarBuscaLeiloes(texto: string): void {
    this.buscaLeiloes = texto;
    clearTimeout(this.temporizadorBuscaLeiloes);
    this.temporizadorBuscaLeiloes = setTimeout(() => this.aplicarFiltrosLeiloes(), 300);
  }

  aplicarFiltrosLeiloes(): void {
    this.paginaLeiloes = 1;
    this.carregarLeiloes();
  }

  limparFiltrosLeiloes(): void {
    this.buscaLeiloes = '';
    this.statusLeiloes = '';
    this.aplicarFiltrosLeiloes();
  }

  mudarPaginaLeiloes(pagina: number): void {
    this.paginaLeiloes = pagina;
    this.carregarLeiloes();
  }

  mudarLimiteLeiloes(limite: number): void {
    this.limiteLeiloes = limite;
    this.paginaLeiloes = 1;
    this.carregarLeiloes();
  }

  async mudarStatusLeilao(l: Leilao, status: AuctionStatus): Promise<void> {
    let motivo: string | undefined;
    if (status === 'CANCELED') {
      const texto = await this.alerta.pedirTexto('Cancelar leilão', 'Informe o motivo do cancelamento');
      if (!texto) return;
      motivo = texto;
    } else {
      const ok = await this.alerta.confirmar(`Mudar para “${ROTULO_STATUS_LEILAO[status]}”?`, l.titulo);
      if (!ok) return;
    }
    this.leiloesService.mudarStatus(l.id, status, motivo).subscribe({
      next: () => {
        this.carregarLeiloes();
        void this.alerta.sucesso('Status atualizado');
      },
      error: (e) => void this.alerta.erro('Não foi possível mudar o status', mensagemDeErro(e)),
    });
  }

  async removerLeilao(l: Leilao): Promise<void> {
    const ok = await this.alerta.confirmar(`Remover “${l.titulo}”?`, 'Só leilões em rascunho podem ser removidos.', 'Remover');
    if (!ok) return;
    this.leiloesService.remover(l.id).subscribe({
      next: () => {
        this.carregarLeiloes();
        void this.alerta.sucesso('Leilão removido');
      },
      error: (e) => void this.alerta.erro('Não foi possível remover', mensagemDeErro(e)),
    });
  }
}
