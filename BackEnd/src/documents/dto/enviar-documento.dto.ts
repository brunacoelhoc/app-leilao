import { IsEnum, IsNotEmpty } from 'class-validator';
import { DocumentType } from '../../generated/prisma/client';

// O arquivo em si vem separado (multipart/form-data, campo "arquivo"),
// esse DTO so cuida do resto dos campos do formulario
export class EnviarDocumentoDto {
  @IsEnum(DocumentType, {
    message: `tipo deve ser um destes: ${Object.values(DocumentType).join(', ')}`,
  })
  @IsNotEmpty({ message: 'tipo e obrigatório' })
  tipo: DocumentType;
}
