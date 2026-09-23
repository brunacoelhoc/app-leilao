import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Formato real da resposta de uma categoria -- so para o Swagger
// documentar o schema; o service continua devolvendo o objeto do Prisma
// direto, que bate estruturalmente com esta classe (mesmos nomes/tipos de campo)
export class CategoriaResposta {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: 'Pintura' })
  nome: string;

  @ApiPropertyOptional({ example: 'Quadros e telas de todas as epocas', nullable: true })
  descricao: string | null;

  @ApiProperty()
  criadoEm: Date;

  @ApiProperty()
  atualizadoEm: Date;
}
