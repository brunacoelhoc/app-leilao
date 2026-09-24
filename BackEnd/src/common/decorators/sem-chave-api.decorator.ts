import { SetMetadata } from '@nestjs/common';

// Marca uma rota que NAO exige o X-API-KEY. Uso raro e deliberado: so para conteudo publico que o
// navegador precisa carregar sozinho (ex.: a tag <img> nao consegue enviar cabecalhos)
export const SEM_CHAVE_API = 'semChaveApi';
export const SemChaveApi = () => SetMetadata(SEM_CHAVE_API, true);
