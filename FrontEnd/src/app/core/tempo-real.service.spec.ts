import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { TempoRealService } from './tempo-real.service';

// Socket falso: guarda os "ouvintes" para o teste disparar os eventos (connect, lance-novo...)
const { criados } = vi.hoisted(() => ({
  criados: [] as { ouvintes: Record<string, (dados?: unknown) => void>; emit: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[],
}));
vi.mock('socket.io-client', () => ({
  io: () => {
    const socket = {
      ouvintes: {} as Record<string, (dados?: unknown) => void>,
      on(evento: string, ouvinte: (dados?: unknown) => void) {
        socket.ouvintes[evento] = ouvinte;
      },
      emit: vi.fn(),
      disconnect: vi.fn(),
    };
    criados.push(socket);
    return socket;
  },
}));

describe('TempoRealService.observarItem', () => {
  beforeEach(() => {
    criados.length = 0;
    TestBed.resetTestingModule();
  });

  it('entra na sala do item ao conectar e NAO avisa "reconectado" na primeira conexao', () => {
    const eventos: unknown[] = [];
    TestBed.inject(TempoRealService)
      .observarItem('item-1')
      .subscribe((e) => eventos.push(e));

    criados[0].ouvintes['connect']();
    expect(criados[0].emit).toHaveBeenCalledWith('entrar-item', 'item-1');
    expect(eventos).toEqual([]);
  });

  it('quando a conexao cai e VOLTA, reentra na sala e avisa a tela para se ressincronizar', () => {
    const eventos: unknown[] = [];
    TestBed.inject(TempoRealService)
      .observarItem('item-1')
      .subscribe((e) => eventos.push(e));

    criados[0].ouvintes['connect'](); // primeira conexao
    criados[0].ouvintes['connect'](); // reconexao (o socket.io dispara "connect" de novo)

    expect(criados[0].emit).toHaveBeenCalledTimes(2); // entrou na sala nas duas vezes
    expect(eventos).toEqual([{ tipo: 'reconectado' }]);
  });

  it('avisa a tela quando o admin reativa o leilao (so do PROPRIO item)', () => {
    const eventos: unknown[] = [];
    TestBed.inject(TempoRealService)
      .observarItem('item-1')
      .subscribe((e) => eventos.push(e));

    criados[0].ouvintes['leilao-reativado']({ itemId: 'item-2' }); // de outro item: ignorado
    criados[0].ouvintes['leilao-reativado']({ itemId: 'item-1' });
    expect(eventos).toEqual([{ tipo: 'leilao-reativado' }]);
  });

  it('repassa so os eventos do PROPRIO item e desconecta ao cancelar a assinatura', () => {
    const eventos: unknown[] = [];
    const assinatura = TestBed.inject(TempoRealService)
      .observarItem('item-1')
      .subscribe((e) => eventos.push(e));

    criados[0].ouvintes['lance-novo']({ lance: { itemId: 'item-2' } }); // de outro item: ignorado
    criados[0].ouvintes['lance-novo']({ lance: { itemId: 'item-1' }, lanceAtual: '150' });
    expect(eventos).toHaveLength(1);

    assinatura.unsubscribe();
    expect(criados[0].emit).toHaveBeenCalledWith('sair-item', 'item-1');
    expect(criados[0].disconnect).toHaveBeenCalled();
  });
});
