import { normalizarEmail } from './normalizar-email.util';

describe('normalizarEmail', () => {
  it('tira espacos e deixa minusculo', () => {
    expect(normalizarEmail({ value: '  Ana@X.COM ' })).toBe('ana@x.com');
  });

  it('devolve como esta o que nao e texto (o @IsEmail recusa depois, sem quebrar)', () => {
    expect(normalizarEmail({ value: 123 })).toBe(123);
    expect(normalizarEmail({ value: undefined })).toBeUndefined();
    const objeto = { a: 1 };
    expect(normalizarEmail({ value: objeto })).toBe(objeto);
  });
});
