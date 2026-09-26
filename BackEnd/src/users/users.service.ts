import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
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
  criar(dados: { nome: string; email: string; senha: string; papel?: Role; termosAceitosEm?: Date }): Promise<User> {
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
      throw new ConflictException('Você não pode remover a sua própria conta');
    }
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (erro) {
      if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2003') {
        throw new ConflictException('Este usuário tem histórico na plataforma: desative a conta em vez de remover');
      }
      throw erro;
    }
  }

  // 🔎 Troca de modo: a mesma conta alterna entre COMPRADOR (BIDDER) e VENDEDOR (SELLER) com um
  // clique, sem completar perfil. Cada modo trava o outro: vendedor nao da lance e comprador nao
  // cria leilao. O papel e lido do banco a cada requisicao, entao vale na hora, sem novo login.
  // ADMIN nao troca de modo (moderar e outra funcao)
  async trocarModo(id: string, modo: 'BIDDER' | 'SELLER'): Promise<User> {
    const usuario = await this.buscarPorIdOuFalhar(id);
    if (usuario.papel === 'ADMIN') {
      throw new ForbiddenException('Administradores não trocam de modo');
    }
    if (usuario.papel === modo) {
      throw new ConflictException(modo === 'SELLER' ? 'Sua conta já está no modo vendedor' : 'Sua conta já está no modo comprador');
    }
    return this.prisma.user.update({ where: { id }, data: { papel: modo } });
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
      throw new NotFoundException('Usuário não encontrado');
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

  // 🔎 Trava: quem esta DISPUTANDO peca, ou e DONO de leilao em andamento (aberto ou agendado), nao pode ser desativado (a menos que o
  // ADMIN force, de forma explicita e auditada, ex.: fraude em andamento). Se for forcado, o
  // fechamento do leilao pula os lances dessa conta e passa a peca ao proximo maior lance
  async desativar(
    id: string,
    usuarioLogado: UsuarioAutenticado,
    forcar = false,
  ): Promise<User> {
    await this.buscarPorIdOuFalhar(id);

    // Um ADMIN nao pode se autodesativar: ninguem mais poderia reativa-lo
    // (nao existe outra forma de virar ADMIN a nao ser ja sendo um)
    if (id === usuarioLogado.id) {
      throw new ConflictException('Você não pode desativar a sua própria conta');
    }

    if (!forcar) {
      const disputas = await this.contarDisputas(id);
      if (disputas > 0) {
        throw new ConflictException(
          `Este usuário está disputando ${disputas} peça(s) em leilões em andamento. Desative depois do encerramento ou, em caso de fraude, use forcar=true (os lances dele serão pulados no fechamento).`,
        );
      }

      // Vendedor com leilao em andamento: sem ele, ninguem conduz o leilao (que continuaria aberto e recebendo lances)
      const leiloesEmAndamento = await this.contarLeiloesEmAndamento(id);
      if (leiloesEmAndamento > 0) {
        throw new ConflictException(
          `Este usuário é dono de ${leiloesEmAndamento} leilão(ões) em andamento (aberto ou agendado). Encerre ou cancele antes de desativar ou, em caso de fraude, use forcar=true (os leilões seguem e fecham pelo horário).`,
        );
      }
    }

    // Desativar também derruba as sessões na hora (o token já deixaria de valer pela conferência de "ativo", mas assim
    // não sobra sessão viva no banco esperando uma tentativa de renovar)
    const [desativado] = await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { ativo: false } }),
      this.prisma.session.updateMany({ where: { usuarioId: id, revogadaEm: null }, data: { revogadaEm: new Date() } }),
    ]);
    return desativado;
  }

  // 🔎 ENCERRAR A PROPRIA CONTA (LGPD: direito ao apagamento). O historico (lances, leiloes, pedidos, auditoria) nao pode sumir
  // -- e imutavel e outras pessoas dependem dele --, entao os DADOS PESSOAIS sao anonimizados: nome, e-mail, telefone, CPF,
  // endereco e avatar. A conta fica inativa, sem senha utilizavel e sem sessoes, e o nome que aparece nos historicos vira
  // "Usuario removido". Exige a senha atual e nao pode haver pendencias (disputa, leilao em andamento ou pedido nao finalizado)
  async encerrarConta(id: string, senhaAtual: string): Promise<void> {
    const usuario = await this.buscarPorIdOuFalhar(id);
    if (usuario.papel === 'ADMIN') {
      throw new ForbiddenException('Administradores não encerram a própria conta por aqui (a equipe precisa de ao menos um ADMIN)');
    }
    if (!(await bcrypt.compare(senhaAtual, usuario.senha))) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const disputas = await this.contarDisputas(id);
    const leiloes = await this.contarLeiloesEmAndamento(id);
    const pedidos = await this.prisma.pedido.count({
      where: {
        status: { not: 'FINALIZADO' },
        OR: [{ compradorId: id }, { item: { leilao: { vendedorId: id } } }],
      },
    });
    const pendencias: string[] = [];
    if (disputas > 0) pendencias.push(`${disputas} peça(s) em disputa`);
    if (leiloes > 0) pendencias.push(`${leiloes} leilão(ões) em andamento`);
    if (pedidos > 0) pendencias.push(`${pedidos} pedido(s) não finalizado(s)`);
    if (pendencias.length > 0) {
      throw new ConflictException(`Não é possível encerrar a conta agora: ${pendencias.join(', ')}. Conclua ou aguarde o encerramento e tente de novo.`);
    }

    const senhaInutilizavel = await bcrypt.hash(randomBytes(32).toString('hex'), CUSTO_DO_HASH); // ninguem sabe: o login fica impossivel
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: {
          nome: 'Usuário removido',
          email: `removido.${id}@removido.invalid`,
          senha: senhaInutilizavel,
          telefone: null,
          cpf: null,
          endereco: null,
          avatarUrl: null,
          ativo: false,
        },
      }),
      this.prisma.session.updateMany({ where: { usuarioId: id, revogadaEm: null }, data: { revogadaEm: new Date() } }),
      this.prisma.passwordReset.deleteMany({ where: { usuarioId: id } }),
    ]);
  }

  private contarDisputas(id: string): Promise<number> {
    return this.prisma.auctionItem.count({
      where: { status: 'AVAILABLE', leilao: { status: { in: ['OPEN', 'SCHEDULED'] } }, lances: { some: { licitanteId: id } } },
    });
  }

  private contarLeiloesEmAndamento(id: string): Promise<number> {
    return this.prisma.auction.count({ where: { vendedorId: id, status: { in: ['OPEN', 'SCHEDULED'] } } });
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
        throw new ConflictException(`E-mail já cadastrado: ${dados.email}`);
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
