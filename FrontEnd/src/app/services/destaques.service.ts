import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { Destaque } from '../core/models';

@Injectable({ providedIn: 'root' })
export class DestaquesService {
  private readonly http = inject(HttpClient);

  // Quem entra no carrossel e em que ordem é decidido pelo backend
  listar(): Observable<Destaque[]> {
    return this.http.get<Destaque[]>(`${environment.apiUrl}/destaques`);
  }
}
