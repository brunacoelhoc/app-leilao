import 'dotenv/config';
import { createHash, randomUUID } from 'crypto';
import { copyFile, mkdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { PrismaPg } from '@prisma/adapter-pg';
import { DocumentType, PrismaClient } from '../src/generated/prisma/client';

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
    where: { documentos: { none: { tipo: DocumentType.PHOTO } } },
    orderBy: { criadoEm: 'asc' },
    include: { leilao: { select: { vendedorId: true } } },
  });

  let anexadas = 0;
  for (const [i, item] of itens.entries()) {
    const obra = obras[i % obras.length];
    const origem = join(PASTA_ACERVO, obra.arquivo);
    const conteudo = await readFile(origem);
    const nomeArquivo = `${randomUUID()}.jpg`;
    await copyFile(origem, join(PASTA_UPLOADS, nomeArquivo));

    await prisma.document.create({
      data: {
        tipo: DocumentType.PHOTO,
        nomeOriginal: obra.arquivo,
        nomeArquivo,
        mimeType: 'image/jpeg',
        tamanho: (await stat(origem)).size,
        hash: createHash('sha256').update(conteudo).digest('hex'),
        itemId: item.id,
        enviadoPorId: item.leilao.vendedorId,
      },
    });
    anexadas++;
  }
  console.log(`Fotos anexadas: ${anexadas} (itens que ja tinham foto foram ignorados)`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
