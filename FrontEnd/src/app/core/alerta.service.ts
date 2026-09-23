import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon } from 'sweetalert2';

// Ponto unico de acesso ao SweetAlert2, com o tema visual do projeto
// (dourado/bordo) ja aplicado -- nenhuma tela chama o Swal direto
const CORES = {
  confirmar: '#8a5a34',
  cancelar: '#6b1420',
  fundo: '#fffdf9',
  texto: '#2b2420',
};

@Injectable({ providedIn: 'root' })
export class AlertaService {
  sucesso(titulo: string, texto?: string): Promise<unknown> {
    return this.base('success', titulo, texto);
  }

  erro(titulo: string, texto?: string): Promise<unknown> {
    return this.base('error', titulo, texto);
  }

  info(titulo: string, texto?: string): Promise<unknown> {
    return this.base('info', titulo, texto);
  }

  async confirmar(titulo: string, texto?: string, textoBotao = 'Confirmar'): Promise<boolean> {
    const resultado = await Swal.fire({
      icon: 'warning',
      title: titulo,
      text: texto,
      showCancelButton: true,
      confirmButtonText: textoBotao,
      cancelButtonText: 'Cancelar',
      confirmButtonColor: CORES.cancelar,
      cancelButtonColor: CORES.confirmar,
      background: CORES.fundo,
      color: CORES.texto,
      reverseButtons: true,
    });
    return resultado.isConfirmed;
  }

  // Pergunta um texto obrigatorio (ex.: motivo do cancelamento); null se cancelar
  async pedirTexto(titulo: string, rotulo: string): Promise<string | null> {
    const resultado = await Swal.fire({
      title: titulo,
      input: 'text',
      inputLabel: rotulo,
      showCancelButton: true,
      confirmButtonText: 'Confirmar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: CORES.confirmar,
      background: CORES.fundo,
      color: CORES.texto,
      inputValidator: (valor) => (valor.trim() ? null : 'Este campo é obrigatório'),
    });
    return resultado.isConfirmed ? String(resultado.value).trim() : null;
  }

  // Modal informativo generico (usado pelos cards clicaveis: leilao, item, lance)
  async detalhe(titulo: string, htmlConteudo: string): Promise<void> {
    await Swal.fire({
      title: titulo,
      html: htmlConteudo,
      confirmButtonText: 'Fechar',
      confirmButtonColor: CORES.confirmar,
      background: CORES.fundo,
      color: CORES.texto,
      width: '32rem',
    });
  }

  // Mensagem festiva (ex.: ganhador de um lote)
  async celebrar(titulo: string, texto: string): Promise<void> {
    await Swal.fire({
      title: `🎉 ${titulo}`,
      html: texto,
      confirmButtonText: 'Vivas!',
      confirmButtonColor: CORES.confirmar,
      background: CORES.fundo,
      color: CORES.texto,
    });
  }

  private async base(icon: SweetAlertIcon, titulo: string, texto?: string): Promise<unknown> {
    return Swal.fire({
      icon,
      title: titulo,
      text: texto,
      confirmButtonText: 'Ok',
      confirmButtonColor: CORES.confirmar,
      background: CORES.fundo,
      color: CORES.texto,
    });
  }
}
