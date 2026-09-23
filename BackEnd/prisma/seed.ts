import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
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
