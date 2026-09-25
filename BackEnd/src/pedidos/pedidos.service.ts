import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemStatus, Pedido, PedidoStatus, TipoEntrega } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioAutenticado } from '../common/interfaces/usuario-autenticado.interface';
import { DefinirEntregaDto, PagarPedidoDto, PedidoResposta } from './dto/pedido.dto';

// 🔎 Pos-leilao: so o VENCEDOR de um item VENDIDO mexe no pedido, e em ordem:
// 1) paga (simulado)  2) escolhe retirada ou entrega. Pular etapa -> 409.
@Injectable()
export class PedidosService {
  constructor(private readonly prisma: PrismaService) {}

  // Devolve o pedido do vencedor; cria na primeira consulta (AGUARDANDO_PAGAMENTO)
  async obter(itemId: string, usuario: UsuarioAutenticado): Promise<PedidoResposta> {
    const item = await this.itemDoVencedor(itemId, usuario);
    const pedido = await this.prisma.pedido.upsert({
      where: { itemId },
      update: {},
      create: { itemId, compradorId: usuario.id, valor: item.lanceAtual! },
    });
    return this.montarResposta(pedido, item);
  }

  async pagar(itemId: string, dto: PagarPedidoDto, usuario: UsuarioAutenticado): Promise<PedidoResposta> {
    const item = await this.itemDoVencedor(itemId, usuario);
    const pedido = await this.prisma.pedido.upsert({
      where: { itemId },
      update: {},
      create: { itemId, compradorId: usuario.id, valor: item.lanceAtual! },
    });
    if (pedido.status !== PedidoStatus.AGUARDANDO_PAGAMENTO) {
      throw new ConflictException('Este pedido ja foi pago');
    }
    const atualizado = await this.prisma.pedido.update({
      where: { id: pedido.id },
      data: { status: PedidoStatus.PAGO, formaPagamento: dto.formaPagamento, pagoEm: new Date() },
    });
    return this.montarResposta(atualizado, item);
  }

  async definirEntrega(itemId: string, dto: DefinirEntregaDto, usuario: UsuarioAutenticado): Promise<PedidoResposta> {
    const item = await this.itemDoVencedor(itemId, usuario);
    const pedido = await this.prisma.pedido.findUnique({ where: { itemId } });
    if (!pedido || pedido.status === PedidoStatus.AGUARDANDO_PAGAMENTO) {
      throw new ConflictException('Pague o pedido antes de escolher a retirada ou a entrega');
    }
    if (pedido.status === PedidoStatus.FINALIZADO) {
      throw new ConflictException('A retirada/entrega deste pedido ja foi definida');
    }
    const retirada = dto.tipoEntrega === TipoEntrega.RETIRADA;
    const atualizado = await this.prisma.pedido.update({
      where: { id: pedido.id },
      data: {
        status: PedidoStatus.FINALIZADO,
        tipoEntrega: dto.tipoEntrega,
        enderecoEntrega: retirada ? null : dto.enderecoEntrega!.trim(),
        // Codigo curto e legivel (sem letras que se confundem) para apresentar na retirada
        codigoRetirada: retirada ? randomBytes(4).toString('hex').toUpperCase() : null,
      },
    });
    return this.montarResposta(atualizado, item);
  }

  // Regras de acesso: item existe, esta VENDIDO e quem chama e o vencedor
  private async itemDoVencedor(itemId: string, usuario: UsuarioAutenticado) {
    const item = await this.prisma.auctionItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item nao encontrado');
    if (item.status !== ItemStatus.SOLD || !item.lanceAtual) {
      throw new ConflictException('Este item ainda nao foi vendido');
    }
    if (item.vencedorId !== usuario.id) {
      throw new ForbiddenException('So o vencedor do item acessa o pagamento e a retirada');
    }
    return item;
  }

  private montarResposta(
    pedido: Pedido,
    item: { cidade: string | null; uf: string | null; cep: string },
  ): PedidoResposta {
    const cidade = item.cidade && item.uf ? `${item.cidade}/${item.uf}` : 'endereco do vendedor';
    return {
      id: pedido.id,
      itemId: pedido.itemId,
      valor: pedido.valor.toFixed(2),
      status: pedido.status,
      formaPagamento: pedido.formaPagamento,
      pagoEm: pedido.pagoEm,
      tipoEntrega: pedido.tipoEntrega,
      enderecoEntrega: pedido.enderecoEntrega,
      codigoRetirada: pedido.codigoRetirada,
      localRetirada: `${cidade} (CEP ${item.cep})`,
    };
  }
}
