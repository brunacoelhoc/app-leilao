import { IsEnum, IsNotEmpty, MaxLength, ValidateIf } from 'class-validator';
import { AuctionStatus } from '../../generated/prisma/client';

export class MudarStatusDto {
  @IsEnum(AuctionStatus, {
    message: `status deve ser um destes: ${Object.values(AuctionStatus).join(', ')}`,
  })
  status: AuctionStatus;

  // @ValidateIf ja torna o campo "opcional" quando a condicao e falsa (nao
  // precisa de @IsOptional aqui -- ele atrapalharia o @IsNotEmpty quando cancelar)
  @MaxLength(300, { message: 'motivo deve ter no máximo 300 caracteres' })
  @ValidateIf((dto: MudarStatusDto) => dto.status === AuctionStatus.CANCELED)
  @IsNotEmpty({ message: 'motivo e obrigatório para cancelar um leilão' })
  motivo?: string;
}
