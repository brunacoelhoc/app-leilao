import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';

export class EsqueciSenhaDto {
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail({}, { message: 'email deve ser um e-mail valido' })
  @MaxLength(180, { message: 'email deve ter no maximo 180 caracteres' })
  email: string;
}
