import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Documentacao interativa da API (Swagger/OpenAPI). So e chamada pelo
// main.ts -- nao faz parte de configurarAplicacao() porque os testes e2e
// nao precisam gerar essa documentacao a cada bootstrap
export function configurarSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Belle Époque Leilões — API')
    .setDescription(
      'API da Plataforma de Leilões (AV-08). Toda rota exige o cabecalho ' +
        '"X-API-KEY" (clique em Authorize e preencha "api-key"); rotas ' +
        'autenticadas tambem exigem "Authorization: Bearer <token>" ' +
        '(obtido em POST /auth/login, preencha em "jwt").',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'api-key')
    // Descricao por aba (aparece no topo de cada secao expandida no Swagger UI)
    .addTag('Auth', 'Registro e login. Rotas publicas (so exigem X-API-KEY).')
    .addTag('Users', 'Perfil do proprio usuario (/me) e gestao de usuarios pelo ADMIN.')
    .addTag('Categories', 'CRUD de categorias. Leitura livre, escrita so do ADMIN.')
    .addTag('Auctions', 'Leiloes: criacao, edicao e maquina de estados (DRAFT -> SCHEDULED -> OPEN -> CLOSED/CANCELED).')
    .addTag('Auction Items', 'Itens do leilao, com endereco de retirada preenchido via integracao real com o ViaCEP.')
    .addTag('Bids', 'Lances, com concorrencia protegida por lock pessimista (SELECT ... FOR UPDATE).')
    .addTag('Documents', 'Upload de fotos/documentos dos itens, com hash SHA-256 e nome de arquivo seguro.')
    .addTag('Saúde', 'Health check da API e do banco de dados.')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // "docs" fica FORA do prefixo /api (a documentacao nao e uma rota de
  // negocio) -- e o unico caminho liberado do ApiKeyGuard, de proposito
  // (ver src/common/guards/api-key.guard.ts)
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // nao perde o token/chave ao atualizar a pagina
    },
  });
}
