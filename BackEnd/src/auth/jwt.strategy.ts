import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { UsersService } from '../users/users.service';

interface PayloadDoToken {
  sub: string;
  papel: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // O Passport ja confirmou a assinatura e a validade (exp) do token antes de chegar aqui
  async validate(payload: PayloadDoToken): Promise<UsuarioAutenticado> {
    const usuario = await this.usersService.buscarPorId(payload.sub);

    // Reconsulta o banco a cada requisicao: se o usuario foi apagado ou
    // desativado DEPOIS de emitir o token, o acesso e cortado na hora
    if (!usuario || !usuario.ativo) {
      throw new UnauthorizedException('Sessao invalida ou usuario desativado');
    }

    return { id: usuario.id, papel: usuario.papel };
  }
}
