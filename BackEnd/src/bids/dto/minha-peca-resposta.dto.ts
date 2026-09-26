import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MinhaPecaItem {
  @ApiProperty() id: string;
  @ApiProperty() titulo: string;
  @ApiPropertyOptional({ nullable: true }) descricao: string | null;
  @ApiProperty({ example: 'Escultura em bronze' }) leilaoTitulo: string;
  @ApiProperty() leilaoId: string;
  @ApiPropertyOptional({ nullable: true, description: 'Maior lance atual da peça (string)' }) lanceAtual: string | null;
  @ApiPropertyOptional({ nullable: true }) capaDocumentoId: string | null;
  @ApiProperty() capaPadrao: string;
}

// Um card da tela "Meus lances": resume TUDO que o usuario fez em uma peca
export class MinhaPecaResposta {
  @ApiProperty({ enum: ['ADQUIRIDAS', 'EM_DISPUTA', 'ENCERRADAS'], description: 'Em qual aba da coleção a peça aparece (decidido pelo servidor)' })
  grupo: 'ADQUIRIDAS' | 'EM_DISPUTA' | 'ENCERRADAS';

  @ApiProperty({ type: MinhaPecaItem }) item: MinhaPecaItem;

  @ApiProperty({ example: '1170.00', description: 'Maior lance que EU dei nesta peça (string)' })
  meuMaiorLance: string;

  @ApiProperty({ example: 2 }) totalMeusLances: number;
  @ApiProperty({ description: 'Quando dei o último lance nesta peça' }) ultimoLanceEm: Date;

  @ApiProperty({
    enum: ['VENCEDOR', 'LIDERANDO', 'SUPERADO', 'PERDIDO', 'CANCELADO'],
    description: 'VENCEDOR=arrematei; LIDERANDO=meu lance e o maior e o leilão segue; SUPERADO=alguém cobriu meu lance; PERDIDO=leilão terminou e outra pessoa levou; CANCELADO=leilão cancelado',
  })
  situacaoDoLance: 'VENCEDOR' | 'LIDERANDO' | 'SUPERADO' | 'PERDIDO' | 'CANCELADO';

  @ApiPropertyOptional({ nullable: true, description: 'Quando o leilão terminou (só para VENCEDOR): data e hora da aquisição' })
  adquiridoEm: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Quanto paguei (só para VENCEDOR)' })
  valorAquisicao: string | null;
}

export class ResumoColecao {
  @ApiProperty({ example: 4 }) adquiridas: number;
  @ApiProperty({ example: 2 }) emDisputa: number;
  @ApiProperty({ example: 1 }) encerradas: number;
  @ApiProperty({ example: 1 }) liderando: number;
  @ApiProperty({ example: 7 }) disputadas: number;
  @ApiProperty({ example: '9840.00', description: 'Soma do que paguei nas peças arrematadas (string)' }) totalInvestido: string;
}

export class MinhasPecasResposta {
  @ApiProperty({ type: ResumoColecao }) resumo: ResumoColecao;
  @ApiProperty({ type: MinhaPecaResposta, isArray: true }) pecas: MinhaPecaResposta[];
}
