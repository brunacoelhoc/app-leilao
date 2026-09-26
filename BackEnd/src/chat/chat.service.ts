import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuctionStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LancesGateway } from '../realtime/lances.gateway';
import { nomeAbreviado } from '../common/utils/nome.util';
import type { MensagemResposta } from './dto/mensagem-resposta.dto';

const LIMITE_PADRAO = 50;
const LIMITE_MAXIMO = 100;

const INCLUIR_AUTOR = { autor: { select: { nome: true, papel: true, avatarUrl: true } } } as const;

interface MensagemComAutor {
  id: string;
  texto: string;
  leilaoId: string;
  autorId: string;
  criadoEm: Date;
  autor: { nome: string; papel: string; avatarUrl: string | null };
}

function paraResposta(m: MensagemComAutor): MensagemResposta {
  return {
    id: m.id,
    texto: m.texto,
    leilaoId: m.leilaoId,
    autorId: m.autorId,
    autorNome: nomeAbreviado(m.autor.nome),
    autorPapel: m.autor.papel,
    // So avatares prontos (nomes curtos): imagens em base64 deixariam cada mensagem pesada
    autorAvatar: m.autor.avatarUrl && m.autor.avatarUrl.length <= 40 ? m.autor.avatarUrl : null,
    criadoEm: m.criadoEm,
  };
}

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: LancesGateway,
  ) {}

  // Devolve as ultimas mensagens em ordem cronologica. Com "depois", so as
  // mais novas que essa data (usado para "buscar o que perdi")
  async listar(leilaoId: string, limite?: number, depois?: Date): Promise<MensagemResposta[]> {
    await this.garantirLeilao(leilaoId);
    const take = Math.min(LIMITE_MAXIMO, Math.max(1, limite ?? LIMITE_PADRAO));
    const mensagens = await this.prisma.chatMessage.findMany({
      where: { leilaoId, ...(depois ? { criadoEm: { gt: depois } } : {}) },
      orderBy: { criadoEm: 'desc' },
      take,
      include: INCLUIR_AUTOR,
    });
    return mensagens.reverse().map(paraResposta);
  }

  // 🔎 Regra: so se conversa enquanto o leilao esta ABERTO (a leitura e livre)
  async enviar(leilaoId: string, autorId: string, texto: string): Promise<MensagemResposta> {
    const leilao = await this.garantirLeilao(leilaoId);
    if (leilao.status !== AuctionStatus.OPEN) {
      throw new ConflictException('O chat só fica aberto enquanto o leilão está aberto');
    }
    const mensagem = await this.prisma.chatMessage.create({
      data: { leilaoId, autorId, texto },
      include: INCLUIR_AUTOR,
    });
    const resposta = paraResposta(mensagem);
    this.gateway.emitirMensagemNova(leilaoId, resposta);
    return resposta;
  }

  private async garantirLeilao(id: string): Promise<{ status: AuctionStatus }> {
    const leilao = await this.prisma.auction.findUnique({ where: { id }, select: { status: true } });
    if (!leilao) throw new NotFoundException('Leilão não encontrado');
    return leilao;
  }
}
