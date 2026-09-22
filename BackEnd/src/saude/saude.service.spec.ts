import { ServiceUnavailableException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { SaudeService } from './saude.service';

// Cria um PrismaService falso: so precisa do $queryRaw, que e o que o SaudeService usa
function criarPrismaFalso(consulta: jest.Mock): PrismaService {
  return { $queryRaw: consulta } as unknown as PrismaService;
}

describe('SaudeService', () => {
  it('responde ok quando o banco responde', async () => {
    const consulta = jest.fn().mockResolvedValue([{ ok: 1 }]);
    const service = new SaudeService(criarPrismaFalso(consulta));

    const resultado = await service.verificar();

    expect(resultado.status).toBe('ok');
    expect(resultado.banco).toBe('conectado');
    expect(consulta).toHaveBeenCalledTimes(1);
  });

  it('lanca 503 quando o banco falha', async () => {
    const consulta = jest.fn().mockRejectedValue(new Error('banco caiu'));
    const service = new SaudeService(criarPrismaFalso(consulta));

    await expect(service.verificar()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
