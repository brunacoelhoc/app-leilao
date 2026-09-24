import { afterNextRender, Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Daltonismo, MODOS_DALTONISMO, PreferenciasService, Tema } from '../../core/preferencias.service';

const URL_VLIBRAS = 'https://vlibras.gov.br/app';

declare global {
  interface Window {
    VLibras?: { Widget: new (url: string) => unknown };
  }
}

@Component({
  selector: 'app-acessibilidade',
  templateUrl: './acessibilidade.html',
  styleUrl: './acessibilidade.css',
})
export class Acessibilidade {
  protected readonly prefs = inject(PreferenciasService);
  protected readonly modosDaltonismo = MODOS_DALTONISMO;
  protected readonly painelAberto = signal(false);
  private readonly router = inject(Router);

  // Lista mostrada no painel "Mais opcoes" (o mapa real esta em aoTeclar)
  protected readonly atalhos = [
    { teclas: 'Alt + 1', acao: 'Ir para a Home' },
    { teclas: 'Alt + 2', acao: 'Ir para o Catálogo de leilões' },
    { teclas: 'Alt + 3', acao: 'Meus lances' },
    { teclas: 'Alt + 4', acao: 'Painel do vendedor' },
    { teclas: 'Alt + 5', acao: 'Administração' },
    { teclas: 'Alt + 6', acao: 'Meu perfil' },
    { teclas: 'Alt + M', acao: 'Pular para o conteúdo principal' },
    { teclas: 'Alt + 0', acao: 'Abrir/fechar opções de acessibilidade' },
    { teclas: 'Alt + C', acao: 'Alternar alto contraste' },
    { teclas: 'Alt + + / Alt + -', acao: 'Aumentar / diminuir a fonte' },
  ];

  // 🔎 Atalhos de navegacao. Usa event.code (posicao da tecla) porque o Alt
  // muda o caractere em alguns teclados. As rotas protegidas continuam
  // protegidas: se a pessoa nao tem permissao, o guard redireciona
  @HostListener('document:keydown', ['$event'])
  aoTeclar(evento: KeyboardEvent): void {
    if (!evento.altKey || evento.ctrlKey || evento.metaKey) return;

    const rotas: Record<string, () => unknown> = {
      Digit1: () => this.router.navigateByUrl('/'),
      Digit2: () => this.router.navigate(['/'], { fragment: 'todos-leiloes' }),
      Digit3: () => this.router.navigateByUrl('/meus-lances'),
      Digit4: () => this.router.navigateByUrl('/vendedor'),
      Digit5: () => this.router.navigateByUrl('/admin'),
      Digit6: () => this.router.navigateByUrl('/perfil'),
      KeyM: () => document.getElementById('conteudo-principal')?.focus(),
      Digit0: () => this.alternarPainel(),
      KeyC: () =>
        this.prefs.definirTema(this.prefs.tema() === 'alto-contraste' ? 'claro' : 'alto-contraste'),
      Equal: () => this.prefs.aumentarFonte(),
      NumpadAdd: () => this.prefs.aumentarFonte(),
      Minus: () => this.prefs.diminuirFonte(),
      NumpadSubtract: () => this.prefs.diminuirFonte(),
    };

    const acao = rotas[evento.code];
    if (!acao) return;
    evento.preventDefault();
    acao();
  }

  constructor() {
    // O VLibras (tradutor para Libras do governo) e um script externo:
    // so carrega no navegador, depois do primeiro render
    afterNextRender(() => this.carregarVLibras());
  }

  alternarPainel(): void {
    this.painelAberto.update((v) => !v);
  }

  fecharPainel(): void {
    this.painelAberto.set(false);
  }

  escolherTema(evento: Event): void {
    this.prefs.definirTema((evento.target as HTMLSelectElement).value as Tema);
  }

  escolherDaltonismo(evento: Event): void {
    this.prefs.definirDaltonismo((evento.target as HTMLSelectElement).value as Daltonismo);
  }

  private carregarVLibras(): void {
    if (document.getElementById('script-vlibras')) return;
    const script = document.createElement('script');
    script.id = 'script-vlibras';
    script.src = `${URL_VLIBRAS}/vlibras-plugin.js`;
    script.async = true;
    script.onload = () => new window.VLibras!.Widget(URL_VLIBRAS);
    // sem internet o resto do site continua funcionando normalmente
    script.onerror = () => script.remove();
    document.body.appendChild(script);
  }
}
