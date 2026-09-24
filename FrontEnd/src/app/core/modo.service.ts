import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { UsuariosService } from '../services/usuarios.service';
import { AlertaService } from './alerta.service';
import { AuthService } from './auth.service';
import { mensagemDeErro } from './erro.util';

// 🔎 Troca de modo (comprador <-> vendedor). A tela so pergunta e pede: quem decide e o servidor
// (PATCH /users/me/modo). O aviso das travas fica aqui, num lugar so, para o menu e o rodape
@Injectable({ providedIn: 'root' })
export class ModoService {
  private readonly auth = inject(AuthService);
  private readonly usuarios = inject(UsuariosService);
  private readonly alerta = inject(AlertaService);
  private readonly router = inject(Router);

  readonly trocando = signal(false);

  async alternar(): Promise<void> {
    const papel = this.auth.papel();
    if (papel !== 'BIDDER' && papel !== 'SELLER') return;
    const paraVendedor = papel === 'BIDDER';

    const aceitou = await this.alerta.confirmar(
      paraVendedor ? 'Ativar o modo vendedor?' : 'Voltar ao modo comprador?',
      paraVendedor
        ? 'No modo vendedor você cria e gerencia leilões, mas NÃO pode dar lances. Para comprar de novo, volte ao modo comprador em Meu perfil. Em nenhum modo é possível dar lance no seu próprio leilão.'
        : 'No modo comprador você dá lances, mas NÃO pode criar leilões. Para vender de novo, ative o modo vendedor em Meu perfil.',
      'Aceitar',
      'Recusar',
    );
    if (!aceitou) return;

    this.trocando.set(true);
    try {
      const atualizado = await firstValueFrom(this.usuarios.trocarModo(paraVendedor ? 'SELLER' : 'BIDDER'));
      this.auth.atualizarUsuarioLocal(atualizado);
      await this.router.navigateByUrl(paraVendedor ? '/vendedor' : '/');
    } catch (erro) {
      void this.alerta.erro('Não foi possível trocar', mensagemDeErro(erro, 'Tente novamente'));
    } finally {
      this.trocando.set(false);
    }
  }
}
