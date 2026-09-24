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

  // 🔎 URL publica da foto de uma peca: a tag <img> (e o visualizador 3D) carregam sozinhas, com
  // cache do navegador. Quem serve e valida e o servidor; a tela nao baixa nem guarda nada
  urlFoto(id: string): string {
    return `${this.base}/documents/${id}/foto`;
  }

}
