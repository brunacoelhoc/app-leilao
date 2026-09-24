import { ApiProperty } from '@nestjs/swagger';

export class RequisitoVendedor {
  @ApiProperty({ example: 'telefone' }) campo: string;
  @ApiProperty({ example: 'Telefone' }) rotulo: string;
  @ApiProperty() ok: boolean;
  @ApiProperty({ example: 'Informe seu telefone no perfil', description: 'O que fazer quando ok=false' }) ajuda: string;
}

export class RequisitosVendedorResposta {
  @ApiProperty({ description: 'true = a conta ja e de vendedor' }) jaEVendedor: boolean;
  @ApiProperty({ description: 'true = o botao "Quero vender" vai funcionar agora' }) podeSolicitar: boolean;
  @ApiProperty({ type: RequisitoVendedor, isArray: true }) requisitos: RequisitoVendedor[];
}
