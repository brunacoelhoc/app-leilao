// O ClassSerializerInterceptor global (ver passo 3.3) usa o class-transformer,
// que NAO chama o toString()/toJSON() do Decimal do Prisma -- ele desmonta o
// valor na estrutura interna da biblioteca (ex.: {s:1,e:2,d:[100,5000000]}).
// Por isso, todo campo monetario precisa ser convertido para string ANTES de
// sair do service, usando esta funcao (funciona com qualquer Decimal, ja que
// so exige um toString(); nao precisamos importar o tipo Decimal do Prisma)
export function decimalParaString(
  valor: { toString(): string } | null | undefined,
): string | null {
  return valor === null || valor === undefined ? null : valor.toString();
}
