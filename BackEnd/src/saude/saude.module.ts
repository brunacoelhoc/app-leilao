import { Module } from '@nestjs/common';
import { SaudeController } from './saude.controller';
import { SaudeService } from './saude.service';

// Agrupa a rota de saude. O PrismaService vem do PrismaModule, que e global
@Module({
  controllers: [SaudeController],
  providers: [SaudeService],
})
export class SaudeModule {}
