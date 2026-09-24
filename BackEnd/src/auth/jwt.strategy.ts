import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { UsersService } from '../users/users.service';
import { SessaoService } from './sessao.service';

interface PayloadDoToken {
  sub: string;
  papel: string;
  sid?: string; // id da sessao de login
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly sessaoService: SessaoService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      // So aceita token assinado com HS256 (o mesmo usado para assinar no
      // login) -- defesa em profundidade contra ataques de confusao de algoritmo
      algorithms: ['HS256'],
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

    // 🔎 O token so vale enquanto a SESSAO dele estiver ativa: logout, troca de senha e reuso suspeito
    // do refresh token a revogam, e o token para de funcionar na hora (nao espera expirar)
    if (!payload.sid || !(await this.sessaoService.estaAtiva(payload.sid, usuario.id))) {
      throw new UnauthorizedException('Sessao encerrada ou expirada. Entre novamente.');
    }

    return { id: usuario.id, papel: usuario.papel, sessaoId: payload.sid };
  }
}
