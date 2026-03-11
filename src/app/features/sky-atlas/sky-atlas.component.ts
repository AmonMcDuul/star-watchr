import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  HostListener,
  signal,
  ChangeDetectorRef,
  PLATFORM_ID
} from '@angular/core';

import * as THREE from 'three';
import { StarCatalogService } from '../../services/star-catalog.service';
import { MessierService } from '../../services/messier.service';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

// Direct imports
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

interface StarData {
  position: THREE.Vector3;
  name?: string;
  magnitude: number;
  color: THREE.Color;
  ra: number;
  dec: number;
  size: number;
}

interface DSOSpriteData {
  object: any;
  sprite: THREE.Sprite;
  position: THREE.Vector3;
  imageMesh?: THREE.Mesh;
  type: 'messier' | 'caldwell';
  magnitude: number;
  size: number;
}

interface HudInfo {
  ra: string;
  dec: string;
  fov: number;
}

@Component({
  selector: 'app-sky-atlas',
  imports: [CommonModule, FormsModule],
  templateUrl: './sky-atlas.component.html',
  styleUrls: ['./sky-atlas.component.scss']
})
export class SkyAtlasComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;

  private catalog = inject(StarCatalogService);
  private messierService = inject(MessierService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);

  // THREE core
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private composer!: EffectComposer;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  private textureLoader = new THREE.TextureLoader();

  // Groups
  private skySphere = new THREE.Group();
  private starGroup = new THREE.Group();
  private constellationLineGroup = new THREE.Group();
  private constellationNameGroup = new THREE.Group();
  private dsoGroup = new THREE.Group();           // oranje cirkels
  private dsoImageGroup = new THREE.Group();      // DSO afbeeldingen
  private labelGroup = new THREE.Group();         // sterren labels
  private gridGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();

  // Animation
  private frameId = 0;
  private targetFov = 60;
  private lastFrame = 0;

  // Star data
  private stars: StarData[] = [];
  public dsoSprites: DSOSpriteData[] = [];

  // Textures
  private textures: {
    star: THREE.CanvasTexture;
    dsoNormal: THREE.CanvasTexture;
    dsoHover: THREE.CanvasTexture;
    dsoSelected: THREE.CanvasTexture;
  } = {} as any;

  // Touch/zoom state
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
  private readonly MIN_FOV = 5;
  private readonly MAX_FOV = 120;

  // Hover/selectie
  private hoveredDSO: DSOSpriteData | null = null;
  private selectedDSO: DSOSpriteData | null = null;

  // UI state (signals)
  showConstellations = signal(true);
  showConstellationNames = signal(true);
  showStarNames = signal(false);
  showMessier = signal(false);
  showGrid = signal(true);
  showInfoPanel = signal(false);
  showSearch = signal(false);
  nightMode = signal(false);

  infoPanelContent = signal<any>(null);
  hoverTooltipContent = signal<string | null>(null);
  hoverTooltipPosition = signal({ x: 0, y: 0 });

  hudInfo: HudInfo = { ra: '', dec: '', fov: 0 };

  searchQuery = '';
  searchResults: any[] = [];
  showSearchResults = false;

  private resizeThrottleTimeout: any;
  private isBrowser = isPlatformBrowser(this.platformId);

  // =====================================================
  // LIFECYCLE
  // =====================================================

  async ngAfterViewInit() {
    if (!this.isBrowser) return;

    this.catalog.setStarDensity('all');
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
    this.animate();

    this.updateHUD();
  }

  ngOnDestroy() {
    if (!this.isBrowser) return;

    cancelAnimationFrame(this.frameId);
    if (this.zoomAnimationFrame) cancelAnimationFrame(this.zoomAnimationFrame);
    clearTimeout(this.resizeThrottleTimeout);
    clearTimeout(this.zoomTimeout);

    this.renderer?.dispose();
    this.composer?.dispose();
    Object.values(this.textures).forEach(t => t?.dispose());

    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('click', this.onClick);
  }

  // =====================================================
  // INIT
  // =====================================================

  private createTextures() {
    // Ster – glow (kleiner voor subtieler effect)
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 64; starCanvas.height = 64;
    const sCtx = starCanvas.getContext('2d')!;
    const grad = sCtx.createRadialGradient(32,32,0,32,32,32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,230,0.8)');
    grad.addColorStop(0.8, 'rgba(255,220,150,0.2)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    sCtx.fillStyle = grad;
    sCtx.fillRect(0,0,64,64);
    this.textures.star = new THREE.CanvasTexture(starCanvas);

    // DSO normaal (oranje cirkel)
    const dsoCanvas = document.createElement('canvas');
    dsoCanvas.width = 64; dsoCanvas.height = 64;
    const dCtx = dsoCanvas.getContext('2d')!;
    dCtx.clearRect(0,0,64,64);
    dCtx.strokeStyle = '#ffaa44';
    dCtx.lineWidth = 2.5;
    dCtx.beginPath();
    dCtx.arc(32,32,14,0,2*Math.PI);
    dCtx.stroke();
    dCtx.fillStyle = 'rgba(255,170,68,0.15)';
    dCtx.beginPath();
    dCtx.arc(32,32,10,0,2*Math.PI);
    dCtx.fill();
    this.textures.dsoNormal = new THREE.CanvasTexture(dsoCanvas);

    // DSO hover (wit)
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

    // DSO selectie (groen)
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
  }

  private initThree() {
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
    this.controls.rotateSpeed = -0.2;
    this.controls.target.set(0,0,1);

    this.scene.add(this.skySphere);
    this.skySphere.add(
      this.starGroup,
      this.constellationLineGroup,
      this.constellationNameGroup,
      this.dsoGroup,
      this.dsoImageGroup,
      this.labelGroup,
      this.gridGroup,
      this.highlightGroup
    );
  }

  private initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(this.canvasRef.nativeElement.clientWidth, this.canvasRef.nativeElement.clientHeight),
      0.1, 0.2, 0.6
    );
    this.composer.addPass(bloomPass);
  }

  private setupEventListeners() {
    const canvas = this.canvasRef.nativeElement;
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
  }

  // =====================================================
  // SKY BUILDING
  // =====================================================

  private buildSky() {
    this.clearGroups();
    this.createStars();
    this.createConstellations();
    this.createDSOObjects();
    this.createCelestialGrid();
    this.rebuildLabels();
    this.updateVisibility();
  }

  private clearGroups() {
    [this.starGroup, this.constellationLineGroup, this.constellationNameGroup,
     this.dsoGroup, this.dsoImageGroup, this.labelGroup, this.gridGroup, this.highlightGroup]
      .forEach(g => { while(g.children.length) g.remove(g.children[0]); });
    this.stars = [];
    this.dsoSprites = [];
  }

  // ===== STERREN met twinkeling =====
  private createStars() {
    const allStars = this.catalog.getStarsNear(0, 0, 180);
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];

    allStars.forEach(star => {
      const pos = this.raDecToXYZ(star.ra, star.dec, 100);
      const color = this.bvToColor(star.ci);
      positions.push(pos.x, pos.y, pos.z);
      colors.push(color.r, color.g, color.b);

      let size = 4.0 * (6.5 - Math.min(star.mag, 6.5)) * 0.7;
      if (star.mag < 0) size *= 1.4;
      else if (star.mag < 1) size *= 1.2;
      else if (star.mag < 2) size *= 1.1;
      size = Math.min(16, Math.max(2, size));
      sizes.push(size);

      this.stars.push({ position: pos, name: star.name, magnitude: star.mag, color, ra: star.ra, dec: star.dec, size });
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const vertexShader = `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      varying float vRand;
      void main() {
        vColor = color;
        vRand = fract(sin(position.x * 12.9898 + position.y * 78.233 + position.z * 45.5432) * 43758.5453);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    const fragmentShader = `
      uniform sampler2D pointTexture;
      uniform float time;
      uniform float nightMode;
      varying vec3 vColor;
      varying float vRand;
      void main() {
        vec4 texColor = texture2D(pointTexture, gl_PointCoord);
        float twinkle = 0.8 + 0.3 * sin(time * 4.0 + vRand * 10.0);
        vec3 finalColor = vColor;
        if (nightMode > 0.5) {
          finalColor = vec3(1.0, 0.3, 0.1) * (vColor.r * 0.3 + vColor.g * 0.6 + vColor.b * 0.1);
        }
        gl_FragColor = vec4(finalColor, texColor.a * twinkle);
      }
    `;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.textures.star },
        time: { value: 0 },
        nightMode: { value: this.nightMode() ? 1 : 0 }
      },
      vertexShader, fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.starGroup.add(new THREE.Points(geometry, material));
  }

  // ===== CONSTELLATIES (kleinere labels) =====
  private createConstellations() {
    const constellations = this.catalog.getConstellations();
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x88aaff, opacity: 0.4, transparent: true });

    constellations.forEach(c => {
      c.lines.forEach((line: any) => {
        const from = this.raDecToXYZ(line.from.ra, line.from.dec, 99.5);
        const to = this.raDecToXYZ(line.to.ra, line.to.dec, 99.5);
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        this.constellationLineGroup.add(new THREE.Line(geometry, lineMaterial));
      });

      const center = this.calculateConstellationCenter(c);
      // Kleinere labels: fontSize 32, scaleDivisor 30 (was 40,20)
      const label = this.createLabel(c.name, '#aaccff', 40, 40);
      label.position.copy(center);
      this.constellationNameGroup.add(label);
    });
  }

  // ===== DSO OBJECTEN =====
  private createDSOObjects() {
    const allDSO = this.messierService.realAll();
    const radius = 180;

    allDSO.forEach(obj => {
      const ra = this.raToDeg(obj.rightAscension);
      const dec = this.decToDeg(obj.declination);
      const distance = this.angularDistance(0, 0, ra, dec);
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
    const number = obj.messierNumber || obj.caldwellNumber;
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
    }, undefined, () => {});

    this.dsoImageGroup.add(plane);
    return plane;
  }

  // ===== HEMELROOSTER =====
  private createCelestialGrid() {
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x446688, opacity: 0.08, transparent: true });
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
    const eqMat = new THREE.LineBasicMaterial({ color: 0x6688aa, opacity: 0.15, transparent: true });
    this.gridGroup.add(new THREE.Line(eqGeo, eqMat));
  }

  // ===== LABELS (sterrennamen) =====
  private rebuildLabels() {
    while(this.labelGroup.children.length) this.labelGroup.remove(this.labelGroup.children[0]);

    if (this.showStarNames()) {
      this.stars
        .filter(s => s.name && s.magnitude < 3.0)
        .forEach(star => {
          const fontSize = star.magnitude < 1 ? 22 : 18;
          const label = this.createLabel(star.name!, '#ffd700', fontSize, 35);
          label.position.copy(star.position.clone().multiplyScalar(1.04));
          this.labelGroup.add(label);
        });
    }
  }

  private updateLabelSizes() {
    // Beperkte schaling om te voorkomen dat labels te groot worden bij inzoomen
    const zoomFactor = Math.max(0.6, Math.min(1.5, 45 / this.camera.fov));
    this.labelGroup.children.forEach(child => {
      if (child instanceof THREE.Sprite && child.userData['baseWidth']) {
        child.scale.set(
          child.userData['baseWidth'] * zoomFactor,
          child.userData['baseHeight'] * zoomFactor,
          1
        );
      }
    });
    this.constellationNameGroup.children.forEach(child => {
      if (child instanceof THREE.Sprite && child.userData['baseWidth']) {
        child.scale.set(
          child.userData['baseWidth'] * zoomFactor,
          child.userData['baseHeight'] * zoomFactor,
          1
        );
      }
    });
  }

  // ===== ZICHTBAARHEID =====
  private updateVisibility() {
    this.constellationLineGroup.visible = this.showConstellations();
    this.constellationNameGroup.visible = this.showConstellations() && this.showConstellationNames();
    this.dsoGroup.visible = this.showMessier();
    this.dsoImageGroup.visible = true;
    this.gridGroup.visible = this.showGrid();
  }

  // ===== NIGHT MODE =====
  private updateNightMode() {
    this.starGroup.children.forEach(child => {
      if (child instanceof THREE.Points && child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms['nightMode'].value = this.nightMode() ? 1 : 0;
      }
    });

    const lineColor = this.nightMode() ? 0x442211 : 0x88aaff;
    const gridColor = this.nightMode() ? 0x331100 : 0x446688;
    this.constellationLineGroup.children.forEach(child => {
      if (child instanceof THREE.Line && child.material instanceof THREE.LineBasicMaterial) {
        child.material.color.setHex(lineColor);
      }
    });
    this.gridGroup.children.forEach(child => {
      if (child instanceof THREE.Line && child.material instanceof THREE.LineBasicMaterial) {
        child.material.color.setHex(gridColor);
      }
    });

    this.dsoSprites.forEach(dso => {
      if (dso.sprite.material instanceof THREE.SpriteMaterial) {
        dso.sprite.material.color.setHex(this.nightMode() ? 0x884422 : 0xffaa44);
      }
    });
  }

  // ===== HOVER & CLICK =====
  private onMouseMove = (event: MouseEvent) => this.checkHover(event.clientX, event.clientY);
  private onClick = (event: MouseEvent) => this.handleClick(event.clientX, event.clientY);

  private checkHover(x: number, y: number) {
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
        if (this.hoveredDSO !== dsoData) {
          // Reset vorige hover (rekening houdend met selectie)
          if (this.hoveredDSO) {
            if (this.hoveredDSO === this.selectedDSO) {
              this.hoveredDSO.sprite.material.map = this.textures.dsoSelected;
            } else {
              this.hoveredDSO.sprite.material.map = this.textures.dsoNormal;
            }
            this.hoveredDSO.sprite.scale.set(3.0, 3.0, 1);
            this.hoveredDSO.sprite.material.needsUpdate = true;
          }

          // Alleen hover toepassen als niet geselecteerd
          if (dsoData !== this.selectedDSO) {
            this.hoveredDSO = dsoData;
            this.hoveredDSO.sprite.material.map = this.textures.dsoHover;
            this.hoveredDSO.sprite.scale.set(4.5, 4.5, 1);
            this.hoveredDSO.sprite.material.needsUpdate = true;
          } else {
            // Bij geselecteerd object alleen tooltip tonen, geen texture change
            this.hoveredDSO = dsoData;
          }

          const type = dsoData.object.code === 'M' ? 'Messier' : 'Caldwell';
          const number = dsoData.object.messierNumber || dsoData.object.caldwellNumber;
          this.hoverTooltipContent.set(`${type} ${number}: ${dsoData.object.name}`);
        }
      }
    } else {
      if (this.hoveredDSO) {
        if (this.hoveredDSO === this.selectedDSO) {
          this.hoveredDSO.sprite.material.map = this.textures.dsoSelected;
        } else {
          this.hoveredDSO.sprite.material.map = this.textures.dsoNormal;
        }
        this.hoveredDSO.sprite.scale.set(3.0, 3.0, 1);
        this.hoveredDSO.sprite.material.needsUpdate = true;
        this.hoveredDSO = null;
        this.hoverTooltipContent.set(null);
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
        if (this.selectedDSO && this.selectedDSO !== dsoData) {
          this.selectedDSO.sprite.material.map = this.textures.dsoNormal;
          this.selectedDSO.sprite.material.needsUpdate = true;
        }
        this.selectedDSO = dsoData;
        this.selectedDSO.sprite.material.map = this.textures.dsoSelected;
        this.selectedDSO.sprite.material.needsUpdate = true;
        this.infoPanelContent.set(dsoData.object);
        this.showInfoPanel.set(true);
        this.cdr.detectChanges();
      }
    }
  }

  private handleDoubleClick(x: number, y: number) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = ((x - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((y - rect.top) / rect.height) * 2 + 1;

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
  onSearch(query: string) {
    this.searchQuery = query;
    if (query.length < 2) {
      this.searchResults = [];
      this.showSearchResults = false;
      return;
    }

    const results: any[] = [];

    this.stars
      .filter(s => s.name && s.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5)
      .forEach(s => results.push({ type: 'star', name: s.name, ra: s.ra, dec: s.dec, mag: s.magnitude }));

    this.dsoSprites
      .filter(d =>
        d.object.name.toLowerCase().includes(query.toLowerCase()) ||
        `${d.object.code}${d.object.messierNumber || d.object.caldwellNumber}`.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 5)
      .forEach(d => results.push({ type: 'messier', name: `${d.object.code}${d.object.messierNumber || d.object.caldwellNumber}: ${d.object.name}`, object: d.object }));

    this.searchResults = results;
    this.showSearchResults = results.length > 0;
    this.cdr.detectChanges();
  }

  selectSearchResult(result: any) {
    this.showSearchResults = false;
    this.searchQuery = '';
    this.showSearch.set(false);

    if (result.type === 'star') {
      const pos = this.raDecToXYZ(result.ra, result.dec, 10);
      this.camera.lookAt(pos.x, pos.y, pos.z);
      this.controls.target.copy(pos);
    } else if (result.type === 'messier') {
      const ra = this.raToDeg(result.object.rightAscension);
      const dec = this.decToDeg(result.object.declination);
      const pos = this.raDecToXYZ(ra, dec, 10);
      this.camera.lookAt(pos.x, pos.y, pos.z);
      this.controls.target.copy(pos);
      this.infoPanelContent.set(result.object);
      this.showInfoPanel.set(true);
      this.cdr.detectChanges();
    }
  }

  // ===== HUD UPDATE =====
  private updateHUD() {
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
      fov: this.camera.fov
    };
  }

  // ===== UI ACTIES =====
  toggleConstellations() {
    this.showConstellations.update(v => !v);
    this.constellationLineGroup.visible = this.showConstellations();
    this.constellationNameGroup.visible = this.showConstellations() && this.showConstellationNames();
  }

  toggleConstellationNames() {
    this.showConstellationNames.update(v => !v);
    this.constellationNameGroup.visible = this.showConstellations() && this.showConstellationNames();
  }

  toggleStarNames() {
    this.showStarNames.update(v => !v);
    this.rebuildLabels();
  }

  toggleMessier() {
    this.showMessier.update(v => !v);
    this.dsoGroup.visible = this.showMessier();
  }

  toggleGrid() {
    this.showGrid.update(v => !v);
    this.gridGroup.visible = this.showGrid();
  }

  toggleNightMode() {
    this.nightMode.update(v => !v);
    this.updateNightMode();
  }

  toggleSearch() {
    this.showSearch.update(v => !v);
    if (!this.showSearch()) {
      this.searchResults = [];
      this.showSearchResults = false;
    }
  }

  resetView() {
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, 1);
    this.controls.target.set(0, 0, 1);
    this.targetFov = 60;
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.updateLabelSizes();
    this.updateHUD();
  }

  hideInfoPanel() {
    this.showInfoPanel.set(false);
    this.infoPanelContent.set(null);
  }

  handleImageError(event: Event) {
    (event.target as HTMLImageElement).src = '/assets/dso/placeholder.webp';
  }

  goToMessierDetails(obj: any) {
    const code = obj.code;
    const number = obj.messierNumber || obj.caldwellNumber;
    this.router.navigate(['/dso', `${code}${number}`]);
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
    if (t < 0.0)  return new THREE.Color('#9bbcff');
    if (t < 0.4)  return new THREE.Color('#cdd9ff');
    if (t < 0.8)  return new THREE.Color('#fff4ea');
    if (t < 1.2)  return new THREE.Color('#ffd2a1');
    return new THREE.Color('#ffb56c');
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

  private createLabel(text: string, color: string, fontSize: number = 20, scaleDivisor: number = 35): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    ctx.font = `500 ${fontSize}px 'Inter', sans-serif`;
    const metrics = ctx.measureText(text);
    const padding = 10;
    const width = metrics.width + padding * 2;
    const height = fontSize + padding * 2;
    canvas.width = width;
    canvas.height = height;
    ctx.font = `500 ${fontSize}px 'Inter', sans-serif`;
    ctx.textBaseline = 'middle';

    // Achtergrond (donker, semi-transparant)
    ctx.fillStyle = 'rgba(5,10,20,0.8)';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 2;
    const radius = 8;
    ctx.beginPath();
    ctx.moveTo(radius,0); ctx.lineTo(width-radius,0); ctx.quadraticCurveTo(width,0,width,radius);
    ctx.lineTo(width,height-radius); ctx.quadraticCurveTo(width,height,width-radius,height);
    ctx.lineTo(radius,height); ctx.quadraticCurveTo(0,height,0,height-radius);
    ctx.lineTo(0,radius); ctx.quadraticCurveTo(0,0,radius,0);
    ctx.closePath();
    ctx.fill();

    // Rand
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.stroke();

    // Tekst
    ctx.fillStyle = color;
    ctx.fillText(text, padding, fontSize/2 + padding);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true, depthWrite: false, sizeAttenuation: true });
    const sprite = new THREE.Sprite(material);
    const baseWidth = width / scaleDivisor;
    const baseHeight = height / scaleDivisor;
    sprite.userData = { baseWidth, baseHeight };
    sprite.scale.set(baseWidth, baseHeight, 1);
    return sprite;
  }

  // ===== ZOOM / TOUCH =====
  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    if (!this.isZooming) { this.isZooming = true; this.controls.enableRotate = false; }
    const speed = this.targetFov < 30 ? 0.03 : 0.06;
    this.targetFov += event.deltaY * 0.01 * speed * 60;
    this.targetFov = THREE.MathUtils.clamp(this.targetFov, this.MIN_FOV, this.MAX_FOV);
    this.updateLabelSizes();
    this.updateHUD();
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
      this.updateHUD();
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

  // ===== ANIMATIE =====
  private animate = () => {
    if (this.isBrowser) this.frameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = (now - this.lastFrame) / 1000;
    this.lastFrame = now;

    this.starGroup.children.forEach(child => {
      if (child instanceof THREE.Points && child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms['time'].value += delta;
      }
    });

    if (Math.abs(this.camera.fov - this.targetFov) > 0.01) {
      this.camera.fov += (this.targetFov - this.camera.fov) * 0.1;
      this.camera.updateProjectionMatrix();
      this.updateLabelSizes();
      this.updateHUD();
    }

    this.controls.update();
    this.composer.render();
  };

  // ===== RESIZE =====
  @HostListener('window:resize')
  onResize() {
    if (!this.isBrowser) return;
    clearTimeout(this.resizeThrottleTimeout);
    this.resizeThrottleTimeout = setTimeout(() => {
      const canvas = this.canvasRef.nativeElement;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
      this.composer.setSize(width, height);
    }, 100);
  }
}