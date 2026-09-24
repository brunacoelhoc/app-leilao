import { Module } from '@nestjs/common';
import { AcervoController } from './acervo.controller';
import { ObrasController } from './obras.controller';
import { ObrasService } from './obras.service';

@Module({ controllers: [ObrasController, AcervoController], providers: [ObrasService] })
export class ObrasModule {}
