import { Injectable, signal } from '@angular/core';

const CHAVE_FONTE = 'leiloes.tamanhoFonte';
const CHAVE_TEMA = 'leiloes.tema';
const CHAVE_DISLEXIA = 'leiloes.dislexia';
const CHAVE_DALTONISMO = 'leiloes.daltonismo';
const CHAVE_ANIMACOES = 'leiloes.reduzirAnimacoes';
const CHAVE_LIBRAS = 'leiloes.vlibras';
const TAMANHOS = [15, 16, 18, 20, 22];

export type Tema = 'claro' | 'escuro' | 'alto-contraste';
export type Daltonismo = 'nenhum' | 'vermelho-verde' | 'azul-amarelo' | 'monocromatico';

export const MODOS_DALTONISMO: { valor: Daltonismo; rotulo: string }[] = [
  { valor: 'nenhum', rotulo: 'Cores normais' },
  { valor: 'vermelho-verde', rotulo: 'Protanopia / Deuteranopia (vermelho-verde)' },
  { valor: 'azul-amarelo', rotulo: 'Tritanopia (azul-amarelo)' },
  { valor: 'monocromatico', rotulo: 'Acromatopsia (tons de cinza)' },
];

// Preferencias de acessibilidade. Cada uma vira um atributo no <html>
// (data-*) que o styles.css usa para trocar cores/fontes/animacoes, e fica
// guardada no localStorage para valer nas proximas visitas.
// Sao preferencias do proprio aparelho: nao sao enviadas ao servidor (LGPD).
@Injectable({ providedIn: 'root' })
export class PreferenciasService {
  readonly indiceFonte = signal(this.lerIndiceFonteSalvo());
  readonly tema = signal<Tema>(this.lerTemaSalvo());
  readonly dislexia = signal(this.lerBool(CHAVE_DISLEXIA));
  readonly daltonismo = signal<Daltonismo>(this.lerDaltonismoSalvo());
  // Se a pessoa nunca escolheu, segue a configuracao do sistema operacional
  readonly reduzirAnimacoes = signal(this.lerAnimacoesSalvas());
  readonly libras = signal(this.lerBool(CHAVE_LIBRAS, true));

  constructor() {
    this.aplicarFonte();
    this.aplicarTema();
    this.aplicarDislexia();
    this.aplicarDaltonismo();
    this.aplicarAnimacoes();
  }

  aumentarFonte(): void {
    this.indiceFonte.update((i) => Math.min(i + 1, TAMANHOS.length - 1));
    this.aplicarFonte();
  }

  diminuirFonte(): void {
    this.indiceFonte.update((i) => Math.max(i - 1, 0));
    this.aplicarFonte();
  }

  definirTema(tema: Tema): void {
    this.tema.set(tema);
    this.guardar(CHAVE_TEMA, tema);
    this.aplicarTema();
  }

  alternarDislexia(): void {
    this.dislexia.update((v) => !v);
    this.guardar(CHAVE_DISLEXIA, String(this.dislexia()));
    this.aplicarDislexia();
  }

  definirDaltonismo(modo: Daltonismo): void {
    this.daltonismo.set(modo);
    this.guardar(CHAVE_DALTONISMO, modo);
    this.aplicarDaltonismo();
  }

  alternarAnimacoes(): void {
    this.reduzirAnimacoes.update((v) => !v);
    this.guardar(CHAVE_ANIMACOES, String(this.reduzirAnimacoes()));
    this.aplicarAnimacoes();
  }

  alternarLibras(): void {
    this.libras.update((v) => !v);
    this.guardar(CHAVE_LIBRAS, String(this.libras()));
  }

  restaurarPadrao(): void {
    this.indiceFonte.set(1);
    this.aplicarFonte();
    this.definirTema('claro');
    this.dislexia.set(false);
    this.guardar(CHAVE_DISLEXIA, 'false');
    this.aplicarDislexia();
    this.definirDaltonismo('nenhum');
    this.reduzirAnimacoes.set(this.sistemaPedeMenosMovimento());
    this.guardar(CHAVE_ANIMACOES, String(this.reduzirAnimacoes()));
    this.aplicarAnimacoes();
    this.libras.set(true);
    this.guardar(CHAVE_LIBRAS, 'true');
  }

  private aplicarFonte(): void {
    const tamanho = TAMANHOS[this.indiceFonte()];
    document.documentElement.style.setProperty('--tamanho-fonte-base', `${tamanho}px`);
    this.guardar(CHAVE_FONTE, String(this.indiceFonte()));
  }

  private aplicarTema(): void {
    document.documentElement.setAttribute('data-tema', this.tema());
  }

  private aplicarDislexia(): void {
    document.documentElement.toggleAttribute('data-dislexia', this.dislexia());
  }

  private aplicarDaltonismo(): void {
    document.documentElement.setAttribute('data-daltonismo', this.daltonismo());
  }

  private aplicarAnimacoes(): void {
    document.documentElement.toggleAttribute('data-sem-animacoes', this.reduzirAnimacoes());
  }

  private sistemaPedeMenosMovimento(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  // localStorage pode estar bloqueado (aba anonima etc): nao pode quebrar o app
  private guardar(chave: string, valor: string): void {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      /* sem armazenamento: a preferencia vale so nesta visita */
    }
  }

  private ler(chave: string): string | null {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  }

  private lerBool(chave: string, padrao = false): boolean {
    const salvo = this.ler(chave);
    return salvo === null ? padrao : salvo === 'true';
  }

  private lerAnimacoesSalvas(): boolean {
    const salvo = this.ler(CHAVE_ANIMACOES);
    return salvo === null ? this.sistemaPedeMenosMovimento() : salvo === 'true';
  }

  private lerTemaSalvo(): Tema {
    const salvo = this.ler(CHAVE_TEMA);
    return salvo === 'claro' || salvo === 'escuro' || salvo === 'alto-contraste' ? salvo : 'claro';
  }

  private lerDaltonismoSalvo(): Daltonismo {
    const salvo = this.ler(CHAVE_DALTONISMO);
    return MODOS_DALTONISMO.some((m) => m.valor === salvo) ? (salvo as Daltonismo) : 'nenhum';
  }

  private lerIndiceFonteSalvo(): number {
    const texto = this.ler(CHAVE_FONTE);
    if (texto === null) return 1; // Number(null) daria 0 (fonte menor) sem nada salvo
    const salvo = Number(texto);
    return Number.isInteger(salvo) && salvo >= 0 && salvo < TAMANHOS.length ? salvo : 1;
  }
}
