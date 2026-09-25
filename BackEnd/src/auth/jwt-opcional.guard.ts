import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';

// Para rotas livres que mostram mais coisas a quem esta logado (ex.: o dono ve o leilão cancelado).
// Sem token, ou com token invalido, a rota continua funcionando: o usuário só fica anônimo (request.user vazio)
@Injectable()
export class JwtOpcionalGuard extends AuthGuard('jwt') {
  handleRequest<TUser = UsuarioAutenticado>(_erro: unknown, usuario: TUser | false): TUser {
    return (usuario || undefined) as TUser;
  }
}
