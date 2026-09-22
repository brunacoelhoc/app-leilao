import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    // Pega a requisicao HTTP que chegou
    const requisicao = context.switchToHttp().getRequest<Request>();

    // Le a chave enviada no cabecalho X-API-KEY
    const chaveRecebida = requisicao.headers['x-api-key'];
    // Le a chave correta guardada no .env
    const chaveCorreta = this.configService.get<string>('API_KEY');

    // Sem chave enviada ou sem chave configurada: bloqueia
    if (typeof chaveRecebida !== 'string' || !chaveCorreta) {
      throw new UnauthorizedException('API key ausente ou inválida');
    }

    // Compara de forma segura (evita descobrir a chave pelo tempo de resposta)
    const recebida = Buffer.from(chaveRecebida);
    const correta = Buffer.from(chaveCorreta);
    if (
      recebida.length !== correta.length ||
      !timingSafeEqual(recebida, correta)
    ) {
      throw new UnauthorizedException('API key ausente ou inválida');
    }

    // Chave certa: deixa a requisicao seguir para a rota
    return true;
  }
}
