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
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import type { LoginDto } from './dto/login.dto';
import type { RefreshDto } from './dto/refresh.dto';
import { SessaoService } from './sessao.service';
import type { RegistrarUsuarioDto } from './dto/registrar-usuario.dto';

// Quantas "voltas" o bcrypt da para gerar o hash. Cada +1 dobra o tempo (e a seguranca)
export const CUSTO_DO_HASH = 12;

// Hash de um valor que nunca sera a senha de ninguem. Serve so para "gastar tempo"
// quando o e-mail nao existe, para o tempo de resposta nao denunciar se a conta existe
export const HASH_FICTICIO =
  '$2b$12$CwTycUXWue0Thq9StjUM0uJ8i6ZjLPr.p.LqM0Q9Y5C2X.MvJ8bYK';

export interface RespostaLogin {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioEntity;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly auditLogService: AuditLogService,
    private readonly sessaoService: SessaoService,
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
          ? `E-mail já cadastrado: ${dto.email}`
          : 'Falha ao registrar novo usuário',
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
        motivo: 'Credenciais inválidas',
        statusHttp: 401,
        ...contexto,
      });
      throw new UnauthorizedException('Credenciais inválidas');
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

    // Cada login abre uma SESSAO; o access token (curto) leva o id dela e o refresh token renova o acesso
    const { sessaoId, refreshToken } = await this.sessaoService.criar(usuario.id, contexto);
    const accessToken = await this.jwtService.signAsync({
      sub: usuario.id,
      papel: usuario.papel,
      sid: sessaoId,
    });

    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel,
      acao: 'LOGIN',
      resultado: AuditResult.SUCCESS,
      statusHttp: 200,
      ...contexto,
    });

    return { accessToken, refreshToken, usuario: new UsuarioEntity(usuario) };
  }

  // Troca o refresh token (de uso unico) por um par novo. Qualquer falha devolve a mesma mensagem
  async renovar(dto: RefreshDto, contexto: ContextoRequisicao = {}): Promise<RespostaLogin> {
    const resultado = await this.sessaoService.renovar(dto.refreshToken);
    const recusar = async (motivo: string, usuarioId?: string, reuso = false): Promise<never> => {
      await this.auditLogService.registrar({
        usuarioId,
        acao: reuso ? 'REFRESH_REUSO_DETECTADO' : 'REFRESH',
        resultado: AuditResult.REJECTED,
        motivo,
        statusHttp: 401,
        ...contexto,
      });
      throw new UnauthorizedException('Sessão inválida ou expirada. Entre novamente.');
    };
    if (!resultado.ok) return recusar(resultado.motivo, resultado.usuarioId, resultado.reuso);

    const usuario = await this.usersService.buscarPorId(resultado.usuarioId);
    if (!usuario || !usuario.ativo) {
      await this.sessaoService.revogar(resultado.sessaoId);
      return recusar('Usuário inexistente ou desativado', resultado.usuarioId);
    }

    const accessToken = await this.jwtService.signAsync({ sub: usuario.id, papel: usuario.papel, sid: resultado.sessaoId });
    return { accessToken, refreshToken: resultado.refreshToken, usuario: new UsuarioEntity(usuario) };
  }

  // Encerra a sessao do token usado: ele (e o refresh token dele) param de funcionar na hora
  async encerrarSessao(usuario: UsuarioAutenticado, contexto: ContextoRequisicao = {}): Promise<void> {
    await this.sessaoService.revogar(usuario.sessaoId);
    await this.auditLogService.registrar({
      usuarioId: usuario.id,
      papel: usuario.papel as never,
      acao: 'LOGOUT',
      resultado: AuditResult.SUCCESS,
      statusHttp: 204,
      ...contexto,
    });
  }
}
