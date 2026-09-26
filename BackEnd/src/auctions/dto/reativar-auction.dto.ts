import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReativarAuctionDto {
  @MaxLength(300, { message: 'motivo deve ter no máximo 300 caracteres' })
  @IsString({ message: 'motivo deve ser um texto' })
  @IsNotEmpty({ message: 'motivo é obrigatório para reativar um leilão' })
  motivo: string;
}
