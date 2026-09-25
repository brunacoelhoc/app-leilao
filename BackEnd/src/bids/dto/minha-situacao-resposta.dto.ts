import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// O que ESTE usuario pode fazer nesta peca. A tela so exibe: quem decide e o servidor
export class MinhaSituacaoResposta {
  @ApiProperty({ description: 'true = pode dar lance agora' })
  permitido: boolean;

  @ApiPropertyOptional({
    nullable: true,
    enum: ['ADMIN', 'MODO_VENDEDOR', 'DONO', 'PERFIL_INCOMPLETO', 'LEILAO_FECHADO', 'ITEM_INDISPONIVEL', 'JA_LIDERA'],
    description: 'Por que NAO pode (null quando pode). JA_LIDERA = o proprio lance ja e o maior',
  })
  motivo: 'ADMIN' | 'MODO_VENDEDOR' | 'DONO' | 'PERFIL_INCOMPLETO' | 'LEILAO_FECHADO' | 'ITEM_INDISPONIVEL' | 'JA_LIDERA' | null;

  @ApiPropertyOptional({ nullable: true, description: 'Texto pronto para exibir (null quando pode)' })
  mensagem: string | null;

  @ApiProperty({ description: 'Eu sou o dono do leilao desta peca' })
  euSouDono: boolean;

  @ApiProperty({ description: 'Eu venci esta peca' })
  euSouVencedor: boolean;
}
