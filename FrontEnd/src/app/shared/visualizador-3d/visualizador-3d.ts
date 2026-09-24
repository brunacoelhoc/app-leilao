import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// 🔎 Visualizador 3D (Three.js / WebGL) da peça do lote.
// - Com foto: um quadro com moldura dourada e a foto do item como tela.
// - Sem foto: uma ânfora (vaso) dourada, feita girando uma curva.
// Gira sozinho devagar (desligado se o usuário prefere menos movimento) e
// aceita mouse, toque e teclado para girar e dar zoom.
import { PreferenciasService } from '../../core/preferencias.service';

@Component({
  selector: 'app-visualizador-3d',
  templateUrl: './visualizador-3d.html',
  styleUrl: './visualizador-3d.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Visualizador3d implements OnDestroy {
  private readonly prefs = inject(PreferenciasService);
  readonly fotoUrl = input<string | null>(null);
  readonly titulo = input('Peça do lote');
  readonly indisponivel = input(false);

  protected readonly semWebgl = signal(false);
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private renderer?: WebGLRenderer;
  private scene?: Scene;
  private camera?: PerspectiveCamera;
  private controls?: OrbitControls;
  private peca?: Group;
  private observador?: ResizeObserver;
  private observadorVisibilidade?: IntersectionObserver;
  private visivel = true;
  private quadro = 0;

  constructor() {
    // Monta a cena só no navegador (o canvas já existe depois do 1º render)
    afterNextRender(() => this.iniciar());

    // Troca a peça quando a foto muda (ex.: a foto termina de baixar)
    effect(() => {
      const url = this.fotoUrl();
      if (this.scene) this.montarPeca(url);
    });
    effect(() => {
      const bloqueado = this.indisponivel();
      const semMovimento = this.prefs.reduzirAnimacoes(); // relê quando a pessoa muda no painel
      if (this.controls) this.controls.autoRotate = !bloqueado && !semMovimento;
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.quadro);
    this.observador?.disconnect();
    this.observadorVisibilidade?.disconnect();
    this.controls?.dispose();
    this.limparPeca();
    this.renderer?.dispose();
  }

  private iniciar(): void {
    const canvas = this.canvasRef().nativeElement;
    try {
      this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      this.semWebgl.set(true);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0.4, 8.2);

    // Luz quente de galeria
    this.scene.add(new AmbientLight(0xfff1d6, 0.9));
    const principal = new DirectionalLight(0xffe2ad, 2.2);
    principal.position.set(3, 4, 5);
    this.scene.add(principal);
    const contraluz = new PointLight(0xc5a059, 25, 20);
    contraluz.position.set(-4, 2, -3);
    this.scene.add(contraluz);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 4.5;
    this.controls.maxDistance = 12;
    this.controls.target.set(0, 0.2, 0);
    this.controls.autoRotate = !this.indisponivel() && !this.prefs.reduzirAnimacoes();
    this.controls.autoRotateSpeed = 1.1;
    this.controls.listenToKeyEvents(canvas); // setas do teclado giram a peça

    this.montarPeca(this.fotoUrl());

    this.observador = new ResizeObserver(() => this.ajustarTamanho());
    this.observador.observe(canvas.parentElement!);
    this.ajustarTamanho();

    // Economia: não desenha quando o canvas está fora da tela
    this.observadorVisibilidade = new IntersectionObserver(([e]) => (this.visivel = e.isIntersecting));
    this.observadorVisibilidade.observe(canvas);

    const desenhar = () => {
      this.quadro = requestAnimationFrame(desenhar);
      if (!this.visivel) return;
      this.controls!.update();
      this.renderer!.render(this.scene!, this.camera!);
    };
    desenhar();
  }

  private ajustarTamanho(): void {
    const pai = this.canvasRef().nativeElement.parentElement!;
    const { clientWidth: largura, clientHeight: altura } = pai;
    if (!largura || !altura) return;
    this.renderer!.setSize(largura, altura, false);
    this.camera!.aspect = largura / altura;
    this.camera!.updateProjectionMatrix();
  }

  private limparPeca(): void {
    if (!this.peca) return;
    this.scene?.remove(this.peca);
    this.peca.traverse((obj) => {
      if (obj instanceof Mesh) {
        obj.geometry.dispose();
        const material = obj.material as MeshStandardMaterial;
        material.map?.dispose();
        material.dispose();
      }
    });
    this.peca = undefined;
  }

  private montarPeca(fotoUrl: string | null): void {
    this.limparPeca();
    this.peca = fotoUrl ? this.criarQuadro(fotoUrl) : this.criarAnfora();
    this.scene!.add(this.peca);
  }

  private materialOuro(): MeshStandardMaterial {
    return new MeshStandardMaterial({
      color: new Color('#c5a059'),
      metalness: 0.9,
      roughness: 0.28,
      side: DoubleSide,
    });
  }

  private materialMadeira(): MeshStandardMaterial {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#4a2e1f';
    g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(0,0,0,.25)';
    for (let i = 0; i < 64; i += 6) {
      g.beginPath();
      g.moveTo(0, i);
      g.lineTo(64, i + 2);
      g.stroke();
    }
    return new MeshStandardMaterial({ map: new CanvasTexture(c), roughness: 0.8 });
  }

  // Moldura dourada em volta da foto
  private criarQuadro(fotoUrl: string): Group {
    const grupo = new Group();
    const largura = 3;
    const altura = 3.9;
    const borda = 0.32;
    const profundidade = 0.28;
    const ouro = this.materialOuro();

    const barra = (w: number, h: number, x: number, y: number) => {
      const m = new Mesh(new BoxGeometry(w, h, profundidade), ouro);
      m.position.set(x, y, 0);
      grupo.add(m);
    };
    barra(largura + borda * 2, borda, 0, altura / 2 + borda / 2);
    barra(largura + borda * 2, borda, 0, -altura / 2 - borda / 2);
    barra(borda, altura, -largura / 2 - borda / 2, 0);
    barra(borda, altura, largura / 2 + borda / 2, 0);

    // Tela: começa com uma cor lisa e troca pela foto quando carregar
    const tela = new Mesh(
      new PlaneGeometry(largura, altura),
      new MeshStandardMaterial({ color: new Color('#3a2a1c'), roughness: 0.85 }),
    );
    tela.position.z = -0.02;
    grupo.add(tela);
    new TextureLoader().load(fotoUrl, (textura) => {
      textura.colorSpace = SRGBColorSpace;
      const material = tela.material as MeshStandardMaterial;
      material.map = textura;
      material.color.set('#ffffff');
      // Encaixa a foto na tela sem distorcer (recorta o excesso)
      const razaoTela = largura / altura;
      const razaoFoto = textura.image.width / textura.image.height;
      if (razaoFoto > razaoTela) {
        textura.repeat.set(razaoTela / razaoFoto, 1);
        textura.offset.set((1 - razaoTela / razaoFoto) / 2, 0);
      } else {
        textura.repeat.set(1, razaoFoto / razaoTela);
        textura.offset.set(0, (1 - razaoFoto / razaoTela) / 2);
      }
      material.needsUpdate = true;
    });

    // Verso de madeira, para não ficar vazio quando gira
    const verso = new Mesh(
      new PlaneGeometry(largura + borda * 2, altura + borda * 2),
      this.materialMadeira(),
    );
    verso.position.z = -profundidade / 2 - 0.01;
    verso.rotation.y = Math.PI;
    grupo.add(verso);

    grupo.position.y = 0.15;
    return grupo;
  }

  // Ânfora dourada: uma curva girada em torno do eixo Y (LatheGeometry)
  private criarAnfora(): Group {
    const grupo = new Group();
    const perfil = [
      [0.01, -1.9], [0.9, -1.9], [0.95, -1.7], [0.55, -1.5], [0.5, -1.2],
      [1.05, -0.3], [1.25, 0.5], [1.0, 1.2], [0.55, 1.6], [0.45, 2.0],
      [0.7, 2.25], [0.68, 2.4], [0.4, 2.35],
    ].map(([x, y]) => new Vector2(x, y));
    grupo.add(new Mesh(new LatheGeometry(perfil, 64), this.materialOuro()));

    const base = new Mesh(new CylinderGeometry(1.15, 1.3, 0.25, 48), this.materialMadeira());
    base.position.y = -2.03;
    grupo.add(base);

    grupo.scale.setScalar(0.85);
    grupo.position.y = -0.1;
    return grupo;
  }
}
