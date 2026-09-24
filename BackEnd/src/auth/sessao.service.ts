import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import { PrismaService } from '../prisma/prisma.service';

// A sessao vale 7 dias SEM USO: cada renovacao do refresh token empurra o prazo
const DURACAO_SESSAO_DIAS = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

const hash = (segredo: string): string => createHash('sha256').update(segredo).digest('hex');
const iguais = (a: string, b: string): boolean => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y); // comparacao em tempo constante
};
const novaExpiracao = (): Date => new Date(Date.now() + DURACAO_SESSAO_DIAS * DIA_MS);

export type ResultadoRenovacao =
  | { ok: true; sessaoId: string; usuarioId: string; refreshToken: string }
  | { ok: false; motivo: string; usuarioId?: string; reuso?: boolean };

// 🔎 Sessoes de login. O access token e curto (minutos) e leva o id da sessao; a cada requisicao o
// servidor confere se a sessao continua ativa. O refresh token ("<idDaSessao>.<segredo>") e rotativo:
// cada uso gera um novo, e so o HASH do segredo fica no banco. Se um refresh token JA USADO aparecer de
// novo (sinal de roubo), a sessao inteira e revogada.
@Injectable()
export class SessaoService {
  constructor(private readonly prisma: PrismaService) {}

  async criar(usuarioId: string, contexto: ContextoRequisicao = {}): Promise<{ sessaoId: string; refreshToken: string }> {
    // Faxina barata: sessoes deste usuario expiradas ou revogadas ha mais de 30 dias
    const limite = new Date(Date.now() - 30 * DIA_MS);
    await this.prisma.session.deleteMany({
      where: { usuarioId, OR: [{ expiraEm: { lt: limite } }, { revogadaEm: { lt: limite } }] },
    });

    const segredo = randomBytes(32).toString('hex');
    const sessao = await this.prisma.session.create({
      data: {
        usuarioId,
        refreshHash: hash(segredo),
        expiraEm: novaExpiracao(),
        ipOrigem: contexto.ipOrigem,
        userAgent: contexto.userAgent,
      },
    });
    return { sessaoId: sessao.id, refreshToken: `${sessao.id}.${segredo}` };
  }

  // Conferida a CADA requisicao autenticada (o access token so vale enquanto a sessao dele estiver ativa)
  async estaAtiva(sessaoId: string, usuarioId: string): Promise<boolean> {
    const sessao = await this.prisma.session.findUnique({
      where: { id: sessaoId },
      select: { usuarioId: true, revogadaEm: true, expiraEm: true },
    });
    return !!sessao && sessao.usuarioId === usuarioId && sessao.revogadaEm === null && sessao.expiraEm > new Date();
  }

  async renovar(refreshToken: string): Promise<ResultadoRenovacao> {
    const partes = refreshToken.split('.');
    if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'Formato invalido' };
    const [sessaoId, segredo] = partes;

    const sessao = await this.prisma.session.findUnique({ where: { id: sessaoId } });
    if (!sessao || sessao.revogadaEm !== null || sessao.expiraEm <= new Date()) {
      return { ok: false, motivo: 'Sessao inexistente, revogada ou expirada', usuarioId: sessao?.usuarioId };
    }

    const enviado = hash(segredo);

    // Um refresh token que ja foi trocado apareceu de novo: pode ter sido roubado -> derruba a sessao
    if (sessao.refreshHashAnterior && iguais(enviado, sessao.refreshHashAnterior)) {
      await this.revogar(sessao.id);
      return { ok: false, motivo: 'Refresh token ja usado (possivel roubo): sessao revogada', usuarioId: sessao.usuarioId, reuso: true };
    }
    if (!iguais(enviado, sessao.refreshHash)) return { ok: false, motivo: 'Segredo incorreto', usuarioId: sessao.usuarioId };

    // Rotacao atomica: so troca se o refresh atual ainda for o mesmo (dois pedidos iguais ao mesmo tempo nao passam)
    const novoSegredo = randomBytes(32).toString('hex');
    const trocado = await this.prisma.session.updateMany({
      where: { id: sessao.id, refreshHash: sessao.refreshHash, revogadaEm: null },
      data: {
        refreshHash: hash(novoSegredo),
        refreshHashAnterior: sessao.refreshHash,
        expiraEm: novaExpiracao(),
        ultimoUsoEm: new Date(),
      },
    });
    if (trocado.count === 0) return { ok: false, motivo: 'Renovacao concorrente', usuarioId: sessao.usuarioId };

    return { ok: true, sessaoId: sessao.id, usuarioId: sessao.usuarioId, refreshToken: `${sessao.id}.${novoSegredo}` };
  }

  async revogar(sessaoId: string): Promise<void> {
    await this.prisma.session.updateMany({ where: { id: sessaoId, revogadaEm: null }, data: { revogadaEm: new Date() } });
  }

  // Derruba todas as sessoes do usuario (opcionalmente poupando a atual): usado ao trocar/redefinir a senha
  async revogarTodas(usuarioId: string, exceto?: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { usuarioId, revogadaEm: null, ...(exceto ? { id: { not: exceto } } : {}) },
      data: { revogadaEm: new Date() },
    });
  }
}
