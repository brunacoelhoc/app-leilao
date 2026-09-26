import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiSecurity, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ErroResposta } from '../common/dto/erro-resposta.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';

@ApiExcludeController()
@ApiTags('Admin')
@ApiSecurity('api-key')
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('resumo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth('jwt')
  @ApiOperation({ summary: 'Totais da plataforma para o painel de administração (só ADMIN)' })
  @ApiOkResponse({ description: 'Quantidade de categorias, usuários e leilões', schema: { example: { categorias: 26, usuarios: 27, leiloes: 40 } } })
  @ApiForbiddenResponse({ description: 'Autenticado, mas não é ADMIN', type: ErroResposta })
  async resumo(): Promise<{ categorias: number; usuarios: number; leiloes: number }> {
    const [categorias, usuarios, leiloes] = await Promise.all([
      this.prisma.category.count(),
      this.prisma.user.count(),
      this.prisma.auction.count(),
    ]);
    return { categorias, usuarios, leiloes };
  }
}
