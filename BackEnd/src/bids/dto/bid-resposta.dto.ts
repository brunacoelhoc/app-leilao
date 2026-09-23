import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Formato real da resposta de um lance -- so para o Swagger documentar o
// schema. "valor" e "lanceAnterior" saem como STRING (nunca number), porque
// o Decimal do Prisma nao serializa direito pelo ClassSerializerInterceptor
export class BidResposta {
  @ApiProperty({ example: '1fd53fd7-66b3-4a37-bc5f-2fb0f9033407' })
  id: string;

  @ApiProperty({ example: '500.00', description: 'Decimal(12,2) do banco, sempre como string' })
  valor: string;

  @ApiPropertyOptional({ nullable: true, example: null, description: 'Lance anterior do item (null se este foi o primeiro)' })
  lanceAnterior: string | null;

  @ApiProperty({ description: 'Id do item que recebeu o lance' })
  itemId: string;

  @ApiProperty({ description: 'Id de quem deu o lance' })
  licitanteId: string;

  @ApiPropertyOptional({ nullable: true, description: 'IP de quem deu o lance (auditoria)' })
  ipOrigem: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Navegador/app usado (auditoria)' })
  userAgent: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Id da requisicao, para cruzar com os logs (auditoria)' })
  idRequisicao: string | null;

  @ApiProperty()
  criadoEm: Date;
}
