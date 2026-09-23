import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  imports: [AuthModule, AuditModule], // AuthModule pelo JwtAuthGuard, AuditModule pelo AuditLogService
  controllers: [CategoriesController],
  providers: [CategoriesService],
})
export class CategoriesModule {}
