import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configurarAplicacao } from './configurar-aplicacao';
import { configurarSwagger } from './configurar-swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo /api, Helmet, compressao, CORS e validacao dos DTOs
  configurarAplicacao(app);

  // Documentacao interativa em /docs (fora do prefixo /api, de proposito)
  configurarSwagger(app);

  // Ao receber um sinal de encerramento (Ctrl+C, deploy), fecha a conexao com o banco antes de sair
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  await app.listen(configService.get<number>('PORT') ?? 3000);
}

// Se algo falhar ao iniciar (ex.: banco fora do ar), mostra o motivo e encerra com codigo 1
bootstrap().catch((erro: { code?: string; message?: string }) => {
  // O motivo real (ex.: ECONNREFUSED = banco fora do ar) vem no campo "code"
  const codigo = erro.code ? ` [${erro.code}]` : '';
  const mensagem = (erro.message ?? '').split('\n').find((l) => l.trim()) ?? '';
  new Logger('Bootstrap').error(
    `Falha ao iniciar a aplicacao${codigo}: ${mensagem}`,
  );
  process.exit(1);
});
