import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import helmet from 'helmet';
import { formatarErrosDeValidacao } from './common/formatar-erros-validacao';

// Configuracao comum da API. Usada pelo main.ts e pelos testes e2e,
// para os testes rodarem a API do mesmo jeito que ela roda de verdade
export function configurarAplicacao(app: INestApplication): void {
  const configService = app.get(ConfigService);

  // Todas as rotas comecam com /api (ex.: /api/saude)
  app.setGlobalPrefix('api');

  // Cabecalhos HTTP de seguranca
  app.use(helmet());

  // Comprime as respostas (gzip)
  app.use(compression());

  // Libera apenas o front-end (Angular) para chamar a API
  // e aceita o cabecalho X-API-KEY (senao o navegador bloqueia)
  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-KEY'],
    exposedHeaders: ['X-Request-Id'], // deixa o front ler o id da requisicao
  });

  // Valida todos os DTOs automaticamente
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove campos que nao existem no DTO
      forbidNonWhitelisted: true, // e rejeita a requisicao (400) se vierem
      transform: true, // converte tipos (ex.: "5" -> 5)
      stopAtFirstError: true, // uma mensagem por campo, nao varias juntas
      // Traduz as mensagens do class-validator para portugues (inclusive a de campo extra)
      exceptionFactory: (erros) =>
        new BadRequestException(formatarErrosDeValidacao(erros)),
    }),
  );
}

