import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../core/environment';
import { paramsSemVazios } from '../core/http-params.util';
import { Papel, RespostaPaginada, Usuario } from '../core/models';

@Injectable({ providedIn: 'root' })
export class UsuariosService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/users`;

  meuPerfil(): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.base}/me`);
  }

  listar(params: { pagina?: number; limite?: number; papel?: Papel; ativo?: boolean; busca?: string } = {}): Observable<RespostaPaginada<Usuario>> {
    return this.http.get<RespostaPaginada<Usuario>>(this.base, {
      params: paramsSemVazios({ pagina: 1, limite: 50, ...params }),
    });
  }

  // Troca o modo da conta (BIDDER compra / SELLER vende); o servidor aplica as travas de cada modo
  trocarModo(modo: 'BIDDER' | 'SELLER'): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.base}/me/modo`, { modo });
  }

  // "senhaAtual" so e exigida pelo backend quando o e-mail muda
  atualizarMeuPerfil(
    dto: Partial<Pick<Usuario, 'nome' | 'email' | 'telefone' | 'endereco' | 'cpf' | 'avatarUrl'>> & { senhaAtual?: string },
  ): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.base}/me`, dto);
  }

  // LGPD: encerra a propria conta (o servidor anonimiza os dados pessoais e confere pendencias e senha)
  encerrarMinhaConta(senhaAtual: string): Observable<void> {
    return this.http.post<void>(`${this.base}/me/encerrar-conta`, { senhaAtual });
  }

  alterarMinhaSenha(senhaAtual: string, novaSenha: string): Observable<void> {
    return this.http.patch<void>(`${this.base}/me/senha`, { senhaAtual, novaSenha });
  }

  // Dado COMPLETO (sensivel): so o ADMIN, e cada consulta e auditada no backend
  detalhe(id: string): Observable<Usuario> {
    return this.http.get<Usuario>(`${this.base}/${id}`);
  }

  desativar(id: string): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.base}/${id}/desativar`, {});
  }

  reativar(id: string): Observable<Usuario> {
    return this.http.patch<Usuario>(`${this.base}/${id}/reativar`, {});
  }
}
