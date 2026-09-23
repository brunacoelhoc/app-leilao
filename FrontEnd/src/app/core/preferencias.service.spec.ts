import { TestBed } from '@angular/core/testing';
import { PreferenciasService } from './preferencias.service';

describe('PreferenciasService', () => {
  const html = document.documentElement;

  function criar(): PreferenciasService {
    TestBed.resetTestingModule();
    return TestBed.inject(PreferenciasService);
  }

  beforeEach(() => {
    localStorage.clear();
    ['data-tema', 'data-daltonismo', 'data-dislexia', 'data-sem-animacoes'].forEach((a) =>
      html.removeAttribute(a),
    );
  });

  it('aplica os padroes no <html>', () => {
    criar();
    expect(html.getAttribute('data-tema')).toBe('claro');
    expect(html.getAttribute('data-daltonismo')).toBe('nenhum');
    expect(html.hasAttribute('data-dislexia')).toBe(false);
  });

  it('liga e desliga o modo dislexia', () => {
    const prefs = criar();
    prefs.alternarDislexia();
    expect(html.hasAttribute('data-dislexia')).toBe(true);
    prefs.alternarDislexia();
    expect(html.hasAttribute('data-dislexia')).toBe(false);
  });

  it('troca o modo de daltonismo e o tema', () => {
    const prefs = criar();
    prefs.definirDaltonismo('vermelho-verde');
    prefs.definirTema('alto-contraste');
    expect(html.getAttribute('data-daltonismo')).toBe('vermelho-verde');
    expect(html.getAttribute('data-tema')).toBe('alto-contraste');
  });

  it('reduz animacoes', () => {
    const prefs = criar();
    prefs.alternarAnimacoes();
    expect(html.hasAttribute('data-sem-animacoes')).toBe(prefs.reduzirAnimacoes());
  });

  it('lembra as escolhas na proxima visita', () => {
    const prefs = criar();
    prefs.alternarDislexia();
    prefs.definirDaltonismo('azul-amarelo');
    prefs.aumentarFonte();
    const outra = criar();
    expect(outra.dislexia()).toBe(true);
    expect(outra.daltonismo()).toBe('azul-amarelo');
    expect(outra.indiceFonte()).toBe(2);
  });

  it('ignora valores invalidos salvos', () => {
    localStorage.setItem('leiloes.tema', 'xyz');
    localStorage.setItem('leiloes.daltonismo', 'xyz');
    const prefs = criar();
    expect(prefs.tema()).toBe('claro');
    expect(prefs.daltonismo()).toBe('nenhum');
  });

  it('restaura o padrao', () => {
    const prefs = criar();
    prefs.alternarDislexia();
    prefs.definirDaltonismo('monocromatico');
    prefs.definirTema('escuro');
    prefs.aumentarFonte();
    prefs.restaurarPadrao();
    expect(html.hasAttribute('data-dislexia')).toBe(false);
    expect(html.getAttribute('data-daltonismo')).toBe('nenhum');
    expect(html.getAttribute('data-tema')).toBe('claro');
    expect(prefs.indiceFonte()).toBe(1);
  });
});
