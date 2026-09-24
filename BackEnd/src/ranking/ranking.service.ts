import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RankingVendedorResposta } from './ranking-vendedor-resposta.dto';

interface LinhaRanking {
  id: string;
  nome: string;
  avatarUrl: string | null;
  criadoEm: Date;
  arrecadado: string;
  vendidas: number;
  finalizadas: number;
  maiorVenda: string;
  leiloesEncerrados: number;
}

// So entra no ranking quem tem pelo menos uma venda (evita "100% de 1 leilao" no topo sem venda)
const MINIMO_DE_VENDAS = 1;

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  // 🔎 Ranking calculado na hora a partir dos itens vendidos: ordena pelo total
  // arrecadado e desempata pelo numero de vendas. Dinheiro sai como texto (::text)
  async vendedores(limite: number): Promise<RankingVendedorResposta[]> {
    const linhas = await this.prisma.$queryRaw<LinhaRanking[]>`
      SELECT u.id,
             u.nome,
             u."avatarUrl",
             u."criadoEm",
             COALESCE(SUM(i."lanceAtual") FILTER (WHERE i.status = 'SOLD'), 0)::text  AS "arrecadado",
             (COUNT(*) FILTER (WHERE i.status = 'SOLD'))::int                          AS "vendidas",
             (COUNT(*) FILTER (WHERE i.status IN ('SOLD', 'UNSOLD')))::int             AS "finalizadas",
             COALESCE(MAX(i."lanceAtual") FILTER (WHERE i.status = 'SOLD'), 0)::text   AS "maiorVenda",
             (COUNT(DISTINCT a.id) FILTER (WHERE a.status = 'CLOSED'))::int            AS "leiloesEncerrados"
        FROM "User" u
        JOIN "Auction" a     ON a."vendedorId" = u.id
        JOIN "AuctionItem" i ON i."leilaoId" = a.id
       WHERE u.papel = 'SELLER' AND u.ativo = true
       GROUP BY u.id
      HAVING COUNT(*) FILTER (WHERE i.status = 'SOLD') >= ${MINIMO_DE_VENDAS}
       ORDER BY SUM(i."lanceAtual") FILTER (WHERE i.status = 'SOLD') DESC NULLS LAST,
                COUNT(*) FILTER (WHERE i.status = 'SOLD') DESC
       LIMIT ${limite}
    `;

    const maior = Number(linhas[0]?.arrecadado ?? 0);
    return linhas.map((l, indice) => ({
      posicao: indice + 1,
      vendedorId: l.id,
      nome: l.nome,
      // So avatares prontos (nomes curtos): imagem em base64 deixaria a resposta pesada
      avatarUrl: l.avatarUrl && l.avatarUrl.length <= 40 ? l.avatarUrl : null,
      arrecadado: Number(l.arrecadado).toFixed(2),
      vendidas: l.vendidas,
      finalizadas: l.finalizadas,
      taxaVenda: l.finalizadas === 0 ? 0 : Math.round((l.vendidas / l.finalizadas) * 100),
      maiorVenda: Number(l.maiorVenda).toFixed(2),
      leiloesEncerrados: l.leiloesEncerrados,
      participacao: maior > 0 ? Math.round((Number(l.arrecadado) / maior) * 1000) / 10 : 0,
      membroDesde: l.criadoEm,
    }));
  }
}
