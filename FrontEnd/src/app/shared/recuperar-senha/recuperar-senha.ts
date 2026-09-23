import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertaService } from '../../core/alerta.service';
import { Modal } from '../modal/modal';

type Etapa = 'email' | 'codigo' | 'senha';

// 🔎 SIMULAÇÃO de "Esqueci minha senha" (o backend não tem recuperação por
// e-mail, que está fora do escopo). O fluxo é interativo, em 3 etapas:
// e-mail -> código de 6 dígitos -> nova senha. Nada é enviado nem gravado:
// o código é gerado aqui e mostrado na tela só para demonstrar o fluxo.
@Component({
  selector: 'app-recuperar-senha',
  imports: [FormsModule, Modal],
  templateUrl: './recuperar-senha.html',
  styleUrl: './recuperar-senha.css',
})
export class RecuperarSenha implements OnInit {
  private readonly alerta = inject(AlertaService);

  readonly emailInicial = input('');
  readonly fechar = output<void>();

  readonly etapa = signal<Etapa>('email');
  readonly erro = signal<string | null>(null);
  readonly mostrar = signal(false);

  email = '';
  codigoDigitado = '';
  novaSenha = '';
  confirmar = '';
  protected codigoGerado = '';

  ngOnInit(): void {
    this.email = this.emailInicial();
  }

  enviarCodigo(): void {
    this.erro.set(null);
    if (!/^\S+@\S+\.\S+$/.test(this.email.trim())) {
      this.erro.set('Informe um e-mail válido.');
      return;
    }
    // Código de 6 dígitos (100000–999999), só para a simulação
    this.codigoGerado = String(100000 + Math.floor(Math.random() * 900000));
    this.codigoDigitado = '';
    this.etapa.set('codigo');
  }

  conferirCodigo(): void {
    this.erro.set(null);
    if (this.codigoDigitado.trim() !== this.codigoGerado) {
      this.erro.set('Código incorreto. Confira e tente de novo.');
      return;
    }
    this.etapa.set('senha');
  }

  // Mesmas regras de senha forte do cadastro (só para orientar na tela)
  get problemasSenha(): string[] {
    const s = this.novaSenha;
    const problemas: string[] = [];
    if (s.length < 8) problemas.push('mínimo de 8 caracteres');
    if (!/[A-Z]/.test(s)) problemas.push('uma letra maiúscula');
    if (!/[a-z]/.test(s)) problemas.push('uma letra minúscula');
    if (!/\d/.test(s)) problemas.push('um número');
    if (!/[^A-Za-z0-9]/.test(s)) problemas.push('um símbolo');
    return problemas;
  }

  async redefinir(): Promise<void> {
    this.erro.set(null);
    if (this.problemasSenha.length > 0) {
      this.erro.set(`A senha precisa ter: ${this.problemasSenha.join(', ')}.`);
      return;
    }
    if (this.novaSenha !== this.confirmar) {
      this.erro.set('A confirmação não confere com a nova senha.');
      return;
    }
    this.fechar.emit();
    await this.alerta.sucesso(
      'Senha redefinida (simulação)',
      'Em um ambiente real, sua senha teria sido alterada. Aqui nada foi gravado: continue entrando com a senha atual.',
    );
  }
}
