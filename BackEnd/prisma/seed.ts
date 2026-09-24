import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { CATALOGO_OBRAS } from '../src/obras/catalogo-obras';
import {
  AuctionStatus,
  ItemStatus,
  PrismaClient,
} from '../src/generated/prisma/client';

// Mesmo padrao de conexao do PrismaService (driver adapter do Prisma 7)
const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

// Custo igual ao usado pelo AuthService, para as senhas ficarem realistas
const CUSTO_DO_HASH = 12;

// Ids fixos: permitem rodar o seed varias vezes sem duplicar nada (upsert
// por id). Bid e AuctionStatusHistory sao imutaveis (trigger do banco), por
// isso sao sempre "criar se nao existir", nunca upsert/update
const IDS = {
  auctionDraft: '8e9d06c4-98be-4ef2-950e-1e2a71408212',
  itemDraft: 'f80c24f0-7bf2-4795-a699-c7119d15279d',
  auctionOpen: '82b7ce0c-ddad-4397-be70-cfc1896644f6',
  itemOpen: 'b9e2a0f4-25a4-44b0-a33e-f804a9a8d0e7',
  auctionClosed: '167589c0-3f74-4ad4-abf4-163c378bba66',
  itemSold: '55d753b5-eab5-46c7-9ece-84db380d7498',
  itemUnsold: 'c35ce01f-73ba-489c-9ce3-4f78221ac8df',
  bidOpen: '1fd53fd7-66b3-4a37-bc5f-2fb0f9033407',
  bidSold: '46b4119c-ef88-444c-9e4d-bea3f2ff9f27',
};

// Endereco real (Avenida Paulista, SP), reaproveitado nos itens de exemplo
// -- o seed escreve direto no banco, sem passar pela integracao com o
// ViaCEP (que so roda quando o item e criado pela API de verdade)
const ENDERECO_EXEMPLO = {
  cep: '01310100',
  logradouro: 'Avenida Paulista',
  cidade: 'São Paulo',
  uf: 'SP',
};

async function criarUsuarios() {
  const senhaComHash = (senha: string) => bcrypt.hash(senha, CUSTO_DO_HASH);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@belleepoque.com' },
    update: {},
    create: {
      nome: 'Administradora Belle Époque',
      email: 'admin@belleepoque.com',
      senha: await senhaComHash('Admin@123!'),
      papel: 'ADMIN',
    },
  });

  const vendedor = await prisma.user.upsert({
    where: { email: 'vendedor@belleepoque.com' },
    update: {},
    create: {
      nome: 'Casa de Leilões Belle Époque',
      email: 'vendedor@belleepoque.com',
      senha: await senhaComHash('Vendedor@123!'),
      papel: 'SELLER',
    },
  });

  const comprador = await prisma.user.upsert({
    where: { email: 'comprador@belleepoque.com' },
    update: {},
    create: {
      nome: 'Comprador Exemplo',
      email: 'comprador@belleepoque.com',
      senha: await senhaComHash('Comprador@123!'),
      papel: 'BIDDER',
    },
  });

  return { admin, vendedor, comprador };
}

async function criarCategorias() {
  const nomes = [
    { nome: 'Pintura', descricao: 'Quadros e telas de todas as épocas' },
    { nome: 'Escultura', descricao: 'Esculturas em bronze, mármore e madeira' },
    { nome: 'Mobiliário Antigo', descricao: 'Móveis de época, restaurados ou originais' },
    { nome: 'Joias e Relógios', descricao: 'Joias e relógios antigos e de coleção' },
    { nome: 'Livros Raros', descricao: 'Primeiras edições e livros de colecionador' },
    { nome: 'Cultura Geek e Pop', descricao: 'Action figures, HQs, games e memorabilia de cinema, séries e animes' },
    { nome: 'Itens Colecionáveis', descricao: 'Peças de coleção raras, edições limitadas e curiosidades' },
    { nome: 'Instrumentos Musicais', descricao: 'Violinos, pianos, guitarras e instrumentos históricos' },
    { nome: 'Discos e Áudio Vintage', descricao: 'Vinis raros, toca-discos, gramofones e rádios antigos' },
    { nome: 'Cerâmica e Porcelana', descricao: 'Louças, vasos e peças de porcelana de manufaturas renomadas' },
    { nome: 'Vidros e Cristais', descricao: 'Cristais lapidados, vitrais e vidros artísticos' },
    { nome: 'Prataria e Metais', descricao: 'Talheres, bandejas, castiçais e objetos em prata e bronze' },
    { nome: 'Gravuras e Xilogravuras', descricao: 'Estampas, litografias e gravuras originais numeradas' },
    { nome: 'Arte Contemporânea', descricao: 'Obras de artistas atuais: pintura, instalação e arte urbana' },
    { nome: 'Arte Sacra', descricao: 'Imagens, oratórios e peças de devoção' },
    { nome: 'Arte Popular Brasileira', descricao: 'Cerâmica, xilogravura de cordel e artesanato tradicional' },
    { nome: 'Fotografia Antiga', descricao: 'Daguerreótipos, câmeras históricas e retratos de época' },
    { nome: 'Numismática e Filatelia', descricao: 'Moedas, cédulas raras e selos de coleção' },
    { nome: 'Mapas e Cartografia', descricao: 'Mapas antigos, cartas náuticas e globos terrestres' },
    { nome: 'Cartazes e Arte Gráfica', descricao: 'Pôsteres vintage, ilustrações e publicidade antiga' },
    { nome: 'Tapeçaria e Têxteis', descricao: 'Tapetes, tapeçarias, rendas e tecidos históricos' },
    { nome: 'Brinquedos Antigos', descricao: 'Bonecas, carrinhos de lata e brinquedos de época' },
    { nome: 'Moda e Acessórios Vintage', descricao: 'Peças de alta-costura, bolsas e chapéus de época' },
    { nome: 'Automobilia', descricao: 'Miniaturas, placas, acessórios e itens de automóveis clássicos' },
    { nome: 'Instrumentos Científicos', descricao: 'Telescópios, bússolas, astrolábios e aparelhos de laboratório' },
    { nome: 'Memorabilia Esportiva', descricao: 'Camisas, troféus e objetos ligados à história do esporte' },
  ];

  const categorias: Record<string, { id: string }> = {};
  for (const dados of nomes) {
    categorias[dados.nome] = await prisma.category.upsert({
      where: { nome: dados.nome },
      update: {},
      create: dados,
    });
  }
  return categorias;
}

// So cria a linha de historico se ela ainda nao existir (a tabela e imutavel,
// upsert/update nunca funcionaria numa segunda execucao do seed)
async function garantirHistorico(dados: {
  leilaoId: string;
  statusAnterior: AuctionStatus | null;
  statusNovo: AuctionStatus;
  alteradoPorId: string;
}) {
  const jaExiste = await prisma.auctionStatusHistory.findFirst({
    where: { leilaoId: dados.leilaoId, statusNovo: dados.statusNovo },
  });
  if (!jaExiste) {
    await prisma.auctionStatusHistory.create({ data: dados });
  }
}

// So cria o lance se ele ainda nao existir (mesma logica: tabela imutavel)
async function garantirLance(dados: {
  id: string;
  valor: number;
  lanceAnterior: number | null;
  itemId: string;
  licitanteId: string;
}) {
  const jaExiste = await prisma.bid.findUnique({ where: { id: dados.id } });
  if (!jaExiste) {
    await prisma.bid.create({ data: dados });
  }
}

// Leiloes extras para o carrossel de destaques (5 na tela + 5 para deslizar).
// Cada um tem 1 item, entao o botao "Participar" leva direto para a sala.
const DESTAQUES_EXTRAS = [
  { chave: 'aberto-1', status: AuctionStatus.OPEN, titulo: 'Leilão de Pintura Impressionista', descricao: 'Telas e estudos de paisagens do fim do século XIX', dataInicio: '2020-01-01', dataFim: '2030-02-01', item: 'Paisagem ao Nascer do Sol', categoria: 'Pintura', preco: 1200 },
  { chave: 'aberto-2', status: AuctionStatus.OPEN, titulo: 'Leilão de Retratos Clássicos', descricao: 'Retratos a óleo de coleções particulares europeias', dataInicio: '2020-01-01', dataFim: '2030-03-01', item: 'Retrato de Dama com Pérolas', categoria: 'Pintura', preco: 2500 },
  { chave: 'aberto-3', status: AuctionStatus.OPEN, titulo: 'Leilão de Gravuras Orientais', descricao: 'Xilogravuras japonesas dos períodos Edo e Meiji', dataInicio: '2020-01-01', dataFim: '2030-04-01', item: 'Xilogravura da Grande Onda', categoria: 'Pintura', preco: 900 },
  { chave: 'breve-1', status: AuctionStatus.SCHEDULED, titulo: 'Leilão de Mobiliário de Época', descricao: 'Cômodas, aparadores e poltronas restaurados', dataInicio: '2026-10-05', dataFim: '2026-10-15', item: 'Aparador Império em Mogno', categoria: 'Mobiliário Antigo', preco: 1800 },
  { chave: 'breve-2', status: AuctionStatus.SCHEDULED, titulo: 'Leilão de Relógios de Coleção', descricao: 'Relógios de bolso e de mesa dos séculos XIX e XX', dataInicio: '2026-10-20', dataFim: '2026-10-30', item: 'Relógio de Bolso em Ouro', categoria: 'Joias e Relógios', preco: 1500 },
  { chave: 'breve-3', status: AuctionStatus.SCHEDULED, titulo: 'Leilão de Livros Raros', descricao: 'Primeiras edições e manuscritos ilustrados', dataInicio: '2026-11-10', dataFim: '2026-11-20', item: 'Bíblia Ilustrada de 1750', categoria: 'Livros Raros', preco: 3000 },
  { chave: 'fechado-1', status: AuctionStatus.CLOSED, titulo: 'Leilão de Esculturas em Mármore', descricao: 'Bustos e figuras da escola neoclássica', dataInicio: '2025-05-01', dataFim: '2025-05-10', item: 'Busto Neoclássico em Mármore', categoria: 'Escultura', preco: 2200 },
  { chave: 'fechado-2', status: AuctionStatus.CLOSED, titulo: 'Leilão de Arte Barroca', descricao: 'Pinturas e talhas douradas do período barroco', dataInicio: '2025-08-01', dataFim: '2025-08-10', item: 'Painel Barroco Dourado', categoria: 'Pintura', preco: 2800 },
];

// Id fixo gerado a partir da chave (o seed continua podendo rodar varias vezes)
function idDaChave(chave: string): string {
  const h = createHash('sha1').update(`belle-epoque:${chave}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// Ficha tecnica e descricao detalhada dos itens (aplicadas por id, entao o
// seed atualiza tambem itens que ja existiam de execucoes anteriores)
interface Ficha {
  descricao: string;
  autor: string;
  periodo: string;
  tecnica: string;
  dimensoes: string;
  conservacao: string;
  procedencia: string;
}

const FICHAS: Record<string, Ficha> = {
  [IDS.itemOpen]: {
    descricao:
      'Escultura de anjo em bronze patinado, com asas abertas e expressão serena. A pátina marrom-esverdeada, formada naturalmente ao longo de mais de um século, realça os detalhes do drapeado e dos cabelos. Peça de devoção que chegou a ornar um oratório particular.',
    autor: 'Autoria desconhecida (escola europeia)',
    periodo: 'Século XIX',
    tecnica: 'Bronze fundido com pátina',
    dimensoes: '48 x 22 x 20 cm',
    conservacao: 'Muito boa, com desgaste leve na base',
    procedencia: 'Oratório de casa de fazenda no interior paulista',
  },
  [IDS.itemSold]: {
    descricao:
      'Anel de ouro 18 quilates com rubi central lapidado em cabochão, cercado por pequenas pérolas naturais. Peça típica da joalheria vitoriana, com o interior da argola gravado com marcas de contraste inglesas. Acompanha estojo original em couro.',
    autor: 'Ourives inglês não identificado',
    periodo: 'c. 1880',
    tecnica: 'Ouro 18k, rubi natural e pérolas',
    dimensoes: 'Aro 14, rubi de 6 mm',
    conservacao: 'Excelente',
    procedencia: 'Coleção particular, Londres',
  },
  [IDS.itemUnsold]: {
    descricao:
      'Colar de pérolas naturais em fio único, com fecho de ouro branco decorado. As pérolas têm brilho suave e tamanhos ligeiramente diferentes, marca das peças anteriores ao cultivo industrial.',
    autor: 'Joalheria europeia',
    periodo: 'Início do século XX',
    tecnica: 'Pérolas naturais, fecho em ouro branco',
    dimensoes: '45 cm de comprimento',
    conservacao: 'Boa, sem certificado de autenticidade',
    procedencia: 'Herança familiar',
  },
  [IDS.itemDraft]: {
    descricao:
      'Cômoda de três gavetas em madeira nobre, com frente arqueada e ferragens em bronze dourado. Restaurada com técnicas de época, mantém o verniz goma-laca original nas laterais.',
    autor: 'Marcenaria francesa',
    periodo: 'Século XVIII',
    tecnica: 'Madeira nobre e bronze dourado',
    dimensoes: '85 x 120 x 55 cm',
    conservacao: 'Restaurada',
    procedencia: 'Casa senhorial em Paris',
  },
};

// Fichas dos itens extras, pela chave usada em DESTAQUES_EXTRAS
const FICHAS_EXTRAS: Record<string, Ficha> = {
  'aberto-1': {
    descricao:
      'Paisagem de luz baixa e pinceladas soltas, em que o sol nascente tinge de laranja a névoa sobre a água. A obra carrega a pesquisa impressionista sobre o instante e a atmosfera, com pigmentos ainda vivos e craquelê fino e regular.',
    autor: 'Escola impressionista francesa',
    periodo: 'c. 1880',
    tecnica: 'Óleo sobre tela',
    dimensoes: '50 x 65 cm',
    conservacao: 'Muito boa, relaminada',
    procedencia: 'Coleção particular, Rouen',
  },
  'aberto-2': {
    descricao:
      'Retrato de dama com colar de pérolas e vestido de veludo escuro, pintado com luz lateral e fundo sóbrio. O olhar direto e a delicadeza das mãos revelam a mão de um retratista experiente.',
    autor: 'Escola holandesa',
    periodo: 'c. 1665',
    tecnica: 'Óleo sobre tela',
    dimensoes: '45 x 40 cm',
    conservacao: 'Boa, com retoques pontuais',
    procedencia: 'Coleção nobiliárquica, Haia',
  },
  'aberto-3': {
    descricao:
      'Xilogravura policromada de grande onda prestes a quebrar sobre pequenos barcos, com o monte ao fundo. Impressão de época em papel washi, com as cores azul-da-prússia bem preservadas.',
    autor: 'Escola ukiyo-e, Japão',
    periodo: 'c. 1831',
    tecnica: 'Xilogravura sobre papel washi',
    dimensoes: '25 x 38 cm',
    conservacao: 'Boa, leve desbotamento nas bordas',
    procedencia: 'Colecionador em Kyoto',
  },
  'breve-1': {
    descricao:
      'Aparador de estilo Império em mogno maciço, com tampo de mármore, colunas frontais e aplicações de bronze dourado. Peça de grande presença, própria de salas de jantar de casas nobres.',
    autor: 'Marcenaria francesa',
    periodo: 'c. 1815',
    tecnica: 'Mogno, mármore e bronze dourado',
    dimensoes: '95 x 160 x 55 cm',
    conservacao: 'Restaurado',
    procedencia: 'Solar no Rio de Janeiro',
  },
  'breve-2': {
    descricao:
      'Relógio de bolso em ouro, com caixa gravada, mostrador de esmalte branco e algarismos romanos. Movimento mecânico de corda manual, revisado e em pleno funcionamento.',
    autor: 'Manufatura suíça',
    periodo: 'c. 1900',
    tecnica: 'Ouro 18k e esmalte',
    dimensoes: '50 mm de diâmetro',
    conservacao: 'Excelente, em funcionamento',
    procedencia: 'Coleção de relojoaria, Genebra',
  },
  'breve-3': {
    descricao:
      'Bíblia ilustrada com gravuras em página inteira, encadernada em couro com ferros dourados na lombada. Contém anotações manuscritas de antigos donos nas guardas.',
    autor: 'Oficina tipográfica europeia',
    periodo: '1750',
    tecnica: 'Impressão tipográfica e gravura em cobre',
    dimensoes: '32 x 22 cm, 640 páginas',
    conservacao: 'Boa, com manchas de umidade leves',
    procedencia: 'Biblioteca conventual',
  },
  'fechado-1': {
    descricao:
      'Busto masculino em mármore branco de Carrara, de linhas neoclássicas e drapeado à antiga. Sobre base de pedra escura, pertenceu a uma biblioteca particular.',
    autor: 'Escola neoclássica italiana',
    periodo: 'Século XIX',
    tecnica: 'Mármore de Carrara',
    dimensoes: '62 x 40 x 28 cm',
    conservacao: 'Muito boa',
    procedencia: 'Palacete em Florença',
  },
  'fechado-2': {
    descricao:
      'Painel barroco em madeira entalhada e dourada a folha de ouro, com volutas e figuras angelicais. Fazia parte de um retábulo lateral de capela.',
    autor: 'Ateliê barroco luso-brasileiro',
    periodo: 'Século XVIII',
    tecnica: 'Talha em madeira com douramento',
    dimensoes: '110 x 75 cm',
    conservacao: 'Regular, douramento com perdas',
    procedencia: 'Capela particular em Minas Gerais',
  },
};

async function aplicarFichas() {
  const porId: Record<string, Ficha> = { ...FICHAS };
  for (const [chave, ficha] of Object.entries(FICHAS_EXTRAS)) {
    porId[idDaChave(`item-${chave}`)] = ficha;
  }
  for (const [id, ficha] of Object.entries(porId)) {
    await prisma.auctionItem.update({ where: { id }, data: ficha });
  }
}

// Algumas mensagens no chat dos leiloes abertos, so se o chat ainda estiver vazio
async function criarConversaExemplo(
  usuarios: { comprador: string; vendedor: string; admin: string },
) {
  const abertos = await prisma.auction.findMany({
    where: { id: { in: [IDS.auctionOpen, idDaChave('leilao-aberto-1'), idDaChave('leilao-aberto-2'), idDaChave('leilao-aberto-3')] } },
    select: { id: true },
  });
  const conversa: [keyof typeof usuarios, string][] = [
    ['vendedor', 'Boa noite a todos! A peça pode ser vista com hora marcada em São Paulo.'],
    ['comprador', 'Que obra linda! Alguém sabe se acompanha certificado?'],
    ['vendedor', 'Sim, acompanha laudo de procedência e autenticidade.'],
    ['admin', 'Lembrando: os lances são registrados e não podem ser desfeitos.'],
  ];
  for (const { id } of abertos) {
    if ((await prisma.chatMessage.count({ where: { leilaoId: id } })) > 0) continue;
    for (const [quem, texto] of conversa) {
      await prisma.chatMessage.create({ data: { leilaoId: id, autorId: usuarios[quem], texto } });
    }
  }
}

async function criarDestaquesExtras(
  vendedorId: string,
  categorias: Record<string, { id: string }>,
) {
  for (const d of DESTAQUES_EXTRAS) {
    const leilaoId = idDaChave(`leilao-${d.chave}`);
    await prisma.auction.upsert({
      where: { id: leilaoId },
      update: {},
      create: {
        id: leilaoId,
        titulo: d.titulo,
        descricao: d.descricao,
        status: d.status,
        dataInicio: new Date(`${d.dataInicio}T12:00:00.000Z`),
        dataFim: new Date(`${d.dataFim}T12:00:00.000Z`),
        vendedorId,
      },
    });

    // Historico coerente com o status atual
    const caminho = [AuctionStatus.DRAFT, AuctionStatus.SCHEDULED, AuctionStatus.OPEN, AuctionStatus.CLOSED];
    const ate = caminho.indexOf(d.status);
    for (let i = 1; i <= ate; i++) {
      await garantirHistorico({
        leilaoId,
        statusAnterior: caminho[i - 1],
        statusNovo: caminho[i],
        alteradoPorId: vendedorId,
      });
    }

    const itemId = idDaChave(`item-${d.chave}`);
    await prisma.auctionItem.upsert({
      where: { id: itemId },
      update: {},
      create: {
        id: itemId,
        titulo: d.item,
        descricao: d.descricao,
        precoInicial: d.preco,
        incrementoMinimo: 50,
        status: d.status === AuctionStatus.CLOSED ? ItemStatus.UNSOLD : ItemStatus.AVAILABLE,
        ...ENDERECO_EXEMPLO,
        leilaoId,
        categoriaId: categorias[d.categoria].id,
      },
    });
  }
}

// ---- Pessoas de exemplo (para a gestao de usuarios parecer uma plataforma em uso) ----
// Foto de perfil = um dos avatares de animais prontos (chaves de FrontEnd/src/app/core/avatares.ts)
const ANIMAIS = [
  'raposa', 'coruja', 'leao', 'gato', 'cisne', 'pavao', 'cachorro', 'panda', 'aguia', 'cavalo', 'cervo', 'sapo',
  'unicornio', 'coelho', 'urso', 'tartaruga',
];

interface Pessoa {
  nome: string;
  email: string;
  papel: 'BIDDER' | 'SELLER' | 'ADMIN';
  telefone: string;
  endereco: string;
  ativo?: boolean;
  mesesAtras: number;
}

const PESSOAS: Pessoa[] = [
  { nome: 'Carlos Eduardo Whitaker', email: 'carlos.whitaker@belleepoque.com', papel: 'ADMIN', telefone: '11987412356', endereco: 'Alameda Santos, 1.240, apto 92 - Jardim Paulista, São Paulo/SP', mesesAtras: 9 },
  { nome: 'Marcos Antônio Vilela', email: 'marcos.vilela@antiquariovilela.com.br', papel: 'SELLER', telefone: '21998745123', endereco: 'Rua do Lavradio, 88 - Centro, Rio de Janeiro/RJ', mesesAtras: 8 },
  { nome: 'Beatriz Nogueira Salles', email: 'beatriz.salles@galeriasalles.com.br', papel: 'SELLER', telefone: '31991234567', endereco: 'Rua Antônio de Albuquerque, 330 - Savassi, Belo Horizonte/MG', mesesAtras: 7 },
  { nome: 'Rodrigo Albuquerque Pinto', email: 'rodrigo.pinto@pintoleiloes.com.br', papel: 'SELLER', telefone: '41996547821', endereco: 'Rua Presidente Faria, 415 - Centro, Curitiba/PR', mesesAtras: 6 },
  { nome: 'Isadora Miranda Cavalcanti', email: 'isadora.cavalcanti@gmail.com', papel: 'SELLER', telefone: '81992036547', endereco: 'Rua da Aurora, 1.020, sala 4 - Boa Vista, Recife/PE', mesesAtras: 5 },
  { nome: 'Gabriel Monteiro Ribeiro', email: 'gabriel.ribeiro@outlook.com', papel: 'BIDDER', telefone: '11976543210', endereco: 'Rua Oscar Freire, 512, apto 31 - Pinheiros, São Paulo/SP', mesesAtras: 8 },
  { nome: 'Camila Andrade Bastos', email: 'camila.bastos@gmail.com', papel: 'BIDDER', telefone: '21987654321', endereco: 'Avenida Atlântica, 2.100, apto 802 - Copacabana, Rio de Janeiro/RJ', mesesAtras: 8 },
  { nome: 'Thiago Carvalho Lacerda', email: 'thiago.lacerda@uol.com.br', papel: 'BIDDER', telefone: '31988761234', endereco: 'Rua Sergipe, 1.055 - Funcionários, Belo Horizonte/MG', mesesAtras: 7 },
  { nome: 'Larissa Figueiredo Prado', email: 'larissa.prado@icloud.com', papel: 'BIDDER', telefone: '11965432187', endereco: 'Rua Haddock Lobo, 760, apto 141 - Cerqueira César, São Paulo/SP', mesesAtras: 7 },
  { nome: 'Eduardo Sampaio Mendonça', email: 'eduardo.mendonca@terra.com.br', papel: 'BIDDER', telefone: '51993214567', endereco: 'Rua Padre Chagas, 220, apto 502 - Moinhos de Vento, Porto Alegre/RS', mesesAtras: 6 },
  { nome: 'Fernanda Lopes Guimarães', email: 'fernanda.guimaraes@gmail.com', papel: 'BIDDER', telefone: '61991876543', endereco: 'SQS 308, Bloco C, apto 405 - Asa Sul, Brasília/DF', mesesAtras: 6 },
  { nome: 'Rafael Teixeira Coutinho', email: 'rafael.coutinho@outlook.com', papel: 'BIDDER', telefone: '71987651234', endereco: 'Avenida Sete de Setembro, 3.400, apto 61 - Barra, Salvador/BA', mesesAtras: 5 },
  { nome: 'Juliana Barreto Nascimento', email: 'juliana.nascimento@gmail.com', papel: 'BIDDER', telefone: '85992345678', endereco: 'Rua Osvaldo Cruz, 1.150, apto 1.202 - Meireles, Fortaleza/CE', mesesAtras: 5 },
  { nome: 'Leonardo Pacheco Siqueira', email: 'leonardo.siqueira@uol.com.br', papel: 'BIDDER', telefone: '19998123456', endereco: 'Rua Barão de Jaguara, 980, apto 72 - Centro, Campinas/SP', mesesAtras: 4 },
  { nome: 'Mariana Rezende Almeida', email: 'mariana.almeida@icloud.com', papel: 'BIDDER', telefone: '11954321876', endereco: 'Alameda Lorena, 1.800, apto 24 - Jardim Paulista, São Paulo/SP', mesesAtras: 4 },
  { nome: 'Felipe Moraes Cardoso', email: 'felipe.cardoso@gmail.com', papel: 'BIDDER', telefone: '48991237654', endereco: 'Rua Felipe Schmidt, 515, apto 803 - Centro, Florianópolis/SC', mesesAtras: 3 },
  { nome: 'Patrícia Vieira Toledo', email: 'patricia.toledo@terra.com.br', papel: 'BIDDER', telefone: '12997654321', endereco: 'Rua Paraibuna, 300 - Jardim Esplanada, São José dos Campos/SP', mesesAtras: 3 },
  { nome: 'Vinícius Azevedo Ramos', email: 'vinicius.ramos@outlook.com', papel: 'BIDDER', telefone: '21976541298', endereco: 'Rua Visconde de Pirajá, 414, apto 601 - Ipanema, Rio de Janeiro/RJ', mesesAtras: 2 },
  { nome: 'Aline Medeiros Freitas', email: 'aline.freitas@gmail.com', papel: 'BIDDER', telefone: '62993214578', endereco: 'Avenida T-4, 1.200, apto 1.501 - Setor Bueno, Goiânia/GO', mesesAtras: 2 },
  { nome: 'Bruno Cavalcante Dias', email: 'bruno.dias@uol.com.br', papel: 'BIDDER', telefone: '11982345671', endereco: 'Rua Augusta, 2.690, apto 53 - Cerqueira César, São Paulo/SP', mesesAtras: 2 },
  { nome: 'Renata Fontes Magalhães', email: 'renata.magalhaes@icloud.com', papel: 'BIDDER', telefone: '31997651234', endereco: 'Rua Pernambuco, 1.001, apto 302 - Funcionários, Belo Horizonte/MG', mesesAtras: 1 },
  { nome: 'Otávio Brandão Peixoto', email: 'otavio.peixoto@terra.com.br', papel: 'BIDDER', telefone: '41988765432', endereco: 'Avenida Batel, 1.500, apto 91 - Batel, Curitiba/PR', ativo: false, mesesAtras: 1 },
  { nome: 'Sofia Bernardes Queiroz', email: 'sofia.queiroz@gmail.com', papel: 'BIDDER', telefone: '11991234876', endereco: 'Rua Bela Cintra, 1.020, apto 72 - Consolação, São Paulo/SP', mesesAtras: 1 },
];

// CPF com digitos verificadores validos, gerado a partir de um numero-base
// (so para os dados de exemplo ficarem no formato certo)
function cpfDe(base: number): string {
  const d = String(100000000 + ((base * 7919) % 899999999)).slice(0, 9).split('').map(Number);
  const digito = (n: number[]) => {
    const soma = n.reduce((acc, v, i) => acc + v * (n.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  d.push(digito(d));
  d.push(digito(d));
  return d.join('');
}

async function criarPessoas() {
  const senha = await bcrypt.hash('Usuario@123!', CUSTO_DO_HASH);
  const dados = (pessoa: Pessoa, i: number) => ({
    nome: pessoa.nome,
    papel: pessoa.papel,
    ativo: pessoa.ativo ?? true,
    telefone: pessoa.telefone,
    cpf: cpfDe(i + 11),
    endereco: pessoa.endereco,
    avatarUrl: ANIMAIS[i % ANIMAIS.length],
  });
  for (const [i, pessoa] of PESSOAS.entries()) {
    const criadoEm = new Date(Date.now() - pessoa.mesesAtras * 30 * 86400000 - i * 3600000);
    await prisma.user.upsert({
      where: { email: pessoa.email },
      update: dados(pessoa, i),
      create: { email: pessoa.email, senha, criadoEm, ...dados(pessoa, i) },
    });
  }
}

// As contas de demonstracao (login do README) ganham nome de pessoa e dados completos.
// Nao mexe em quem ja personalizou o proprio perfil (so preenche o que esta vazio)
async function completarContasDemo() {
  const preencher = [
    { email: 'admin@belleepoque.com', telefone: '11999887766', cpf: cpfDe(3), endereco: 'Avenida Paulista, 1.578, conjunto 121 - Bela Vista, São Paulo/SP', avatar: 'pinguim' },
    { email: 'vendedor@belleepoque.com', telefone: '11988776655', cpf: cpfDe(5), endereco: 'Rua das Antiguidades, 120 - Vila Madalena, São Paulo/SP', avatar: 'coruja' },
    { email: 'comprador@belleepoque.com', telefone: '11977665544', cpf: cpfDe(7), endereco: 'Rua Joaquim Floriano, 466, apto 82 - Itaim Bibi, São Paulo/SP', avatar: 'raposa' },
  ];
  for (const c of preencher) {
    const { avatar, ...campos } = c;
    await prisma.user.updateMany({ where: { email: c.email, telefone: null }, data: campos });
    // Vazio (ou herdado de uma versao anterior do seed com obras de arte) -> animal
    await prisma.user.updateMany({
      where: { email: c.email, OR: [{ avatarUrl: null }, { avatarUrl: { startsWith: 'acervo/' } }] },
      data: { avatarUrl: avatar },
    });
  }
  // Nomes de demonstracao viram nomes de pessoas
  await prisma.user.updateMany({ where: { nome: 'Comprador Exemplo' }, data: { nome: 'Helena Duarte Vasconcelos' } });
  await prisma.user.updateMany({ where: { nome: 'Teste Docker' }, data: { nome: 'Henrique Lacerda Guedes' } });
  await prisma.user.updateMany({ where: { nome: 'Admin' }, data: { nome: 'Ana Luísa Bittencourt' } });
  await prisma.user.updateMany({
    where: { nome: 'Henrique Lacerda Guedes', telefone: null },
    data: {
      telefone: '16995432187',
      cpf: cpfDe(101),
      endereco: 'Rua Riachuelo, 45, apto 31 - Centro, Ribeirão Preto/SP',
      avatarUrl: 'cachorro',
    },
  });
  await prisma.user.updateMany({ where: { nome: 'Henrique Lacerda Guedes', avatarUrl: { startsWith: 'acervo/' } }, data: { avatarUrl: 'cachorro' } });
}

// ---- Vendas de exemplo: leiloes encerrados de cada vendedor, com lances e compradores ----
// Alimentam o ranking e a tela "Meus lances". Cada peca e uma REPRODUCAO de uma obra do acervo
// (o titulo da peca e o da obra), entao foto, titulo e "historia da obra" sempre combinam.
// Tudo com id fixo: o seed pode rodar varias vezes
const VENDEDORES_VENDAS = [
  {
    email: 'marcos.vilela@antiquariovilela.com.br', escala: 2.4, naoVende: 7,
    leiloes: [
      { titulo: 'Mestres Holandeses do Século de Ouro', obras: ['ronda-da-noite', 'moca-brinco-perola', 'leiteira'] },
      { titulo: 'Grandes Nomes do Renascimento Italiano', obras: ['nascimento-venus', 'ultima-ceia', 'escola-de-atenas'] },
      { titulo: 'Impressionismo Francês', obras: ['impressao-nascer-do-sol', 'almoco-remadores', 'baile-moulin'] },
      { titulo: 'Pós-impressionistas', obras: ['noite-estrelada', 'girassois', 'quarto-arles'] },
      { titulo: 'O Espírito Romântico', obras: ['viajante-nevoeiro', 'liberdade-guiando-povo', 'temerario'] },
    ],
  },
  {
    email: 'beatriz.salles@galeriasalles.com.br', escala: 2.0, naoVende: 5,
    leiloes: [
      { titulo: 'Simbolismo e Art Nouveau', obras: ['o-beijo', 'adele-bloch-bauer', 'arvore-da-vida'] },
      { titulo: 'Gravuras Japonesas', obras: ['grande-onda', 'fuji-vermelho', 'chuva-ponte-ohashi'] },
      { titulo: 'Barroco Europeu', obras: ['las-meninas', 'judite-caravaggio', 'autorretrato-rembrandt'] },
      { titulo: 'Arte Brasileira do Século XIX', obras: ['caipira-picando-fumo', 'independencia-ou-morte', 'primeira-missa'] },
    ],
  },
  {
    email: 'vendedor@belleepoque.com', escala: 1.7, naoVende: 4,
    leiloes: [
      { titulo: 'Realismo e Escola de Barbizon', obras: ['respigadoras', 'angelus', 'olimpia'] },
      { titulo: 'Academia e Retrato Inglês', obras: ['grande-odalisca', 'menino-azul', 'mae-de-whistler'] },
    ],
  },
  {
    email: 'rodrigo.pinto@pintoleiloes.com.br', escala: 1.5, naoVende: 3,
    leiloes: [
      { titulo: 'Renascimento do Norte', obras: ['torre-de-babel', 'cacadores-na-neve', 'casal-arnolfini'] },
      { titulo: 'Monet em Série', obras: ['ninfeias', 'catedral-de-rouen', 'campo-de-papoulas'] },
      { titulo: 'Angústia e Sonho', obras: ['o-grito', 'cigana-adormecida', 'jardim-das-delicias'] },
    ],
  },
  {
    email: 'isadora.cavalcanti@gmail.com', escala: 1.1, naoVende: 4,
    leiloes: [
      { titulo: 'Cézanne e a Modernidade', obras: ['jogadores-de-cartas', 'montanha-sainte-victoire', 'domingo-grande-jatte'] },
      { titulo: 'Grandes Retratos', obras: ['madame-x', 'embaixadores', 'dr-gachet'] },
      { titulo: 'Mestres do Detalhe', obras: ['vista-de-delft', 'arte-da-pintura', 'licao-de-anatomia'] },
    ],
  },
];

async function criarVendasDeExemplo(categorias: Record<string, { id: string }>) {
  const compradores = await prisma.user.findMany({
    where: { papel: 'BIDDER', ativo: true },
    orderBy: { email: 'asc' },
    select: { id: true },
  });

  for (const [v, spec] of VENDEDORES_VENDAS.entries()) {
    const vendedor = await prisma.user.findUnique({ where: { email: spec.email }, select: { id: true } });
    if (!vendedor) continue;

    for (const [a, leilaoSpec] of spec.leiloes.entries()) {
      const leilaoId = idDaChave(`venda-${v}-${a}`);
      const fim = new Date(Date.UTC(2026, 1 + ((v + a * 2) % 7), 8 + a, 15));
      const inicio = new Date(fim.getTime() - 9 * 86400000);
      const dadosLeilao = {
        titulo: leilaoSpec.titulo,
        descricao: `Reproduções de obras de domínio público selecionadas pela casa: ${leilaoSpec.titulo.toLowerCase()}.`,
      };

      await prisma.auction.upsert({
        where: { id: leilaoId },
        update: dadosLeilao,
        create: {
          id: leilaoId,
          ...dadosLeilao,
          status: AuctionStatus.CLOSED,
          dataInicio: inicio,
          dataFim: fim,
          vendedorId: vendedor.id,
        },
      });
      const caminho = [AuctionStatus.DRAFT, AuctionStatus.SCHEDULED, AuctionStatus.OPEN, AuctionStatus.CLOSED];
      for (let i = 1; i < caminho.length; i++) {
        await garantirHistorico({ leilaoId, statusAnterior: caminho[i - 1], statusNovo: caminho[i], alteradoPorId: vendedor.id });
      }

      for (const [k, chaveObra] of leilaoSpec.obras.entries()) {
        const obra = CATALOGO_OBRAS[chaveObra];
        const n = v * 100 + a * 10 + k; // numero unico da peca: base dos valores "aleatorios"
        const preco = Math.round((350 + ((n * 373) % 1600)) * spec.escala / 10) * 10;
        const vendida = (n + 1) % spec.naoVende !== 0;
        const valorFinal = Math.round((preco * (1.2 + (n % 5) * 0.24)) / 10) * 10;
        const vencedor = compradores[(n * 3 + v) % compradores.length];
        const outro = compradores[(n * 3 + v + 1) % compradores.length];
        const itemId = idDaChave(`venda-item-${v}-${a}-${k}`);
        const categoria = chaveObra.match(/grande-onda|fuji|ohashi/) ? 'Gravuras e Xilogravuras' : 'Pintura';
        const dadosItem = {
          titulo: obra.titulo,
          descricao: `Reprodução de "${obra.titulo}", de ${obra.artista} (${obra.ano}), obra do movimento ${obra.movimento}. Acompanha certificado de reprodução.`,
          autor: obra.artista,
          periodo: obra.ano,
          conservacao: 'Excelente',
          procedencia: `Reprodução de obra de domínio público. Original: ${obra.localAtual}`,
          categoriaId: categorias[categoria].id,
        };

        await prisma.auctionItem.upsert({
          where: { id: itemId },
          update: {
            ...dadosItem,
            ...(vendida
              ? { status: ItemStatus.SOLD, lanceAtual: valorFinal, vencedorId: vencedor.id }
              : { status: ItemStatus.UNSOLD, lanceAtual: null, vencedorId: null }),
          },
          create: {
            id: itemId,
            ...dadosItem,
            precoInicial: preco,
            incrementoMinimo: Math.max(10, Math.round(preco / 20 / 10) * 10),
            lanceAtual: vendida ? valorFinal : null,
            status: vendida ? ItemStatus.SOLD : ItemStatus.UNSOLD,
            vencedorId: vendida ? vencedor.id : null,
            ...ENDERECO_EXEMPLO,
            leilaoId,
          },
        });

        if (vendida) {
          // Dois lances: o de abertura (outro comprador) e o vencedor
          const abertura = preco;
          await garantirLance({ id: idDaChave(`venda-lance-a-${v}-${a}-${k}`), valor: abertura, lanceAnterior: null, itemId, licitanteId: outro.id });
          await garantirLance({ id: idDaChave(`venda-lance-b-${v}-${a}-${k}`), valor: valorFinal, lanceAnterior: abertura, itemId, licitanteId: vencedor.id });
        }
      }
    }
  }
}

async function main() {
  console.log('Seed: criando usuarios...');
  const { admin, vendedor, comprador } = await criarUsuarios();

  console.log('Seed: criando categorias...');
  const categorias = await criarCategorias();

  console.log('Seed: leilao em rascunho (DRAFT)...');
  await prisma.auction.upsert({
    where: { id: IDS.auctionDraft },
    update: {},
    create: {
      id: IDS.auctionDraft,
      titulo: 'Leilão de Inverno 2027',
      descricao: 'Peças selecionadas para a temporada de inverno (ainda em preparação)',
      status: AuctionStatus.DRAFT,
      dataInicio: new Date('2027-06-01T00:00:00.000Z'),
      dataFim: new Date('2027-06-10T00:00:00.000Z'),
      vendedorId: vendedor.id,
    },
  });
  await prisma.auctionItem.upsert({
    where: { id: IDS.itemDraft },
    update: {},
    create: {
      id: IDS.itemDraft,
      titulo: 'Cômoda Luís XV',
      descricao: 'Cômoda em madeira nobre, restaurada, século XVIII',
      precoInicial: 800,
      incrementoMinimo: 50,
      ...ENDERECO_EXEMPLO,
      leilaoId: IDS.auctionDraft,
      categoriaId: categorias['Mobiliário Antigo'].id,
    },
  });

  console.log('Seed: leilao aberto (OPEN), com um lance...');
  await prisma.auction.upsert({
    where: { id: IDS.auctionOpen },
    update: { status: AuctionStatus.OPEN },
    create: {
      id: IDS.auctionOpen,
      titulo: 'Leilão de Arte Sacra',
      descricao: 'Esculturas e imagens de devoção dos séculos XVIII e XIX',
      status: AuctionStatus.OPEN,
      dataInicio: new Date('2020-01-01T00:00:00.000Z'),
      dataFim: new Date('2030-01-01T00:00:00.000Z'),
      vendedorId: vendedor.id,
    },
  });
  await garantirHistorico({
    leilaoId: IDS.auctionOpen,
    statusAnterior: AuctionStatus.DRAFT,
    statusNovo: AuctionStatus.SCHEDULED,
    alteradoPorId: vendedor.id,
  });
  await garantirHistorico({
    leilaoId: IDS.auctionOpen,
    statusAnterior: AuctionStatus.SCHEDULED,
    statusNovo: AuctionStatus.OPEN,
    alteradoPorId: vendedor.id,
  });
  await prisma.auctionItem.upsert({
    where: { id: IDS.itemOpen },
    update: { lanceAtual: 500 },
    create: {
      id: IDS.itemOpen,
      titulo: 'Escultura de Anjo em Bronze',
      descricao: 'Escultura em bronze patinado, autoria desconhecida',
      precoInicial: 500,
      incrementoMinimo: 25,
      lanceAtual: 500,
      ...ENDERECO_EXEMPLO,
      leilaoId: IDS.auctionOpen,
      categoriaId: categorias['Escultura'].id,
    },
  });
  await garantirLance({
    id: IDS.bidOpen,
    valor: 500,
    lanceAnterior: null,
    itemId: IDS.itemOpen,
    licitanteId: comprador.id,
  });

  console.log('Seed: leilao encerrado (CLOSED), com um item vendido e um sem lance...');
  await prisma.auction.upsert({
    where: { id: IDS.auctionClosed },
    update: { status: AuctionStatus.CLOSED },
    create: {
      id: IDS.auctionClosed,
      titulo: 'Leilão de Joias Vitorianas',
      descricao: 'Peças de joalheria do período vitoriano',
      status: AuctionStatus.CLOSED,
      dataInicio: new Date('2025-01-01T00:00:00.000Z'),
      dataFim: new Date('2025-01-10T00:00:00.000Z'),
      vendedorId: vendedor.id,
    },
  });
  await garantirHistorico({
    leilaoId: IDS.auctionClosed,
    statusAnterior: AuctionStatus.DRAFT,
    statusNovo: AuctionStatus.SCHEDULED,
    alteradoPorId: vendedor.id,
  });
  await garantirHistorico({
    leilaoId: IDS.auctionClosed,
    statusAnterior: AuctionStatus.SCHEDULED,
    statusNovo: AuctionStatus.OPEN,
    alteradoPorId: vendedor.id,
  });
  await garantirHistorico({
    leilaoId: IDS.auctionClosed,
    statusAnterior: AuctionStatus.OPEN,
    statusNovo: AuctionStatus.CLOSED,
    alteradoPorId: vendedor.id,
  });
  await prisma.auctionItem.upsert({
    where: { id: IDS.itemSold },
    update: { status: ItemStatus.SOLD, lanceAtual: 340, vencedorId: comprador.id },
    create: {
      id: IDS.itemSold,
      titulo: 'Anel de Rubi Vitoriano',
      descricao: 'Anel em ouro com rubi central, Inglaterra, c. 1880',
      precoInicial: 300,
      incrementoMinimo: 20,
      lanceAtual: 340,
      status: ItemStatus.SOLD,
      vencedorId: comprador.id,
      ...ENDERECO_EXEMPLO,
      leilaoId: IDS.auctionClosed,
      categoriaId: categorias['Joias e Relógios'].id,
    },
  });
  await garantirLance({
    id: IDS.bidSold,
    valor: 340,
    lanceAnterior: null,
    itemId: IDS.itemSold,
    licitanteId: comprador.id,
  });
  await prisma.auctionItem.upsert({
    where: { id: IDS.itemUnsold },
    update: { status: ItemStatus.UNSOLD },
    create: {
      id: IDS.itemUnsold,
      titulo: 'Colar de Pérolas Antigo',
      descricao: 'Colar de pérolas naturais, sem certificado de autenticidade',
      precoInicial: 250,
      incrementoMinimo: 15,
      status: ItemStatus.UNSOLD,
      ...ENDERECO_EXEMPLO,
      leilaoId: IDS.auctionClosed,
      categoriaId: categorias['Joias e Relógios'].id,
    },
  });

  console.log('Seed: leiloes extras para o carrossel de destaques...');
  await criarDestaquesExtras(vendedor.id, categorias);

  console.log('Seed: fichas tecnicas dos itens e conversa de exemplo no chat...');
  await aplicarFichas();
  await criarConversaExemplo({ comprador: comprador.id, vendedor: vendedor.id, admin: admin.id });

  console.log('Seed: pessoas de exemplo (usuarios)...');
  await criarPessoas();
  await completarContasDemo();

  console.log('Seed: vendas de exemplo (ranking de vendedores)...');
  await criarVendasDeExemplo(categorias);

  console.log('\nSeed concluído. Contas de exemplo (mesma senha nunca é exibida novamente):');
  console.log(`  ADMIN:     ${admin.email} / Admin@123!`);
  console.log(`  SELLER:    ${vendedor.email} / Vendedor@123!`);
  console.log(`  BIDDER:    ${comprador.email} / Comprador@123!`);
}

main()
  .catch((erro) => {
    console.error('Falha ao executar o seed:', erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
