import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionStatus } from '../../generated/prisma/client';

// Formato real da resposta de um leilao -- so para o Swagger documentar o
// schema; o service continua devolvendo o objeto do Prisma direto
export class AuctionResposta {
  @ApiProperty({ example: '8e9d06c4-98be-4ef2-950e-1e2a71408212' })
  id: string;

  @ApiProperty({ example: 'Leilão de Arte' })
  titulo: string;

  @ApiPropertyOptional({ nullable: true, example: 'Peças selecionadas de um colecionador' })
  descricao: string | null;

  @ApiProperty({ enum: AuctionStatus, example: AuctionStatus.DRAFT })
  status: AuctionStatus;

  @ApiProperty()
  dataInicio: Date;

  @ApiProperty()
  dataFim: Date;

  @ApiProperty({ description: 'Id do usuario SELLER dono do leilao' })
  vendedorId: string;

  @ApiProperty({ enum: AuctionStatus, isArray: true, description: 'Estados para os quais o leilao PODE ir agora (regra da maquina de estados, decidida pelo backend)' })
  transicoesPermitidas: AuctionStatus[];

  @ApiProperty({ description: 'true quando o leilao ainda pode ser editado, ter itens alterados e ser removido (so em rascunho). Decidido pelo backend' })
  editavel: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Id da foto de capa (so na listagem); baixe em GET /documents/:id/download' })
  capaDocumentoId?: string | null;

  @ApiPropertyOptional({ description: 'Caminho de uma obra do acervo para usar quando nao ha foto enviada (escolhida pelo servidor)' })
  capaPadrao?: string;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;
}
