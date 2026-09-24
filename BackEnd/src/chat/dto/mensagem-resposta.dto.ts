import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Uma mensagem do chat do leilao (so para o Swagger documentar o formato)
export class MensagemResposta {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'Que peça linda!' })
  texto: string;

  @ApiProperty()
  leilaoId: string;

  @ApiProperty()
  autorId: string;

  @ApiProperty({ example: 'Maria Silva' })
  autorNome: string;

  @ApiProperty({ example: 'BIDDER' })
  autorPapel: string;

  @ApiPropertyOptional({ nullable: true, example: 'raposa', description: 'Avatar pronto do usuario (imagens grandes nao vao no chat)' })
  autorAvatar: string | null;

  @ApiProperty()
  criadoEm: Date;
}
