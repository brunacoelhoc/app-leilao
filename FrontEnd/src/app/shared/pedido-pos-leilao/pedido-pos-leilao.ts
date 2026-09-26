import { CurrencyPipe } from '@angular/common';
import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { mensagemDeErro } from '../../core/erro.util';
import { formatarCep, somenteDigitos } from '../../core/mascara.util';
import { FormaPagamento, Pedido, TipoEntrega } from '../../core/models';
import { CepService } from '../../services/cep.service';
import { PedidosService } from '../../services/pedidos.service';

// 🔎 Pos-leilao (so o vencedor ve): 1) paga (SIMULADO) 2) escolhe retirar ou receber em casa.
// A ordem e regra do servidor (409 se pular o pagamento); aqui a tela so mostra o passo atual.
@Component({
  selector: 'app-pedido-pos-leilao',
  imports: [FormsModule, CurrencyPipe],
  templateUrl: './pedido-pos-leilao.html',
  styleUrl: './pedido-pos-leilao.css',
})
export class PedidoPosLeilao {
  readonly itemId = input.required<string>();

  private readonly pedidosService = inject(PedidosService);
  private readonly cepService = inject(CepService);

  readonly pedido = signal<Pedido | null>(null);
  readonly carregando = signal(true);
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly FORMAS: { valor: FormaPagamento; rotulo: string; dica: string }[] = [
    { valor: 'PIX', rotulo: 'PIX', dica: 'Aprovação na hora' },
    { valor: 'CARTAO', rotulo: 'Cartão de crédito', dica: 'Aprovação na hora' },
    { valor: 'BOLETO', rotulo: 'Boleto', dica: 'Simulado como compensado' },
  ];
  readonly ROTULO_FORMA: Record<FormaPagamento, string> = { PIX: 'PIX', CARTAO: 'Cartão de crédito', BOLETO: 'Boleto' };

  forma: FormaPagamento = 'PIX';
  tipo: TipoEntrega = 'RETIRADA';

  // Endereco de entrega: o CEP preenche rua/cidade/UF sozinho; numero e complemento (apto, bloco...) sao digitados
  cep = '';
  logradouro = '';
  numero = '';
  complemento = '';
  cidade = '';
  uf = '';
  readonly buscandoCep = signal(false);
  readonly erroCep = signal<string | null>(null);

  mascararCep(): void {
    this.cep = formatarCep(this.cep);
    this.erroCep.set(null);
    if (somenteDigitos(this.cep).length === 8) this.buscarCep();
  }

  buscarCep(): void {
    const cep = somenteDigitos(this.cep);
    if (cep.length !== 8) {
      this.erroCep.set('Digite os 8 números do CEP.');
      return;
    }
    this.buscandoCep.set(true);
    this.erroCep.set(null);
    this.cepService.buscar(cep).subscribe({
      next: (e) => {
        this.logradouro = e.logradouro ?? '';
        this.cidade = e.cidade;
        this.uf = e.uf;
        this.buscandoCep.set(false);
      },
      error: (erro) => {
        this.cidade = this.uf = '';
        this.erroCep.set(mensagemDeErro(erro, 'Não foi possível consultar o CEP'));
        this.buscandoCep.set(false);
      },
    });
  }

  // Junta os campos num texto so (o backend guarda o endereco de entrega como texto)
  private montarEndereco(): string {
    const rua = [this.logradouro.trim(), this.numero.trim()].filter(Boolean).join(', ');
    const complemento = this.complemento.trim() ? ` - ${this.complemento.trim()}` : '';
    return `${rua}${complemento} — ${this.cidade}/${this.uf} — CEP ${this.cep}`;
  }

  constructor() {
    // O input so tem valor depois da criacao: carrega no proximo ciclo
    queueMicrotask(() => this.carregar());
  }

  private carregar(): void {
    this.pedidosService.obter(this.itemId()).subscribe({
      next: (pedido) => {
        this.pedido.set(pedido);
        this.carregando.set(false);
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro, 'Não foi possível carregar o pedido'));
        this.carregando.set(false);
      },
    });
  }

  pagar(): void {
    this.executar(this.pedidosService.pagar(this.itemId(), this.forma));
  }

  confirmarEntrega(): void {
    if (this.tipo === 'ENTREGA') {
      if (!this.cidade) {
        this.erro.set('Informe um CEP válido para preencher o endereço.');
        return;
      }
      if (!this.logradouro.trim() || !this.numero.trim()) {
        this.erro.set('Informe a rua e o número (use "s/n" se não houver).');
        return;
      }
    }
    this.executar(this.pedidosService.definirEntrega(this.itemId(), this.tipo, this.tipo === 'ENTREGA' ? this.montarEndereco() : undefined));
  }

  private executar(chamada: ReturnType<PedidosService['pagar']>): void {
    if (this.enviando()) return;
    this.erro.set(null);
    this.enviando.set(true);
    chamada.subscribe({
      next: (pedido) => {
        this.pedido.set(pedido);
        this.enviando.set(false);
      },
      error: (erro) => {
        this.erro.set(mensagemDeErro(erro, 'Não foi possível concluir esta etapa'));
        this.enviando.set(false);
      },
    });
  }
}
