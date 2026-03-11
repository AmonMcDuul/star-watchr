import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
  ChangeDetectorRef,
  NgZone,
  PLATFORM_ID
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { StarCatalogService } from '../../services/star-catalog.service';
import { MessierService } from '../../services/messier.service';

// ========== INTERFACES ==========
export interface StarData {
  position: THREE.Vector3;
  name?: string;
  magnitude: number;
  color: THREE.Color;
  ra: number;
  dec: number;
  size: number;
}

export interface DSOSpriteData {
  object: any;               // Messier of Caldwell object
  sprite: THREE.Sprite;
  position: THREE.Vector3;
  imageMesh?: THREE.Mesh;
  type: 'messier' | 'caldwell';
  magnitude: number;
  size: number;              // boogminuten
}

export interface HudInfo {
  ra: string;
  dec: string;
  fov: number;
  altitude: number;
  azimuth: number;
}

@Component({
  selector: 'app-starhop-atlas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './starhop-atlas.component.html',
  styleUrls: ['./starhop-atlas.component.scss']
})
export class StarhopAtlasComponent implements AfterViewInit, OnDestroy, OnChanges {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // ===== INPUTS =====
  @Input() ra!: number;
  @Input() dec!: number;
  @Input() targetName: string = '';
  @Input() fovDegrees: number = 3;

  @Input() showConstellations: boolean = true;
  @Input() showConstellationNames: boolean = true;
  @Input() showStarNames: boolean = false;
  @Input() showMessier: boolean = true;
  @Input() showGrid: boolean = true;
  @Input() mirrored: boolean = false;
  @Input() starDensity: 'sparse' | 'normal' | 'dense' = 'normal';

  // ===== DEPENDENCIES =====
  private catalog = inject(StarCatalogService);
  private messierService = inject(MessierService);
  private router = inject(Router);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  // ===== THREE CORE =====
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private composer!: EffectComposer;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private textureLoader = new THREE.TextureLoader();

  // ===== GROUPS =====
  private skySphere = new THREE.Group();
  private starGroup = new THREE.Group();
  private constellationLineGroup = new THREE.Group();
  private constellationNameGroup = new THREE.Group();
  private dsoGroup = new THREE.Group();           // oranje cirkels
  private dsoImageGroup = new THREE.Group();      // DSO afbeeldingen
  private gridGroup = new THREE.Group();
  private targetHighlightGroup = new THREE.Group();

  // ===== DATA =====
  private stars: StarData[] = [];
  public dsoSprites: DSOSpriteData[] = [];
  private targetPosition = new THREE.Vector3();

  // ===== TEXTURES =====
  private textures: {
    star: THREE.CanvasTexture;
    dsoNormal: THREE.CanvasTexture;    // oranje cirkel
    dsoHover: THREE.CanvasTexture;      // wit oplichtend
    dsoSelected: THREE.CanvasTexture;   // groen (voor selectie)
    highlight: THREE.CanvasTexture;      // rode stippellijn voor target
  } = {} as any;

  // ===== ANIMATIE =====
  private frameId = 0;
  private targetFov: number;
  private resizeObserver!: ResizeObserver;
  private resizeThrottleTimeout: any;

  // ===== ZOOM / TOUCH =====
  private touchStartDistance = 0;
  private initialFov = 60;
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };
  private isZooming = false;
  private zoomTimeout: any;
  private lastTapTime = 0;
  private lastTapPosition = { x: 0, y: 0 };
  private readonly DOUBLE_TAP_DELAY = 300;
  private readonly DOUBLE_TAP_MAX_DIST = 30;
  private zoomAnimationFrame: number | null = null;
  private readonly MIN_FOV = 0.5;
  private readonly MAX_FOV = 60;

  // ===== HOVER / SELECTIE =====
  private hoveredDSO: DSOSpriteData | null = null;
  private selectedDSO: DSOSpriteData | null = null;

  // ===== UI STATE =====
  showInfoPanel = false;
  infoPanelContent: any = null;
  hoverTooltipContent: string | null = null;
  showSearchPanel = false;
  searchQuery = '';
  searchResults: any[] = [];

  // ===== HUD =====
  hudInfo: HudInfo = {
    ra: '',
    dec: '',
    fov: 0,
    altitude: 0,
    azimuth: 0
  };

  // ===== ROTATIE =====
  private rotationAngle = 0;

  // ===== BROWSER CHECK =====
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    this.targetFov = this.fovDegrees;
  }

  async ngAfterViewInit() {
    if (!this.isBrowser) return;

    this.catalog.setStarDensity(this.starDensity);

    await Promise.all([
      this.catalog.load(),
      this.messierService.load(),
      this.messierService.loadCaldwell()
    ]);

    this.createTextures();
    this.initThree();
    this.initPostProcessing();
    this.buildSky();
    this.setupEventListeners();
    this.setupResizeObserver();
    this.animate();

    requestAnimationFrame(() => {
      this.centerOnTarget();
      this.updateHUD();
    });
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      cancelAnimationFrame(this.frameId);
      if (this.zoomAnimationFrame) cancelAnimationFrame(this.zoomAnimationFrame);
      clearTimeout(this.resizeThrottleTimeout);
      clearTimeout(this.zoomTimeout);
    }
    this.renderer?.dispose();
    this.composer?.dispose();
    this.resizeObserver?.disconnect();
    Object.values(this.textures).forEach(t => t?.dispose());

    const canvas = this.canvasRef?.nativeElement;
    if (canvas) {
      canvas.removeEventListener('wheel', this.onWheel);
      canvas.removeEventListener('touchstart', this.onTouchStart);
      canvas.removeEventListener('touchmove', this.onTouchMove);
      canvas.removeEventListener('touchend', this.onTouchEnd);
      canvas.removeEventListener('mousemove', this.onMouseMove);
      canvas.removeEventListener('click', this.onClick);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.camera) return;

    if (changes['ra'] || changes['dec']) {
      this.buildSky();
      requestAnimationFrame(() => this.centerOnTarget());
    }
    if (changes['fovDegrees'] && !changes['fovDegrees'].firstChange) {
      this.targetFov = this.fovDegrees;
    }
    if (changes['starDensity']) {
      this.catalog.setStarDensity(this.starDensity);
      this.buildSky();
    }
    if (changes['showConstellations'] || changes['showConstellationNames'] ||
        changes['showMessier'] || changes['showStarNames'] || changes['showGrid'] || changes['mirrored']) {
      this.updateVisibility();
    }
  }

  // ========== INIT ==========
  private createTextures(): void {
    // Star texture
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 64; starCanvas.height = 64;
    const sCtx = starCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,200,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0,0,64,64);
    this.textures.star = new THREE.CanvasTexture(starCanvas);

    // Normale DSO cirkel (oranje)
    const dsoCanvas = document.createElement('canvas');
    dsoCanvas.width = 64; dsoCanvas.height = 64;
    const dCtx = dsoCanvas.getContext('2d')!;
    dCtx.clearRect(0,0,64,64);
    dCtx.strokeStyle = '#ffaa44';
    dCtx.lineWidth = 3;
    dCtx.beginPath();
    dCtx.arc(32,32,14,0,2*Math.PI);
    dCtx.stroke();
    dCtx.fillStyle = 'rgba(255,170,68,0.2)';
    dCtx.beginPath();
    dCtx.arc(32,32,10,0,2*Math.PI);
    dCtx.fill();
    this.textures.dsoNormal = new THREE.CanvasTexture(dsoCanvas);

    // Hover (wit)
    const hoverCanvas = document.createElement('canvas');
    hoverCanvas.width = 64; hoverCanvas.height = 64;
    const hCtx = hoverCanvas.getContext('2d')!;
    hCtx.clearRect(0,0,64,64);
    hCtx.strokeStyle = 'white';
    hCtx.lineWidth = 3;
    hCtx.beginPath();
    hCtx.arc(32,32,18,0,2*Math.PI);
    hCtx.stroke();
    hCtx.fillStyle = 'rgba(255,255,255,0.2)';
    hCtx.beginPath();
    hCtx.arc(32,32,14,0,2*Math.PI);
    hCtx.fill();
    this.textures.dsoHover = new THREE.CanvasTexture(hoverCanvas);

    // Selectie (groen)
    const selCanvas = document.createElement('canvas');
    selCanvas.width = 64; selCanvas.height = 64;
    const selCtx = selCanvas.getContext('2d')!;
    selCtx.clearRect(0,0,64,64);
    selCtx.strokeStyle = '#44ffaa';
    selCtx.lineWidth = 3;
    selCtx.beginPath();
    selCtx.arc(32,32,18,0,2*Math.PI);
    selCtx.stroke();
    selCtx.fillStyle = 'rgba(68,255,170,0.2)';
    selCtx.beginPath();
    selCtx.arc(32,32,14,0,2*Math.PI);
    selCtx.fill();
    this.textures.dsoSelected = new THREE.CanvasTexture(selCanvas);

    // Highlight (rood gestippeld)
    const hlCanvas = document.createElement('canvas');
    hlCanvas.width = 128; hlCanvas.height = 128;
    const hlCtx = hlCanvas.getContext('2d')!;
    hlCtx.clearRect(0,0,128,128);
    hlCtx.strokeStyle = 'rgba(255,60,60,0.9)';
    hlCtx.lineWidth = 4;
    hlCtx.setLineDash([10,8]);
    hlCtx.beginPath();
    hlCtx.arc(64,64,40,0,2*Math.PI);
    hlCtx.stroke();
    this.textures.highlight = new THREE.CanvasTexture(hlCanvas);
  }

  private initThree(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03030a);

    this.camera = new THREE.PerspectiveCamera(this.targetFov, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    this.camera.position.set(0,0,0);
    this.camera.lookAt(0,0,1);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = -0.2;  // inverted voor natuurlijke navigatie
    this.controls.target.set(0,0,1);

    this.scene.add(this.skySphere);
    this.skySphere.add(
      this.starGroup,
      this.constellationLineGroup,
      this.constellationNameGroup,
      this.dsoGroup,
      this.dsoImageGroup,
      this.gridGroup,
      this.targetHighlightGroup
    );
    this.skySphere.scale.x = this.mirrored ? -1 : 1;
  }

  private initPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.canvasRef.nativeElement.clientWidth, this.canvasRef.nativeElement.clientHeight),
      0.1, 0.2, 0.5
    );
    this.composer.addPass(bloomPass);
  }

  private setupEventListeners(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
  }

  private setupResizeObserver(): void {
    if (!this.isBrowser) return;
    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(this.resizeThrottleTimeout);
      this.resizeThrottleTimeout = setTimeout(() => this.zone.run(() => this.onResize()), 100);
    });
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
  }

  onResize(): void {
    const canvas = this.canvasRef.nativeElement;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  // ========== SKY BUILDING ==========
  private buildSky(): void {
    this.clearGroups();
    this.createStars();
    this.createConstellations();
    this.createDSOObjects();
    this.createGrid();
    this.createTargetHighlight();
    this.updateVisibility();
  }

  private clearGroups(): void {
    [this.starGroup, this.constellationLineGroup, this.constellationNameGroup,
     this.dsoGroup, this.dsoImageGroup, this.gridGroup, this.targetHighlightGroup]
      .forEach(g => { while(g.children.length) g.remove(g.children[0]); });
    this.stars = [];
    this.dsoSprites = [];
  }

  // ===== STERREN =====
// ===== STERREN - met vaste grootte =====
private createStars(): void {
  const allStars = this.catalog.getStarsNear(this.ra, this.dec, 30);
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];

  allStars.forEach(star => {
    const pos = this.raDecToXYZ(star.ra, star.dec, 100);
    const color = this.bvToColor(star.ci);
    positions.push(pos.x, pos.y, pos.z);
    colors.push(color.r, color.g, color.b);

    // Kleinere basisgrootte voor alle sterren
      let size = 7.0 * (6.5 - Math.min(star.mag, 6.5)) * 0.8;
      if (star.mag < 1) size *= 1.4;
      else if (star.mag < 2) size *= 1.2;
      else if (star.mag < 4) size *= 1.1;
    // Maximum veel kleiner gemaakt
    size = Math.min(16, Math.max(2, size));

    sizes.push(size);

    this.stars.push({ 
      position: pos, 
      name: star.name, 
      magnitude: star.mag, 
      color, 
      ra: star.ra, 
      dec: star.dec, 
      size 
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

  // Eenvoudige shader zonder schaling op afstand
  const vertexShader = `
    attribute float size;
    attribute vec3 color;
    varying vec3 vColor;
    void main() {
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      // VASTE grootte - niet schalen met afstand
      gl_PointSize = size;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  
  const fragmentShader = `
    uniform sampler2D pointTexture;
    varying vec3 vColor;
    void main() {
      vec4 texColor = texture2D(pointTexture, gl_PointCoord);
      gl_FragColor = vec4(vColor, texColor.a);
    }
  `;
  
  const material = new THREE.ShaderMaterial({
    uniforms: { pointTexture: { value: this.textures.star } },
    vertexShader, 
    fragmentShader,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  this.starGroup.add(new THREE.Points(geometry, material));

  if (this.showStarNames) {
    this.stars
      .filter(s => s.name && s.magnitude < 4)
      .forEach(star => {
        const label = this.createLabel(star.name!, '#ffd700', 28, 18);
        label.position.copy(star.position.clone().multiplyScalar(1.05));
        this.starGroup.add(label);
      });
  }
}

  // ===== CONSTELLATIES =====
// ===== CONSTELLATIES - precies zoals in originele werkende code =====
private createConstellations(): void {
  const constellations = this.catalog.getConstellationsInView(this.ra, this.dec, 60);
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0x88aaff, opacity: 0.4, transparent: true });

  constellations.forEach(c => {
    c.lines.forEach((line: any) => {
      const from = this.raDecToXYZ(line.from.ra, line.from.dec, 99.5);
      const to = this.raDecToXYZ(line.to.ra, line.to.dec, 99.5);
      const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
      this.constellationLineGroup.add(new THREE.Line(geometry, lineMaterial));
    });

    // PREcies dezelfde center berekening als origineel
    const center = this.calculateConstellationCenter(c);
    
    // PREcies dezelfde label creatie als origineel
    const label = this.createLabelOrigineel(c.name, '#aaccff', 20, 16);
    label.position.copy(center);
    this.constellationNameGroup.add(label);
  });
  
  // Zorg dat de groep altijd zichtbaar is
  this.constellationNameGroup.visible = true;
}

// ===== ORIGINELE label functie (uit je eerste code) =====
private createLabelOrigineel(
  text: string, 
  color: string, 
  baseFontSize = 32,
  scaleDivisor = 15
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  
  canvas.width = 512;
  canvas.height = 256;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.font = `800 ${baseFontSize}px 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  
  ctx.shadowColor = 'rgba(0, 0, 0, 1)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  
  ctx.globalAlpha = 1.0;
  ctx.shadowBlur = 0;
  
  const texture = new THREE.CanvasTexture(canvas);
  // ORIGINEEL materiaal zonder depthTest aanpassingen!
  const material = new THREE.SpriteMaterial({ 
    map: texture, 
    transparent: true,
    depthTest: true,        // Origineel was true
    depthWrite: false,      // Origineel was false
    blending: THREE.NormalBlending,
    sizeAttenuation: true
  });
  
  const sprite = new THREE.Sprite(material);
  
  const baseWidth = canvas.width / scaleDivisor;
  const baseHeight = canvas.height / scaleDivisor;
  
  sprite.userData = { 
    baseWidth, 
    baseHeight,
    minScale: 1.8,
    maxScale: 2.0
  };
  
  sprite.scale.set(baseWidth, baseHeight, 1);
  
  return sprite;
}

  // ===== DSO OBJECTEN =====
  private createDSOObjects(): void {
    const allDSO = this.messierService.realAll();
    const radius = 20;

    allDSO.forEach(obj => {
      const ra = this.raToDeg(obj.rightAscension);
      const dec = this.decToDeg(obj.declination);
      const distance = this.angularDistance(this.ra, this.dec, ra, dec);
      if (distance > radius) return;

      const type = obj.code === 'M' ? 'messier' : 'caldwell';
      const pos = this.raDecToXYZ(ra, dec, 99);

      // Sprite (oranje cirkel)
      const spriteMat = new THREE.SpriteMaterial({
        map: this.textures.dsoNormal,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(pos);
      const sizeArcmin = (obj as any).sizeArcmin || 60;
      const baseScale = 3.0;
      const sizeScale = Math.max(0.5, Math.min(3.0, sizeArcmin / 20));
      sprite.scale.set(baseScale * sizeScale, baseScale * sizeScale, 1);
      sprite.frustumCulled = false;
      this.dsoGroup.add(sprite);

      // Afbeelding
      let imageMesh: THREE.Mesh | undefined;
      imageMesh = this.createDSOImage(obj, pos);

      this.dsoSprites.push({
        object: obj,
        sprite,
        position: pos,
        imageMesh,
        type,
        magnitude: obj.magnitude || 99,
        size: sizeArcmin
      });
    });
  }

  private createDSOImage(obj: any, pos: THREE.Vector3): THREE.Mesh | undefined {
    const code = obj.code;
    const number = obj.messierNumber || obj.messierNumber;
    const path = code === 'M'
      ? `/assets/dso/messier/M${number}.webp`
      : `/assets/dso/caldwell/C${number}.webp`;

    const sizeArcmin = (obj as any).sizeArcmin || 60;
    const scale = (sizeArcmin / 60) * 2.0;

    const geometry = new THREE.PlaneGeometry(scale, scale);
    const material = new THREE.ShaderMaterial({
      uniforms: { map: { value: null } },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          vec4 color = texture2D(map, vUv);
          float dist = distance(vUv, vec2(0.5));
          float alpha = smoothstep(0.6, 0.3, dist);
          gl_FragColor = vec4(color.rgb, color.a * alpha);
        }
      `
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.position.copy(pos);
    plane.lookAt(0, 0, 0);
    plane.userData = obj;

    this.textureLoader.load(path, texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      if (plane.material instanceof THREE.ShaderMaterial) {
        plane.material.uniforms['map'].value = texture;
      }
    }, undefined, (error) => {
      console.warn(`Could not load DSO image: ${path}`, error);
    });

    this.dsoImageGroup.add(plane);
    return plane;
  }

  // ===== GRID =====
  private createGrid(): void {
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x446688, opacity: 0.15, transparent: true });
    for (let ra = 0; ra < 360; ra += 30) {
      const points: THREE.Vector3[] = [];
      for (let dec = -85; dec <= 85; dec += 5) points.push(this.raDecToXYZ(ra, dec, 99.8));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }
    for (let dec = -80; dec <= 80; dec += 20) {
      const points: THREE.Vector3[] = [];
      for (let ra = 0; ra <= 360; ra += 10) points.push(this.raDecToXYZ(ra, dec, 99.8));
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }
    const eqPoints: THREE.Vector3[] = [];
    for (let ra = 0; ra <= 360; ra += 5) eqPoints.push(this.raDecToXYZ(ra, 0, 99.8));
    const eqGeo = new THREE.BufferGeometry().setFromPoints(eqPoints);
    const eqMat = new THREE.LineBasicMaterial({ color: 0x6688aa, opacity: 0.25, transparent: true });
    this.gridGroup.add(new THREE.Line(eqGeo, eqMat));
  }

  // ===== TARGET HIGHLIGHT =====
  private createTargetHighlight(): void {
    const targetObj = this.messierService.realAll().find(m =>
      `${m.code}${m.messierNumber}` === this.targetName
    );
    if (!targetObj) return;
    const ra = this.raToDeg(targetObj.rightAscension);
    const dec = this.decToDeg(targetObj.declination);
    this.targetPosition.copy(this.raDecToXYZ(ra, dec, 99.5));

    const spriteMat = new THREE.SpriteMaterial({
      map: this.textures.highlight,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
      alphaTest: 0.01
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(this.targetPosition);
    sprite.scale.set(3.2, 3.2, 1);
    this.targetHighlightGroup.add(sprite);
  }

  // ===== ZICHTBAARHEID =====
private updateVisibility(): void {
  this.constellationLineGroup.visible = this.showConstellations;
  this.showConstellationNames = true;
  this.constellationNameGroup.visible = this.showConstellations && this.showConstellationNames;
  this.dsoGroup.visible = this.showMessier;
  this.dsoImageGroup.visible = true;
  this.gridGroup.visible = this.showGrid;
  this.skySphere.scale.x = this.mirrored ? -1 : 1;
}

  // ===== CENTEREN =====
  private centerOnTarget(): void {
    if (!this.camera || !this.controls) return;
    const targetDir = this.raDecToXYZ(this.ra, this.dec, 1).normalize();
    this.controls.target.copy(targetDir);
    this.camera.lookAt(targetDir);
    this.targetFov = this.fovDegrees;
    this.camera.fov = this.targetFov;
    this.camera.updateProjectionMatrix();
    this.updateLabelSizes();
  }

  // ===== HOVER & CLICK =====
  private onMouseMove = (event: MouseEvent) => this.checkHover(event.clientX, event.clientY);
  private onClick = (event: MouseEvent) => this.handleClick(event.clientX, event.clientY);

  private checkHover(x: number, y: number) {
    // Geen showMessier check, altijd hover mogelijk
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Raycast zowel sprites als afbeeldingen
    const objects = [
      ...this.dsoSprites.map(d => d.sprite),
      ...this.dsoImageGroup.children
    ];
    const intersects = this.raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      let dsoData: DSOSpriteData | undefined;
      if (hit instanceof THREE.Sprite) {
        dsoData = this.dsoSprites.find(d => d.sprite === hit);
      } else {
        // het is een mesh (afbeelding)
        dsoData = this.dsoSprites.find(d => d.imageMesh === hit);
      }
      if (dsoData) {
        if (this.hoveredDSO !== dsoData) {
          // vorige hover terugzetten
          if (this.hoveredDSO) {
            this.hoveredDSO.sprite.material.map = this.textures.dsoNormal;
            this.hoveredDSO.sprite.scale.set(3.0, 3.0, 1);
          }
          this.hoveredDSO = dsoData;
          this.hoveredDSO.sprite.material.map = this.textures.dsoHover;
          this.hoveredDSO.sprite.scale.set(4.5, 4.5, 1);
          this.hoverTooltipContent = `${dsoData.object.code}${dsoData.object.messierNumber || dsoData.object.messierNumber}: ${dsoData.object.name}`;
          this.cdr.detectChanges();
        }
      }
    } else {
      if (this.hoveredDSO) {
        this.hoveredDSO.sprite.material.map = this.textures.dsoNormal;
        this.hoveredDSO.sprite.scale.set(3.0, 3.0, 1);
        this.hoveredDSO = null;
        this.hoverTooltipContent = null;
        this.cdr.detectChanges();
      }
    }
  }

  private handleClick(x: number, y: number) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);

    const objects = [
      ...this.dsoSprites.map(d => d.sprite),
      ...this.dsoImageGroup.children
    ];
    const intersects = this.raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      let dsoData: DSOSpriteData | undefined;
      if (hit instanceof THREE.Sprite) {
        dsoData = this.dsoSprites.find(d => d.sprite === hit);
      } else {
        dsoData = this.dsoSprites.find(d => d.imageMesh === hit);
      }
      if (dsoData) {
        // reset vorige selectie
        if (this.selectedDSO) {
          this.selectedDSO.sprite.material.map = this.textures.dsoNormal;
        }
        this.selectedDSO = dsoData;
        this.selectedDSO.sprite.material.map = this.textures.dsoSelected; // groen
        this.infoPanelContent = dsoData.object;
        this.showInfoPanel = true;
        this.cdr.detectChanges();
      }
    }
  }

  // ===== DOUBLE TAP / ZOOM =====
  private handleDoubleClick(x: number, y: number) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = ((x - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((y - rect.top) / rect.height) * 2 + 1;

    // probeer eerst DSO te raken
    this.mouse.x = mouseX; this.mouse.y = mouseY;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const objects = [
      ...this.dsoSprites.map(d => d.sprite),
      ...this.dsoImageGroup.children
    ];
    const intersects = this.raycaster.intersectObjects(objects);
    if (intersects.length > 0) {
      const hit = intersects[0].object;
      let dsoData: DSOSpriteData | undefined;
      if (hit instanceof THREE.Sprite) {
        dsoData = this.dsoSprites.find(d => d.sprite === hit);
      } else {
        dsoData = this.dsoSprites.find(d => d.imageMesh === hit);
      }
      if (dsoData) {
        this.zoomToPoint(dsoData.position, 0.3);
        return;
      }
    }

    // zoom naar punt op bol
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
    const sphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 1);
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectSphere(sphere, point)) {
      this.zoomToPoint(point, 0.4);
    }
  }

  private zoomToPoint(targetPoint: THREE.Vector3, zoomFactor: number) {
    if (this.zoomAnimationFrame) cancelAnimationFrame(this.zoomAnimationFrame);
    const startDir = this.controls.target.clone().normalize();
    const endDir = targetPoint.clone().normalize();
    const startFov = this.targetFov;
    const endFov = Math.max(this.MIN_FOV, Math.min(this.MAX_FOV, startFov * zoomFactor));
    const wasDamping = this.controls.enableDamping;
    this.controls.enableDamping = false;
    const startTime = performance.now();
    const duration = 600;
    const animate = () => {
      const now = performance.now();
      const progress = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentDir = new THREE.Vector3().lerpVectors(startDir, endDir, ease).normalize();
      this.controls.target.copy(currentDir);
      this.targetFov = startFov + (endFov - startFov) * ease;
      this.updateLabelSizes();
      if (progress < 1) {
        this.zoomAnimationFrame = requestAnimationFrame(animate);
      } else {
        this.controls.enableDamping = wasDamping;
        this.zoomAnimationFrame = null;
      }
    };
    this.zoomAnimationFrame = requestAnimationFrame(animate);
  }

  // ===== ZOEKEN =====
  searchObjects(): void {
    if (!this.searchQuery.trim()) { this.searchResults = []; return; }
    const q = this.searchQuery.toLowerCase();
    const all = this.messierService.realAll();
    this.searchResults = all.filter(obj => {
      const code = `${obj.code}${obj.messierNumber || obj.messierNumber}`.toLowerCase();
      const name = obj.name?.toLowerCase() || '';
      const type = obj.type?.toLowerCase() || '';
      const constell = obj.constellation?.toLowerCase() || '';
      return code.includes(q) || name.includes(q) || type.includes(q) || constell.includes(q);
    }).slice(0, 20);
  }

  selectSearchResult(obj: any): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchPanel = false;
    this.goToDSODetails(obj);
  }

  // ===== HUD UPDATE =====
  private updateHUD(): void {
    if (!this.camera || !this.controls) return;
    const targetDir = this.controls.target.clone().normalize();
    let ra = Math.atan2(targetDir.x, targetDir.z) * 180 / Math.PI;
    let dec = Math.asin(targetDir.y) * 180 / Math.PI;
    ra = (ra + 360) % 360;
    const raHours = ra / 15;
    const rh = Math.floor(raHours);
    const rm = Math.floor((raHours - rh) * 60);
    const rs = Math.floor(((raHours - rh) * 60 - rm) * 60);
    this.hudInfo = {
      ra: `${rh.toString().padStart(2,'0')}h ${rm.toString().padStart(2,'0')}m ${rs.toString().padStart(2,'0')}s`,
      dec: `${dec >= 0 ? '+' : ''}${dec.toFixed(2)}°`,
      fov: this.camera.fov,
      altitude: 90 - Math.abs(dec),
      azimuth: (ra + 180) % 360
    };
  }

  // ===== SCREENSHOT =====
  takeScreenshot(): void {
    if (!this.renderer) return;
    this.composer.render();
    const canvas = this.renderer.domElement;
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `starhop-${this.targetName || 'view'}-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.png`;
    link.href = dataUrl;
    link.click();
  }

  // ===== PUBLIEKE METHODES =====
  resetView(): void {
    if (this.zoomAnimationFrame) cancelAnimationFrame(this.zoomAnimationFrame);
    this.centerOnTarget();
    this.showInfoPanel = false;
    this.camera.up.set(0,1,0);
    this.rotationAngle = 0;
    const targetDir = this.raDecToXYZ(this.ra, this.dec, 1).normalize();
    this.controls.target.copy(targetDir);
    this.camera.position.set(0,0,0);
    this.camera.lookAt(targetDir);
    this.targetFov = this.fovDegrees;
    this.camera.fov = this.targetFov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.updateLabelSizes();
  }

  toggleMirror(): void { this.mirrored = !this.mirrored; this.skySphere.scale.x = this.mirrored ? -1 : 1; }
  toggleStarNames(): void { this.showStarNames = !this.showStarNames; this.buildSky(); }
  toggleConstellations(): void {
    this.showConstellations = !this.showConstellations;
    this.constellationLineGroup.visible = this.showConstellations;
    this.constellationNameGroup.visible = this.showConstellations && this.showConstellationNames;
  }
  toggleConstellationNames(): void {
    this.showConstellationNames = !this.showConstellationNames;
    this.constellationNameGroup.visible = this.showConstellations && this.showConstellationNames;
  }
  toggleMessier(): void {
    this.showMessier = !this.showMessier;
    this.dsoGroup.visible = this.showMessier; // alleen cirkels
    // afbeeldingen blijven altijd zichtbaar
  }
  toggleGrid(): void { this.showGrid = !this.showGrid; this.gridGroup.visible = this.showGrid; }
  rotateLeft(): void { this.rotateField(-15); }
  rotateRight(): void { this.rotateField(15); }
  private rotateField(degrees: number): void {
    if (!this.camera || !this.controls) return;
    const angle = THREE.MathUtils.degToRad(degrees);
    this.rotationAngle += degrees;
    const viewDir = new THREE.Vector3().subVectors(this.controls.target, this.camera.position).normalize();
    const q = new THREE.Quaternion().setFromAxisAngle(viewDir, angle);
    this.skySphere.quaternion.premultiply(q);
    this.skySphere.quaternion.normalize();
  }
  setDensity(density: 'sparse' | 'normal' | 'dense'): void {
    this.starDensity = density;
    this.catalog.setStarDensity(density);
    this.buildSky();
  }
  hideInfoPanel(): void { this.showInfoPanel = false; this.infoPanelContent = null; }
  handleImageError(event: Event): void { (event.target as HTMLImageElement).src = '/assets/dso/placeholder.webp'; }

  goToDSODetails(obj: any): void {
    const code = obj.code;
    const number = obj.messierNumber || obj.caldwellNumber;
    const url = `/dso/${code}${number}`;
    
    // Forceer een echte pagina navigatie door eerst naar een dummy route te gaan
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([url]);
    });
    
    this.hideInfoPanel();
  }

  // ===== UTILITIES =====
  private raDecToXYZ(ra: number, dec: number, radius: number): THREE.Vector3 {
    const raRad = THREE.MathUtils.degToRad(ra - 90);
    const decRad = THREE.MathUtils.degToRad(dec);
    return new THREE.Vector3(
      radius * Math.cos(decRad) * Math.sin(raRad),
      radius * Math.sin(decRad),
      radius * Math.cos(decRad) * Math.cos(raRad)
    );
  }

  private calculateConstellationCenter(constellation: any): THREE.Vector3 {
    const center = new THREE.Vector3();
    let count = 0;
    constellation.lines.forEach((line: any) => {
      center.add(this.raDecToXYZ(line.from.ra, line.from.dec, 101));
      center.add(this.raDecToXYZ(line.to.ra, line.to.dec, 101));
      count += 2;
    });
    return center.divideScalar(count);
  }

  private bvToColor(bv?: number): THREE.Color {
    if (bv == null || isNaN(bv)) return new THREE.Color(0xffffff);
    const t = Math.max(-0.4, Math.min(2.0, bv));
    if (t < 0.0) return new THREE.Color('#fff4ea');
    if (t < 0.4) return new THREE.Color('#fff4ea');
    if (t < 0.8) return new THREE.Color('#fff4ea');
    if (t < 1.2) return new THREE.Color('#ffd2a1');
    return new THREE.Color('#fff4ea');
  }

  private raToDeg(ra: string): number {
    const parts = ra.split(':').map(Number);
    return (parts[0] + parts[1]/60 + parts[2]/3600) * 15;
  }

  private decToDeg(dec: string): number {
    const sign = dec.startsWith('-') ? -1 : 1;
    const parts = dec.replace(/[+-]/, '').split(':').map(Number);
    return sign * (parts[0] + parts[1]/60 + parts[2]/3600);
  }

  private angularDistance(ra1: number, dec1: number, ra2: number, dec2: number): number {
    const dRA = (ra1 - ra2) * Math.PI/180;
    const dDec = (dec1 - dec2) * Math.PI/180;
    const a = Math.sin(dDec/2)**2 + Math.cos(dec1*Math.PI/180)*Math.cos(dec2*Math.PI/180)*Math.sin(dRA/2)**2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 180/Math.PI;
  }

private createLabel(text: string, color: string, baseFontSize = 32, scaleDivisor = 15): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0,0,512,256);
  ctx.font = `800 ${baseFontSize}px 'Inter', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,1)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 128);
  const texture = new THREE.CanvasTexture(canvas);
  
  const material = new THREE.SpriteMaterial({ 
    map: texture, 
    transparent: true, 
    depthTest: false,  
    depthWrite: false,
    blending: THREE.NormalBlending, 
    sizeAttenuation: true 
  });
  
  const sprite = new THREE.Sprite(material);
  const baseWidth = canvas.width / scaleDivisor;
  const baseHeight = canvas.height / scaleDivisor;
  sprite.userData = { baseWidth, baseHeight, minScale: 1.8, maxScale: 2.0 };
  sprite.scale.set(baseWidth, baseHeight, 1);
  
  sprite.renderOrder = 100;
  
  return sprite;
}
private updateLabelSizes(): void {
  if (!this.camera) return;
  
  // Alleen constellation namen aanpassen, geen sterren meer
  this.constellationNameGroup.children.forEach(child => {
    if (child instanceof THREE.Sprite && child.userData?.['baseWidth']) {
      const { baseWidth, baseHeight, minScale = 1.0, maxScale = 2.0 } = child.userData;
      // Alleen bij grote zoomverschillen een beetje aanpassen
      const zoomFactor = Math.min(2.0, 20 / this.camera.fov);
      const clamped = Math.max(minScale, Math.min(maxScale, zoomFactor));
      child.scale.set(baseWidth * clamped, baseHeight * clamped, 1);
    }
  });
  
  // Sterren labels niet aanpassen
  this.starGroup.children.forEach(child => {
    if (child instanceof THREE.Sprite && child.userData?.['baseWidth']) {
      // Houd labels van sterren op vaste grootte
      const { baseWidth, baseHeight } = child.userData;
      child.scale.set(baseWidth, baseHeight, 1);
    }
  });
}

  // ===== TOUCH =====
  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!this.isZooming) { this.isZooming = true; this.controls.enableRotate = false; }
    const speed = this.targetFov < 10 ? 0.02 : 0.04;
    this.targetFov += event.deltaY * 0.01 * speed * 60;
    this.targetFov = THREE.MathUtils.clamp(this.targetFov, this.MIN_FOV, this.MAX_FOV);
    this.updateLabelSizes();
    clearTimeout(this.zoomTimeout);
    this.zoomTimeout = setTimeout(() => { this.isZooming = false; this.controls.enableRotate = true; }, 200);
  };

  private onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      this.isZooming = true; this.controls.enableRotate = false;
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this.touchStartDistance = Math.sqrt(dx*dx + dy*dy);
      this.initialFov = this.camera.fov;
    } else if (event.touches.length === 1) {
      this.touchStartTime = Date.now();
      this.touchStartPos.x = event.touches[0].clientX;
      this.touchStartPos.y = event.touches[0].clientY;
    }
  };

  private onTouchMove = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx*dx + dy*dy);
      const factor = 1 + ((this.touchStartDistance / distance) - 1) * 0.8;
      this.targetFov = THREE.MathUtils.clamp(this.initialFov * factor, this.MIN_FOV, this.MAX_FOV);
      this.updateLabelSizes();
    } else if (event.touches.length === 1 && this.isZooming) {
      event.preventDefault();
    }
  };

  private onTouchEnd = (event: TouchEvent) => {
    if (this.isZooming) {
      event.preventDefault();
      if (event.touches.length === 0) {
        this.isZooming = false;
        this.controls.enableRotate = true;
        this.touchStartPos.x = 0; this.touchStartPos.y = 0; this.touchStartTime = 0;
      }
      return;
    }
    const now = Date.now();
    if (event.touches.length === 0 && event.changedTouches.length === 1 && !this.isZooming) {
      const touch = event.changedTouches[0];
      const timeDiff = now - this.lastTapTime;
      const dx = Math.abs(touch.clientX - this.lastTapPosition.x);
      const dy = Math.abs(touch.clientY - this.lastTapPosition.y);
      if (timeDiff < this.DOUBLE_TAP_DELAY && dx < this.DOUBLE_TAP_MAX_DIST && dy < this.DOUBLE_TAP_MAX_DIST) {
        this.handleDoubleClick(touch.clientX, touch.clientY);
      } else if (now - this.touchStartTime < 300 && Math.abs(touch.clientX - this.touchStartPos.x) < 10 && Math.abs(touch.clientY - this.touchStartPos.y) < 10) {
        this.handleClick(touch.clientX, touch.clientY);
      }
      this.lastTapTime = now;
      this.lastTapPosition.x = touch.clientX;
      this.lastTapPosition.y = touch.clientY;
    }
  };

  // ===== ANIMATIE LOOP =====
  private animate = () => {
    if (this.isBrowser) this.frameId = requestAnimationFrame(this.animate);
    if (Math.abs(this.camera.fov - this.targetFov) > 0.01) {
      this.camera.fov += (this.targetFov - this.camera.fov) * 0.1;
      this.camera.updateProjectionMatrix();
      this.updateLabelSizes();
      this.updateHUD();
    }
    this.controls.update();
    this.composer.render();
  };
}