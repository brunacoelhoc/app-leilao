import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuctionsController } from './auctions.controller';
import { AuctionsService } from './auctions.service';

@Module({
  imports: [AuthModule, AuditModule], // AuthModule pelo JwtAuthGuard, AuditModule pelo AuditLogService
  controllers: [AuctionsController],
  providers: [AuctionsService],
})
export class AuctionsModule {}
