import { TestBed } from '@angular/core/testing';
import { Acessibilidade } from './acessibilidade';

describe('Acessibilidade', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [Acessibilidade] }).compileComponents();
  });

  it('abre o painel e liga o modo dislexia pelo checkbox', async () => {
    const fixture = TestBed.createComponent(Acessibilidade);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('#painel-a11y')).toBeNull();
    (el.querySelector('.btn-painel') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('#painel-a11y')).not.toBeNull();

    const caixas = el.querySelectorAll<HTMLInputElement>('.interruptor input');
    caixas[0].click();
    fixture.detectChanges();
    expect(document.documentElement.hasAttribute('data-dislexia')).toBe(true);
  });

  it('troca o daltonismo pelo select', async () => {
    const fixture = TestBed.createComponent(Acessibilidade);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('.btn-painel') as HTMLButtonElement).click();
    fixture.detectChanges();

    const select = el.querySelector('#a11y-daltonismo') as HTMLSelectElement;
    select.value = 'azul-amarelo';
    select.dispatchEvent(new Event('change'));
    expect(document.documentElement.getAttribute('data-daltonismo')).toBe('azul-amarelo');
  });
});
