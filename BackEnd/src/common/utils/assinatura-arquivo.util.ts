// 🔎 O "mimetype" de um upload e informado pelo CLIENTE e pode mentir (um executavel enviado como
// "foto.jpg" chega com mimetype image/jpeg). Por isso o servidor olha os primeiros bytes do arquivo:
// cada formato tem uma "assinatura" (magic bytes) que o identifica de verdade.
export type TipoReal = 'image/jpeg' | 'image/png' | 'application/pdf';

const comeca = (buffer: Buffer, bytes: number[]): boolean =>
  buffer.length >= bytes.length && bytes.every((b, i) => buffer[i] === b);

export function tipoRealDoArquivo(buffer: Buffer): TipoReal | null {
  if (comeca(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (comeca(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (comeca(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'; // "%PDF-"
  return null;
}
