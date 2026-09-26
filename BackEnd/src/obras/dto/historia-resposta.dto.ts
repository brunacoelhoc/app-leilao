import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ObraHistoriaResposta {
  @ApiProperty({ example: 'Mona Lisa' }) titulo: string;
  @ApiProperty({ example: 'Leonardo da Vinci' }) artista: string;
  @ApiProperty({ example: 'c. 1503' }) ano: string;
  @ApiProperty({ example: 'Alto Renascimento' }) movimento: string;
  @ApiProperty({ example: 'Museu do Louvre, Paris' }) localAtual: string;
  @ApiProperty({ description: 'A história da obra' }) historia: string;
  @ApiProperty() contextoHistorico: string;
  @ApiProperty() contextoFilosofico: string;
  @ApiProperty() contextoSocial: string;
  @ApiProperty() curiosidade: string;
  @ApiProperty({ example: 'REPRODUCAO', description: 'REPRODUCAO = a peça é uma cópia de demonstração de uma obra de domínio público' })
  autenticidade: 'REPRODUCAO';
  @ApiProperty({ description: 'Texto pronto sobre a autenticidade da peça' }) autenticidadeTexto: string;
}

export class HistoriaPecaResposta {
  @ApiProperty({ enum: ['OBRA_DO_ACERVO', 'FICHA_DA_PECA'], description: 'OBRA_DO_ACERVO = a foto é uma obra conhecida; FICHA_DA_PECA = só os dados que o vendedor informou' })
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
