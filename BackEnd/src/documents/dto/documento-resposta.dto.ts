import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../generated/prisma/client';

// Formato real da resposta de um documento/foto -- so para o Swagger
// documentar o schema; o service continua devolvendo o objeto do Prisma direto
export class DocumentoResposta {
  @ApiProperty({ example: '2f0e1a3b-4c5d-6e7f-8091-a2b3c4d5e6f7' })
  id: string;

  @ApiProperty({ enum: DocumentType, example: DocumentType.PHOTO })
  tipo: DocumentType;

  @ApiProperty({ example: 'foto-original.jpg', description: 'Nome que o arquivo tinha no computador de quem enviou' })
  nomeOriginal: string;

  @ApiPropertyOptional({ description: 'Nome seguro (UUID) usado para salvar em disco. Só vem na resposta do envio (para quem enviou), nunca na listagem pública' })
  nomeArquivo: string;

  @ApiProperty({ example: 'image/jpeg' })
  mimeType: string;

  @ApiProperty({ example: 245678, description: 'Tamanho em bytes' })
  tamanho: number;

  @ApiProperty({ description: 'Impressao digital SHA-256, prova que o arquivo não foi alterado' })
  hash: string;

  @ApiProperty({ description: 'Id do item a que este documento pertence' })
  itemId: string;

  @ApiPropertyOptional({ description: 'Id de quem enviou. Só vem na resposta do envio, nunca na listagem pública' })
  enviadoPorId: string;

  @ApiProperty()
  criadoEm: Date;
}
