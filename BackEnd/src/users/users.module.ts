import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

// Exporta o UsersService para o AuthModule (e outros) poderem usar
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
