import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { io } from 'socket.io-client';
import { environment } from './environment';
import { Lance, MensagemChat } from './models';

// Eventos que o backend (lances.gateway.ts) envia
export interface LanceNovoEvento {
  lance: Lance;
  licitanteNome: string;
  lanceAtual: string;
  lanceMinimo: string;
  lancesSugeridos: string[];
}

export interface ItemFinalizadoEvento {
  itemId: string;
  status: 'SOLD' | 'UNSOLD';
  vencedorId: string | null;
  vencedorNome: string | null;
  valorFinal: string | null;
}

// 🔎 Conexao WebSocket (Socket.io) com o backend. Cada tela de item "entra"
// na sala do item e recebe os eventos dele em tempo real
@Injectable({ providedIn: 'root' })
export class TempoRealService {
  // apiUrl termina em /api; o socket fica na raiz do servidor (namespace /lances)
  private readonly url = environment.apiUrl.replace(/\/api\/?$/, '') + '/lances';

  // Observa um item: conecta, entra na sala e devolve os eventos.
  // Ao dar unsubscribe, sai da sala e fecha a conexao
  observarItem(itemId: string): Observable<
    | { tipo: 'lance-novo'; dados: LanceNovoEvento }
    | { tipo: 'item-finalizado'; dados: ItemFinalizadoEvento }
  > {
    return new Observable((assinante) => {
      const socket = io(this.url, { transports: ['websocket'] });
      // "connect" dispara tambem nas reconexoes, entao a sala e reassinada sozinha
      socket.on('connect', () => socket.emit('entrar-item', itemId));
      socket.on('lance-novo', (dados: LanceNovoEvento) => {
        if (dados.lance.itemId === itemId) assinante.next({ tipo: 'lance-novo', dados });
      });
      socket.on('item-finalizado', (dados: ItemFinalizadoEvento) => {
        if (dados.itemId === itemId) assinante.next({ tipo: 'item-finalizado', dados });
      });
      return () => {
        socket.emit('sair-item', itemId);
        socket.disconnect();
      };
    });
  }

  // Chat do leilao: entra na sala do leilao e devolve as mensagens novas.
  // "conectado" avisa a tela para buscar o que perdeu (dispara tambem nas reconexoes)
  observarChat(leilaoId: string): Observable<{ tipo: 'conectado' } | { tipo: 'mensagem'; dados: MensagemChat }> {
    return new Observable((assinante) => {
      const socket = io(this.url, { transports: ['websocket'] });
      socket.on('connect', () => {
        socket.emit('entrar-leilao', leilaoId);
        assinante.next({ tipo: 'conectado' });
      });
      socket.on('mensagem-nova', (dados: MensagemChat) => {
        if (dados.leilaoId === leilaoId) assinante.next({ tipo: 'mensagem', dados });
      });
      return () => {
        socket.emit('sair-leilao', leilaoId);
        socket.disconnect();
      };
    });
  }
}
