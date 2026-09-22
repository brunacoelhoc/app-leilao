import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UsuarioEntity } from '../users/usuario.entity';
import type { LoginDto } from './dto/login.dto';
import type { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

// Quantas "voltas" o bcrypt da para gerar o hash. Cada +1 dobra o tempo (e a seguranca)
const CUSTO_DO_HASH = 12;

// Hash de um valor que nunca sera a senha de ninguem. Serve so para "gastar tempo"
// quando o e-mail nao existe, para o tempo de resposta nao denunciar se a conta existe
const HASH_FICTICIO =
  '$2b$12$CwTycUXWue0Thq9StjUM0uJ8i6ZjLPr.p.LqM0Q9Y5C2X.MvJ8bYK';

export interface RespostaLogin {
  accessToken: string;
  usuario: UsuarioEntity;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async registrar(dto: RegistrarUsuarioDto): Promise<UsuarioEntity> {
    // Nunca guardamos a senha pura, so o hash
    const senhaComHash = await bcrypt.hash(dto.senha, CUSTO_DO_HASH);

    // Se o e-mail ja existir, o banco recusa (P2002) e o filtro global
    // ja traduz isso para 409 -- nao precisamos checar isso aqui
    const usuario = await this.usersService.criar({
      nome: dto.nome,
      email: dto.email,
      senha: senhaComHash,
    });

    return new UsuarioEntity(usuario);
  }

  async login(dto: LoginDto): Promise<RespostaLogin> {
    const usuario = await this.usersService.buscarPorEmail(dto.email);

    // Sempre compara com ALGUM hash, exista o usuario ou nao -- senao o tempo
    // de resposta denuncia quais e-mails estao cadastrados
    const senhaConfere = await bcrypt.compare(
      dto.senha,
      usuario?.senha ?? HASH_FICTICIO,
    );

    if (!usuario || !senhaConfere) {
      throw new UnauthorizedException('Credenciais invalidas');
    }

    // So avisamos que a conta esta desativada DEPOIS de confirmar a senha:
    // assim so quem realmente sabe a senha (o dono) fica sabendo do motivo
    if (!usuario.ativo) {
      throw new ForbiddenException(
        'Sua conta foi desativada. Entre em contato com o suporte.',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: usuario.id,
      papel: usuario.papel,
    });

    return { accessToken, usuario: new UsuarioEntity(usuario) };
  }
}
