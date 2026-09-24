// Destino depois do login/cadastro: so aceita caminho INTERNO do app ("/itens/123"),
// nunca um endereco externo (evita redirecionamento malicioso)
export function destinoSeguro(valor: string | null | undefined): string {
  return valor && valor.startsWith('/') && !valor.startsWith('//') ? valor : '/';
}
