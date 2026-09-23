import { Component, output, signal } from '@angular/core';

interface Obra {
  arquivo: string;
  titulo: string;
  autor: string;
  ano: string;
}

// Seletor de fotos do acervo (obras de domínio público, em /acervo). Para quem
// não tem uma foto do item à mão: escolher uma obra devolve um File, que segue
// exatamente o mesmo caminho de um upload feito pelo computador.
@Component({
  selector: 'app-acervo-fotos',
  templateUrl: './acervo-fotos.html',
  styleUrl: './acervo-fotos.css',
})
export class AcervoFotos {
  readonly escolher = output<File>();

  protected readonly obras = signal<Obra[]>([]);
  protected readonly selecionada = signal<string | null>(null);
  protected readonly erro = signal<string | null>(null);
  private carregou = false;

  // Só busca a lista quando a pessoa abre o painel
  async aoAbrir(): Promise<void> {
    if (this.carregou) return;
    this.carregou = true;
    try {
      // fetch nativo: são arquivos estáticos do próprio front, não da API
      const resposta = await fetch('acervo/acervo.json');
      this.obras.set((await resposta.json()) as Obra[]);
    } catch {
      this.carregou = false;
      this.erro.set('Não foi possível carregar o acervo.');
    }
  }

  async usar(obra: Obra): Promise<void> {
    this.erro.set(null);
    try {
      const blob = await (await fetch(`acervo/${obra.arquivo}`)).blob();
      this.selecionada.set(obra.arquivo);
      this.escolher.emit(new File([blob], obra.arquivo, { type: 'image/jpeg' }));
    } catch {
      this.erro.set('Não foi possível usar essa imagem.');
    }
  }
}
