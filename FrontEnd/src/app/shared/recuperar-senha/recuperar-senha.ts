import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro.util';
import { Modal } from '../modal/modal';

type Etapa = 'email' | 'redefinir';

// 🔎 "Esqueci minha senha": a tela só pergunta e envia. Quem gera o código (com validade e
// limite de tentativas), guarda no banco, confere e troca a senha é o servidor. Toda mensagem
// mostrada aqui é a que o servidor devolveu.
@Component({
  selector: 'app-recuperar-senha',
  imports: [FormsModule, Modal],
  templateUrl: './recuperar-senha.html',
  styleUrl: './recuperar-senha.css',
})
export class RecuperarSenha implements OnInit {
  private readonly alerta = inject(AlertaService);
  private readonly auth = inject(AuthService);

  readonly emailInicial = input('');
  readonly fechar = output<void>();

  readonly etapa = signal<Etapa>('email');
  readonly erro = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly enviando = signal(false);
  readonly mostrar = signal(false);

  email = '';
  codigo = '';
  novaSenha = '';
  confirmar = '';

  ngOnInit(): void {
    this.email = this.emailInicial();
  }

  async pedirCodigo(): Promise<void> {
    this.erro.set(null);
    this.enviando.set(true);
    try {
      this.aviso.set(await this.auth.pedirCodigoDeSenha(this.email.trim()));
      this.etapa.set('redefinir');
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro, 'Não foi possível enviar o código'));
    } finally {
      this.enviando.set(false);
    }
  }

  async redefinir(): Promise<void> {
    this.erro.set(null);
    // Só conferência de digitação (o servidor não recebe a confirmação)
    if (this.novaSenha !== this.confirmar) {
      this.erro.set('A confirmação não confere com a nova senha.');
      return;
    }
    this.enviando.set(true);
    try {
      const mensagem = await this.auth.redefinirSenha(this.email.trim(), this.codigo.trim(), this.novaSenha);
      this.fechar.emit();
      await this.alerta.sucesso('Senha redefinida!', mensagem);
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro, 'Não foi possível redefinir a senha'));
    } finally {
      this.enviando.set(false);
    }
  }
}
