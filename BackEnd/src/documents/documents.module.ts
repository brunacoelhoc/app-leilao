import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [AuthModule, AuditModule], // AuthModule pelo JwtAuthGuard, AuditModule pelo AuditLogService
  controllers: [DocumentsController],
  providers: [DocumentsService],
})
export class DocumentsModule {}
