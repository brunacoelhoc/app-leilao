import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

// Controle de paginacao reutilizavel: setas, numeros e um select para mudar
// quantos itens aparecem por vez (5, 10, 50 ou 100; o padrao das telas e 5). So mostra os numeros/setas
// quando ha mais de uma pagina
@Component({
  selector: 'app-paginacao',
  imports: [FormsModule],
  templateUrl: './paginacao.html',
  styleUrl: './paginacao.css',
})
export class Paginacao {
  readonly pagina = input.required<number>();
  readonly totalPaginas = input.required<number>();
  readonly total = input(0);
  readonly limite = input(5);

  readonly mudarPagina = output<number>();
  readonly mudarLimite = output<number>();

  protected readonly opcoesLimite = [5, 10, 50, 100];

  // Janela de ate 5 numeros em volta da pagina atual
  protected readonly numeros = computed(() => {
    const atual = this.pagina();
    const ultimo = this.totalPaginas();
    const inicio = Math.max(1, Math.min(atual - 2, ultimo - 4));
    const fim = Math.min(ultimo, inicio + 4);
    return Array.from({ length: fim - inicio + 1 }, (_, i) => inicio + i);
  });

  protected irPara(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginas() && pagina !== this.pagina()) {
      this.mudarPagina.emit(pagina);
    }
  }

  protected aoMudarLimite(valor: string): void {
    this.mudarLimite.emit(Number(valor));
  }
}
