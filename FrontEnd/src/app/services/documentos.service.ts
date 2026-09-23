import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { paramsSemVazios } from '../core/http-params.util';
import { Documento, RespostaPaginada, TipoDocumento } from '../core/models';

@Injectable({ providedIn: 'root' })
export class DocumentosService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  listarPorItem(itemId: string, pagina = 1, limite = 20): Observable<RespostaPaginada<Documento>> {
    return this.http.get<RespostaPaginada<Documento>>(`${this.base}/auction-items/${itemId}/documents`, {
      params: paramsSemVazios({ pagina, limite }),
    });
  }

  enviar(itemId: string, tipo: TipoDocumento, arquivo: File): Observable<Documento> {
    const formData = new FormData();
    formData.append('tipo', tipo);
    formData.append('arquivo', arquivo);
    return this.http.post<Documento>(`${this.base}/auction-items/${itemId}/documents`, formData);
  }

  // O download exige a X-API-KEY (o interceptor cuida disso via HttpClient);
  // por isso baixamos como blob em vez de usar um <a href> direto
  baixar(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/documents/${id}/download`, { responseType: 'blob' });
  }
}
