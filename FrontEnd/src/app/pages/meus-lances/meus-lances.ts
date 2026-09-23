import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensagemDeErro } from '../../core/erro.util';
import { Lance, RespostaPaginada } from '../../core/models';
import { LancesService } from '../../services/lances.service';

@Component({
  selector: 'app-meus-lances',
  imports: [DatePipe, RouterLink],
  templateUrl: './meus-lances.html',
})
export class MeusLances {
  private readonly lancesService = inject(LancesService);

  readonly resposta = signal<RespostaPaginada<Lance> | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  constructor() {
    this.lancesService.meusLances(1, 50).subscribe({
      next: (resposta) => {
        this.resposta.set(resposta);
        this.carregando.set(false);
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro));
        this.carregando.set(false);
      },
    });
  }
}
