import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { Categoria, RespostaPaginada } from '../core/models';

@Injectable({ providedIn: 'root' })
export class CategoriasService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/categories`;

  listar(pagina = 1, limite = 50): Observable<RespostaPaginada<Categoria>> {
    return this.http.get<RespostaPaginada<Categoria>>(this.base, {
      params: { pagina, limite },
    });
  }

  buscarPorId(id: string): Observable<Categoria> {
    return this.http.get<Categoria>(`${this.base}/${id}`);
  }

  criar(dto: { nome: string; descricao?: string }): Observable<Categoria> {
    return this.http.post<Categoria>(this.base, dto);
  }

  atualizar(id: string, dto: { nome?: string; descricao?: string }): Observable<Categoria> {
    return this.http.patch<Categoria>(`${this.base}/${id}`, dto);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
