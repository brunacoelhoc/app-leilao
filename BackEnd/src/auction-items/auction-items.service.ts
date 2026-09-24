import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogService } from '../audit/audit-log.service';
import { CepService } from '../cep/cep.service';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import { decimalParaString } from '../common/utils/decimal.util';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import {
  calcularPaginacao,
  paginar,
  type ParametrosPaginacao,
  type RespostaPaginada,
} from '../common/utils/paginacao.util';
import {
  AuctionStatus,
  AuditResult,
  DocumentType,
  Prisma,
  type AuctionItem,
  type Role,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AtualizarAuctionItemDto } from './dto/atualizar-auction-item.dto';
import type { AuctionItemResposta } from './dto/auction-item-resposta.dto';
import type { CriarAuctionItemDto } from './dto/criar-auction-item.dto';
import { capaPadrao } from '../common/utils/capa-padrao.util';
import { calcularLanceMinimo, calcularSituacao, lancesSugeridosDe } from './situacao-item';

interface FiltrosListagem extends ParametrosPaginacao {
  leilaoId?: string;
  categoriaId?: string;
  busca?: string;
}

// _count vem do Prisma quando a query pede "include: { _count: { select: { lances: true } } }"
type ItemComContagem = AuctionItem & {
  _count?: { lances: number };
  vencedor?: { nome: string } | null;
  leilao?: { status: AuctionStatus; dataInicio: Date; dataFim: Date; prorrogacoes: number };
  documentos?: { id: string }[]; // so na listagem: a primeira foto vira a capa
};

function paraResposta(itemComRelacoes: ItemComContagem): AuctionItemResposta {
  // "vencedor" e "leilao" (objetos) nao saem na resposta: so o nome do
  // vencedor e os valores calculados (situacao, lanceMinimo...)
  const { vencedor, leilao, documentos, ...item } = itemComRelacoes;
  const { situacao, segundosParaMudanca } = calcularSituacao(
    item.status,
    leilao,
    new Date(),
  );
  const lanceMinimo = calcularLanceMinimo(item);
  const abertoParaLance = situacao === 'ABERTO';
  return {
    ...item,
    // 🔎 Atalhos de lance: o servidor calcula (minimo e mais 1, 2 e 5 incrementos).
    // So existem enquanto o lote recebe lances; a tela apenas exibe
    lancesSugeridos: abertoParaLance ? lancesSugeridosDe(lanceMinimo, item.incrementoMinimo) : [],
    // Texto do botao do card, decidido aqui (a tela nao interpreta situacao)
    rotuloAcao:
      abertoParaLance || situacao === 'ENCERRANDO'
        ? 'Participar'
        : item.status === 'AVAILABLE'
          ? 'Ver peça'
          : 'Ver resultado',
    capaPadrao: capaPadrao(item.id),
    situacao,
    segundosParaMudanca,
    prorrogacoes: leilao?.prorrogacoes ?? 0,
    lanceMinimo: lanceMinimo.toString(),
    vencedorNome: vencedor?.nome ?? null,
    capaDocumentoId: documentos?.[0]?.id ?? null,
    precoInicial: decimalParaString(item.precoInicial)!,
    incrementoMinimo: decimalParaString(item.incrementoMinimo)!,
    lanceAtual: decimalParaString(item.lanceAtual),
    // Indicador do dominio: total de lances recebidos por este item. Um item
    // recem criado/atualizado nunca tem lance (leilao ainda em DRAFT), por
    // isso o "?? 0" cobre os casos em que a query nao pediu o _count
    totalLances: item._count?.lances ?? 0,
  };
}

@Injectable()
export class AuctionItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cepService: CepService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async criar(
    dto: CriarAuctionItemDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<AuctionItemResposta> {
    try {
      const leilao = await this.prisma.auction.findUnique({
        where: { id: dto.leilaoId },
      });
      if (!leilao) {
        throw new NotFoundException('Leilao nao encontrado');
      }

      if (usuario.papel !== 'ADMIN' && leilao.vendedorId !== usuario.id) {
        throw new ForbiddenException(
          'Voce so pode adicionar itens aos seus proprios leiloes',
        );
      }

      if (leilao.status !== AuctionStatus.DRAFT) {
        throw new ConflictException(
          'So e possivel adicionar itens a um leilao que ainda esta em rascunho (DRAFT)',
        );
      }

      const categoria = await this.prisma.category.findUnique({
        where: { id: dto.categoriaId },
      });
      if (!categoria) {
        throw new NotFoundException('Categoria nao encontrada');
      }

      // Integracao externa (HttpService/ViaCEP): busca o endereco a partir do
      // CEP informado. Se o CEP nao existir ou o servico falhar, o item nao e
      // criado (o proprio service ja lanca 400/503 tratados)
      const endereco = await this.cepService.buscar(dto.cep);

      const item = await this.prisma.auctionItem.create({
        data: {
          titulo: dto.titulo,
          descricao: dto.descricao,
          precoInicial: dto.precoInicial,
          incrementoMinimo: dto.incrementoMinimo,
          autor: dto.autor,
          periodo: dto.periodo,
          tecnica: dto.tecnica,
          dimensoes: dto.dimensoes,
          conservacao: dto.conservacao,
          procedencia: dto.procedencia,
          cep: dto.cep,
          logradouro: endereco.logradouro,
          cidade: endereco.cidade,
          uf: endereco.uf,
          leilaoId: dto.leilaoId,
          categoriaId: dto.categoriaId,
        },
      });
      await this.registrarAuditoria(
        'ITEM_CRIADO',
        item.id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        201,
      );
      return paraResposta(item);
    } catch (erro) {
      await this.registrarAuditoria(
        'ITEM_CRIADO',
        undefined,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  // Consultas por relacionamento: itens de um leilao e/ou itens de uma categoria
  async listarTodos(
    filtros: FiltrosListagem,
  ): Promise<RespostaPaginada<AuctionItemResposta>> {
    const paginacao = calcularPaginacao(filtros);
    const where: Prisma.AuctionItemWhereInput = {
      leilaoId: filtros.leilaoId,
      categoriaId: filtros.categoriaId,
      ...(filtros.busca
        ? {
            OR: [
              { titulo: { contains: filtros.busca, mode: 'insensitive' } },
              { descricao: { contains: filtros.busca, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [itens, total] = await Promise.all([
      this.prisma.auctionItem.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
        include: {
          _count: { select: { lances: true } },
          vencedor: { select: { nome: true } },
          leilao: {
            select: { status: true, dataInicio: true, dataFim: true, prorrogacoes: true },
          },
          documentos: {
            where: { tipo: DocumentType.PHOTO },
            orderBy: { criadoEm: 'asc' },
            take: 1,
            select: { id: true },
          },
        },
      }),
      this.prisma.auctionItem.count({ where }),
    ]);
    return paginar(itens.map((item) => paraResposta(item)), total, paginacao);
  }

  async buscarPorId(id: string): Promise<AuctionItemResposta> {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id },
      include: {
          _count: { select: { lances: true } },
          vencedor: { select: { nome: true } },
          leilao: {
            select: { status: true, dataInicio: true, dataFim: true, prorrogacoes: true },
          },
        },
    });
    if (!item) {
      throw new NotFoundException('Item nao encontrado');
    }
    return paraResposta(item);
  }

  // Busca o item JUNTO com o leilao, para conferir o dono e o status do leilao
  private async buscarComLeilao(id: string) {
    const item = await this.prisma.auctionItem.findUnique({
      where: { id },
      include: { leilao: true },
    });
    if (!item) {
      throw new NotFoundException('Item nao encontrado');
    }
    return item;
  }

  private garantirDono(
    vendedorIdDoLeilao: string,
    usuario: UsuarioAutenticado,
  ): void {
    if (usuario.papel === 'ADMIN') return;
    if (vendedorIdDoLeilao !== usuario.id) {
      throw new ForbiddenException(
        'Voce so pode gerenciar itens dos seus proprios leiloes',
      );
    }
  }

  async atualizar(
    id: string,
    dto: AtualizarAuctionItemDto,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<AuctionItemResposta> {
    try {
      const item = await this.buscarComLeilao(id);
      this.garantirDono(item.leilao.vendedorId, usuario);

      if (item.leilao.status !== AuctionStatus.DRAFT) {
        throw new ConflictException(
          'So e possivel editar itens de um leilao que ainda esta em rascunho (DRAFT)',
        );
      }

      if (dto.categoriaId) {
        const categoria = await this.prisma.category.findUnique({
          where: { id: dto.categoriaId },
        });
        if (!categoria) {
          throw new NotFoundException('Categoria nao encontrada');
        }
      }

      // So consulta o ViaCEP de novo se o CEP realmente mudou (evita uma
      // chamada externa desnecessaria quando so o titulo/preco sao editados)
      const endereco =
        dto.cep && dto.cep !== item.cep
          ? await this.cepService.buscar(dto.cep)
          : undefined;

      const atualizado = await this.prisma.auctionItem.update({
        where: { id },
        data: {
          titulo: dto.titulo,
          descricao: dto.descricao,
          precoInicial: dto.precoInicial,
          incrementoMinimo: dto.incrementoMinimo,
          autor: dto.autor,
          periodo: dto.periodo,
          tecnica: dto.tecnica,
          dimensoes: dto.dimensoes,
          conservacao: dto.conservacao,
          procedencia: dto.procedencia,
          cep: dto.cep,
          logradouro: endereco?.logradouro,
          cidade: endereco?.cidade,
          uf: endereco?.uf,
          categoriaId: dto.categoriaId,
        },
      });
      await this.registrarAuditoria(
        'ITEM_ATUALIZADO',
        id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        200,
      );
      return paraResposta(atualizado);
    } catch (erro) {
      await this.registrarAuditoria(
        'ITEM_ATUALIZADO',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  async remover(
    id: string,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
  ): Promise<void> {
    try {
      const item = await this.buscarComLeilao(id);
      this.garantirDono(item.leilao.vendedorId, usuario);

      if (item.leilao.status !== AuctionStatus.DRAFT) {
        throw new ConflictException(
          'So e possivel remover itens de um leilao que ainda esta em rascunho (DRAFT)',
        );
      }

      await this.prisma.auctionItem.delete({ where: { id } });
      await this.registrarAuditoria(
        'ITEM_REMOVIDO',
        id,
        usuario,
        contexto,
        AuditResult.SUCCESS,
        204,
      );
    } catch (erro) {
      await this.registrarAuditoria(
        'ITEM_REMOVIDO',
        id,
        usuario,
        contexto,
        AuditResult.REJECTED,
        this.statusDoErro(erro),
        this.motivoDoErro(erro),
      );
      throw erro;
    }
  }

  private statusDoErro(erro: unknown): number {
    return erro instanceof HttpException ? erro.getStatus() : 500;
  }

  private motivoDoErro(erro: unknown): string {
    return erro instanceof HttpException
      ? erro.message
      : 'Erro interno ao processar o item';
  }

  private registrarAuditoria(
    acao: string,
    itemId: string | undefined,
    usuario: UsuarioAutenticado,
    contexto: ContextoRequisicao,
    resultado: AuditResult,
    statusHttp: number,
    motivo?: string,
  ): Promise<void> {
    return this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel as Role,
      acao,
      entidade: 'AuctionItem',
      entidadeId: itemId,
      resultado,
      motivo,
      statusHttp,
      ...contexto,
    });
  }
}
