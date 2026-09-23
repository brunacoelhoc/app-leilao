import { IsNumber, IsPositive } from 'class-validator';

export class CriarBidDto {
  @IsPositive({ message: 'valor deve ser maior que zero' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'valor deve ser um numero com ate 2 casas decimais' },
  )
  valor: number;
}
