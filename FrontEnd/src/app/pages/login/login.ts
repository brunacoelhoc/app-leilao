import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro.util';
import { RecuperarSenha } from '../../shared/recuperar-senha/recuperar-senha';

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

import { destinoSeguro } from '../../core/retorno.util';

@Component({
  selector: 'app-login',
  imports: [Voltar, FormsModule, RouterLink, RecuperarSenha],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alerta = inject(AlertaService);

  email = '';
  senha = '';
  aceiteTermos = false;
  readonly mostrarSenha = signal(false);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  async entrar(): Promise<void> {
    if (!this.aceiteTermos) {
      this.erro.set('É preciso aceitar os termos de uso para continuar.');
      return;
    }
    this.erro.set(null);
    this.carregando.set(true);
    try {
      await this.auth.login(this.email, this.senha);
      await this.router.navigateByUrl(destinoSeguro(this.route.snapshot.queryParamMap.get('returnUrl')));
      void this.alerta.sucesso('Bem-vindo(a) de volta!', 'Login realizado com sucesso.');
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro, 'Não foi possível entrar'));
    } finally {
      this.carregando.set(false);
    }
  }

  // Simulacao de front-end (sem endpoint de recuperacao no backend): abre o
  // modal interativo de 3 etapas
  readonly recuperando = signal(false);
}
