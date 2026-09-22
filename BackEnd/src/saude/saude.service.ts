import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Confere se a API e o banco de dados estao funcionando
@Injectable()
export class SaudeService {
  constructor(private readonly prisma: PrismaService) {}

  async verificar() {
    try {
      // Consulta simples, so para testar a conexao com o banco
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // Banco fora do ar: responde 503 (servico indisponivel)
      throw new ServiceUnavailableException('Banco de dados indisponivel');
    }

    return {
      status: 'ok',
      banco: 'conectado',
      dataHora: new Date().toISOString(),
    };
  }
}
