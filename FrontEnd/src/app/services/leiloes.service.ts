import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { paramsSemVazios } from '../core/http-params.util';
import { AuctionStatus, IndicadoresLeilao, Leilao, RespostaPaginada, ResumoLeiloes } from '../core/models';

@Injectable({ providedIn: 'root' })
export class LeiloesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auctions`;

  listar(
    params: { pagina?: number; limite?: number; vendedorId?: string; busca?: string; status?: AuctionStatus | '' } = {},
  ): Observable<RespostaPaginada<Leilao>> {
    return this.http.get<RespostaPaginada<Leilao>>(this.base, {
      params: paramsSemVazios({ pagina: 1, limite: 20, ...params }),
    });
  }

  // Quantos leiloes em cada status (o servidor conta; a tela so exibe)
  resumo(vendedorId?: string): Observable<ResumoLeiloes> {
    return this.http.get<ResumoLeiloes>(`${this.base}/resumo`, { params: paramsSemVazios({ vendedorId }) });
  }

  buscarPorId(id: string): Observable<Leilao> {
    return this.http.get<Leilao>(`${this.base}/${id}`);
  }

  indicadores(id: string): Observable<IndicadoresLeilao> {
    return this.http.get<IndicadoresLeilao>(`${this.base}/${id}/indicadores`);
  }

  criar(dto: { titulo: string; descricao?: string; dataInicio: string; dataFim: string }): Observable<Leilao> {
    return this.http.post<Leilao>(this.base, dto);
  }

  atualizar(id: string, dto: Partial<{ titulo: string; descricao: string; dataInicio: string; dataFim: string }>): Observable<Leilao> {
    return this.http.patch<Leilao>(`${this.base}/${id}`, dto);
  }

  mudarStatus(id: string, status: AuctionStatus, motivo?: string): Observable<Leilao> {
    return this.http.patch<Leilao>(`${this.base}/${id}/status`, { status, motivo });
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
