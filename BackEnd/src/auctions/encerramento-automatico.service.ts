import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuctionStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionsService } from './auctions.service';

const INTERVALO_MS = 5000;

// 🔎 Robo que confere o relogio a cada 5s: abre os leiloes que chegaram na
// dataInicio e fecha (definindo os vencedores) os que passaram da dataFim.
// Sem isso o leilao so fecharia se alguem clicasse em "fechar"
@Injectable()
export class EncerramentoAutomaticoService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EncerramentoAutomaticoService.name);
  private temporizador?: NodeJS.Timeout;
  private executando = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auctionsService: AuctionsService,
  ) {}

  onModuleInit(): void {
    // Nos testes automatizados o robo ficaria mexendo nos dados de teste
    if (process.env.NODE_ENV === 'test') return;
    this.temporizador = setInterval(() => void this.verificar(), INTERVALO_MS);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.temporizador);
  }

  async verificar(): Promise<void> {
    if (this.executando) return; // evita rodadas sobrepostas
    this.executando = true;
    try {
      const agora = new Date();

      const paraFechar = await this.prisma.auction.findMany({
        where: { status: AuctionStatus.OPEN, dataFim: { lte: agora } },
      });
      for (const leilao of paraFechar) {
        // Um leilao que falha (ex.: alguem mudou o estado antes, 409) nao pode abortar os demais
        try {
          await this.auctionsService.aplicarMudancaStatus(
            leilao,
            AuctionStatus.CLOSED,
            leilao.vendedorId,
            'Encerrado automaticamente ao fim do prazo',
            true, // se um lance de ultima hora estendeu o prazo neste meio tempo, NAO fecha
          );
          this.logger.log(`Leilao ${leilao.id} encerrado automaticamente`);
        } catch (erro) {
          this.logger.warn(`Leilao ${leilao.id} nao encerrado agora: ${(erro as Error).message}`);
        }
      }

      const paraAbrir = await this.prisma.auction.findMany({
        where: {
          status: AuctionStatus.SCHEDULED,
          dataInicio: { lte: agora },
          dataFim: { gt: agora },
        },
      });
      for (const leilao of paraAbrir) {
        try {
          await this.auctionsService.aplicarMudancaStatus(
            leilao,
            AuctionStatus.OPEN,
            leilao.vendedorId,
            'Aberto automaticamente na data de inicio',
          );
          this.logger.log(`Leilao ${leilao.id} aberto automaticamente`);
        } catch (erro) {
          this.logger.warn(`Leilao ${leilao.id} nao aberto agora: ${(erro as Error).message}`);
        }
      }
    } catch (erro) {
      this.logger.error(`Falha na verificacao automatica: ${(erro as Error).message}`);
    } finally {
      this.executando = false;
    }
  }
}
