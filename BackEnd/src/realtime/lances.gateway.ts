import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { SkipThrottle } from '@nestjs/throttler';
import type { Server, Socket } from 'socket.io';
import type { MensagemResposta } from '../chat/dto/mensagem-resposta.dto';
import type { BidResposta } from '../bids/dto/bid-resposta.dto';

// Dados enviados a todos que estao vendo o item quando chega um lance novo
export interface LanceNovoEvento {
  lance: BidResposta;
  licitanteNome: string;
  lanceAtual: string;
  lanceMinimo: string; // menor lance aceito a partir de agora
  lancesSugeridos: string[]; // atalhos prontos para o campo de lance (calculados aqui)
  // Prazo do leilao depois deste lance (o anti-sniping pode ter estendido): a tela so acompanha
  prazo: { dataFim: string; segundosParaMudanca: number; prorrogacoes: number; estendido: boolean };
}

// Dados enviados quando o item e finalizado (vendido ou sem lances)
export interface ItemFinalizadoEvento {
  itemId: string;
  status: 'SOLD' | 'UNSOLD';
  vencedorId: string | null;
  vencedorNome: string | null;
  valorFinal: string | null;
}

// 🔎 Gateway = "controller" do WebSocket. Cada item tem uma "sala" (room):
// so quem abriu aquele item recebe os eventos dele
@SkipThrottle() // o ThrottlerGuard global e so para HTTP
@WebSocketGateway({ namespace: 'lances' })
export class LancesGateway {
  private readonly logger = new Logger(LancesGateway.name);

  @WebSocketServer()
  private servidor: Server;

  // O front chama isso ao abrir a pagina do item
  @SubscribeMessage('entrar-item')
  entrarNoItem(
    @MessageBody() itemId: string,
    @ConnectedSocket() cliente: Socket,
  ): void {
    if (typeof itemId === 'string' && itemId.length > 0) {
      void cliente.join(this.sala(itemId));
    }
  }

  @SubscribeMessage('sair-item')
  sairDoItem(
    @MessageBody() itemId: string,
    @ConnectedSocket() cliente: Socket,
  ): void {
    if (typeof itemId === 'string') {
      void cliente.leave(this.sala(itemId));
    }
  }

  // Chat: a sala do leilao recebe as mensagens novas
  @SubscribeMessage('entrar-leilao')
  entrarNoLeilao(
    @MessageBody() leilaoId: string,
    @ConnectedSocket() cliente: Socket,
  ): void {
    if (typeof leilaoId === 'string' && leilaoId.length > 0) {
      void cliente.join(this.salaLeilao(leilaoId));
    }
  }

  @SubscribeMessage('sair-leilao')
  sairDoLeilao(
    @MessageBody() leilaoId: string,
    @ConnectedSocket() cliente: Socket,
  ): void {
    if (typeof leilaoId === 'string') {
      void cliente.leave(this.salaLeilao(leilaoId));
    }
  }

  emitirMensagemNova(leilaoId: string, mensagem: MensagemResposta): void {
    this.servidor.to(this.salaLeilao(leilaoId)).emit('mensagem-nova', mensagem);
  }

  emitirLanceNovo(itemId: string, evento: LanceNovoEvento): void {
    this.servidor.to(this.sala(itemId)).emit('lance-novo', evento);
  }

  // Leilão reativado: quem está vendo o item busca tudo de novo (status, itens e o prazo novo)
  emitirLeilaoReativado(itemId: string, dataFim: string): void {
    this.servidor.to(this.sala(itemId)).emit('leilao-reativado', { itemId, dataFim });
  }

  emitirItemFinalizado(evento: ItemFinalizadoEvento): void {
    this.logger.log(`Item ${evento.itemId} finalizado: ${evento.status}`);
    this.servidor.to(this.sala(evento.itemId)).emit('item-finalizado', evento);
  }

  private salaLeilao(leilaoId: string): string {
    return `leilão:${leilaoId}`;
  }

  private sala(itemId: string): string {
    return `item:${itemId}`;
  }
}
