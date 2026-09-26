import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  @MaxLength(200, { message: 'refreshToken inválido' })
  @IsString({ message: 'refreshToken deve ser um texto' })
  @IsNotEmpty({ message: 'refreshToken e obrigatório' })
  refreshToken: string;
}
