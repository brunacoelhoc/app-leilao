import { HttpService } from '@nestjs/axios';
import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { CepService } from './cep.service';

describe('CepService', () => {
  let service: CepService;
  let httpService: { get: jest.Mock };

  beforeEach(async () => {
    httpService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CepService, { provide: HttpService, useValue: httpService }],
    }).compile();

    service = module.get(CepService);
  });

  it('CEP existente: devolve logradouro, cidade e uf', async () => {
    httpService.get.mockReturnValue(
      of({
        data: {
          logradouro: 'Avenida Paulista',
          localidade: 'Sao Paulo',
          uf: 'SP',
        },
      }),
    );

    const endereco = await service.buscar('01310100');

    expect(endereco).toEqual({
      logradouro: 'Avenida Paulista',
      cidade: 'Sao Paulo',
      uf: 'SP',
    });
    expect(httpService.get).toHaveBeenCalledWith('/01310100/json/');
  });

  it('CEP com formato valido mas inexistente (ViaCEP responde erro:true) -> BadRequestException', async () => {
    httpService.get.mockReturnValue(of({ data: { erro: 'true' } }));

    await expect(service.buscar('00000000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('timeout -> ServiceUnavailableException (nunca deixa a requisicao pendurada)', async () => {
    const erroDeTimeout = new AxiosError('timeout of 5000ms exceeded', 'ECONNABORTED');
    httpService.get.mockReturnValue(throwError(() => erroDeTimeout));

    await expect(service.buscar('01310100')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('servico fora do ar (erro de rede generico) -> ServiceUnavailableException', async () => {
    httpService.get.mockReturnValue(
      throwError(() => new Error('connect ECONNREFUSED')),
    );

    await expect(service.buscar('01310100')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
