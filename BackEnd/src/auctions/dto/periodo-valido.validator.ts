import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

// Um leilao dura no maximo 48 horas (2 dias) entre dataInicio e dataFim.
// So vale ao criar/editar: o anti-sniping pode estender o prazo depois de aberto
export const DURACAO_MAXIMA_HORAS = 48;
const DURACAO_MAXIMA_MS = DURACAO_MAXIMA_HORAS * 60 * 60 * 1000;

export function excedeDuracaoMaxima(inicio: Date, fim: Date): boolean {
  return fim.getTime() - inicio.getTime() > DURACAO_MAXIMA_MS;
}

// Mesma ideia do DataDepoisDe: 400 amigavel se o periodo passar de 48 horas
export function DuracaoMaximaDe(nomeDoOutroCampo: string, opcoes?: ValidationOptions) {
  return function (objeto: object, nomeDaPropriedade: string) {
    registerDecorator({
      name: 'duracaoMaximaDe',
      target: objeto.constructor,
      propertyName: nomeDaPropriedade,
      constraints: [nomeDoOutroCampo],
      options: opcoes,
      validator: {
        validate(valor: unknown, args: ValidationArguments) {
          const [outroCampo] = args.constraints as [string];
          const valorDoOutroCampo = (args.object as Record<string, unknown>)[outroCampo];
          if (!valor || !valorDoOutroCampo) return true;
          const fim = new Date(valor as string);
          const inicio = new Date(valorDoOutroCampo as string);
          if (Number.isNaN(fim.getTime()) || Number.isNaN(inicio.getTime())) return true; // outro validador cobre
          return !excedeDuracaoMaxima(inicio, fim);
        },
        defaultMessage() {
          return `O leilao pode durar no maximo ${DURACAO_MAXIMA_HORAS} horas (2 dias)`;
        },
      },
    });
  };
}

// Validador customizado: confere se este campo (dataFim) e uma data DEPOIS
// do campo indicado (dataInicio). Da um 400 amigavel na hora, sem precisar
// tentar gravar no banco (o CHECK do banco continua la, como ultima defesa)
export function DataDepoisDe(
  nomeDoOutroCampo: string,
  opcoes?: ValidationOptions,
) {
  return function (objeto: object, nomeDaPropriedade: string) {
    registerDecorator({
      name: 'dataDepoisDe',
      target: objeto.constructor,
      propertyName: nomeDaPropriedade,
      constraints: [nomeDoOutroCampo],
      options: opcoes,
      validator: {
        validate(valor: unknown, args: ValidationArguments) {
          const [outroCampo] = args.constraints as [string];
          const valorDoOutroCampo = (args.object as Record<string, unknown>)[
            outroCampo
          ];

          // So valida se os dois campos vieram preenchidos (numa edicao
          // parcial, so um dos dois pode vir; o banco (CHECK) cobre esse caso)
          if (!valor || !valorDoOutroCampo) return true;

          return new Date(valor as string) > new Date(valorDoOutroCampo as string);
        },
        defaultMessage(args: ValidationArguments) {
          const [outroCampo] = args.constraints as [string];
          return `${args.property} deve ser uma data depois de ${outroCampo}`;
        },
      },
    });
  };
}
