import { PartialType } from '@nestjs/mapped-types';
import { CriarAuctionDto } from './criar-auction.dto';

// Todos os campos opcionais. So pode ser usado enquanto o leilao esta em DRAFT
// (regra conferida no service, nao aqui)
export class AtualizarAuctionDto extends PartialType(CriarAuctionDto) {}
