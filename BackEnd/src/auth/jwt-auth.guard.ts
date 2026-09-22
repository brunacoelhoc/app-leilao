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
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    // Erro proprio (lancado no JwtStrategy.validate, ex.: usuario desativado):
    // ja esta em portugues, so repassa
    if (erro) throw erro;

    // Sem erro mas sem usuario: token ausente, mal formado, expirado ou com assinatura invalida
    if (!usuario) {
      throw new UnauthorizedException('Token ausente, invalido ou expirado');
    }

    return usuario;
  }
}
