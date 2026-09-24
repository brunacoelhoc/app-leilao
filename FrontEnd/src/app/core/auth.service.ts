import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from './environment';
import { Papel, RespostaLogin, Usuario } from './models';

const CHAVE_TOKEN = 'leiloes.token';
const CHAVE_REFRESH = 'leiloes.refresh';
// Chave antiga: o usuario inteiro (com CPF, telefone e endereco) ficava salvo no navegador
const CHAVE_USUARIO_ANTIGA = 'leiloes.usuario';

// 🔎 O navegador guarda SO os tokens (sobrevivem a um F5): o de acesso (dura minutos) e o de renovacao.
// Os dados do usuario ficam no banco: a tela os busca em GET /users/me quando abre (carregarSessao) e
// mantem so na memoria. Quem valida senha, sessao e permissao de verdade e o BackEnd -- isto aqui e
// so estado de tela
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  readonly token = signal<string | null>(localStorage.getItem(CHAVE_TOKEN));
  private readonly refreshToken = signal<string | null>(localStorage.getItem(CHAVE_REFRESH));
  readonly usuario = signal<Usuario | null>(null);

  readonly estaLogado = computed(() => this.token() !== null);
  readonly papel = computed<Papel | null>(() => this.usuario()?.papel ?? null);

  // Varias chamadas que falham ao mesmo tempo esperam a MESMA renovacao (o refresh token e de uso unico)
  private renovando: Promise<boolean> | null = null;

  temRefreshToken(): boolean {
    return this.refreshToken() !== null;
  }

  // Roda uma vez, antes da primeira tela: se ha token, busca o usuario no servidor.
  // O interceptor renova o acesso sozinho se ele tiver vencido; sessao encerrada -> sai da sessao
  async carregarSessao(): Promise<void> {
    localStorage.removeItem(CHAVE_USUARIO_ANTIGA);
    if (this.token() === null) return;
    try {
      this.usuario.set(await firstValueFrom(this.http.get<Usuario>(`${environment.apiUrl}/users/me`)));
    } catch {
      this.limparSessao();
    }
  }

  // Pede um par novo de tokens ao servidor. false = sessao encerrada, expirada ou refresh invalido
  renovar(): Promise<boolean> {
    const refresh = this.refreshToken();
    if (!refresh) return Promise.resolve(false);
    this.renovando ??= firstValueFrom(
      this.http.post<RespostaLogin>(`${environment.apiUrl}/auth/refresh`, { refreshToken: refresh }),
    )
      .then((resposta) => {
        this.salvarSessao(resposta);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.renovando = null;
      });
    return this.renovando;
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

  // Logout de verdade: o servidor revoga a sessao (o token deixa de funcionar na hora) e so depois
  // a tela esquece os tokens. Se o servidor nao responder, sai mesmo assim
  async logout(): Promise<void> {
    const encerrar = () => firstValueFrom(this.http.post(`${environment.apiUrl}/auth/logout`, {}));
    try {
      await encerrar();
    } catch (erro) {
      // Acesso vencido: renova e tenta encerrar a sessao no servidor mais uma vez
      if (erro instanceof HttpErrorResponse && erro.status === 401 && (await this.renovar())) {
        await encerrar().catch(() => undefined);
      }
    }
    this.limparSessao();
  }

  // So esquece a sessao neste navegador (o servidor nao e avisado)
  limparSessao(): void {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_REFRESH);
    this.token.set(null);
    this.refreshToken.set(null);
    this.usuario.set(null);
  }

  private salvarSessao(resposta: RespostaLogin): void {
    localStorage.setItem(CHAVE_TOKEN, resposta.accessToken);
    localStorage.setItem(CHAVE_REFRESH, resposta.refreshToken);
    this.token.set(resposta.accessToken);
    this.refreshToken.set(resposta.refreshToken);
    this.usuario.set(resposta.usuario);
  }
}
