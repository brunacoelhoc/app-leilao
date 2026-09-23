import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CepController } from './cep.controller';
import { CepService } from './cep.service';

@Module({
  imports: [
    // URL base e timeout vem do .env -- o CepService so usa caminhos relativos
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        baseURL: config.getOrThrow<string>('CEP_API_URL'),
        timeout: config.getOrThrow<number>('CEP_API_TIMEOUT_MS'),
      }),
    }),
  ],
  controllers: [CepController],
  providers: [CepService],
  exports: [CepService],
})
export class CepModule {}
