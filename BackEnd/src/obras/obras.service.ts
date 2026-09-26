import { Injectable, NotFoundException } from '@nestjs/common';
import { DocumentType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CATALOGO_OBRAS } from './catalogo-obras';
import type { HistoriaPecaResposta } from './dto/historia-resposta.dto';
import type { ObraAcervoResposta } from './dto/obra-acervo-resposta.dto';

@Injectable()
export class ObrasService {
  constructor(private readonly prisma: PrismaService) {}

  // Catalogo do acervo (fonte unica, no servidor): a tela so exibe a lista
  acervo(): ObraAcervoResposta[] {
    return Object.entries(CATALOGO_OBRAS).map(([chave, o]) => ({
      arquivo: `${chave}.jpg`,
      titulo: o.titulo,
      autor: o.artista,
      ano: o.ano,
      fonte: o.fonte,
    }));
  }

  // 🔎 "Sobre a obra": se a foto principal da peca e uma obra do acervo, devolve a historia
  // e o contexto da epoca (conteudo do catalogo, escrito no servidor). Se nao for, devolve
  // so a ficha que o vendedor preencheu
  async historiaDaPeca(itemId: string): Promise<HistoriaPecaResposta> {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id: itemId },
      include: {
        documentos: { where: { tipo: DocumentType.PHOTO }, orderBy: { criadoEm: 'asc' }, take: 1, select: { nomeOriginal: true } },
      },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    const chave = item.documentos[0]?.nomeOriginal.replace(/\.jpe?g$/i, '') ?? '';
    const candidata = CATALOGO_OBRAS[chave];
    // So conta a historia da obra quando ela tem a ver com a peca: o titulo da peca e o da obra,
    // ou o vendedor nao preencheu uma ficha propria (peca so com a foto do acervo). Uma peca com
    // ficha propria e outro nome mostra a propria ficha, nunca a historia de uma obra alheia
    const mesmoTitulo = candidata?.titulo.toLowerCase() === item.titulo.trim().toLowerCase();
    const catalogo = candidata && (mesmoTitulo || !item.autor) ? candidata : undefined;

    return {
      origem: catalogo ? 'OBRA_DO_ACERVO' : 'FICHA_DA_PECA',
      obra: catalogo
        ? {
            ...catalogo,
            autenticidade: 'REPRODUCAO',
            autenticidadeTexto: `Esta peça e uma reprodução de demonstração. O original e uma obra de domínio público, conservada em ${catalogo.localAtual}.`,
          }
        : null,
      itemId: item.id,
      titulo: item.titulo,
      descricao: item.descricao,
      autor: item.autor,
      periodo: item.periodo,
      tecnica: item.tecnica,
      dimensoes: item.dimensoes,
      conservacao: item.conservacao,
      procedencia: item.procedencia,
    };
  }
}
