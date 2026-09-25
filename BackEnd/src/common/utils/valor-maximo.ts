// Maior valor em reais que cabe no banco (Decimal(12,2)): preço, incremento e lance.
// Acima disso o Postgres recusava e a API respondia 500; agora é 400 com mensagem clara
export const VALOR_MAXIMO = 9_999_999_999.99;
