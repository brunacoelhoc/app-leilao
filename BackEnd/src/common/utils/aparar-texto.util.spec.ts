import { aparar } from './aparar-texto.util';

describe('aparar', () => {
  it('tira os espaços das pontas e mantém os do meio', () => {
    expect(aparar({ value: '  Arte  Sacra \n' })).toBe('Arte  Sacra');
    expect(aparar({ value: '     ' })).toBe('');
  });

  it('devolve como está o que não é texto (o @IsString recusa depois)', () => {
    expect(aparar({ value: 123 })).toBe(123);
    expect(aparar({ value: null })).toBeNull();
    expect(aparar({ value: undefined })).toBeUndefined();
  });
});
