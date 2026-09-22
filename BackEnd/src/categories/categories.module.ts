import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [AuthModule], // precisa do AuthModule por causa do JwtAuthGuard (ver passo 3.5)
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
