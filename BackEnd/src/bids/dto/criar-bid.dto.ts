import { IsNumber, IsPositive, Max } from 'class-validator';
import { VALOR_MAXIMO } from '../../common/utils/valor-maximo';

export class CriarBidDto {
  @Max(VALOR_MAXIMO, { message: 'valor deve ser no máximo 9.999.999.999,99' })
  @IsPositive({ message: 'valor deve ser maior que zero' })
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'valor deve ser um numero com ate 2 casas decimais' },
  )
  valor: number;
}
