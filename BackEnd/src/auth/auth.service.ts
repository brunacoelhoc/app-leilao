import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuditLogService } from '../audit/audit-log.service';
import type { ContextoRequisicao } from '../common/interfaces/contexto-requisicao.interface';
import { AuditResult, Prisma } from '../generated/prisma/client';
import { UsersService } from '../users/users.service';
import { UsuarioEntity } from '../users/usuario.entity';
import type { LoginDto } from './dto/login.dto';
import type { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

// Quantas "voltas" o bcrypt da para gerar o hash. Cada +1 dobra o tempo (e a seguranca)
export const CUSTO_DO_HASH = 12;

// Hash de um valor que nunca sera a senha de ninguem. Serve so para "gastar tempo"
// quando o e-mail nao existe, para o tempo de resposta nao denunciar se a conta existe
export const HASH_FICTICIO =
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
    private readonly auditLogService: AuditLogService,
  ) {}

  async registrar(
    dto: RegistrarUsuarioDto,
    contexto: ContextoRequisicao = {},
  ): Promise<UsuarioEntity> {
    // Nunca guardamos a senha pura, so o hash
    const senhaComHash = await bcrypt.hash(dto.senha, CUSTO_DO_HASH);

    try {
      // Se o e-mail ja existir, o banco recusa (P2002) e o filtro global
      // ja traduz isso para 409 -- so precisamos capturar aqui para auditar
      const usuario = await this.usersService.criar({
        nome: dto.nome,
        email: dto.email,
        senha: senhaComHash,
        termosAceitosEm: new Date(),
      });

      await this.auditLogService.registrar({
        usuarioId: usuario.id,
        papel: usuario.papel,
        acao: 'REGISTRO',
        resultado: AuditResult.SUCCESS,
        statusHttp: 201,
        ...contexto,
      });

      return new UsuarioEntity(usuario);
    } catch (erro) {
      // So sabemos dizer com certeza o motivo no caso mais comum (e-mail
      // duplicado, P2002); qualquer outro erro e auditado de forma generica,
      // sem inventar um motivo ou status que talvez nao seja o real
      const duplicado =
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002';

      await this.auditLogService.registrar({
        acao: 'REGISTRO',
        resultado: AuditResult.REJECTED,
        motivo: duplicado
          ? `E-mail ja cadastrado: ${dto.email}`
          : 'Falha ao registrar novo usuario',
        statusHttp: duplicado ? 409 : 500,
        ...contexto,
      });
      throw erro;
    }
  }

  async login(
    dto: LoginDto,
    contexto: ContextoRequisicao = {},
  ): Promise<RespostaLogin> {
    const usuario = await this.usersService.buscarPorEmail(dto.email);

    // Sempre compara com ALGUM hash, exista o usuario ou nao -- senao o tempo
    // de resposta denuncia quais e-mails estao cadastrados
    const senhaConfere = await bcrypt.compare(
      dto.senha,
      usuario?.senha ?? HASH_FICTICIO,
    );

    if (!usuario || !senhaConfere) {
      await this.auditLogService.registrar({
        usuarioId: usuario?.id,
        acao: 'LOGIN',
        resultado: AuditResult.REJECTED,
        motivo: 'Credenciais invalidas',
        statusHttp: 401,
        ...contexto,
      });
      throw new UnauthorizedException('Credenciais invalidas');
    }

    // So avisamos que a conta esta desativada DEPOIS de confirmar a senha:
    // assim so quem realmente sabe a senha (o dono) fica sabendo do motivo
    if (!usuario.ativo) {
      await this.auditLogService.registrar({
        usuarioId: usuario.id,
        papel: usuario.papel,
        acao: 'LOGIN',
        resultado: AuditResult.REJECTED,
        motivo: 'Conta desativada',
        statusHttp: 403,
        ...contexto,
      });
      throw new ForbiddenException(
        'Sua conta foi desativada. Entre em contato com o suporte.',
      );
    }

    const accessToken = await this.jwtService.signAsync({
      sub: usuario.id,
      papel: usuario.papel,
    });

    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel,
      acao: 'LOGIN',
      resultado: AuditResult.SUCCESS,
      statusHttp: 200,
      ...contexto,
    });

    return { accessToken, usuario: new UsuarioEntity(usuario) };
  }
}
