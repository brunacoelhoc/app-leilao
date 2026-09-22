import type { ValidationError } from '@nestjs/common';

// Percorre os erros do class-validator e devolve mensagens em portugues.
// Erros de "campo nao permitido" (extra no body) nao tem mensagem customizavel
// pelo decorator, entao traduzimos aqui
export function formatarErrosDeValidacao(erros: ValidationError[]): string[] {
  const mensagens: string[] = [];

  for (const erro of erros) {
    if (erro.constraints?.whitelistValidation) {
      mensagens.push(
        `O campo '${erro.property}' nao e reconhecido ou nao pode ser enviado nesta requisicao`,
      );
    } else if (erro.constraints) {
      mensagens.push(...Object.values(erro.constraints));
    }

    if (erro.children?.length) {
      mensagens.push(...formatarErrosDeValidacao(erro.children));
    }
  }

  return mensagens;
}
