import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { HistoriaPeca, ObraAcervo } from '../core/models';

@Injectable({ providedIn: 'root' })
export class ObrasService {
  private readonly http = inject(HttpClient);

  // Obras do acervo (o servidor e a fonte do catalogo; as imagens sao arquivos do front)
  acervo(): Observable<ObraAcervo[]> {
    return this.http.get<ObraAcervo[]>(`${environment.apiUrl}/obras/acervo`);
  }

  // Historia da obra e contexto da epoca (conteudo do servidor)
  historia(itemId: string): Observable<HistoriaPeca> {
    return this.http.get<HistoriaPeca>(`${environment.apiUrl}/auction-items/${itemId}/historia`);
  }
}
