import { ClassSerializerInterceptor, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CategoriesModule } from './categories/categories.module';
import { FiltroExcecoes } from './common/filters/filtro-excecoes';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { LogRequisicaoInterceptor } from './common/interceptors/log-requisicao.interceptor';
import { IdRequisicaoMiddleware } from './common/middlewares/id-requisicao.middleware';
import { validarVariaveisAmbiente } from './config/variaveis-ambiente';
import { PrismaModule } from './prisma/prisma.module';
import { SaudeModule } from './saude/saude.module';

@Module({
  imports: [
    // Carrega o .env e deixa o ConfigService disponivel em toda a aplicacao
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarVariaveisAmbiente, // a API so sobe se o .env estiver correto
    }),
    // Limite de requisicoes por IP (protege contra forca bruta e robos)
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('RATE_LIMIT_JANELA_MS'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
          },
        ],
        errorMessage: 'Muitas requisicoes. Aguarde um pouco e tente novamente.',
      }),
    }),
    // Conexao com o banco, disponivel em toda a aplicacao
    PrismaModule,
    // Rota /saude: confere se a API e o banco estao no ar
    SaudeModule,
    // Registro, login e as pecas de autenticacao (JWT, papeis)
    AuthModule,
    // CRUD de categorias (leitura livre, escrita so para ADMIN)
    CategoriesModule,
  ],
  providers: [
    // Limite de requisicoes. Vem ANTES do guard da chave, para tambem
    // limitar quem fica chutando chaves erradas
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // Guard global: exige o cabecalho X-API-KEY em todas as rotas
    { provide: APP_GUARD, useClass: ApiKeyGuard },
    // Filtro global: todo erro da API sai no mesmo formato, em portugues
    { provide: APP_FILTER, useClass: FiltroExcecoes },
    // Interceptor global: log estruturado de cada requisicao, com o tempo gasto
    { provide: APP_INTERCEPTOR, useClass: LogRequisicaoInterceptor },
    // Rede de seguranca: remove campos marcados com @Exclude() (ex.: a senha) de qualquer resposta
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },
  ],
})
export class AppModule implements NestModule {
  // Liga o middleware do id em TODAS as rotas
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdRequisicaoMiddleware).forRoutes('*path');
  }
}
