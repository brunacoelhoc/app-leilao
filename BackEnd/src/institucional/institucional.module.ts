import { Module } from '@nestjs/common';
import { InstitucionalController } from './institucional.controller';

@Module({ controllers: [InstitucionalController] })
export class InstitucionalModule {}
