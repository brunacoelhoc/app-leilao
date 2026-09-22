import { Controller, Get } from '@nestjs/common';
import { SaudeService } from './saude.service';

// Rota GET /saude (tambem exige o X-API-KEY, como todas as outras)
@Controller('saude')
export class SaudeController {
  constructor(private readonly saudeService: SaudeService) {}

  @Get()
  verificar() {
    // O controller so repassa; quem trabalha e o service
    return this.saudeService.verificar();
  }
}
