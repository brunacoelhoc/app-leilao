import { ApiProperty } from '@nestjs/swagger';

// Uma obra do acervo (obras de dominio publico que podem servir de foto para uma peca)
export class ObraAcervoResposta {
  @ApiProperty({ example: 'noite-estrelada.jpg', description: 'Nome do arquivo da imagem (pasta /acervo do front)' })
  arquivo: string;
  @ApiProperty({ example: 'A Noite Estrelada' }) titulo: string;
  @ApiProperty({ example: 'Vincent van Gogh' }) autor: string;
  @ApiProperty({ example: '1889' }) ano: string;
  @ApiProperty({ description: 'Pagina da obra no Wikimedia Commons (credito)' }) fonte: string;
}
