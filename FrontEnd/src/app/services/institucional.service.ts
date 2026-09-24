import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { Institucional } from '../core/models';

@Injectable({ providedIn: 'root' })
export class InstitucionalService {
  private readonly http = inject(HttpClient);

  obter(): Observable<Institucional> {
    return this.http.get<Institucional>(`${environment.apiUrl}/institucional`);
  }
}
