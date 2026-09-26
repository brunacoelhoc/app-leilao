import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

// O Postgres não guarda o caractere nulo (\u0000) em texto: antes ele chegava ao banco e a API respondia 500.
// Nenhum campo do sistema precisa dele, então qualquer texto (corpo, query ou parâmetro) com esse caractere é 400
@Injectable()
export class RejeitarCaractereNuloPipe implements PipeTransform {
  transform(valor: unknown, metadados: ArgumentMetadata): unknown {
    if (metadados.type === 'body' || metadados.type === 'query' || metadados.type === 'param') {
      if (this.temCaractereNulo(valor, 0)) {
        throw new BadRequestException('O texto contém caracteres inválidos');
      }
    }
    return valor;
  }

  private temCaractereNulo(valor: unknown, profundidade: number): boolean {
    if (typeof valor === 'string') return valor.includes('\u0000');
    if (profundidade > 10 || valor === null || typeof valor !== 'object') return false;
    return Object.values(valor).some((item) => this.temCaractereNulo(item, profundidade + 1));
  }
}
