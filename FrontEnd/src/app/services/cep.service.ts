import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';

export interface EnderecoCep {
  logradouro: string;
  cidade: string;
  uf: string;
}

// Consulta de CEP feita pelo backend (que fala com o ViaCEP)
@Injectable({ providedIn: 'root' })
export class CepService {
  private readonly http = inject(HttpClient);

  buscar(cep: string): Observable<EnderecoCep> {
    return this.http.get<EnderecoCep>(`${environment.apiUrl}/cep/${cep}`);
  }
}
