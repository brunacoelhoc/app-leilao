import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../generated/prisma/client';
import { CHAVE_PAPEIS } from '../decorators/roles.decorator';
import type { UsuarioAutenticado } from '../interfaces/usuario-autenticado.interface';

// So funciona DEPOIS do JwtAuthGuard (precisa de request.user ja preenchido)
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const papeisPermitidos = this.reflector.getAllAndOverride<Role[]>(
      CHAVE_PAPEIS,
      [context.getHandler(), context.getClass()],
    );

    // Rota sem @Roles(): qualquer usuario autenticado pode acessar
    if (!papeisPermitidos || papeisPermitidos.length === 0) return true;

    const requisicao = context
      .switchToHttp()
      .getRequest<{ user?: UsuarioAutenticado }>();
    const usuario = requisicao.user;

    if (!usuario || !papeisPermitidos.includes(usuario.papel as Role)) {
      throw new ForbiddenException(
        'Voce nao tem permissao para acessar este recurso',
      );
    }

    return true;
  }
}
