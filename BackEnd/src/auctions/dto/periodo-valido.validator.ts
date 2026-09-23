import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

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
