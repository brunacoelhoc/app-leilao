import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { AuditLogService } from '../audit/audit-log.service';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import { AuditResult } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CUSTO_DO_HASH, HASH_FICTICIO } from './auth.service';
import type { EsqueciSenhaDto } from './dto/esqueci-senha.dto';
import type { RedefinirSenhaDto } from './dto/redefinir-senha.dto';
import { EmailSimuladoService } from './email-simulado.service';

// Regras da recuperacao de senha (todas aqui, no servidor)
const VALIDADE_MINUTOS = 15; // o codigo vale por 15 minutos
const MAX_TENTATIVAS = 5; // 5 erros e o codigo e queimado
const MAX_PEDIDOS_POR_HORA = 3; // por conta

const MENSAGEM_PEDIDO = `Se o e-mail estiver cadastrado, enviamos um codigo de 6 digitos, valido por ${VALIDADE_MINUTOS} minutos.`;

@Injectable()
export class RecuperacaoSenhaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly emailService: EmailSimuladoService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // 🔎 A resposta e SEMPRE a mesma, exista o e-mail ou nao (senao a tela viraria um detector
  // de e-mails cadastrados). So o servidor sabe se o codigo foi realmente gerado
  async solicitar(dto: EsqueciSenhaDto, contexto: ContextoRequisicao = {}): Promise<{ mensagem: string }> {
    const usuario = await this.usersService.buscarPorEmail(dto.email);

    if (!usuario || !usuario.ativo) {
      await this.auditLogService.registrar({
        usuarioId: usuario?.id,
        acao: 'SENHA_RECUPERACAO_SOLICITADA',
        resultado: AuditResult.REJECTED,
        motivo: usuario ? 'Conta desativada' : 'E-mail nao cadastrado',
        statusHttp: 200,
        ...contexto,
      });
      return { mensagem: MENSAGEM_PEDIDO };
    }

    const umaHoraAtras = new Date(Date.now() - 60 * 60_000);
    const pedidosNaUltimaHora = await this.prisma.passwordReset.count({
      where: { usuarioId: usuario.id, criadoEm: { gte: umaHoraAtras } },
    });
    if (pedidosNaUltimaHora >= MAX_PEDIDOS_POR_HORA) {
      await this.auditLogService.registrar({
        usuarioId: usuario.id,
        papel: usuario.papel,
        acao: 'SENHA_RECUPERACAO_SOLICITADA',
        resultado: AuditResult.REJECTED,
        motivo: `Limite de ${MAX_PEDIDOS_POR_HORA} pedidos por hora`,
        statusHttp: 200,
        ...contexto,
      });
      return { mensagem: MENSAGEM_PEDIDO };
    }

    // Um pedido novo cancela os anteriores ainda validos: so o ultimo codigo funciona
    await this.prisma.passwordReset.updateMany({
      where: { usuarioId: usuario.id, usadoEm: null },
      data: { usadoEm: new Date() },
    });

    const codigo = String(randomInt(100_000, 1_000_000)); // 6 digitos, aleatorio seguro
    await this.prisma.passwordReset.create({
      data: {
        usuarioId: usuario.id,
        codigoHash: await bcrypt.hash(codigo, CUSTO_DO_HASH), // o codigo em si nunca e guardado
        expiraEm: new Date(Date.now() + VALIDADE_MINUTOS * 60_000),
      },
    });
    this.emailService.enviarCodigoDeRecuperacao(usuario.email, usuario.nome, codigo, VALIDADE_MINUTOS);

    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel,
      acao: 'SENHA_RECUPERACAO_SOLICITADA',
      resultado: AuditResult.SUCCESS,
      statusHttp: 200,
      ...contexto,
    });
    return { mensagem: MENSAGEM_PEDIDO };
  }

  async redefinir(dto: RedefinirSenhaDto, contexto: ContextoRequisicao = {}): Promise<{ mensagem: string }> {
    const usuario = await this.usersService.buscarPorEmail(dto.email);

    const recusar = async (motivo: string): Promise<never> => {
      await this.auditLogService.registrar({
        usuarioId: usuario?.id,
        acao: 'SENHA_REDEFINICAO',
        resultado: AuditResult.REJECTED,
        motivo,
        statusHttp: 400,
        ...contexto,
      });
      // Mesma mensagem para todo tipo de falha: nao entrega pista nenhuma
      throw new BadRequestException('Codigo invalido ou expirado. Peca um novo codigo.');
    };

    if (!usuario || !usuario.ativo) {
      await bcrypt.compare(dto.codigo, HASH_FICTICIO); // gasta o mesmo tempo de uma conta real
      return recusar('E-mail nao cadastrado ou conta desativada');
    }

    const pedido = await this.prisma.passwordReset.findFirst({
      where: { usuarioId: usuario.id, usadoEm: null, expiraEm: { gt: new Date() } },
      orderBy: { criadoEm: 'desc' },
    });
    if (!pedido) return recusar('Nenhum codigo valido (inexistente, usado ou expirado)');

    // 🔎 A tentativa e CONTADA ANTES de conferir, de forma atomica (so conta se ainda houver
    // tentativas): varios palpites ao mesmo tempo nao passam de 5
    const contada = await this.prisma.passwordReset.updateMany({
      where: { id: pedido.id, usadoEm: null, tentativas: { lt: MAX_TENTATIVAS } },
      data: { tentativas: { increment: 1 } },
    });
    if (contada.count === 0) return recusar('Limite de tentativas atingido');

    const confere = await bcrypt.compare(dto.codigo, pedido.codigoHash);
    if (!confere) {
      if (pedido.tentativas + 1 >= MAX_TENTATIVAS) {
        await this.prisma.passwordReset.update({ where: { id: pedido.id }, data: { usadoEm: new Date() } });
      }
      return recusar(`Codigo incorreto (tentativa ${pedido.tentativas + 1} de ${MAX_TENTATIVAS})`);
    }

    // Codigo certo: troca a senha e queima o codigo na MESMA transacao (uso unico)
    const novoHash = await bcrypt.hash(dto.novaSenha, CUSTO_DO_HASH);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: usuario.id }, data: { senha: novoHash } }),
      this.prisma.passwordReset.updateMany({ where: { usuarioId: usuario.id, usadoEm: null }, data: { usadoEm: new Date() } }),
    ]);

    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel,
      acao: 'SENHA_REDEFINICAO',
      resultado: AuditResult.SUCCESS,
      statusHttp: 200,
      ...contexto,
    });
    return { mensagem: 'Senha redefinida com sucesso. Entre com a nova senha.' };
  }
}
