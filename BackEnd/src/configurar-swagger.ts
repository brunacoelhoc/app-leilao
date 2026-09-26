import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

// Documentacao interativa da API (Swagger/OpenAPI). So e chamada pelo
// main.ts -- nao faz parte de configurarAplicacao() porque os testes e2e
// nao precisam gerar essa documentacao a cada bootstrap
export function configurarSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Belle Époque Leilões — API')
    .setDescription(
      'API da Plataforma de Leilões (AV-08). Toda rota exige o cabeçalho ' +
        '"X-API-KEY" (clique em Authorize e preencha "api-key"); rotas ' +
        'autenticadas também exigem "Authorization: Bearer <token>" ' +
        '(obtido em POST /auth/login, preencha em "jwt").',
    )
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .addApiKey({ type: 'apiKey', name: 'X-API-KEY', in: 'header' }, 'api-key')
    // Descricao por aba (aparece no topo de cada secao expandida no Swagger UI)
    .addTag('Auth', 'Registro e login. Rotas públicas (só exigem X-API-KEY).')
    .addTag('Users', 'Perfil do próprio usuário (/me) e gestão de usuários pelo ADMIN.')
    .addTag('Categories', 'CRUD de categorias. Leitura livre, escrita só do ADMIN.')
    .addTag('Auctions', 'Leilões: criação, edição e máquina de estados (DRAFT -> SCHEDULED -> OPEN -> CLOSED/CANCELED).')
    .addTag('Auction Items', 'Itens do leilão, com endereço de retirada preenchido via integração real com o ViaCEP.')
    .addTag('Bids', 'Lances, com concorrencia protegida por lock pessimista (SELECT ... FOR UPDATE).')
    .addTag('Pedidos', 'Pos-leilao, só para o vencedor: pagamento (simulado) e depois retirada ou entrega.')
    .build();

  // Rotas de apoio (documents, saude, cep, destaques, chat, ranking, admin, obras,
  // institucional) ficam ESCONDIDAS do Swagger com @ApiExcludeController: continuam
  // funcionando, so nao poluem a demonstracao com o que nao e o fluxo principal
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
