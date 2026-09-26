import { IsNotEmpty, Matches, MinLength } from 'class-validator';

// PATCH /users/me/senha -- exige a senha atual (confere no service via
// bcrypt.compare) para trocar, mesma regra de forca da senha do registro
export class AlterarSenhaDto {
  @IsNotEmpty({ message: 'senhaAtual e obrigatória' })
  senhaAtual: string;

  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'A nova senha não segue o padrão exigido: use letra maiúscula, minúscula, número e caractere especial',
  })
  @MinLength(8, { message: 'novaSenha deve ter no mínimo 8 caracteres' })
  @IsNotEmpty({ message: 'novaSenha e obrigatória' })
  novaSenha: string;
}
