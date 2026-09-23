import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { paramsSemVazios } from '../core/http-params.util';
import { ItemLeilao, RespostaPaginada } from '../core/models';

@Injectable({ providedIn: 'root' })
export class ItensService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/auction-items`;

  listar(
    params: { pagina?: number; limite?: number; leilaoId?: string; categoriaId?: string; busca?: string } = {},
  ): Observable<RespostaPaginada<ItemLeilao>> {
    return this.http.get<RespostaPaginada<ItemLeilao>>(this.base, {
      params: paramsSemVazios({ pagina: 1, limite: 50, ...params }),
    });
  }

  buscarPorId(id: string): Observable<ItemLeilao> {
    return this.http.get<ItemLeilao>(`${this.base}/${id}`);
  }

  criar(dto: {
    titulo: string;
    descricao?: string;
    precoInicial: number;
    incrementoMinimo: number;
    cep: string;
    leilaoId: string;
    categoriaId: string;
  }): Observable<ItemLeilao> {
    return this.http.post<ItemLeilao>(this.base, dto);
  }

  atualizar(id: string, dto: Partial<{
    titulo: string;
    descricao: string;
    precoInicial: number;
    incrementoMinimo: number;
    cep: string;
    categoriaId: string;
  }>): Observable<ItemLeilao> {
    return this.http.patch<ItemLeilao>(`${this.base}/${id}`, dto);
  }

  remover(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
