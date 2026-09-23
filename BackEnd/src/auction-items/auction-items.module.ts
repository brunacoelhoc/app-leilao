import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CepModule } from '../cep/cep.module';
import { AuctionItemsController } from './auction-items.controller';
import { AuctionItemsService } from './auction-items.service';

@Module({
  imports: [AuthModule, CepModule, AuditModule], // AuthModule pelo JwtAuthGuard, CepModule pelo CepService, AuditModule pelo AuditLogService
  controllers: [AuctionItemsController],
  providers: [AuctionItemsService],
})
export class AuctionItemsModule {}
