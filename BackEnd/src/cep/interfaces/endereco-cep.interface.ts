// Endereco ja no formato que o resto do sistema usa (rua/cidade/uf),
// depois de traduzido da resposta do ViaCEP
export interface EnderecoCep {
  logradouro?: string;
  cidade: string;
  uf: string;
}
