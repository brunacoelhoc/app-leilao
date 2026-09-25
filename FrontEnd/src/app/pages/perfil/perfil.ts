import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { ModoService } from '../../core/modo.service';
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
  protected readonly modo = inject(ModoService);
  private readonly usuariosService = inject(UsuariosService);
  private readonly alerta = inject(AlertaService);
  private readonly cepService = inject(CepService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly encerrando = signal(false);

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
  // signal: a leitura do arquivo termina fora da deteccao de mudancas, com campo simples a tela so atualizava na troca seguinte
  readonly formAvatar = signal<string | null>(null);
  readonly mapaUrl = signal<SafeResourceUrl | null>(null);
  readonly salvando = signal(false);
  readonly erroEdicao = signal<string | null>(null);

  // ---- Modal de senha ----
  readonly trocandoSenha = signal(false);
  senhaAtual = '';
  novaSenha = '';
  confirmarSenha = '';
  readonly mostrarSenhas = signal(false);
  readonly erroSenha = signal<string | null>(null);

  // LGPD: encerra a conta. O servidor confere a senha e as pendencias (disputa, leilao em andamento, pedido) e
  // anonimiza os dados pessoais; a tela so confirma com a pessoa, envia e mostra a resposta
  async encerrarConta(): Promise<void> {
    const certeza = await this.alerta.confirmar(
      'Encerrar a sua conta?',
      'Seus dados pessoais (nome, e-mail, telefone, CPF, endereço e foto) serão apagados e você não poderá mais entrar. O histórico de lances e pedidos permanece, sem identificar você. Esta ação não pode ser desfeita.',
      'Continuar',
    );
    if (!certeza) return;
    const senha = await this.alerta.pedirSenha('Confirme a sua senha', 'Digite a senha atual para encerrar a conta');
    if (!senha) return;

    this.encerrando.set(true);
    try {
      await firstValueFrom(this.usuariosService.encerrarMinhaConta(senha));
      this.auth.limparSessao();
      await this.router.navigateByUrl('/');
      void this.alerta.sucesso('Conta encerrada', 'Seus dados pessoais foram apagados. Obrigado por ter participado.');
    } catch (erro) {
      void this.alerta.erro('Não foi possível encerrar a conta', mensagemDeErro(erro, 'Tente novamente'));
    } finally {
      this.encerrando.set(false);
    }
  }

  constructor() {
    // O usuario salvo no navegador e o do momento do login: busca o cadastro atual
    // para a tela (e o menu lateral) nao mostrarem dados desatualizados
    this.usuariosService.meuPerfil().subscribe({
      next: (atual) => {
        this.auth.atualizarUsuarioLocal(atual);
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
    // o CEP fica gravado dentro do texto do endereco; ao reabrir, volta para o campo
    this.formCep = formatarCep(/CEP\s*(\d{5}-?\d{3})/.exec(this.formEndereco)?.[1] ?? '');
    this.formLogradouro = this.formNumero = this.formComplemento = '';
    this.formCidade = this.formUf = '';
    this.erroCep.set(null);
    this.formCpf = formatarCpf(u.cpf);
    this.formAvatar.set(u.avatarUrl);
    this.erroEdicao.set(null);
    this.editando.set(true);
  }

  escolherAvatar(chave: string): void {
    this.formAvatar.set(chave);
  }

  async aoEscolherArquivo(evento: Event): Promise<void> {
    const campo = evento.target as HTMLInputElement;
    const arquivo = campo.files?.[0];
    campo.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivo) return;
    try {
      this.formAvatar.set(await redimensionarParaDataUrl(arquivo));
      this.erroEdicao.set(null);
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

  get temEnderecoParaMapa(): boolean {
    return !!(this.montarEndereco() ?? this.formEndereco.trim());
  }

  // Abre o mapa do Google (versao embed, sem chave de API) no endereco digitado ou no ja salvo
  abrirMapa(): void {
    const consulta = this.montarEndereco() ?? this.formEndereco.trim();
    if (!consulta) return;
    const url = `https://www.google.com/maps?q=${encodeURIComponent(consulta)}&z=17&output=embed`;
    this.mapaUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
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
    const avatar = this.formAvatar();
    if (avatar) dto['avatarUrl'] = avatar;

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
