import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

// Servico que conversa com o banco. Os outros modulos vao usar ele em vez de abrir conexao propria
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    // Le a URL do banco do .env (getOrThrow avisa se ela nao existir)
    const url = configService.getOrThrow<string>('DATABASE_URL');

    // O Prisma 7 precisa de um adaptador para falar com o PostgreSQL
    const adapter = new PrismaPg(url);

    super({ adapter });
  }

  // Roda quando a aplicacao inicia: abre a conexao com o banco
  async onModuleInit() {
    await this.$connect();
    // O $connect sozinho nao testa o banco; esta consulta forca a conexao real
    // e faz a API falhar ao subir se o banco estiver fora do ar ou a URL estiver errada
    await this.$queryRaw`SELECT 1`;
  }

  // Roda quando a aplicacao encerra: fecha a conexao com o banco
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
