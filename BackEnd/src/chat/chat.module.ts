import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule], // por causa do JwtAuthGuard
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
