import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { SEM_CHAVE_API } from '../decorators/sem-chave-api.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // O WebSocket (sala de lances, so leitura de eventos publicos) nao envia
    // cabecalhos; as acoes de escrita continuam sendo HTTP e exigem a chave
    if (context.getType() !== 'http') return true;

    // Rotas marcadas com @SemChaveApi() (so as fotos das pecas) ficam livres
    const livre = this.reflector.getAllAndOverride<boolean>(SEM_CHAVE_API, [context.getHandler(), context.getClass()]);
    if (livre) return true;

    // Pega a requisicao HTTP que chegou
    const requisicao = context.switchToHttp().getRequest<Request>();

    // Le a chave enviada no cabecalho X-API-KEY
    const chaveRecebida = requisicao.headers['x-api-key'];
    // Le a chave correta guardada no .env
    const chaveCorreta = this.configService.get<string>('API_KEY');

    // Sem chave enviada ou sem chave configurada: bloqueia
    if (typeof chaveRecebida !== 'string' || !chaveCorreta) {
      throw new UnauthorizedException('API key ausente. Envie o cabeçalho X-API-KEY (no Swagger, use Authorize > api-key).');
    }

    // Compara de forma segura (evita descobrir a chave pelo tempo de resposta)
    const recebida = Buffer.from(chaveRecebida);
    const correta = Buffer.from(chaveCorreta);
    if (
      recebida.length !== correta.length ||
      !timingSafeEqual(recebida, correta)
    ) {
      throw new UnauthorizedException('API key inválida. Confira o valor do cabeçalho X-API-KEY.');
    }

    // Chave certa: deixa a requisicao seguir para a rota
    return true;
  }
}
