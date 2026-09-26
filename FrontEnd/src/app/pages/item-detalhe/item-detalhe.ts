import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AlertaService } from '../../core/alerta.service';
import { AuthService } from '../../core/auth.service';
import { LoginNecessario } from '../../core/login-necessario.service';
import { mensagemDeErro } from '../../core/erro.util';
import { Documento, ItemLeilao, Lance, Leilao, MinhaSituacao, RespostaPaginada, SituacaoItem } from '../../core/models';
import { ROTULO_STATUS_ITEM, classeSeloItem } from '../../core/status.util';
import { ItemFinalizadoEvento, TempoRealService } from '../../core/tempo-real.service';
import { DocumentosService } from '../../services/documentos.service';
import { ItensService } from '../../services/itens.service';
import { LancesService } from '../../services/lances.service';
import { LeiloesService } from '../../services/leiloes.service';
import { PedidoPosLeilao } from '../../shared/pedido-pos-leilao/pedido-pos-leilao';
import { Visualizador3d } from '../../shared/visualizador-3d/visualizador-3d';

interface FotoCarregada {
  documento: Documento;
  url: string;
}

const INTERVALO_SINCRONIA_MS = 5000;
const PASSO_LANCE = 50; // os botoes do campo de lance sobem/descem de R$ 50 em R$ 50

import { Voltar } from '../../shared/botao-voltar/botao-voltar';

@Component({
  selector: 'app-item-detalhe',
  imports: [Voltar, RouterLink, DatePipe, FormsModule, Visualizador3d, PedidoPosLeilao],
  templateUrl: './item-detalhe.html',
  styleUrl: './item-detalhe.css',
})
export class ItemDetalhe {
  private readonly route = inject(ActivatedRoute);
  private readonly itensService = inject(ItensService);
  private readonly leiloesService = inject(LeiloesService);
  private readonly lancesService = inject(LancesService);
  private readonly documentosService = inject(DocumentosService);
  private readonly tempoReal = inject(TempoRealService);
  private readonly alerta = inject(AlertaService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  private readonly login = inject(LoginNecessario);

  protected readonly ROTULO_STATUS_ITEM = ROTULO_STATUS_ITEM;
  protected readonly classeSeloItem = classeSeloItem;

  readonly item = signal<ItemLeilao | null>(null);
  readonly leilao = signal<Leilao | null>(null);
  readonly lances = signal<RespostaPaginada<Lance> | null>(null);
  readonly fotos = signal<FotoCarregada[]>([]);
  readonly carregando = signal(true);
  readonly erro = signal<string | null>(null);

  valorLance: number | null = null;
  readonly enviandoLance = signal(false);
  readonly erroLance = signal<string | null>(null);

  // 🔎 A tela NÃO decide regra de negócio: "situacao", "lanceMinimo" e os
  // segundos restantes vêm prontos do servidor. Aqui só se conta o tempo que
  // o servidor informou, com o relógio do navegador só como cronômetro.
  private readonly agora = signal(Date.now());
  // Aviso "prazo estendido" que aparece quando um lance de ultima hora estende o leilao ao vivo
  protected readonly prazoEstendidoAgora = signal(false);
  private fimContagem: number | null = null; // instante local em que a contagem zera
  private ultimaSincronia = 0;
  private celebrado = false;

  readonly situacao = computed<SituacaoItem | 'CARREGANDO'>(() => this.item()?.situacao ?? 'CARREGANDO');

  // Tempo restante para a próxima mudança (abre / encerra), a partir do servidor
  readonly restante = computed(() => {
    this.agora();
    return this.fimContagem === null ? null : Math.max(0, Math.ceil((this.fimContagem - Date.now()) / 1000));
  });

  readonly contagem = computed(() => {
    const total = this.restante();
    const situacao = this.situacao();
    if (total === null || (situacao !== 'EM_BREVE' && situacao !== 'ABERTO')) return null;
    const dias = Math.floor(total / 86400);
    const dois = (n: number) => String(n).padStart(2, '0');
    const hms = `${dois(Math.floor((total % 86400) / 3600))}:${dois(Math.floor((total % 3600) / 60))}:${dois(total % 60)}`;
    return {
      rotulo: situacao === 'EM_BREVE' ? 'Abre em' : 'Encerra em',
      texto: dias > 0 ? `${dias}d ${hms}` : hms,
      urgente: situacao === 'ABERTO' && total <= 60,
    };
  });

  // Lance mínimo (número) só para preencher o campo; a regra é do servidor
  readonly lanceMinimo = computed(() => Number(this.item()?.lanceMinimo ?? 0));

  // Bloqueia o botão na hora em que a contagem zera; o servidor confirma em seguida
  readonly indisponivel = computed(
    () => this.situacao() !== 'ABERTO' && this.situacao() !== 'EM_BREVE' || (this.situacao() === 'ABERTO' && this.restante() === 0),
  );
  readonly euGanhei = computed(() => {
    const item = this.item();
    return item?.situacao === 'VENDIDO' && item.vencedorId === this.auth.usuario()?.id;
  });
  readonly fotoPrincipal = computed(() => this.fotos()[0]?.url ?? null);

  private readonly itemId: string;

  constructor() {
    this.itemId = this.route.snapshot.paramMap.get('id')!;
    this.carregarTudo();
    this.atualizarMinhaSituacao();
    this.ouvirTempoReal();

    const relogio = setInterval(() => this.batida(), 1000);
    this.destroyRef.onDestroy(() => {
      clearInterval(relogio);
    });
  }

  // A cada segundo: atualiza o cronômetro e, quando a contagem zera (ou o
  // servidor ainda está apurando), pergunta ao servidor a nova situação
  private batida(): void {
    this.agora.set(Date.now());
    const esperandoServidor = this.situacao() === 'ENCERRANDO' || (this.restante() === 0 && this.fimContagem !== null);
    if (esperandoServidor && Date.now() - this.ultimaSincronia > INTERVALO_SINCRONIA_MS) {
      this.ultimaSincronia = Date.now();
      this.carregarItemELeilao(false);
    }
  }

  private carregarTudo(): void {
    this.carregarItemELeilao(true);
    this.carregarLances();
    this.carregarFotos();
  }

  private carregarItemELeilao(primeiraVez: boolean): void {
    this.itensService.buscarPorId(this.itemId).subscribe({
      next: (item) => {
        this.aplicarItem(item);
        if (primeiraVez) this.celebrado = item.status !== 'AVAILABLE'; // já estava vendido: sem festa
        if (primeiraVez || !this.leilao()) this.carregando.set(false);
        this.leiloesService.buscarPorId(item.leilaoId).subscribe({
          next: (leilao) => this.leilao.set(leilao),
        });
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro, 'Item não encontrado'));
        this.carregando.set(false);
      },
    });
  }

  private aplicarItem(item: ItemLeilao): void {
    this.item.set(item);
    this.fimContagem = item.segundosParaMudanca === null ? null : Date.now() + item.segundosParaMudanca * 1000;
  }

  private carregarLances(): void {
    this.lancesService.listarPorItem(this.itemId, 1, 20).subscribe({
      next: (lances) => this.lances.set(lances),
    });
  }

  private carregarFotos(): void {
    this.documentosService.listarPorItem(this.itemId, 1, 20).subscribe({
      next: (resposta) => {
        for (const documento of resposta.dados) {
          if (documento.tipo !== 'PHOTO') continue;
          this.fotos.update((atual) => [...atual, { documento, url: this.documentosService.urlFoto(documento.id) }]);
        }
      },
    });
  }

  // Lances e a finalização chegam aqui na hora (WebSocket), sem recarregar
  // Pergunta ao servidor se posso dar lance agora (muda quando alguem cobre o meu lance, ou eu cubro o dos outros)
  private atualizarMinhaSituacao(): void {
    if (!this.auth.estaLogado()) return;
    this.lancesService.minhaSituacao(this.itemId).subscribe({ next: (m) => this.minhaSituacao.set(m) });
  }

  private ouvirTempoReal(): void {
    this.tempoReal
      .observarItem(this.itemId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((evento) => {
        if (evento.tipo === 'lance-novo') {
          const { lance, licitanteNome, lanceAtual, lanceMinimo, lancesSugeridos, prazo } = evento.dados;
          this.item.update((i) =>
            i ? { ...i, lanceAtual, lanceMinimo, lancesSugeridos, totalLances: i.totalLances + 1, prorrogacoes: prazo.prorrogacoes } : i,
          );
          // Anti-sniping: o servidor pode ter estendido o prazo; o cronometro so acompanha o novo tempo
          this.fimContagem = Date.now() + prazo.segundosParaMudanca * 1000;
          if (prazo.estendido) this.prazoEstendidoAgora.set(true);
          this.lances.update((r) =>
            r && !r.dados.some((l) => l.id === lance.id)
              ? { ...r, dados: [{ ...lance, licitanteNome }, ...r.dados], total: r.total + 1 }
              : r,
          );
          this.atualizarMinhaSituacao(); // se alguem cobriu o meu lance, o botao libera na hora
        } else if (evento.tipo === 'reconectado' || evento.tipo === 'leilao-reativado') {
          // A conexao caiu e voltou: pode ter perdido lances, prorrogacao ou o fim do lote. Busca tudo de novo
          // (o cronometro volta a contar a partir do que o servidor informa)
          this.carregarItemELeilao(false);
          this.carregarLances();
          this.atualizarMinhaSituacao();
        } else {
          this.finalizar(evento.dados);
        }
      });
  }

  // 🔎 Fim do lote: o botão de lance some/desabilita na hora (situacao vira
  // "vendido") e o ganhador é parabenizado pelo nome
  private finalizar(evento: ItemFinalizadoEvento): void {
    this.item.update((i) =>
      i
        ? {
            ...i,
            status: evento.status,
            situacao: evento.status === 'SOLD' ? ('VENDIDO' as const) : ('NAO_VENDIDO' as const),
            segundosParaMudanca: null,
            vencedorId: evento.vencedorId,
            vencedorNome: evento.vencedorNome,
            lanceAtual: evento.valorFinal ?? i.lanceAtual,
          }
        : i,
    );
    this.fimContagem = null;
    if (this.celebrado) return;
    this.celebrado = true;
    const item = this.item();
    if (evento.status === 'SOLD' && evento.vencedorNome) {
      const eu = this.auth.usuario()?.id === evento.vencedorId;
      void this.alerta.celebrar(
        eu ? 'Parabéns, você arrematou!' : `Parabéns, ${evento.vencedorNome}!`,
        `<strong>${this.escapar(item?.titulo ?? 'O lote')}</strong> foi arrematado por ` +
          `<strong>${this.escapar(evento.vencedorNome)}</strong> por ${this.moeda(evento.valorFinal)}.`,
      );
    } else {
      void this.alerta.info('Lote encerrado', 'Este lote terminou sem lances e não foi vendido.');
    }
  }

  private escapar(texto: string): string {
    return texto.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  }

  // "1234.5" -> "R$ 1.234,50"
  moeda(valor: string | number | null): string {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor ?? 0));
  }

  usarMinimo(): void {
    this.valorLance = this.lanceMinimo();
  }

  // Os valores dos atalhos (minimo, +1, +2 e +5 incrementos) chegam calculados do servidor;
  // aqui so se escolhe um deles para preencher o campo
  protected readonly ROTULOS_ATALHO = ['Mínimo', '+1×', '+2×', '+5×'];

  usarValor(valor: string): void {
    this.valorLance = Number(valor);
  }

  // Botoes "− R$ 50" / "+ R$ 50": ajustam o campo de 50 em 50, sem cair abaixo do minimo aceito
  protected readonly PASSO_LANCE = PASSO_LANCE;

  ajustarLance(sinal: 1 | -1): void {
    const base = this.valorLance ?? this.lanceMinimo();
    this.valorLance = Math.max(this.lanceMinimo(), Math.round((base + sinal * PASSO_LANCE) * 100) / 100);
  }

  darLance(): void {
    if (!this.valorLance || !this.podeDarLance()) return;
    this.erroLance.set(null);
    this.enviandoLance.set(true);
    this.lancesService.darLance(this.itemId, this.valorLance).subscribe({
      next: () => {
        this.valorLance = null;
        this.enviandoLance.set(false);
        // A tela se atualiza sozinha pelo evento "lance-novo" (WebSocket)
      },
      error: (erro) => {
        this.erroLance.set(mensagemDeErro(erro, 'Não foi possível dar o lance'));
        this.enviandoLance.set(false);
      },
    });
  }

  // 🔎 Quem pode dar lance NAO e decidido aqui: o servidor responde (papel, dono do leilao,
  // periodo e disponibilidade) e a tela so exibe. O botao apenas obedece.
  readonly minhaSituacao = signal<MinhaSituacao | null>(null);

  // Aviso quando o motivo e "sou administrador", "estou no modo vendedor" ou "sou o dono" (os demais casos ja tem texto proprio)
  readonly avisoDeRestricao = computed(() => {
    const m = this.minhaSituacao();
    return m && (m.motivo === 'ADMIN' || m.motivo === 'MODO_VENDEDOR' || m.motivo === 'PERFIL_INCOMPLETO' || m.motivo === 'DONO' || m.motivo === 'JA_LIDERA') && !this.indisponivel() ? m.mensagem : null;
  });

  podeDarLance(): boolean {
    return !!this.minhaSituacao()?.permitido && this.situacao() === 'ABERTO' && !this.indisponivel();
  }

  pedirLogin(): void {
    this.login.abrir(`/itens/${this.itemId}`);
  }

  ehMeuLance(lance: Lance): boolean {
    return lance.licitanteId === this.auth.usuario()?.id;
  }
}
