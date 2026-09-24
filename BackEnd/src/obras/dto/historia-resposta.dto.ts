import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ObraHistoriaResposta {
  @ApiProperty({ example: 'Mona Lisa' }) titulo: string;
  @ApiProperty({ example: 'Leonardo da Vinci' }) artista: string;
  @ApiProperty({ example: 'c. 1503' }) ano: string;
  @ApiProperty({ example: 'Alto Renascimento' }) movimento: string;
  @ApiProperty({ example: 'Museu do Louvre, Paris' }) localAtual: string;
  @ApiProperty({ description: 'A historia da obra' }) historia: string;
  @ApiProperty() contextoHistorico: string;
  @ApiProperty() contextoFilosofico: string;
  @ApiProperty() contextoSocial: string;
  @ApiProperty() curiosidade: string;
  @ApiProperty({ example: 'REPRODUCAO', description: 'REPRODUCAO = a peca e uma copia de demonstracao de uma obra de dominio publico' })
  autenticidade: 'REPRODUCAO';
  @ApiProperty({ description: 'Texto pronto sobre a autenticidade da peca' }) autenticidadeTexto: string;
}

export class HistoriaPecaResposta {
  @ApiProperty({ enum: ['OBRA_DO_ACERVO', 'FICHA_DA_PECA'], description: 'OBRA_DO_ACERVO = a foto e uma obra conhecida; FICHA_DA_PECA = so os dados que o vendedor informou' })
  origem: 'OBRA_DO_ACERVO' | 'FICHA_DA_PECA';

  @ApiPropertyOptional({ type: ObraHistoriaResposta, nullable: true }) obra: ObraHistoriaResposta | null;

  @ApiProperty() itemId: string;
  @ApiProperty() titulo: string;
  @ApiPropertyOptional({ nullable: true }) descricao: string | null;
  @ApiPropertyOptional({ nullable: true }) autor: string | null;
  @ApiPropertyOptional({ nullable: true }) periodo: string | null;
  @ApiPropertyOptional({ nullable: true }) tecnica: string | null;
  @ApiPropertyOptional({ nullable: true }) dimensoes: string | null;
  @ApiPropertyOptional({ nullable: true }) conservacao: string | null;
  @ApiPropertyOptional({ nullable: true }) procedencia: string | null;
}
