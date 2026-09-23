// Interfaces que espelham as respostas reais da API (BackEnd/src/**/dto/*-resposta.dto.ts).
// Valores monetarios chegam sempre como STRING (Decimal do Prisma), nunca number.

export type Papel = 'BIDDER' | 'SELLER' | 'ADMIN';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  telefone: string | null;
  endereco: string | null;
  cpf: string | null;
  avatarUrl: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface RespostaLogin {
  accessToken: string;
  usuario: Usuario;
}

export interface Categoria {
  id: string;
  nome: string;
  descricao: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export type AuctionStatus = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'CANCELED';

export interface Leilao {
  id: string;
  titulo: string;
  descricao: string | null;
  status: AuctionStatus;
  dataInicio: string;
  dataFim: string;
  vendedorId: string;
  // Decidido pelo backend (maquina de estados): o front so exibe os botoes
  transicoesPermitidas: AuctionStatus[];
  editavel: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

// Card do carrossel da home (GET /destaques): tudo calculado pelo servidor
export interface Destaque {
  id: string;
  titulo: string;
  descricao: string | null;
  status: AuctionStatus;
  etiqueta: string;
  dataInicio: string;
  dataFim: string;
  totalItens: number;
  totalLances: number;
  maiorLance: string | null;
  capaDocumentoId: string | null;
  itemUnicoId: string | null;
}

export interface IndicadoresLeilao {
  totalItens: number;
  totalLances: number;
  maiorLance: string | null;
  itensVendidos: number;
  itensNaoVendidos: number;
  itensDisponiveis: number;
  arrecadadoTotal: string;
}

export type ItemStatus = 'AVAILABLE' | 'SOLD' | 'UNSOLD';

export type SituacaoItem = 'EM_BREVE' | 'ABERTO' | 'ENCERRANDO' | 'VENDIDO' | 'NAO_VENDIDO' | 'CANCELADO';

export interface ItemLeilao {
  id: string;
  titulo: string;
  descricao: string | null;
  status: ItemStatus;
  precoInicial: string;
  incrementoMinimo: string;
  lanceAtual: string | null;
  // Calculados pelo servidor: a tela so exibe
  situacao: SituacaoItem;
  lanceMinimo: string;
  segundosParaMudanca: number | null;
  totalLances: number;
  cep: string;
  logradouro: string | null;
  cidade: string | null;
  uf: string | null;
  vencedorId: string | null;
  vencedorNome: string | null;
  leilaoId: string;
  categoriaId: string;
  criadoEm: string;
  atualizadoEm: string;
}

export interface Lance {
  id: string;
  valor: string;
  lanceAnterior: string | null;
  itemId: string;
  licitanteId: string;
  licitanteNome?: string; // so vem na listagem por item
  criadoEm: string;
}

export type TipoDocumento = 'PHOTO' | 'DOCUMENT';

export interface Documento {
  id: string;
  tipo: TipoDocumento;
  nomeOriginal: string;
  nomeArquivo: string;
  mimeType: string;
  tamanho: number;
  hash: string;
  itemId: string;
  enviadoPorId: string;
  criadoEm: string;
}

// Formato padrao de toda listagem paginada (ver BackEnd paginacao.util.ts)
export interface RespostaPaginada<T> {
  dados: T[];
  total: number;
  pagina: number;
  limite: number;
  totalPaginas: number;
}

// Formato padrao de erro (ver BackEnd erro-resposta.dto.ts)
export interface ErroApi {
  statusCode: number;
  erro: string;
  mensagem: string | string[];
  caminho: string;
  dataHora: string;
}
