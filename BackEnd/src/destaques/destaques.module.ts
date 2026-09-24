import { Module } from '@nestjs/common';
import { DestaquesController } from './destaques.controller';
import { DestaquesService } from './destaques.service';

@Module({
  controllers: [DestaquesController],
  providers: [DestaquesService],
})
export class DestaquesModule {}
