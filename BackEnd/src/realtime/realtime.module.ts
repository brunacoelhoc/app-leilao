import { Global, Module } from '@nestjs/common';
import { LancesGateway } from './lances.gateway';

// Global: qualquer modulo (lances, leiloes) injeta o gateway sem importar de novo
@Global()
@Module({
  providers: [LancesGateway],
  exports: [LancesGateway],
})
export class RealtimeModule {}
