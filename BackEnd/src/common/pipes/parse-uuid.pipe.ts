import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

// Mesmo ParseUUIDPipe do Nest, so que com a mensagem em portugues
export const ParseUuidPipePt = new ParseUUIDPipe({
  exceptionFactory: () => new BadRequestException('id deve ser um uuid válido'),
});
