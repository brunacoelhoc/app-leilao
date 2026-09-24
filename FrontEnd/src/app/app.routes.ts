import { Routes } from '@angular/router';
import { authGuard, papelGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/leiloes-lista/leiloes-lista').then((m) => m.LeiloesLista),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then((m) => m.Login),
  },
  {
    path: 'registrar',
    loadComponent: () => import('./pages/registrar/registrar').then((m) => m.Registrar),
  },
  {
    path: 'leiloes/:id',
    loadComponent: () => import('./pages/leilao-detalhe/leilao-detalhe').then((m) => m.LeilaoDetalhe),
  },
  {
    path: 'itens/:id',
    loadComponent: () => import('./pages/item-detalhe/item-detalhe').then((m) => m.ItemDetalhe),
  },
  {
    path: 'perfil',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/perfil/perfil').then((m) => m.Perfil),
  },
  {
    path: 'meus-lances',
    canActivate: [papelGuard('BIDDER')],
    loadComponent: () => import('./pages/meus-lances/meus-lances').then((m) => m.MeusLances),
  },
  {
    path: 'vendedor',
    canActivate: [papelGuard('SELLER', 'ADMIN')],
    loadComponent: () => import('./pages/vendedor-painel/vendedor-painel').then((m) => m.VendedorPainel),
  },
  {
    path: 'vendedor/leiloes/:id',
    canActivate: [papelGuard('SELLER', 'ADMIN')],
    loadComponent: () => import('./pages/vendedor-leilao/vendedor-leilao').then((m) => m.VendedorLeilao),
  },
  {
    path: 'admin',
    canActivate: [papelGuard('ADMIN')],
    loadComponent: () => import('./pages/admin-painel/admin-painel').then((m) => m.AdminPainel),
  },
  { path: '**', redirectTo: '' },
];
