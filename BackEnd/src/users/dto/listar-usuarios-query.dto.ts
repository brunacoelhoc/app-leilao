import { IsBooleanString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginacaoQueryDto } from '../../common/dto/paginacao-query.dto';
import { Role } from '../../generated/prisma/client';

// Filtros opcionais de GET /users. Query string chega sempre como texto,
// por isso "ativo" e validado como "true"/"false" (string), nao boolean
export class ListarUsuariosQueryDto extends PaginacaoQueryDto {
  @IsOptional()
  @IsEnum(Role, {
    message: `papel deve ser um destes: ${Object.values(Role).join(', ')}`,
  })
  papel?: Role;

  @IsOptional()
  @IsBooleanString({ message: 'ativo deve ser "true" ou "false"' })
  ativo?: string;

  // Trecho do nome ou do e-mail (sem diferenciar maiusculas)
  @IsOptional()
  @MaxLength(100, { message: 'busca deve ter no maximo 100 caracteres' })
  @IsString({ message: 'busca deve ser um texto' })
  busca?: string;
}
