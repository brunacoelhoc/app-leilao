import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { copyFile, mkdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { DocumentType, PrismaClient } from '../src/generated/prisma/client';
import { CATALOGO_OBRAS } from '../src/obras/catalogo-obras';

// Foto que combina com cada peca de exemplo (pelo titulo). As demais recebem
// uma obra qualquer do acervo. Se a peca ja tinha outra foto, ela e trocada
const OBRA_POR_TITULO: Record<string, string> = {
  'Escultura de Anjo em Bronze': 'venus-de-milo.jpg',
  'Busto Neoclássico em Mármore': 'venus-de-milo.jpg',
  'Anel de Rubi Vitoriano': 'o-beijo.jpg',
  'Colar de Pérolas Antigo': 'moca-brinco-perola.jpg',
  'Cômoda Luís XV': 'leiteira.jpg',
  'Aparador Império em Mogno': 'leiteira.jpg',
  'Relógio de Bolso em Ouro': 'girassois.jpg',
  'Bíblia Ilustrada de 1750': 'autorretrato-rembrandt.jpg',
  'Painel Barroco Dourado': 'nascimento-venus.jpg',
  'Paisagem ao Nascer do Sol': 'impressao-nascer-do-sol.jpg',
  'Retrato de Dama com Pérolas': 'moca-brinco-perola.jpg',
  'Xilogravura da Grande Onda': 'grande-onda.jpg',
};

// Anexa uma foto do acervo (obras de dominio publico, em
// FrontEnd/public/acervo) a cada item que ainda NAO tem foto. Serve para a
// demonstracao: os cards do carrossel, a pagina do item e o quadro 3D passam a
// mostrar imagens de verdade. Rodar: npm run fotos:demo
// E idempotente: itens que ja tem foto sao ignorados.
const adapter = new PrismaPg(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });

const PASTA_ACERVO = resolve(__dirname, '../../FrontEnd/public/acervo');
const PASTA_UPLOADS = join(process.cwd(), 'uploads'); // mesma pasta do DocumentsService

interface Obra {
  arquivo: string;
  titulo: string;
}

async function main(): Promise<void> {
  const obras = JSON.parse(
    await readFile(join(PASTA_ACERVO, 'acervo.json'), 'utf8'),
  ) as Obra[];
  if (obras.length === 0) throw new Error('Acervo vazio');

  await mkdir(PASTA_UPLOADS, { recursive: true });

  const itens = await prisma.auctionItem.findMany({
    orderBy: { criadoEm: 'asc' },
    include: {
      leilao: { select: { vendedorId: true } },
      documentos: { where: { tipo: DocumentType.PHOTO }, orderBy: { criadoEm: 'asc' }, take: 1 },
    },
  });

  // 🔎 Uma obra DIFERENTE para cada item (so repete quando acabam as obras do acervo), em 3 passadas:
  // 1) o titulo do item e o titulo de uma obra do acervo -> ela e a foto do item;
  // 2) titulos "sugeridos" (OBRA_POR_TITULO), se a obra ainda estiver livre;
  // 3) os demais recebem as obras que sobraram, na ordem do acervo
  const usadas = new Set<string>();
  const escolha = new Map<string, Obra>();
  for (const item of itens) {
    const igual = obras.find((o) => CATALOGO_OBRAS[o.arquivo.replace(/\.jpe?g$/i, '')]?.titulo === item.titulo && !usadas.has(o.arquivo));
    if (igual) {
      escolha.set(item.id, igual);
      usadas.add(igual.arquivo);
    }
  }
  for (const item of itens) {
    if (escolha.has(item.id)) continue;
    const sugerida = obras.find((o) => o.arquivo === OBRA_POR_TITULO[item.titulo]);
    if (sugerida && !usadas.has(sugerida.arquivo)) {
      escolha.set(item.id, sugerida);
      usadas.add(sugerida.arquivo);
    }
  }
  const livres = obras.filter((o) => !usadas.has(o.arquivo));
  let proxima = 0;
  for (const [i, item] of itens.entries()) {
    if (escolha.has(item.id)) continue;
    escolha.set(item.id, livres.length > 0 ? livres[proxima++ % livres.length] : obras[i % obras.length]);
  }

  let anexadas = 0;
  let trocadas = 0;
  for (const item of itens) {
    const atual = item.documentos[0];
    const obra = escolha.get(item.id)!;
    if (atual && atual.nomeOriginal === obra.arquivo) continue; // ja esta certo

    const origem = join(PASTA_ACERVO, obra.arquivo);
    const conteudo = await readFile(origem);
    const nomeArquivo = `${randomUUID()}.jpg`;
    await copyFile(origem, join(PASTA_UPLOADS, nomeArquivo));
    const dados = {
      nomeOriginal: obra.arquivo,
      nomeArquivo,
      mimeType: 'image/jpeg',
      tamanho: (await stat(origem)).size,
      hash: createHash('sha256').update(conteudo).digest('hex'),
    };

    if (atual) {
      await prisma.document.update({ where: { id: atual.id }, data: dados });
      trocadas++;
    } else {
      await prisma.document.create({
        data: { ...dados, tipo: DocumentType.PHOTO, itemId: item.id, enviadoPorId: item.leilao.vendedorId },
      });
      anexadas++;
    }
  }
  console.log(`Itens: ${itens.length} | obras no acervo: ${obras.length} | distintas usadas: ${new Set([...escolha.values()].map((o) => o.arquivo)).size}`);
  console.log(`Fotos anexadas: ${anexadas}, trocadas: ${trocadas}`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
