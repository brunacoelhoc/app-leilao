// Tira espaços e deixa minúsculo, para "Ana@X.com" e "ana@x.com" serem o mesmo usuário.
// Só mexe em texto: se vier número, objeto ou lista, devolve como está e o @IsEmail recusa com 400
// (antes, chamar .trim() em algo que não era texto quebrava a API com erro 500)
export function normalizarEmail({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}
