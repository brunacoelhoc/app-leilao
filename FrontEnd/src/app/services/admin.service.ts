import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { ResumoAdmin } from '../core/models';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  resumo(): Observable<ResumoAdmin> {
    return this.http.get<ResumoAdmin>(`${environment.apiUrl}/admin/resumo`);
  }
}
