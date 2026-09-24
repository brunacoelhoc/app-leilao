import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { Avatar } from '../avatar/avatar';

const CHAVE_RECOLHIDA = 'menu-recolhido';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Avatar],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly aberta = signal(false); // celular: menu deslizante aberto
  // Computador: menu recolhido (so a setinha na borda). A escolha fica salva no navegador
  readonly recolhida = signal(this.lerRecolhida());

  // Home e Catálogo apontam para a mesma página ("/"); o que os diferencia é o
  // trecho "#todos-leiloes" da URL. Por isso o destaque é calculado aqui
  private readonly url = signal(this.router.url);
  readonly homeAtivo = computed(() => this.url() === '/' || this.url().startsWith('/?'));
  readonly catalogoAtivo = computed(() => this.url().includes('#todos-leiloes'));
  readonly rankingAtivo = computed(() => this.url().includes('#ranking'));

  constructor() {
    this.aplicarRecolhida(this.recolhida());
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.url.set(e.urlAfterRedirects));
  }

  alternarRecolhida(): void {
    const novo = !this.recolhida();
    this.recolhida.set(novo);
    this.aplicarRecolhida(novo);
    try {
      localStorage.setItem(CHAVE_RECOLHIDA, novo ? '1' : '0');
    } catch {
      /* sem armazenamento: so nao lembra da escolha */
    }
  }

  // O resto da pagina (area de conteudo e barra de acessibilidade) acompanha pelo CSS global
  private aplicarRecolhida(valor: boolean): void {
    document.documentElement.toggleAttribute('data-menu-recolhido', valor);
  }

  private lerRecolhida(): boolean {
    try {
      return localStorage.getItem(CHAVE_RECOLHIDA) === '1';
    } catch {
      return false;
    }
  }

  alternar(): void {
    this.aberta.update((v) => !v);
  }

  @HostListener('document:keydown.escape')
  aoApertarEsc(): void {
    this.fechar();
  }

  fechar(): void {
    this.aberta.set(false);
  }

  sair(): void {
    this.auth.logout();
    this.fechar();
    void this.router.navigateByUrl('/');
  }
}
