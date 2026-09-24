// CPF valido = 11 digitos, nao todos iguais, e os 2 digitos verificadores conferem
export function cpfValido(cpf: string): boolean {
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11 || /^(\d)\1{10}$/.test(digitos)) return false;
  const calcular = (quantos: number): number => {
    let soma = 0;
    for (let i = 0; i < quantos; i++) soma += Number(digitos[i]) * (quantos + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calcular(9) === Number(digitos[9]) && calcular(10) === Number(digitos[10]);
}
