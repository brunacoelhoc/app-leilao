import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';
import { FormaPagamento, PedidoStatus, TipoEntrega } from '../../generated/prisma/client';

export class PagarPedidoDto {
  @ApiProperty({ enum: FormaPagamento, example: 'PIX', description: 'Forma de pagamento (o pagamento e SIMULADO)' })
  @IsEnum(FormaPagamento, { message: 'formaPagamento deve ser PIX, CARTAO ou BOLETO' })
  formaPagamento: FormaPagamento;
}

export class DefinirEntregaDto {
  @ApiProperty({ enum: TipoEntrega, example: 'RETIRADA', description: 'RETIRADA busca no local da peca; ENTREGA envia ao endereco informado' })
  @IsEnum(TipoEntrega, { message: 'tipoEntrega deve ser RETIRADA ou ENTREGA' })
  tipoEntrega: TipoEntrega;

  @ApiPropertyOptional({ example: 'Rua das Flores, 100 - Centro - Sao Paulo/SP', description: 'Obrigatorio quando tipoEntrega = ENTREGA' })
  @ValidateIf((dto: DefinirEntregaDto) => dto.tipoEntrega === TipoEntrega.ENTREGA)
  @IsString({ message: 'enderecoEntrega deve ser um texto' })
  @IsNotEmpty({ message: 'Informe o endereco de entrega' })
  @MaxLength(300, { message: 'enderecoEntrega deve ter no maximo 300 caracteres' })
  enderecoEntrega?: string;
}

export class PedidoResposta {
  @ApiPropertyOptional({ nullable: true, description: 'Vazio ate o pedido ser criado (no pagamento)' }) id: string | null;
  @ApiProperty() itemId: string;
  @ApiProperty({ example: '1050.00', description: 'Valor do lance vencedor (string)' }) valor: string;
  @ApiProperty({ enum: PedidoStatus }) status: PedidoStatus;
  @ApiPropertyOptional({ enum: FormaPagamento, nullable: true }) formaPagamento: FormaPagamento | null;
  @ApiPropertyOptional({ nullable: true }) pagoEm: Date | null;
  @ApiPropertyOptional({ enum: TipoEntrega, nullable: true }) tipoEntrega: TipoEntrega | null;
  @ApiPropertyOptional({ nullable: true }) enderecoEntrega: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Codigo a apresentar na retirada' }) codigoRetirada: string | null;
  @ApiProperty({ description: 'Onde retirar (cidade/UF e CEP da peca)' }) localRetirada: string;
}
