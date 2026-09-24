import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CriarMensagemDto {
  // Tira espacos das pontas antes de validar (mensagem so com espacos = vazia)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(300, { message: 'texto deve ter no maximo 300 caracteres' })
  @IsString({ message: 'texto deve ser um texto' })
  @IsNotEmpty({ message: 'texto e obrigatorio' })
  texto: string;
}
