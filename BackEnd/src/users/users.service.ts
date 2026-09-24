import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { cpfValido } from '../common/utils/cpf.util';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import {
  calcularPaginacao,
  paginar,
  type ParametrosPaginacao,
  type RespostaPaginada,
} from '../common/utils/paginacao.util';
import { Prisma, type Role, type User } from '../generated/prisma/client';
import type { AlterarSenhaDto } from './dto/alterar-senha.dto';
import type { CriarUsuarioAdminDto } from './dto/criar-usuario-admin.dto';
import type { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';

interface FiltrosListagemUsuarios extends ParametrosPaginacao {
  papel?: Role;
  ativo?: boolean;
  busca?: string;
}

// Mesmo custo usado no registro/login (src/auth/auth.service.ts) -- duplicado
// aqui de proposito, para o UsersService nao depender do AuthModule
const CUSTO_DO_HASH = 12;

// Fala com a tabela User. A maior parte e so acesso ao banco (usado pelo
// AuthService no login/registro); (des)ativar e gestao pelo ADMIN moram aqui
// tambem, por serem regras sobre o USUARIO em si, nao sobre autenticacao
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Cria o usuario. O papel e o ativo usam o padrao do schema (BIDDER e true)
  criar(dados: { nome: string; email: string; senha: string; papel?: Role }): Promise<User> {
    return this.prisma.user.create({ data: dados });
  }

  // 🔎 Criacao pelo ADMIN: mesma regra de senha do cadastro (hash bcrypt), mas com papel escolhido
  async criarPeloAdmin(dto: CriarUsuarioAdminDto): Promise<User> {
    const senha = await bcrypt.hash(dto.senha, CUSTO_DO_HASH);
    return this.criar({ nome: dto.nome, email: dto.email, senha, papel: dto.papel });
  }

  // Remocao de verdade so para conta SEM historico (sem leiloes, lances, arquivos...).
  // Quem ja participou de algo e desativado, nunca apagado (o banco bloqueia: Restrict)
  async remover(id: string, usuarioLogado: UsuarioAutenticado): Promise<void> {
    await this.buscarPorIdOuFalhar(id);
    if (id === usuarioLogado.id) {
      throw new ConflictException('Voce nao pode remover a sua propria conta');
    }
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2003') {
        throw new ConflictException('Este usuario tem historico na plataforma: desative a conta em vez de remover');
      }
      throw erro;
    }
  }

  // As regras de "Quero vender" em um lugar so: a tela pergunta, o "Quero vender" confere de novo
  async avaliarRequisitosVendedor(usuario: User): Promise<{
    faltando: string[];
    cpfInvalido: boolean;
    cpfEmOutraConta: boolean;
  }> {
    const faltando: string[] = [];
    if (!usuario.telefone) faltando.push('telefone');
    if (!usuario.cpf) faltando.push('CPF');
    if (!usuario.endereco) faltando.push('endereco');
    const cpfInvalido = !!usuario.cpf && !cpfValido(usuario.cpf);
    const cpfEmOutraConta =
      !!usuario.cpf &&
      !cpfInvalido &&
      !!(await this.prisma.user.findFirst({
        where: { cpf: usuario.cpf, papel: 'SELLER', id: { not: usuario.id } },
        select: { id: true },
      }));
    return { faltando, cpfInvalido, cpfEmOutraConta };
  }

  // 🔎 "Quero vender": um COMPRADOR passa a VENDEDOR sozinho, mas so com o perfil completo
  // (telefone, CPF valido e endereco). O CPF nao pode estar em outra conta de vendedor
  // (evita a mesma pessoa com varias contas para inflar o proprio leilao). O papel e lido
  // do banco a cada requisicao, entao vale na hora, sem novo login
  async tornarVendedor(id: string): Promise<User> {
    const usuario = await this.buscarPorIdOuFalhar(id);
    if (usuario.papel === 'SELLER') {
      throw new ConflictException('Sua conta ja e de vendedor');
    }
    if (usuario.papel !== 'BIDDER') {
      throw new ForbiddenException('Somente contas de comprador podem virar vendedor');
    }

    const requisitos = await this.avaliarRequisitosVendedor(usuario);
    if (requisitos.faltando.length > 0) {
      throw new BadRequestException(`Complete o perfil antes de vender: falta ${requisitos.faltando.join(', ')}`);
    }
    if (requisitos.cpfInvalido) {
      throw new BadRequestException('O CPF informado no perfil e invalido');
    }
    if (requisitos.cpfEmOutraConta) {
      throw new ConflictException('Este CPF ja esta vinculado a outra conta de vendedor');
    }

    return this.prisma.user.update({ where: { id }, data: { papel: 'SELLER' } });
  }

  // Usado no login, para achar a conta pelo e-mail
  buscarPorEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  // Usado a cada requisicao autenticada, para confirmar que o usuario ainda existe e esta ativo
  buscarPorId(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async buscarPorIdOuFalhar(id: string): Promise<User> {
    const usuario = await this.buscarPorId(id);
    if (!usuario) {
      throw new NotFoundException('Usuario nao encontrado');
    }
    return usuario;
  }

  // Gestao pelo ADMIN: lista todo mundo, paginado, do mais recente pro mais
  // antigo. Os dois filtros sao opcionais (Prisma ignora um "where" com undefined)
  async listarTodos(
    filtros: FiltrosListagemUsuarios = {},
  ): Promise<RespostaPaginada<User>> {
    const paginacao = calcularPaginacao(filtros);
    const where = {
      papel: filtros.papel,
      ativo: filtros.ativo,
      ...(filtros.busca
        ? {
            OR: [
              { nome: { contains: filtros.busca, mode: 'insensitive' as const } },
              { email: { contains: filtros.busca, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [usuarios, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip: paginacao.skip,
        take: paginacao.take,
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginar(usuarios, total, paginacao);
  }

  async desativar(
    id: string,
    usuarioLogado: UsuarioAutenticado,
  ): Promise<User> {
    await this.buscarPorIdOuFalhar(id);

    // Um ADMIN nao pode se autodesativar: ninguem mais poderia reativa-lo
    // (nao existe outra forma de virar ADMIN a nao ser ja sendo um)
    if (id === usuarioLogado.id) {
      throw new ConflictException('Voce nao pode desativar a sua propria conta');
    }

    return this.prisma.user.update({ where: { id }, data: { ativo: false } });
  }

  async reativar(id: string): Promise<User> {
    await this.buscarPorIdOuFalhar(id);
    return this.prisma.user.update({ where: { id }, data: { ativo: true } });
  }

  // Autoedicao do proprio perfil (nunca mexe em papel/ativo/senha por aqui)
  async atualizarPerfil(id: string, dto: AtualizarPerfilDto): Promise<User> {
    const usuario = await this.buscarPorIdOuFalhar(id);
    // "senhaAtual" so serve para conferir; nunca vai para o banco
    const { senhaAtual, ...dados } = dto;

    if (dados.email && dados.email !== usuario.email) {
      // Trocar o e-mail (login) exige provar quem e: senha atual correta
      if (!senhaAtual || !(await bcrypt.compare(senhaAtual, usuario.senha))) {
        throw new BadRequestException(
          'Para trocar o e-mail, informe a senha atual correta',
        );
      }
      const emUso = await this.prisma.user.findUnique({
        where: { email: dados.email },
      });
      if (emUso) {
        throw new ConflictException(`E-mail ja cadastrado: ${dados.email}`);
      }
    }

    return this.prisma.user.update({ where: { id }, data: dados });
  }

  // So troca a senha se a senha ATUAL bater (confere com o hash gravado)
  async alterarSenha(id: string, dto: AlterarSenhaDto): Promise<void> {
    const usuario = await this.buscarPorIdOuFalhar(id);

    const senhaConfere = await bcrypt.compare(dto.senhaAtual, usuario.senha);
    if (!senhaConfere) {
      // 400 (nao 401): quem chama JA esta autenticado, so errou a senha atual
      throw new BadRequestException('Senha atual incorreta');
    }

    const novoHash = await bcrypt.hash(dto.novaSenha, CUSTO_DO_HASH);
    await this.prisma.user.update({ where: { id }, data: { senha: novoHash } });
  }
}
