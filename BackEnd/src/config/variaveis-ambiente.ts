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
    message: 'DATABASE_URL e obrigatória e deve começar com postgresql://',
  })
  DATABASE_URL: string;

  // Minimo de 32 caracteres e nao pode ser o texto de exemplo do .env.example
  @Matches(/^(?!troque-por).{32,}$/, {
    message:
      'JWT_SECRET e obrigatória, deve ter no mínimo 32 caracteres e não pode ser o valor de exemplo',
  })
  JWT_SECRET: string;

  @IsNotEmpty({ message: 'JWT_EXPIRES_IN e obrigatória (ex.: 15m)' })
  JWT_EXPIRES_IN: string;

  // Se a PORT nao vier no .env, usa 3092
  @Max(65535, { message: 'PORT deve ser no máximo 65535' })
  @Min(1, { message: 'PORT deve ser no mínimo 1' })
  @IsInt({ message: 'PORT deve ser um número inteiro' })
  PORT: number = 3092;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'CEP_API_URL e obrigatória e deve ser uma URL (com http/https)' },
  )
  CEP_API_URL: string;

  @Max(60000, { message: 'CEP_API_TIMEOUT_MS deve ser no máximo 60000' })
  @Min(100, { message: 'CEP_API_TIMEOUT_MS deve ser no mínimo 100' })
  @IsInt({ message: 'CEP_API_TIMEOUT_MS deve ser um número inteiro' })
  CEP_API_TIMEOUT_MS: number;

  @Max(50, { message: 'UPLOAD_MAX_SIZE_MB deve ser no máximo 50' })
  @Min(1, { message: 'UPLOAD_MAX_SIZE_MB deve ser no mínimo 1' })
  @IsInt({ message: 'UPLOAD_MAX_SIZE_MB deve ser um número inteiro' })
  UPLOAD_MAX_SIZE_MB: number;

  @IsUrl(
    { require_tld: false, require_protocol: true },
    { message: 'FRONTEND_URL e obrigatória e deve ser uma URL (com http/https)' },
  )
  FRONTEND_URL: string;

  @Matches(/^(?!troque-por).{32,}$/, {
    message:
      'API_KEY e obrigatória, deve ter no mínimo 32 caracteres e não pode ser o valor de exemplo',
  })
  API_KEY: string;

  // Limite de requisicoes por IP dentro da janela (padrao: 100 por minuto)
  @Min(1, { message: 'RATE_LIMIT_MAX deve ser no mínimo 1' })
  @IsInt({ message: 'RATE_LIMIT_MAX deve ser um número inteiro' })
  RATE_LIMIT_MAX: number = 100;

  // Tamanho da janela do limite, em milissegundos (padrao: 60000 = 1 minuto)
  @Min(1000, { message: 'RATE_LIMIT_JANELA_MS deve ser no mínimo 1000' })
  @IsInt({ message: 'RATE_LIMIT_JANELA_MS deve ser um número inteiro' })
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
    throw new Error(`Variáveis de ambiente inválidas:\n - ${problemas}`);
  }

  return variaveis;
}

