import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro.util';

@Component({
  selector: 'app-registrar',
  imports: [FormsModule, RouterLink],
  templateUrl: './registrar.html',
})
export class Registrar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly alerta = inject(AlertaService);

  nome = '';
  email = '';
  senha = '';
  aceiteTermos = false;
  readonly mostrarSenha = signal(false);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  async cadastrar(): Promise<void> {
    if (!this.aceiteTermos) {
      this.erro.set('É preciso aceitar os termos de uso para continuar.');
      return;
    }
    this.erro.set(null);
    this.carregando.set(true);
    try {
      // Registro sempre cria a conta como BIDDER (regra do backend, nao ha
      // como escolher outro papel por aqui -- de proposito)
      await this.auth.registrar(this.nome, this.email, this.senha);
      await this.router.navigateByUrl('/');
      void this.alerta.sucesso('Conta criada!', `Seja bem-vindo(a), ${this.nome.split(' ')[0]}.`);
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro, 'Não foi possível criar a conta'));
    } finally {
      this.carregando.set(false);
    }
  }
}
