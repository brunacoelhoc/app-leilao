import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { paramsSemVazios } from '../core/http-params.util';
import { MensagemChat } from '../core/models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  // Ultimas mensagens; com "depois" (data ISO), so as mais novas
  listar(leilaoId: string, depois?: string): Observable<MensagemChat[]> {
    return this.http.get<MensagemChat[]>(`${this.base}/auctions/${leilaoId}/chat`, {
      params: paramsSemVazios({ limite: 100, depois }),
    });
  }

  enviar(leilaoId: string, texto: string): Observable<MensagemChat> {
    return this.http.post<MensagemChat>(`${this.base}/auctions/${leilaoId}/chat`, { texto });
  }
}
