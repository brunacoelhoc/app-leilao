import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CriarAuctionItemDto } from './criar-auction-item.dto';

// Todos os campos opcionais, MENOS leilaoId: um item nao "muda de leilao"
// depois de criado. So pode ser usado enquanto o leilao ainda esta em DRAFT
export class AtualizarAuctionItemDto extends PartialType(
  OmitType(CriarAuctionItemDto, ['leilaoId'] as const),
) {}
