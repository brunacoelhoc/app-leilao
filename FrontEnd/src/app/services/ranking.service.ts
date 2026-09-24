import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { RankingVendedor } from '../core/models';

@Injectable({ providedIn: 'root' })
export class RankingService {
  private readonly http = inject(HttpClient);

  // Quem entra e em que ordem e decidido pelo backend (total arrecadado)
  vendedores(limite = 10): Observable<RankingVendedor[]> {
    return this.http.get<RankingVendedor[]>(`${environment.apiUrl}/ranking/vendedores`, { params: { limite } });
  }
}
