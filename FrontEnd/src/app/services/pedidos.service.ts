import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { FormaPagamento, Pedido, TipoEntrega } from '../core/models';

// Pos-leilao do vencedor: paga (simulado) e depois escolhe retirada ou entrega
@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  obter(itemId: string): Observable<Pedido> {
    return this.http.get<Pedido>(`${this.base}/auction-items/${itemId}/pedido`);
  }

  pagar(itemId: string, formaPagamento: FormaPagamento): Observable<Pedido> {
    return this.http.post<Pedido>(`${this.base}/auction-items/${itemId}/pedido/pagamento`, { formaPagamento });
  }

  definirEntrega(itemId: string, tipoEntrega: TipoEntrega, enderecoEntrega?: string): Observable<Pedido> {
    return this.http.post<Pedido>(`${this.base}/auction-items/${itemId}/pedido/entrega`, { tipoEntrega, enderecoEntrega });
  }
}
