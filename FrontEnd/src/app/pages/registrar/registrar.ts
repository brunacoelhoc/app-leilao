import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro.util';

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

import { destinoSeguro } from '../../core/retorno.util';

@Component({
  selector: 'app-registrar',
  imports: [Voltar, FormsModule, RouterLink],
  templateUrl: './registrar.html',
})
export class Registrar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly alerta = inject(AlertaService);

  nome = '';
  email = '';
  senha = '';
  aceiteTermos = false;
  readonly mostrarSenha = signal(false);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);

  async cadastrar(): Promise<void> {
    this.erro.set(null);
    this.carregando.set(true);
    try {
      // Registro sempre cria a conta como BIDDER (regra do backend, nao ha
      // como escolher outro papel por aqui -- de proposito)
      await this.auth.registrar(this.nome, this.email, this.senha, this.aceiteTermos);
      // Conta nova sempre nasce com o perfil incompleto: leva direto para completar
      const incompleto = (this.auth.usuario()?.camposFaltando?.length ?? 0) > 0;
      await this.router.navigateByUrl(incompleto ? '/perfil' : destinoSeguro(this.route.snapshot.queryParamMap.get('returnUrl')));
      void this.alerta.sucesso('Conta criada!', incompleto ? `Bem-vindo(a), ${this.nome.split(' ')[0]}! Complete seu perfil para dar lances e criar leilões.` : `Seja bem-vindo(a), ${this.nome.split(' ')[0]}.`);
    } catch (erro) {
      this.erro.set(mensagemDeErro(erro, 'Não foi possível criar a conta'));
    } finally {
      this.carregando.set(false);
    }
  }
}
