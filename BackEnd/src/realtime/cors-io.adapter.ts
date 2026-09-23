import type { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

// O Socket.io tem o proprio CORS (o enableCors do Nest nao vale para ele).
// Aqui usamos a mesma FRONTEND_URL do resto da API
export class CorsIoAdapter extends IoAdapter {
  constructor(private readonly contexto: INestApplicationContext) {
    super(contexto);
  }

  createIOServer(porta: number, opcoes?: ServerOptions) {
    const origem = this.contexto.get(ConfigService).get<string>('FRONTEND_URL');
    return super.createIOServer(porta, {
      ...opcoes,
      cors: { origin: origem, credentials: true },
    } as ServerOptions);
  }
}
