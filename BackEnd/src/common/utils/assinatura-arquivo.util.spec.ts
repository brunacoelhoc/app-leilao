import { tipoRealDoArquivo } from './assinatura-arquivo.util';

describe('tipoRealDoArquivo (assinatura real do arquivo)', () => {
  it('reconhece JPEG, PNG e PDF pelos primeiros bytes', () => {
    expect(tipoRealDoArquivo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('image/jpeg');
    expect(tipoRealDoArquivo(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe('image/png');
    expect(tipoRealDoArquivo(Buffer.from('%PDF-1.7 resto'))).toBe('application/pdf');
  });

  it('recusa executavel, texto e arquivo vazio ou curto demais', () => {
    expect(tipoRealDoArquivo(Buffer.from('MZ programa'))).toBeNull();
    expect(tipoRealDoArquivo(Buffer.from('texto qualquer'))).toBeNull();
    expect(tipoRealDoArquivo(Buffer.alloc(0))).toBeNull();
    expect(tipoRealDoArquivo(Buffer.from([0xff, 0xd8]))).toBeNull(); // JPEG incompleto
  });
});
