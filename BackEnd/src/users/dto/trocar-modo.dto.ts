import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// O modo e o proprio papel da conta: BIDDER (compra) ou SELLER (vende). ADMIN nunca troca.
export class TrocarModoDto {
  @ApiProperty({ enum: ['BIDDER', 'SELLER'], example: 'SELLER' })
  @IsIn(['BIDDER', 'SELLER'], { message: 'modo deve ser BIDDER ou SELLER' })
  modo: 'BIDDER' | 'SELLER';
}
