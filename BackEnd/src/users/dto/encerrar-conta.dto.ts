import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Encerrar a propria conta exige provar quem e: a senha atual
export class EncerrarContaDto {
  @MaxLength(200, { message: 'senhaAtual inválida' })
  @IsString({ message: 'senhaAtual deve ser um texto' })
  @IsNotEmpty({ message: 'Informe a senha atual para encerrar a conta' })
  senhaAtual: string;
}
