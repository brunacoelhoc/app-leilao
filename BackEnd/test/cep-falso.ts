import { BadRequestException } from '@nestjs/common';

// ViaCEP de mentira para os testes e2e: a internet (ou o ViaCEP) fora do ar
// nao pode derrubar o CI. O comportamento real do CepService (timeout, 502, CEP
// inexistente) e testado sem rede em src/cep/cep.service.spec.ts
export const cepFalso = {
  buscar: (cep: string) => {
    if (cep === '00000000') {
      return Promise.reject(new BadRequestException('CEP nao encontrado'));
    }
    if (cep === '01310100') {
      return Promise.resolve({ logradouro: 'Avenida Paulista', cidade: 'São Paulo', uf: 'SP' });
    }
    return Promise.resolve({ logradouro: 'Rua de Teste', cidade: 'São Paulo', uf: 'SP' });
  },
};
