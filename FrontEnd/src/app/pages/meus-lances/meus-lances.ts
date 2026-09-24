import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { mensagemDeErro } from '../../core/erro.util';
import { HistoriaPeca, MinhaPeca, MinhasPecas, SituacaoDoLance } from '../../core/models';
import { DocumentosService } from '../../services/documentos.service';
import { LancesService } from '../../services/lances.service';
import { ObrasService } from '../../services/obras.service';
import { Voltar } from '../../shared/botao-voltar/botao-voltar';
import { Modal } from '../../shared/modal/modal';

type Aba = 'adquiridas' | 'disputa' | 'encerradas' | 'todas';

const ROTULOS: Record<SituacaoDoLance, string> = {
  VENCEDOR: 'Arrematada',
  LIDERANDO: 'Liderando',
  SUPERADO: 'Superado',
  PERDIDO: 'Não arrematada',
  CANCELADO: 'Leilão cancelado',
};

// 🔎 "Minha coleção": um card por peça. A situação (arrematei, liderando, superado, perdi)
// e as datas/valores vêm calculados do servidor; a tela só organiza e exibe.
@Component({
  selector: 'app-meus-lances',
  imports: [Voltar, DatePipe, RouterLink, Modal],
  templateUrl: './meus-lances.html',
  styleUrl: './meus-lances.css',
})
export class MeusLances {
  private readonly lancesService = inject(LancesService);
  private readonly obrasService = inject(ObrasService);
  private readonly documentosService = inject(DocumentosService);

  protected readonly ROTULOS = ROTULOS;

  private readonly resposta = signal<MinhasPecas | null>(null);
  readonly pecas = computed(() => this.resposta()?.pecas ?? []);
  // Contagens e total investido chegam calculados pelo servidor
  readonly resumo = computed(
    () => this.resposta()?.resumo ?? { adquiridas: 0, emDisputa: 0, encerradas: 0, liderando: 0, disputadas: 0, totalInvestido: '0.00' },
  );
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);
  readonly aba = signal<Aba>('adquiridas');


  // Pop-up "Sobre a obra"
  readonly aberta = signal<MinhaPeca | null>(null);
  readonly historia = signal<HistoriaPeca | null>(null);
  readonly carregandoHistoria = signal(false);

  readonly adquiridas = computed(() =>
    this.pecas()
      .filter((p) => p.grupo === 'ADQUIRIDAS')
      .sort((a, b) => (b.adquiridoEm ?? '').localeCompare(a.adquiridoEm ?? '')),
  );
  readonly emDisputa = computed(() => this.pecas().filter((p) => p.grupo === 'EM_DISPUTA'));
  readonly encerradas = computed(() => this.pecas().filter((p) => p.grupo === 'ENCERRADAS'));

  readonly visiveis = computed(() => {
    switch (this.aba()) {
      case 'adquiridas':
        return this.adquiridas();
      case 'disputa':
        return this.emDisputa();
      case 'encerradas':
        return this.encerradas();
      default:
        return this.pecas();
    }
  });

  constructor() {
    this.lancesService.minhasPecas().subscribe({
      next: (resposta) => {
        this.resposta.set(resposta);
        this.carregando.set(false);
        // Abre na aba que tem conteudo: primeiro as adquiridas, depois as em disputa
        this.aba.set(this.resumo().adquiridas > 0 ? 'adquiridas' : this.resumo().emDisputa > 0 ? 'disputa' : 'todas');
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro));
        this.carregando.set(false);
      },
    });
    inject(DestroyRef).onDestroy(() => {
    });
  }

  capaDe(p: MinhaPeca): string | null {
    const id = p.item.capaDocumentoId;
    return id ? this.documentosService.urlFoto(id) : p.item.capaPadrao;
  }

  moeda(valor: string | number | null): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0));
  }

  abrirDetalhes(p: MinhaPeca): void {
    this.aberta.set(p);
    this.historia.set(null);
    this.carregandoHistoria.set(true);
    this.obrasService.historia(p.item.id).subscribe({
      next: (h) => {
        this.historia.set(h);
        this.carregandoHistoria.set(false);
      },
      error: () => this.carregandoHistoria.set(false),
    });
  }

  fechar(): void {
    this.aberta.set(null);
  }

  emAberto(p: MinhaPeca): boolean {
    return p.grupo === 'EM_DISPUTA';
  }
}
