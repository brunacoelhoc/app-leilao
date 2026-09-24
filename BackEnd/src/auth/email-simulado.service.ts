import { Injectable, Logger } from '@nestjs/common';

// 🔎 Entrega SIMULADA do e-mail: nao ha servico de e-mail neste projeto, entao o codigo
// aparece so no log do servidor (docker compose logs api). Para producao, este e o unico
// ponto a trocar por um envio real (SMTP, SES...): o resto da recuperacao continua igual.
@Injectable()
export class EmailSimuladoService {
  private readonly logger = new Logger('EmailSimulado');

  enviarCodigoDeRecuperacao(email: string, nome: string, codigo: string, validadeMinutos: number): void {
    this.logger.warn(
      `[E-MAIL SIMULADO] Para: ${nome} <${email}> | Codigo de recuperacao de senha: ${codigo} (valido por ${validadeMinutos} minutos)`,
    );
  }
}
