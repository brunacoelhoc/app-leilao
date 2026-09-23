import { Component, HostListener, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Avatar } from '../avatar/avatar';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, Avatar],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly aberta = signal(false);

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
