import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// @Global: qualquer modulo pode usar o PrismaService sem precisar importar este modulo
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
