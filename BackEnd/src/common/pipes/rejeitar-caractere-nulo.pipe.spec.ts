import { BadRequestException } from '@nestjs/common';
import { RejeitarCaractereNuloPipe } from './rejeitar-caractere-nulo.pipe';

describe('RejeitarCaractereNuloPipe', () => {
  const pipe = new RejeitarCaractereNuloPipe();
  const corpo = { type: 'body' as const };

  it('deixa passar texto normal, acento e emoji', () => {
    const valor = { titulo: 'Leilão 🖼️', itens: [{ nome: 'ok' }], numero: 5, nulo: null };
    expect(pipe.transform(valor, corpo)).toBe(valor);
  });

  it('recusa caractere nulo no corpo, dentro de objetos e listas', () => {
    expect(() => pipe.transform({ titulo: 'a\u0000b' }, corpo)).toThrow(BadRequestException);
    expect(() => pipe.transform({ a: { b: ['x', 'y\u0000'] } }, corpo)).toThrow(BadRequestException);
  });

  it('vale também para query e parâmetro de rota', () => {
    expect(() => pipe.transform('a\u0000', { type: 'query' })).toThrow(BadRequestException);
    expect(() => pipe.transform('a\u0000', { type: 'param' })).toThrow(BadRequestException);
  });

  it('ignora o que não é corpo/query/param (ex.: arquivo enviado) e não trava com estrutura funda', () => {
    const arquivo = { buffer: Buffer.from('a\u0000b') };
    expect(pipe.transform(arquivo, { type: 'custom' })).toBe(arquivo);
    let fundo: Record<string, unknown> = { fim: 'x\u0000' };
    for (let i = 0; i < 50; i++) fundo = { filho: fundo };
    expect(() => pipe.transform(fundo, corpo)).not.toThrow(); // limite de profundidade
  });
});
