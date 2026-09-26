import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';

// Protege rotas exigindo um JWT valido no cabecalho Authorization: Bearer <token>
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Personaliza a mensagem de erro (o padrao do Passport vem em ingles)
  handleRequest<TUser = UsuarioAutenticado>(
    erro: unknown,
    usuario: TUser | false,
    info: unknown,
    _context: ExecutionContext,
  ): TUser {
    // Erro proprio (lancado no JwtStrategy.validate, ex.: usuario desativado):
    // ja esta em portugues, so repassa
    if (erro) throw erro;

    // Sem erro mas sem usuario: o "info" do Passport diz o motivo, e cada um ganha uma mensagem propria
    if (!usuario) {
      const nome = info instanceof Error ? info.name : '';
      const texto = info instanceof Error ? info.message : '';
      if (nome === 'TokenExpiredError') {
        throw new UnauthorizedException('Token vencido. Faça login novamente para gerar um token novo.');
      }
      if (texto === 'No auth token') {
        throw new UnauthorizedException('Token ausente. Envie o cabeçalho "Authorization: Bearer <token>" (no Swagger, use Authorize > jwt).');
      }
      throw new UnauthorizedException('Token mal informado ou inválido. Confira se copiou o token inteiro, sem a palavra "Bearer" no Swagger.');
    }

    return usuario;
  }
}
