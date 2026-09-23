// Biblioteca de avatares prontos (animais, em medalhão estilo camafeu vintage). O backend guarda so a "chave"
// (ex.: "raposa") em User.avatarUrl; quem desenha o emoji e a cor e o front
export interface AvatarPronto {
  chave: string;
  nome: string;
  emoji: string;
  cor: string;
  // Ilustracao vintage (SVG em /public/avatares); sem ela, usa o emoji
  imagem?: string;
}

export const AVATARES_PRONTOS: AvatarPronto[] = [
  { chave: 'raposa', nome: 'Raposa', emoji: '🦊', cor: '#e8b27a' },
  { chave: 'gato', nome: 'Gato', emoji: '🐱', cor: '#d9c3a0' },
  { chave: 'cachorro', nome: 'Cachorro', emoji: '🐶', cor: '#c9a978' },
  { chave: 'coruja', nome: 'Coruja', emoji: '🦉', cor: '#b89f7d', imagem: 'avatares/coruja.svg' },
  { chave: 'panda', nome: 'Panda', emoji: '🐼', cor: '#cfd6d2' },
  { chave: 'leao', nome: 'Leão', emoji: '🦁', cor: '#e2c26b', imagem: 'avatares/leao.svg' },
  { chave: 'pavao', nome: 'Pavão', emoji: '🦚', cor: '#9fc3c0', imagem: 'avatares/pavao.svg' },
  { chave: 'cisne', nome: 'Cisne', emoji: '🦢', cor: '#e8e2d6', imagem: 'avatares/cisne.svg' },
  { chave: 'aguia', nome: 'Águia', emoji: '🦅', cor: '#cbb38a' },
  { chave: 'cavalo', nome: 'Cavalo', emoji: '🐴', cor: '#c49a6c' },
  { chave: 'cervo', nome: 'Cervo', emoji: '🦌', cor: '#d3b48a' },
  { chave: 'sapo', nome: 'Sapo', emoji: '🐸', cor: '#a9c79a' },
  { chave: 'unicornio', nome: 'Unicórnio', emoji: '🦄', cor: '#d8b6cf' },
  { chave: 'coelho', nome: 'Coelho', emoji: '🐰', cor: '#e6cdd0' },
  { chave: 'urso', nome: 'Urso', emoji: '🐻', cor: '#b98f6b' },
  { chave: 'pinguim', nome: 'Pinguim', emoji: '🐧', cor: '#b4c3d1' },
  { chave: 'tartaruga', nome: 'Tartaruga', emoji: '🐢', cor: '#9fbf9f' },
];

export function acharAvatarPronto(chave: string | null | undefined): AvatarPronto | undefined {
  return AVATARES_PRONTOS.find((a) => a.chave === chave);
}

export function ehImagemUpload(avatarUrl: string | null | undefined): boolean {
  return !!avatarUrl && avatarUrl.startsWith('data:image/');
}
