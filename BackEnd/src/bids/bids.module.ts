import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { BidsController } from './bids.controller';
import { BidsService } from './bids.service';

@Module({
  imports: [AuthModule, AuditModule], // AuthModule por causa do JwtAuthGuard, AuditModule pelo AuditLogService
  controllers: [BidsController],
  providers: [BidsService],
})
export class BidsModule {}
