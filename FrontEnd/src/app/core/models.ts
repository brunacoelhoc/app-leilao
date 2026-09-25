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
  // O que falta no perfil para dar lances e criar leiloes (calculado pelo servidor)
  camposFaltando: string[];
  criadoEm: string;
  atualizadoEm: string;
}

export interface RespostaLogin {
  accessToken: string;
  refreshToken: string;
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
  capaDocumentoId?: string | null; // foto de capa (listagem e detalhe)
  capaPadrao?: string; // obra do acervo escolhida pelo servidor quando nao ha foto
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
  capaPadrao: string;
  rotuloAcao: string; // texto do botao, decidido pelo servidor
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
  percentuais: { vendidos: number; disponiveis: number; naoVendidos: number }; // para a barra de andamento
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
  prorrogacoes: number; // quantas vezes o anti-sniping estendeu o prazo do leilao
  totalLances: number;
  cep: string;
  logradouro: string | null;
  cidade: string | null;
  uf: string | null;
  vencedorId: string | null;
  vencedorNome: string | null;
  // Ficha tecnica (opcional)
  autor: string | null;
  periodo: string | null;
  tecnica: string | null;
  dimensoes: string | null;
  conservacao: string | null;
  procedencia: string | null;
  capaDocumentoId?: string | null; // so vem na listagem
  capaPadrao: string;
  rotuloAcao: string; // texto do botao do card, decidido pelo servidor
  lancesSugeridos: string[]; // atalhos de lance calculados pelo servidor (vazio se nao recebe lances)
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

// Pos-leilao do vencedor: pagamento (simulado) e depois retirada/entrega
export type FormaPagamento = 'PIX' | 'CARTAO' | 'BOLETO';
export type TipoEntrega = 'RETIRADA' | 'ENTREGA';
export type PedidoStatus = 'AGUARDANDO_PAGAMENTO' | 'PAGO' | 'FINALIZADO';

export interface Pedido {
  id: string;
  itemId: string;
  valor: string;
  status: PedidoStatus;
  formaPagamento: FormaPagamento | null;
  pagoEm: string | null;
  tipoEntrega: TipoEntrega | null;
  enderecoEntrega: string | null;
  codigoRetirada: string | null;
  localRetirada: string;
}

// Mensagem do chat ao vivo de um leilao
export interface MensagemChat {
  id: string;
  texto: string;
  leilaoId: string;
  autorId: string;
  autorNome: string;
  autorPapel: Papel;
  autorAvatar: string | null;
  criadoEm: string;
}

// Linha do ranking de vendedores (GET /ranking/vendedores): so dados publicos
export interface RankingVendedor {
  posicao: number;
  vendedorId: string;
  nome: string;
  avatarUrl: string | null;
  arrecadado: string;
  vendidas: number;
  finalizadas: number;
  taxaVenda: number;
  maiorVenda: string;
  leiloesEncerrados: number;
  participacao: number; // % em relacao ao lider (lider = 100)
  membroDesde: string;
}

// Totais de leiloes por status (GET /auctions/resumo)
export type ResumoLeiloes = Record<AuctionStatus | 'total', number>;

// Totais da plataforma (GET /admin/resumo, so ADMIN)
export interface ResumoAdmin {
  categorias: number;
  usuarios: number;
  leiloes: number;
}

// Dados da casa de leiloes para o rodape (GET /institucional)
export interface Institucional {
  nome: string;
  lema: string;
  endereco: { logradouro: string; cidade: string; uf: string; cep: string };
  telefone: string;
  telefoneLink: string;
  email: string;
  atendimento: { descricao: string; atendendoAgora: boolean };
}

// Um card da tela "Meus lances" (GET /bids/minhas-pecas): tudo o que a pessoa fez numa peca
export type SituacaoDoLance = 'VENCEDOR' | 'LIDERANDO' | 'SUPERADO' | 'PERDIDO' | 'CANCELADO';

export interface MinhaPeca {
  grupo: 'ADQUIRIDAS' | 'EM_DISPUTA' | 'ENCERRADAS'; // aba da colecao, decidida pelo servidor
  item: {
    id: string;
    titulo: string;
    descricao: string | null;
    leilaoTitulo: string;
    leilaoId: string;
    lanceAtual: string | null;
    capaDocumentoId: string | null;
    capaPadrao: string;
  };
  meuMaiorLance: string;
  totalMeusLances: number;
  ultimoLanceEm: string;
  situacaoDoLance: SituacaoDoLance;
  adquiridoEm: string | null;
  valorAquisicao: string | null;
}

// Historia da obra e contexto da epoca (GET /auction-items/:id/historia)
export interface ObraHistoria {
  titulo: string;
  artista: string;
  ano: string;
  movimento: string;
  localAtual: string;
  historia: string;
  contextoHistorico: string;
  contextoFilosofico: string;
  contextoSocial: string;
  curiosidade: string;
  autenticidade: 'REPRODUCAO';
  autenticidadeTexto: string;
}

export interface HistoriaPeca {
  origem: 'OBRA_DO_ACERVO' | 'FICHA_DA_PECA';
  obra: ObraHistoria | null;
  itemId: string;
  titulo: string;
  descricao: string | null;
  autor: string | null;
  periodo: string | null;
  tecnica: string | null;
  dimensoes: string | null;
  conservacao: string | null;
  procedencia: string | null;
}

// Resumo da colecao (as contas saem prontas do servidor)
export interface ResumoColecao {
  adquiridas: number;
  emDisputa: number;
  encerradas: number;
  liderando: number;
  disputadas: number;
  totalInvestido: string;
}

export interface MinhasPecas {
  resumo: ResumoColecao;
  pecas: MinhaPeca[];
}

// O que o usuario logado pode fazer numa peca (GET /auction-items/:id/bids/minha-situacao)
export interface MinhaSituacao {
  permitido: boolean;
  motivo: 'ADMIN' | 'MODO_VENDEDOR' | 'DONO' | 'PERFIL_INCOMPLETO' | 'LEILAO_FECHADO' | 'ITEM_INDISPONIVEL' | 'JA_LIDERA' | null;
  mensagem: string | null;
  euSouDono: boolean;
  euSouVencedor: boolean;
}

// Obra do acervo (GET /obras/acervo)
export interface ObraAcervo {
  arquivo: string;
  titulo: string;
  autor: string;
  ano: string;
  fonte: string;
}
