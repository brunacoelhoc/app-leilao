import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

// Lista das variaveis do .env que a aplicacao exige para subir
class VariaveisAmbiente {
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL e obrigatoria e deve comecar com postgresql://',
  })
  DATABASE_URL: string;

  // Minimo de 32 caracteres e nao pode ser o texto de exemplo do .env.example
  @Matches(/^(?!troque-por).{32,}$/, {
    message:
      'JWT_SECRET e obrigatoria, deve ter no minimo 32 caracteres e nao pode ser o valor de exemplo',
  })
  JWT_SECRET: string;

  @IsNotEmpty({ message: 'JWT_EXPIRES_IN e obrigatoria (ex.: 1d)' })
  JWT_EXPIRES_IN: string;

  // Se a PORT nao vier no .env, usa 3000
  @Max(65535, { message: 'PORT deve ser no maximo 65535' })
  @Min(1, { message: 'PORT deve ser no minimo 1' })
  @IsInt({ message: 'PORT deve ser um numero inteiro' })
  PORT: number = 3000;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'CEP_API_URL e obrigatoria e deve ser uma URL (com http/https)' },
  )
  CEP_API_URL: string;

  @Max(60000, { message: 'CEP_API_TIMEOUT_MS deve ser no maximo 60000' })
  @Min(100, { message: 'CEP_API_TIMEOUT_MS deve ser no minimo 100' })
  @IsInt({ message: 'CEP_API_TIMEOUT_MS deve ser um numero inteiro' })
  CEP_API_TIMEOUT_MS: number;

  @Max(50, { message: 'UPLOAD_MAX_SIZE_MB deve ser no maximo 50' })
  @Min(1, { message: 'UPLOAD_MAX_SIZE_MB deve ser no minimo 1' })
  @IsInt({ message: 'UPLOAD_MAX_SIZE_MB deve ser um numero inteiro' })
  UPLOAD_MAX_SIZE_MB: number;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'FRONTEND_URL e obrigatoria e deve ser uma URL (com http/https)' },
  )
  FRONTEND_URL: string;

  @Matches(/^(?!troque-por).{32,}$/, {
    message:
      'API_KEY e obrigatoria, deve ter no minimo 32 caracteres e nao pode ser o valor de exemplo',
  })
  API_KEY: string;

  // Limite de requisicoes por IP dentro da janela (padrao: 100 por minuto)
  @Min(1, { message: 'RATE_LIMIT_MAX deve ser no minimo 1' })
  @IsInt({ message: 'RATE_LIMIT_MAX deve ser um numero inteiro' })
  RATE_LIMIT_MAX: number = 100;

  // Tamanho da janela do limite, em milissegundos (padrao: 60000 = 1 minuto)
  @Min(1000, { message: 'RATE_LIMIT_JANELA_MS deve ser no minimo 1000' })
  @IsInt({ message: 'RATE_LIMIT_JANELA_MS deve ser um numero inteiro' })
  RATE_LIMIT_JANELA_MS: number = 60000;
}

// Roda ao iniciar: se alguma variavel estiver errada, a API nao sobe e diz qual
export function validarVariaveisAmbiente(config: Record<string, unknown>) {
  // Converte os textos do .env para os tipos da classe (ex.: "3000" vira 3000)
  const variaveis = plainToInstance(VariaveisAmbiente, config, {
    enableImplicitConversion: true,
  });

  // Confere as regras; para no primeiro erro de cada variavel
  const erros = validateSync(variaveis, { stopAtFirstError: true });

  if (erros.length > 0) {
    const problemas = erros
      .map((erro) => Object.values(erro.constraints ?? {}).join('; '))
      .join('\n - ');
    throw new Error(`Variaveis de ambiente invalidas:\n - ${problemas}`);
  }

  return variaveis;
}

