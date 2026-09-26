import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuctionStatus } from '../generated/prisma/client';

// Card do carrossel da pagina inicial (tudo calculado pelo servidor)
export class DestaqueResposta {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Leilão de Arte Clássica' })
  titulo: string;

  @ApiPropertyOptional({ nullable: true })
  descricao: string | null;

  @ApiProperty({ enum: AuctionStatus, example: AuctionStatus.OPEN })
  status: AuctionStatus;

  @ApiProperty({ example: 'Aberto', description: 'Etiqueta pronta para exibir: Aberto, Em breve ou Encerrado' })
  etiqueta: string;

  @ApiProperty()
  dataInicio: Date;

  @ApiProperty()
  dataFim: Date;

  @ApiProperty({ example: 4 })
  totalItens: number;

  @ApiProperty({ example: 17 })
  totalLances: number;

  @ApiPropertyOptional({ nullable: true, example: '2500', description: 'Maior lance entre os itens (null se nenhum lance)' })
  maiorLance: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Id de uma foto (PHOTO) do leilão para usar de capa; null se nenhum item tem foto' })
  capaDocumentoId: string | null;

  @ApiProperty({ description: 'Caminho de uma obra do acervo para usar quando não há foto enviada' })
  capaPadrao: string;

  @ApiProperty({ example: 'Participar', description: 'Texto do botão do card: "Ver resultado" se encerrado, senão "Participar"' })
  rotuloAcao: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Preenchido só quando o leilão tem exatamente 1 item: "Participar" leva direto para a sala dele',
  })
  itemUnicoId: string | null;
}
