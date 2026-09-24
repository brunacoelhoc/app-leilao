import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { RequisitosVendedor } from '../../core/models';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { AVATARES_PRONTOS } from '../../core/avatares';
import { mensagemDeErro } from '../../core/erro.util';
import { redimensionarParaDataUrl } from '../../core/imagem.util';
import {
  formatarCep,
  formatarCpf,
  formatarTelefone,
  ocultarCpf,
  ocultarEndereco,
  ocultarTelefone,
  somenteDigitos,
} from '../../core/mascara.util';
import { CepService } from '../../services/cep.service';
import { UsuariosService } from '../../services/usuarios.service';
import { Avatar } from '../../shared/avatar/avatar';
import { Modal } from '../../shared/modal/modal';

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

@Component({
  selector: 'app-perfil',
  imports: [Voltar, FormsModule, DatePipe, Avatar, Modal],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class Perfil {
  protected readonly auth = inject(AuthService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly alerta = inject(AlertaService);
  private readonly router = inject(Router);
  private readonly cepService = inject(CepService);

  protected readonly avatares = AVATARES_PRONTOS;
  protected readonly ocultarTelefone = ocultarTelefone;
  protected readonly ocultarCpf = ocultarCpf;
  protected readonly ocultarEndereco = ocultarEndereco;
  protected readonly formatarTelefone = formatarTelefone;
  protected readonly formatarCpf = formatarCpf;

  protected readonly usuario = computed(() => this.auth.usuario()!);

  // Quais dados sensiveis estao "revelados" na tela
  readonly revelado = signal<{ telefone: boolean; cpf: boolean; endereco: boolean }>({
    telefone: false,
    cpf: false,
    endereco: false,
  });

  // ---- Modal de edicao ----
  readonly editando = signal(false);
  formNome = '';
  formEmail = '';
  formSenhaEmail = ''; // senha atual, exigida so quando o e-mail muda
  formTelefone = '';
  formEndereco = ''; // endereco ja salvo (texto); so e trocado se um novo for montado abaixo
  formCep = '';
  formLogradouro = '';
  formNumero = '';
  formComplemento = '';
  formCidade = '';
  formUf = '';
  readonly buscandoCep = signal(false);
  readonly erroCep = signal<string | null>(null);
  formCpf = '';
  formAvatar: string | null = null;
  readonly salvando = signal(false);
  readonly erroEdicao = signal<string | null>(null);

  // ---- Modal de senha ----
  readonly trocandoSenha = signal(false);
  senhaAtual = '';
  novaSenha = '';
  confirmarSenha = '';
  readonly mostrarSenhas = signal(false);
  readonly erroSenha = signal<string | null>(null);

  readonly virandoVendedor = signal(false);
  // O que falta para vender: a lista e o "ok" de cada item vem do servidor
  readonly requisitosVendedor = signal<RequisitosVendedor | null>(null);

  private carregarRequisitos(): void {
    this.usuariosService.requisitosVendedor().subscribe({ next: (r) => this.requisitosVendedor.set(r) });
  }

  // "Quero vender": o servidor confere telefone, CPF valido e endereco (e CPF unico entre vendedores)
  async queroVender(): Promise<void> {
    this.virandoVendedor.set(true);
    try {
      const atualizado = await firstValueFrom(this.usuariosService.tornarVendedor());
      this.auth.atualizarUsuarioLocal(atualizado);
      await this.alerta.sucesso('Agora você também vende!', 'Sua conta continua podendo comprar. Crie seu primeiro leilão no Painel do vendedor.');
      await this.router.navigateByUrl('/vendedor');
    } catch (erro) {
      void this.alerta.erro('Ainda não foi possível', mensagemDeErro(erro, 'Não foi possível concluir'));
    } finally {
      this.virandoVendedor.set(false);
    }
  }

  constructor() {
    // O usuario salvo no navegador e o do momento do login: busca o cadastro atual
    // para a tela (e o menu lateral) nao mostrarem dados desatualizados
    this.usuariosService.meuPerfil().subscribe({
      next: (atual) => {
        this.auth.atualizarUsuarioLocal(atual);
        if (atual.papel === 'BIDDER') this.carregarRequisitos();
      },
    });
  }

  alternar(campo: 'telefone' | 'cpf' | 'endereco'): void {
    this.revelado.update((r) => ({ ...r, [campo]: !r[campo] }));
  }

  abrirEdicao(): void {
    const u = this.usuario();
    this.formNome = u.nome;
    this.formEmail = u.email;
    this.formSenhaEmail = '';
    this.formTelefone = formatarTelefone(u.telefone);
    this.formEndereco = u.endereco ?? '';
    this.formCep = this.formLogradouro = this.formNumero = this.formComplemento = '';
    this.formCidade = this.formUf = '';
    this.erroCep.set(null);
    this.formCpf = formatarCpf(u.cpf);
    this.formAvatar = u.avatarUrl;
    this.erroEdicao.set(null);
    this.editando.set(true);
  }

  escolherAvatar(chave: string): void {
    this.formAvatar = chave;
  }

  async aoEscolherArquivo(evento: Event): Promise<void> {
    const arquivo = (evento.target as HTMLInputElement).files?.[0];
    if (!arquivo) return;
    try {
      this.formAvatar = await redimensionarParaDataUrl(arquivo);
    } catch (erro) {
      this.erroEdicao.set((erro as Error).message);
    }
  }

  get emailMudou(): boolean {
    return this.formEmail.trim() !== this.usuario().email;
  }

  mascararCep(): void {
    this.formCep = formatarCep(this.formCep);
    this.erroCep.set(null);
    // Ao completar os 8 digitos, ja busca sozinho
    if (somenteDigitos(this.formCep).length === 8) this.buscarCep();
  }

  buscarCep(): void {
    const cep = somenteDigitos(this.formCep);
    if (cep.length !== 8) {
      this.erroCep.set('Digite os 8 números do CEP.');
      return;
    }
    this.buscandoCep.set(true);
    this.erroCep.set(null);
    this.cepService.buscar(cep).subscribe({
      next: (e) => {
        this.formLogradouro = e.logradouro ?? '';
        this.formCidade = e.cidade;
        this.formUf = e.uf;
        this.buscandoCep.set(false);
      },
      error: (erro) => {
        this.erroCep.set(mensagemDeErro(erro, 'Não foi possível consultar o CEP'));
        this.buscandoCep.set(false);
      },
    });
  }

  // Junta os campos do CEP num texto so (o backend guarda o endereco como texto)
  private montarEndereco(): string | null {
    if (!this.formLogradouro.trim() && !this.formCidade.trim()) return null;
    const rua = [this.formLogradouro.trim(), this.formNumero.trim()].filter(Boolean).join(', ');
    const complemento = this.formComplemento.trim() ? ` - ${this.formComplemento.trim()}` : '';
    const cidade = this.formCidade.trim() ? ` — ${this.formCidade.trim()}/${this.formUf}` : '';
    const cep = this.formCep ? ` — CEP ${this.formCep}` : '';
    return `${rua}${complemento}${cidade}${cep}`.trim();
  }

  mascararTelefone(): void {
    this.formTelefone = formatarTelefone(this.formTelefone);
  }

  mascararCpf(): void {
    this.formCpf = formatarCpf(this.formCpf);
  }

  salvar(): void {
    this.erroEdicao.set(null);
    const telefone = somenteDigitos(this.formTelefone);
    const cpf = somenteDigitos(this.formCpf);

    // O backend so aceita campos preenchidos com o formato certo
    const dto: Record<string, string> = { nome: this.formNome.trim() };
    if (this.emailMudou) {
      dto['email'] = this.formEmail.trim();
      dto['senhaAtual'] = this.formSenhaEmail;
    }
    if (telefone) dto['telefone'] = telefone;
    const novoEndereco = this.montarEndereco() ?? this.formEndereco.trim();
    if (novoEndereco) dto['endereco'] = novoEndereco;
    if (cpf) dto['cpf'] = cpf;
    if (this.formAvatar) dto['avatarUrl'] = this.formAvatar;

    this.salvando.set(true);
    this.usuariosService.atualizarMeuPerfil(dto).subscribe({
      next: (usuario) => {
        this.auth.atualizarUsuarioLocal(usuario);
        this.salvando.set(false);
        this.editando.set(false);
        void this.alerta.sucesso('Perfil atualizado!', 'Suas informações foram salvas.');
      },
      error: (erro) => {
        this.erroEdicao.set(mensagemDeErro(erro, 'Não foi possível salvar o perfil'));
        this.salvando.set(false);
      },
    });
  }

  abrirSenha(): void {
    this.senhaAtual = '';
    this.novaSenha = '';
    this.confirmarSenha = '';
    this.erroSenha.set(null);
    this.trocandoSenha.set(true);
  }

  trocarSenha(): void {
    this.erroSenha.set(null);
    if (this.novaSenha !== this.confirmarSenha) {
      this.erroSenha.set('A confirmação da nova senha não confere.');
      return;
    }
    this.salvando.set(true);
    this.usuariosService.alterarMinhaSenha(this.senhaAtual, this.novaSenha).subscribe({
      next: () => {
        this.salvando.set(false);
        this.trocandoSenha.set(false);
        void this.alerta.sucesso('Senha alterada!', 'Use a nova senha no próximo login.');
      },
      error: (erro) => {
        this.erroSenha.set(mensagemDeErro(erro, 'Não foi possível alterar a senha'));
        this.salvando.set(false);
      },
    });
  }
}
