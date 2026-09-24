import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensagemDeErro } from '../../core/erro.util';
import { AuctionStatus, MensagemChat } from '../../core/models';
import { TempoRealService } from '../../core/tempo-real.service';
import { ChatService } from '../../services/chat.service';
import { Avatar } from '../avatar/avatar';

const LIMITE_TEXTO = 300;
const MAXIMO_NA_TELA = 200;

// 🔎 Chat ao vivo do leilao (estilo chat de live): quem esta na pagina recebe
// as mensagens na hora pelo WebSocket. Ler e livre; escrever exige login e o
// leilao aberto (a regra final e do backend, aqui so escondemos o campo).
@Component({
  selector: 'app-chat-leilao',
  imports: [FormsModule, RouterLink, DatePipe, Avatar],
  templateUrl: './chat-leilao.html',
  styleUrl: './chat-leilao.css',
})
export class ChatLeilao {
  readonly leilaoId = input.required<string>();
  readonly status = input<AuctionStatus | null>(null);

  protected readonly auth = inject(AuthService);
  private readonly chatService = inject(ChatService);
  private readonly tempoReal = inject(TempoRealService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly LIMITE_TEXTO = LIMITE_TEXTO;
  readonly mensagens = signal<MensagemChat[]>([]);
  readonly carregando = signal(true);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly novasAbaixo = signal(0);
  texto = '';

  private readonly lista = viewChild<ElementRef<HTMLElement>>('lista');
  private iniciou = false;

  constructor() {
    // Inicia quando o id do leilao chega (o input so tem valor depois da criacao)
    effect(() => {
      const id = this.leilaoId();
      if (this.iniciou || !id) return;
      this.iniciou = true;
      this.iniciar(id);
    });
    afterNextRender(() => this.rolarParaFim());
  }

  private iniciar(id: string): void {
    this.chatService.listar(id).subscribe({
      next: (lista) => {
        this.mensagens.set(lista);
        this.carregando.set(false);
        this.rolarParaFim();
      },
      error: () => this.carregando.set(false),
    });

    const assinatura = this.tempoReal.observarChat(id).subscribe((evento) => {
      if (evento.tipo === 'mensagem') {
        this.acrescentar([evento.dados]);
      } else {
        this.buscarPerdidas(id); // reconexao: pega o que chegou enquanto estava fora
      }
    });
    this.destroyRef.onDestroy(() => assinatura.unsubscribe());
  }

  private buscarPerdidas(id: string): void {
    const ultima = this.mensagens().at(-1);
    if (!ultima) return; // primeira conexao: a listagem inicial ja cobre
    this.chatService.listar(id, ultima.criadoEm).subscribe({ next: (novas) => this.acrescentar(novas) });
  }

  // Junta sem duplicar (a propria mensagem chega pelo POST e pelo WebSocket)
  private acrescentar(novas: MensagemChat[]): void {
    const atuais = this.mensagens();
    const ids = new Set(atuais.map((m) => m.id));
    const inedidas = novas.filter((m) => !ids.has(m.id));
    if (inedidas.length === 0) return;

    const perto = this.pertoDoFim();
    const minhas = inedidas.some((m) => m.autorId === this.auth.usuario()?.id);
    this.mensagens.set([...atuais, ...inedidas].slice(-MAXIMO_NA_TELA));
    if (perto || minhas) {
      this.rolarParaFim();
    } else {
      this.novasAbaixo.update((n) => n + inedidas.length);
    }
  }

  podeEscrever(): boolean {
    return this.auth.estaLogado() && this.status() === 'OPEN';
  }

  enviar(): void {
    const texto = this.texto.trim();
    if (!texto || !this.podeEscrever() || this.enviando()) return;
    this.erro.set(null);
    this.enviando.set(true);
    this.chatService.enviar(this.leilaoId(), texto).subscribe({
      next: (mensagem) => {
        this.texto = '';
        this.enviando.set(false);
        this.acrescentar([mensagem]);
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro, 'Não foi possível enviar a mensagem'));
        this.enviando.set(false);
      },
    });
  }

  // Enter envia; Shift+Enter nao (o campo e de uma linha, mas mantem o habito do chat)
  aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      this.enviar();
    }
  }

  ehMinha(m: MensagemChat): boolean {
    return m.autorId === this.auth.usuario()?.id;
  }

  rotuloPapel(m: MensagemChat): string | null {
    return m.autorPapel === 'SELLER' ? 'Vendedor' : m.autorPapel === 'ADMIN' ? 'Admin' : null;
  }

  aoRolar(): void {
    if (this.pertoDoFim()) this.novasAbaixo.set(0);
  }

  rolarParaFim(): void {
    this.novasAbaixo.set(0);
    // Espera o Angular desenhar a mensagem nova antes de rolar
    setTimeout(() => {
      const el = this.lista()?.nativeElement;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, 30);
  }

  private pertoDoFim(): boolean {
    const el = this.lista()?.nativeElement;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
}
