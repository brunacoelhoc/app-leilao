import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from './environment';
import { Papel, RespostaLogin, Usuario } from './models';

const CHAVE_TOKEN = 'leiloes.token';
const CHAVE_USUARIO = 'leiloes.usuario';

// Guarda o login na memoria (signals) e no localStorage (sobrevive a um F5).
// So o BackEnd valida senha/permissao de verdade -- isto aqui e so estado de tela
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly token = signal<string | null>(localStorage.getItem(CHAVE_TOKEN));
  readonly usuario = signal<Usuario | null>(lerUsuarioSalvo());

  readonly estaLogado = computed(() => this.token() !== null);
  readonly papel = computed<Papel | null>(() => this.usuario()?.papel ?? null);

  async login(email: string, senha: string): Promise<void> {
    const resposta = await firstValueFrom(
      this.http.post<RespostaLogin>(`${environment.apiUrl}/auth/login`, { email, senha }),
    );
    this.salvarSessao(resposta);
  }

  async registrar(nome: string, email: string, senha: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/auth/registrar`, { nome, email, senha }),
    );
    // Registro nao devolve token -- loga em seguida, com as mesmas credenciais
    await this.login(email, senha);
  }

  // Depois de editar o perfil, atualiza o usuario guardado (nome/avatar no menu lateral)
  atualizarUsuarioLocal(usuario: Usuario): void {
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
    this.usuario.set(usuario);
  }

  logout(): void {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USUARIO);
    this.token.set(null);
    this.usuario.set(null);
  }

  private salvarSessao(resposta: RespostaLogin): void {
    localStorage.setItem(CHAVE_TOKEN, resposta.accessToken);
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify(resposta.usuario));
    this.token.set(resposta.accessToken);
    this.usuario.set(resposta.usuario);
  }
}

function lerUsuarioSalvo(): Usuario | null {
  const bruto = localStorage.getItem(CHAVE_USUARIO);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto) as Usuario;
  } catch {
    return null;
  }
}
