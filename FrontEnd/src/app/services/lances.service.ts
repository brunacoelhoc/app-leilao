import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { paramsSemVazios } from '../core/http-params.util';
import { Lance, RespostaPaginada } from '../core/models';

@Injectable({ providedIn: 'root' })
export class LancesService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listarPorItem(itemId: string, pagina = 1, limite = 20): Observable<RespostaPaginada<Lance>> {
    return this.http.get<RespostaPaginada<Lance>>(`${this.base}/auction-items/${itemId}/bids`, {
      params: paramsSemVazios({ pagina, limite }),
    });
  }

  meusLances(pagina = 1, limite = 20): Observable<RespostaPaginada<Lance>> {
    return this.http.get<RespostaPaginada<Lance>>(`${this.base}/bids/meus`, {
      params: paramsSemVazios({ pagina, limite }),
    });
  }

  darLance(itemId: string, valor: number): Observable<Lance> {
    return this.http.post<Lance>(`${this.base}/auction-items/${itemId}/bids`, { valor });
  }
}
