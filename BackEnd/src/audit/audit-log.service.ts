import { Injectable, Logger } from '@nestjs/common';
import { AuditResult, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Dados de uma acao para registrar na auditoria. Nunca inclua senha, token
// ou qualquer segredo aqui -- so o necessario para reconstruir "quem fez o que"
interface RegistrarAuditoria {
  usuarioId?: string; // vazio quando nao ha usuario logado (ex.: login que falhou)
  papel?: Role;
  acao: string; // ex.: 'LOGIN', 'LANCE_CRIADO', 'LANCE_REJEITADO'
  entidade?: string; // ex.: 'AuctionItem'
  entidadeId?: string;
  resultado: AuditResult;
  motivo?: string;
  statusHttp?: number;
  ipOrigem?: string;
  userAgent?: string;
  idRequisicao?: string;
}

// Grava a auditoria. Nunca deve derrubar a requisicao principal: se a
// gravacao falhar, so registra no log da aplicacao e segue em frente
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registrar(dados: RegistrarAuditoria): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: dados });
    } catch (erro) {
      this.logger.error(
        `Falha ao gravar auditoria (acao=${dados.acao}): ${erro instanceof Error ? erro.message : 'erro desconhecido'}`,
      );
    }
  }
}
