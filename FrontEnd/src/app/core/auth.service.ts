import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from './environment';
import { Papel, RespostaLogin, Usuario } from './models';

const CHAVE_TOKEN = 'leiloes.token';
// Chave antiga: o usuario inteiro (com CPF, telefone e endereco) ficava salvo no navegador
const CHAVE_USUARIO_ANTIGA = 'leiloes.usuario';

// 🔎 O navegador guarda SO o token (sobrevive a um F5). Os dados do usuario ficam no banco:
// a tela os busca em GET /users/me quando abre (carregarSessao) e mantem so na memoria.
// Quem valida senha e permissao de verdade e o BackEnd -- isto aqui e so estado de tela
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly token = signal<string | null>(localStorage.getItem(CHAVE_TOKEN));
  readonly usuario = signal<Usuario | null>(null);

  readonly estaLogado = computed(() => this.token() !== null);
  readonly papel = computed<Papel | null>(() => this.usuario()?.papel ?? null);

  // Roda uma vez, antes da primeira tela: se ha token, busca o usuario no servidor.
  // Token vencido ou usuario desativado (401) -> sai da sessao
  async carregarSessao(): Promise<void> {
    localStorage.removeItem(CHAVE_USUARIO_ANTIGA);
    if (this.token() === null) return;
    try {
      this.usuario.set(await firstValueFrom(this.http.get<Usuario>(`${environment.apiUrl}/users/me`)));
    } catch {
      this.logout();
    }
  }

  async login(email: string, senha: string): Promise<void> {
    const resposta = await firstValueFrom(
      this.http.post<RespostaLogin>(`${environment.apiUrl}/auth/login`, { email, senha }),
    );
    this.salvarSessao(resposta);
  }

  async registrar(nome: string, email: string, senha: string, aceiteTermos: boolean): Promise<void> {
    await firstValueFrom(
      this.http.post(`${environment.apiUrl}/auth/registrar`, { nome, email, senha, aceiteTermos }),
    );
    // Registro nao devolve token -- loga em seguida, com as mesmas credenciais
    await this.login(email, senha);
  }

  // Recuperacao de senha: quem gera, guarda e confere o codigo e o servidor
  async pedirCodigoDeSenha(email: string): Promise<string> {
    const r = await firstValueFrom(this.http.post<{ mensagem: string }>(`${environment.apiUrl}/auth/esqueci-senha`, { email }));
    return r.mensagem;
  }

  async redefinirSenha(email: string, codigo: string, novaSenha: string): Promise<string> {
    const r = await firstValueFrom(this.http.post<{ mensagem: string }>(`${environment.apiUrl}/auth/redefinir-senha`, { email, codigo, novaSenha }));
    return r.mensagem;
  }

  // Depois de editar o perfil ou trocar de modo, atualiza o usuario em memoria (menu lateral etc.)
  atualizarUsuarioLocal(usuario: Usuario): void {
    this.usuario.set(usuario);
  }

  logout(): void {
    localStorage.removeItem(CHAVE_TOKEN);
    this.token.set(null);
    this.usuario.set(null);
  }

  private salvarSessao(resposta: RespostaLogin): void {
    localStorage.setItem(CHAVE_TOKEN, resposta.accessToken);
    this.token.set(resposta.accessToken);
    this.usuario.set(resposta.usuario);
  }
}
