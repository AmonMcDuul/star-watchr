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
  NgZone
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { StarCatalogService } from '../../services/star-catalog.service';
import { MessierService } from '../../services/messier.service';

interface StarData {
  position: THREE.Vector3;
  name?: string;
  magnitude: number;
  color: THREE.Color;
  ra: number;
  dec: number;
  size: number;
}

interface MessierSpriteData {
  object: any;
  sprite: THREE.Sprite;
  position: THREE.Vector3;
  label: THREE.Sprite;
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
  @Input() showMessierNames: boolean = true;
  @Input() showGrid: boolean = false;
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

  // ===== GROUPS =====
  private skySphere = new THREE.Group();
  private starGroup = new THREE.Group();
  private constellationLineGroup = new THREE.Group();
  private constellationNameGroup = new THREE.Group();
  private messierGroup = new THREE.Group();
  private messierLabelGroup = new THREE.Group();
  private gridGroup = new THREE.Group();
  private targetHighlightGroup = new THREE.Group();

  // ===== DATA =====
  private stars: StarData[] = [];
  private messierSprites: MessierSpriteData[] = [];
  private targetPosition = new THREE.Vector3();

  // ===== TEXTURES =====
  private starTexture!: THREE.CanvasTexture;
  private messierTexture!: THREE.CanvasTexture;
  private messierHoverTexture!: THREE.CanvasTexture;
  private highlightTexture!: THREE.CanvasTexture;

  // ===== ANIMATION =====
  private frameId = 0;
  private targetFov: number;
  private resizeObserver!: ResizeObserver;

  // ===== ZOOM HELPERS =====
  private touchStartDistance = 0;
  private initialFov = 60;
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };
  private isZooming = false;
  private zoomTimeout: any;
  
  // ===== DOUBLE TAP HANDLING =====
  private lastTapTime = 0;
  private lastTapPosition = { x: 0, y: 0 };
  private readonly DOUBLE_TAP_DELAY = 300;
  private readonly DOUBLE_TAP_MAX_DIST = 30;
  
  // ===== ZOOM ANIMATION =====
  private zoomAnimationFrame: number | null = null;
  private readonly MIN_FOV = 0.5;  // Minimum zoom (most zoomed in)
  private readonly MAX_FOV = 60;   // Maximum zoom (most zoomed out)

  // ===== HOVER STATE =====
  private hoveredMessier: MessierSpriteData | null = null;

  // ===== UI STATE =====
  showInfoPanel = false;
  infoPanelContent: any = null;
  infoPanelPosition = { x: 0, y: 0 };
  
  hoverTooltipContent: string | null = null;
  hoverTooltipPosition = { x: 0, y: 0 };

  // ===== ROTATION STATE =====
  private rotationAngle = 0; // degrees

  constructor() {
    this.targetFov = this.fovDegrees;
  }

  async ngAfterViewInit() {
    this.catalog.setStarDensity(this.starDensity);
    await Promise.all([this.catalog.load(), this.messierService.load()]);
    this.createTextures();
    this.initThree();
    this.initPostProcessing();
    this.buildSky();
    this.centerOnTarget();
    this.setupEventListeners();
    this.setupResizeObserver();
    this.animate();
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameId);
    if (this.zoomAnimationFrame) {
      cancelAnimationFrame(this.zoomAnimationFrame);
    }
    this.renderer?.dispose();
    this.composer?.dispose();
    this.resizeObserver?.disconnect();
    const canvas = this.canvasRef.nativeElement;
    canvas.removeEventListener('wheel', this.onWheel);
    canvas.removeEventListener('touchstart', this.onTouchStart);
    canvas.removeEventListener('touchmove', this.onTouchMove);
    canvas.removeEventListener('touchend', this.onTouchEnd);
    canvas.removeEventListener('mousemove', this.onMouseMove);
    canvas.removeEventListener('click', this.onClick);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.camera) return;

    let rebuild = false;
    if (changes['ra'] || changes['dec']) {
      this.centerOnTarget();
    }
    if (changes['fovDegrees'] && !changes['fovDegrees'].firstChange) {
      this.targetFov = this.fovDegrees;
    }
    if (changes['starDensity']) {
      this.catalog.setStarDensity(this.starDensity);
      rebuild = true;
    }
    if (changes['showConstellations'] || changes['showConstellationNames'] ||
        changes['showMessier'] || changes['showMessierNames'] ||
        changes['showStarNames'] || changes['showGrid'] ||
        changes['mirrored']) {
      this.updateVisibility();
      if (changes['showStarNames']) rebuild = true;
    }
    if (rebuild) {
      this.buildSky();
    }
  }

  // ===== RESIZE =====
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.zone.run(() => this.onResize());
    });
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
  }

  onResize(): void {
    const canvas = this.canvasRef.nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
  }

  // ===== TEXTURES =====
  private createTextures(): void {
    // Star texture
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 128;
    starCanvas.height = 128;
    const starCtx = starCanvas.getContext('2d')!;
    const gradient = starCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,200,0.9)');
    gradient.addColorStop(0.8, 'rgba(200,180,100,0.3)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    starCtx.fillStyle = gradient;
    starCtx.fillRect(0, 0, 128, 128);
    this.starTexture = new THREE.CanvasTexture(starCanvas);

    // Messier sprite
    const messierCanvas = document.createElement('canvas');
    messierCanvas.width = 64;
    messierCanvas.height = 64;
    const mCtx = messierCanvas.getContext('2d')!;
    mCtx.clearRect(0, 0, 64, 64);
    mCtx.strokeStyle = '#ffaa44';
    mCtx.lineWidth = 3;
    mCtx.beginPath();
    mCtx.arc(32, 32, 14, 0, Math.PI * 2);
    mCtx.stroke();
    mCtx.fillStyle = 'rgba(255,170,68,0.2)';
    mCtx.beginPath();
    mCtx.arc(32, 32, 10, 0, Math.PI * 2);
    mCtx.fill();
    this.messierTexture = new THREE.CanvasTexture(messierCanvas);

    // Hover texture
    const hoverCanvas = document.createElement('canvas');
    hoverCanvas.width = 64;
    hoverCanvas.height = 64;
    const hoverCtx = hoverCanvas.getContext('2d')!;
    hoverCtx.clearRect(0, 0, 64, 64);
    hoverCtx.strokeStyle = 'white';
    hoverCtx.lineWidth = 3;
    hoverCtx.beginPath();
    hoverCtx.arc(32, 32, 18, 0, Math.PI * 2);
    hoverCtx.stroke();
    hoverCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    hoverCtx.beginPath();
    hoverCtx.arc(32, 32, 14, 0, Math.PI * 2);
    hoverCtx.fill();
    this.messierHoverTexture = new THREE.CanvasTexture(hoverCanvas);

    // Highlight texture (subtle red dashed ring)
    const hlCanvas = document.createElement('canvas');
    hlCanvas.width = 128;
    hlCanvas.height = 128;
    const hlCtx = hlCanvas.getContext('2d')!;

    hlCtx.clearRect(0, 0, 128, 128);

    hlCtx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
    hlCtx.lineWidth = 4;
    hlCtx.setLineDash([10, 8]); // dashed line

    hlCtx.beginPath();
    hlCtx.arc(64, 64, 40, 0, Math.PI * 2);
    hlCtx.stroke();

    this.highlightTexture = new THREE.CanvasTexture(hlCanvas);
  }

  // ===== THREE INIT =====
  private initThree(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c1445);
    
    this.camera = new THREE.PerspectiveCamera(
      this.targetFov,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, 1);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false; // We handle zoom manually
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.2; // Slower rotation for mobile
    // this.controls.keyboardSpeed = 0.2;
    // this.controls.mouseRotateSpeed = 0.3;
    this.controls.target.set(0, 0, 1);

    this.scene.add(this.skySphere);
    this.skySphere.add(
      this.starGroup,
      this.constellationLineGroup,
      this.constellationNameGroup,
      this.messierGroup,
      this.messierLabelGroup,
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
      0.1,
      0.2,
      0.5
    );
    this.composer.addPass(bloomPass);
  }

  // ===== EVENT LISTENERS =====
  private setupEventListeners(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    
    if (!this.isZooming) {
      this.isZooming = true;
      this.controls.enableRotate = false;
    }
    
    const zoomSpeed = this.targetFov < 10 ? 0.02 : 0.04;
    this.targetFov += event.deltaY * 0.01 * zoomSpeed * 60;
    this.targetFov = THREE.MathUtils.clamp(this.targetFov, this.MIN_FOV, this.MAX_FOV);
    
    this.updateLabelSizes();
    clearTimeout(this.zoomTimeout);
        this.zoomTimeout = setTimeout(() => {
        this.isZooming = false;
        this.controls.enableRotate = true;
      }, 200);
  };

  private onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault();
      
      this.isZooming = true;
      this.controls.enableRotate = false;
      
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      this.touchStartDistance = Math.sqrt(dx * dx + dy * dy);
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
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const zoomSensitivity = 0.8;
      const zoomFactor = 1 + ((this.touchStartDistance / distance) - 1) * zoomSensitivity;
      this.targetFov = THREE.MathUtils.clamp(
        this.initialFov * zoomFactor,
        this.MIN_FOV,
        this.MAX_FOV
      );
      
      this.updateLabelSizes();
    }
  };

  private onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length < 2) {
      this.isZooming = false;
      this.controls.enableRotate = true;
    }
    const currentTime = Date.now();
    if (event.touches.length === 0 && event.changedTouches.length === 1) {
      const touch = event.changedTouches[0];
      const timeSinceLastTap = currentTime - this.lastTapTime;
      const dx = Math.abs(touch.clientX - this.lastTapPosition.x);
      const dy = Math.abs(touch.clientY - this.lastTapPosition.y);
      
      // Check for double tap
      if (timeSinceLastTap < this.DOUBLE_TAP_DELAY && 
          dx < this.DOUBLE_TAP_MAX_DIST && 
          dy < this.DOUBLE_TAP_MAX_DIST) {
        // Double tap detected
        this.handleDoubleClick(touch.clientX, touch.clientY);
      } else if (currentTime - this.touchStartTime < 300) {
        // Single tap, check if it was a tap (no significant movement)
        const tapDx = Math.abs(touch.clientX - this.touchStartPos.x);
        const tapDy = Math.abs(touch.clientY - this.touchStartPos.y);
        
        if (tapDx < 10 && tapDy < 10) {
          this.handleClick(touch.clientX, touch.clientY);
        }
      }
      
      this.lastTapTime = currentTime;
      this.lastTapPosition.x = touch.clientX;
      this.lastTapPosition.y = touch.clientY;
    }
  };

  // ===== MOUSE MOVE =====
  private onMouseMove = (event: MouseEvent) => {
    this.checkHover(event.clientX, event.clientY);
  };

  // ===== CLICK =====
  private onClick = (event: MouseEvent) => {
    this.handleClick(event.clientX, event.clientY);
  };

  // ===== HOVER HANDLING =====
  private checkHover(x: number, y: number) {
    if (!this.showMessier) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const sprites = this.messierSprites.map(m => m.sprite);
    const intersects = this.raycaster.intersectObjects(sprites);

    if (intersects.length > 0) {
      const hitSprite = intersects[0].object as THREE.Sprite;
      const messierData = this.messierSprites.find(m => m.sprite === hitSprite);
      
      if (messierData) {
        if (this.hoveredMessier !== messierData) {
          if (this.hoveredMessier) {
            this.hoveredMessier.sprite.material.map = this.messierTexture;
            this.hoveredMessier.sprite.material.needsUpdate = true;
            this.hoveredMessier.sprite.scale.set(3.0, 3.0, 1);
          }
          
          this.hoveredMessier = messierData;
          this.hoveredMessier.sprite.material.map = this.messierHoverTexture;
          this.hoveredMessier.sprite.material.needsUpdate = true;
          this.hoveredMessier.sprite.scale.set(4.5, 4.5, 1);
          
          this.hoverTooltipContent = `M${messierData.object.messierNumber}: ${messierData.object.name}`;
          this.hoverTooltipPosition = {
            x: x - rect.left,
            y: y - rect.top
          };
          this.cdr.detectChanges();
        }
      }
    } else if (this.hoveredMessier) {
      this.hoveredMessier.sprite.material.map = this.messierTexture;
      this.hoveredMessier.sprite.material.needsUpdate = true;
      this.hoveredMessier.sprite.scale.set(3.0, 3.0, 1);
      this.hoveredMessier = null;
      this.hoverTooltipContent = null;
      this.cdr.detectChanges();
    }
  }

  // ===== CLICK HANDLING =====
  private handleClick(x: number, y: number) {
    if (!this.showMessier) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const sprites = this.messierSprites.map(m => m.sprite);
    const intersects = this.raycaster.intersectObjects(sprites);

    if (intersects.length > 0) {
      const hitSprite = intersects[0].object as THREE.Sprite;
      const messierData = this.messierSprites.find(m => m.sprite === hitSprite);
      
      if (messierData) {
        this.infoPanelContent = messierData.object;
        const localX = x - rect.left;
        const localY = y - rect.top;

        const container = this.canvasRef.nativeElement.parentElement!;
        const maxWidth = container.clientWidth;
        const maxHeight = container.clientHeight;

        const panelWidth = 260;
        const panelHeight = 320;

        let clampedX = Math.max(panelWidth / 2, Math.min(localX, maxWidth - panelWidth / 2));
        let clampedY = Math.max(panelHeight + 60, localY);

        this.infoPanelPosition = {
          x: clampedX,
          y: clampedY
        };
        this.showInfoPanel = true;
        this.cdr.detectChanges();
      }
    }
  }

  // ===== DOUBLE CLICK/TAP HANDLING =====
  private handleDoubleClick(x: number, y: number) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = ((x - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((y - rect.top) / rect.height) * 2 + 1;

    // First check if we clicked on a Messier object
    if (this.showMessier) {
      this.mouse.x = mouseX;
      this.mouse.y = mouseY;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const sprites = this.messierSprites.map(m => m.sprite);
      const intersects = this.raycaster.intersectObjects(sprites);
      
      if (intersects.length > 0) {
        const hitSprite = intersects[0].object as THREE.Sprite;
        const messierData = this.messierSprites.find(m => m.sprite === hitSprite);
        if (messierData) {
          this.infoPanelContent = messierData.object;
          this.infoPanelPosition = { x, y };
          this.showInfoPanel = true;
          this.cdr.detectChanges();
          this.zoomToPoint(messierData.position, 0.3); // Zoom in to 30% of current FOV
          return;
        }
      }
    }

    // If no Messier object clicked, zoom to the point on the sphere
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
    const intersectionPoint = new THREE.Vector3();
    const hasIntersection = raycaster.ray.intersectSphere(sphere, intersectionPoint);

    if (hasIntersection) {
      this.zoomToPoint(intersectionPoint, 0.4); // Zoom in to 40% of current FOV
    }
  }

  private zoomToPoint(targetPoint: THREE.Vector3, zoomFactor: number = 0.4) {
    if (this.zoomAnimationFrame !== null) {
      cancelAnimationFrame(this.zoomAnimationFrame);
      this.zoomAnimationFrame = null;
    }

    const startDir = this.controls.target.clone().normalize();
    const endDir = targetPoint.clone().normalize();
    const startFov = this.targetFov;
    const endFov = Math.max(this.MIN_FOV, Math.min(this.MAX_FOV, startFov * zoomFactor));

    const wasDampingEnabled = this.controls.enableDamping;
    this.controls.enableDamping = false;

    const startTime = performance.now();
    const duration = 600; // milliseconds

    const animateStep = () => {
      const now = performance.now();
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const easeProgress = 1 - Math.pow(1 - progress, 3);

      const currentDir = new THREE.Vector3().lerpVectors(startDir, endDir, easeProgress).normalize();
      this.controls.target.copy(currentDir);

      this.targetFov = startFov + (endFov - startFov) * easeProgress;
      this.updateLabelSizes();

      if (progress < 1) {
        this.zoomAnimationFrame = requestAnimationFrame(animateStep);
      } else {
        this.controls.enableDamping = wasDampingEnabled;
        this.zoomAnimationFrame = null;
      }
    };

    this.zoomAnimationFrame = requestAnimationFrame(animateStep);
  }

  hideInfoPanel() {
    this.showInfoPanel = false;
    this.infoPanelContent = null;
  }

  goToMessierDetails(m: any) {
    this.messierService.selectMessierByNumber(m.messierNumber);
    window.location.href = `/dso/M${m.messierNumber}`; //temp reload fix
    this.hideInfoPanel();
  }

  // ===== BUILD SKY =====
  private buildSky(): void {
    this.clearGroups();
    this.createStars();
    this.createConstellations();
    this.createMessierObjects();
    this.createGrid();
    this.createTargetHighlight();
    this.updateVisibility();
  }

  private clearGroups(): void {
    [this.starGroup, this.constellationLineGroup, this.constellationNameGroup,
     this.messierGroup, this.messierLabelGroup, this.gridGroup, this.targetHighlightGroup]
      .forEach(g => { while(g.children.length) g.remove(g.children[0]); });
    this.stars = [];
    this.messierSprites = [];
  }

  // ===== STARS =====
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

      let size = 7.0 * (6.5 - Math.min(star.mag, 6.5)) * 0.8;
      if (star.mag < 1) size *= 1.6;
      else if (star.mag < 2) size *= 1.3;
      else if (star.mag < 4) size *= 1.1;
      size = Math.min(28, Math.max(4, size));

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

    const vertexShader = `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
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
      uniforms: { pointTexture: { value: this.starTexture } },
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
          const label = this.createLabel(star.name!, '#ffd700', 32, 18);
          label.position.copy(star.position.clone().multiplyScalar(1.05));
          this.starGroup.add(label);
        });
    }
  }

  // ===== CONSTELLATIONS =====
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

      const center = this.calculateConstellationCenter(c);
      const label = this.createLabel(c.name, '#aaccff', 20, 16);
      label.position.copy(center);
      this.constellationNameGroup.add(label);
    });
  }

  // ===== MESSIER OBJECTS =====
  private createMessierObjects(): void {
    const allMessier = this.messierService.all();
    const radius = 20; // Show objects within 10° of center
    
    console.log(`Looking for Messier objects within ${radius}° of (${this.ra}, ${this.dec})`);
    
    allMessier.forEach(obj => {
      const ra = this.raToDeg(obj.rightAscension);
      const dec = this.decToDeg(obj.declination);
      const distance = this.angularDistance(this.ra, this.dec, ra, dec);
      
      if (distance > radius) return;
      
      console.log(`Found M${obj.messierNumber} at distance ${distance.toFixed(2)}°`);
      
      const pos = this.raDecToXYZ(ra, dec, 99);

      const spriteMat = new THREE.SpriteMaterial({ 
        map: this.messierTexture, 
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending
      });
      
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(pos);
      sprite.scale.set(4.0, 4.0, 1);
      sprite.frustumCulled = false;
      sprite.matrixAutoUpdate = true;
      
      this.messierGroup.add(sprite);

      this.messierSprites.push({
        object: obj,
        sprite,
        position: pos,
        label: null as any
      });
    });
  }

  // ===== GRID =====
  private createGrid(): void {
    const gridMaterial = new THREE.LineBasicMaterial({ color: 0x446688, opacity: 0.1, transparent: true });

    for (let ra = 0; ra < 360; ra += 30) {
      const points: THREE.Vector3[] = [];
      for (let dec = -85; dec <= 85; dec += 5) {
        points.push(this.raDecToXYZ(ra, dec, 99.8));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    for (let dec = -80; dec <= 80; dec += 20) {
      const points: THREE.Vector3[] = [];
      for (let ra = 0; ra <= 360; ra += 10) {
        points.push(this.raDecToXYZ(ra, dec, 99.8));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    const equatorPoints: THREE.Vector3[] = [];
    for (let ra = 0; ra <= 360; ra += 5) {
      equatorPoints.push(this.raDecToXYZ(ra, 0, 99.8));
    }
    const equatorGeo = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    const equatorMat = new THREE.LineBasicMaterial({ color: 0x6688aa, opacity: 0.2, transparent: true });
    this.gridGroup.add(new THREE.Line(equatorGeo, equatorMat));
  }

  // ===== TARGET HIGHLIGHT =====
  private createTargetHighlight(): void {
    const targetObj = this.messierService.all().find(m =>
      `M${m.messierNumber}` === this.targetName || m.name === this.targetName
    );
    if (!targetObj) return;

    const ra = this.raToDeg(targetObj.rightAscension);
    const dec = this.decToDeg(targetObj.declination);
    this.targetPosition.copy(this.raDecToXYZ(ra, dec, 99.5));

    const spriteMat = new THREE.SpriteMaterial({
      map: this.highlightTexture,
      transparent: true,
      blending: THREE.AdditiveBlending
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(this.targetPosition);
    sprite.scale.set(3.2, 3.2, 1);
    this.targetHighlightGroup.add(sprite);
  }

  // ===== VISIBILITY =====
  private updateVisibility(): void {
    this.constellationLineGroup.visible = this.showConstellations;
    this.constellationNameGroup.visible = this.showConstellations;
    this.messierGroup.visible = this.showMessier;
    this.gridGroup.visible = true;
    this.skySphere.scale.x = this.mirrored ? -1 : 1;
  }

  // ===== CENTER ON TARGET =====
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

  // ===== PUBLIC METHODS FOR TEMPLATE =====
  resetView(): void {
    if (this.zoomAnimationFrame) {
      cancelAnimationFrame(this.zoomAnimationFrame);
      this.zoomAnimationFrame = null;
    }
    
    this.centerOnTarget();
    this.showInfoPanel = false;
    
    const targetDir = this.raDecToXYZ(this.ra, this.dec, 1).normalize();
    this.controls.target.copy(targetDir);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(targetDir);
    this.targetFov = this.fovDegrees;
    this.camera.fov = this.targetFov;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.updateLabelSizes();
  }

  toggleMirror(): void {
    this.mirrored = !this.mirrored;
    this.skySphere.scale.x = this.mirrored ? -1 : 1;
  }

  toggleStarNames(): void {
    this.showStarNames = !this.showStarNames;
    this.buildSky();
  }

  toggleConstellations(): void {
    this.showConstellations = !this.showConstellations;
    this.constellationLineGroup.visible = this.showConstellations;
    this.showConstellationNames = this.showConstellations;
    this.constellationNameGroup.visible = this.showConstellations;
  }

  toggleConstellationNames(): void {
    this.showConstellationNames = !this.showConstellationNames;
    this.constellationNameGroup.visible = this.showConstellationNames;
  }

  toggleMessier(): void {
    this.showMessier = !this.showMessier;
    this.messierGroup.visible = this.showMessier;
    this.messierLabelGroup.visible = this.showMessier && this.showMessierNames;
  }

  toggleMessierNames(): void {
    // this.showMessierNames = !this.showMessierNames;
    // this.messierLabelGroup.visible = this.showMessier && this.showMessierNames;
  }

  toggleGrid(): void {
    this.showGrid = !this.showGrid;
    this.gridGroup.visible = this.showGrid;
  }

  rotateLeft(): void {
    const angle = THREE.MathUtils.degToRad(15);
    const target = this.controls.target.clone();
    const rotated = new THREE.Vector3(
      target.x * Math.cos(angle) + target.z * Math.sin(angle),
      target.y,
      -target.x * Math.sin(angle) + target.z * Math.cos(angle)
    );
    this.controls.target.copy(rotated);
    this.camera.lookAt(rotated);
  }

  rotateRight(): void {
    const angle = THREE.MathUtils.degToRad(-15);
    const target = this.controls.target.clone();
    const rotated = new THREE.Vector3(
      target.x * Math.cos(angle) + target.z * Math.sin(angle),
      target.y,
      -target.x * Math.sin(angle) + target.z * Math.cos(angle)
    );
    this.controls.target.copy(rotated);
    this.camera.lookAt(rotated);
  }

  setDensity(density: 'sparse' | 'normal' | 'dense'): void {
    this.starDensity = density;
    this.catalog.setStarDensity(density);
    this.buildSky();
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
    if (t < 0.0)  return new THREE.Color('#fff4ea');
    if (t < 0.4)  return new THREE.Color('#fff4ea');
    if (t < 0.8)  return new THREE.Color('#fff4ea');
    if (t < 1.2)  return new THREE.Color('#ffd2a1');
    return new THREE.Color('#fff4ea');
  }

  private raToDeg(ra: string): number {
    const parts = ra.split(':').map(Number);
    return (parts[0] + parts[1] / 60 + parts[2] / 3600) * 15;
  }

  private decToDeg(dec: string): number {
    const sign = dec.startsWith('-') ? -1 : 1;
    const parts = dec.replace(/[+-]/, '').split(':').map(Number);
    return sign * (parts[0] + parts[1] / 60 + parts[2] / 3600);
  }

  private angularDistance(ra1: number, dec1: number, ra2: number, dec2: number): number {
    const dRA = (ra1 - ra2) * Math.PI / 180;
    const dDec = (dec1 - dec2) * Math.PI / 180;
    const a = Math.sin(dDec / 2) ** 2 +
              Math.cos(dec1 * Math.PI / 180) * Math.cos(dec2 * Math.PI / 180) *
              Math.sin(dRA / 2) ** 2;
    return 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180 / Math.PI;
  }

  private createLabel(
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
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      depthTest: true,
      depthWrite: false,
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

  private updateLabelSizes(): void {
    if (!this.camera) return;
    
    const zoomFactor = 30 / this.camera.fov;
    
    [this.constellationNameGroup, this.messierLabelGroup, this.starGroup].forEach(group => {
      group.children.forEach(child => {
        if (child instanceof THREE.Sprite && child.userData['baseWidth']) {
          const baseWidth = child.userData['baseWidth'];
          const baseHeight = child.userData['baseHeight'];
          const minScale = child.userData['minScale'] || 0.5;
          const maxScale = child.userData['maxScale'] || 3.0;
          
          const clampedZoom = Math.max(minScale, Math.min(maxScale, zoomFactor));
          
          child.scale.set(
            baseWidth * clampedZoom,
            baseHeight * clampedZoom,
            1
          );
        }
      });
    });
  }

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);

    if (Math.abs(this.camera.fov - this.targetFov) > 0.01) {
      this.camera.fov += (this.targetFov - this.camera.fov) * 0.1;
      this.camera.updateProjectionMatrix();
      this.updateLabelSizes();
    }

    this.controls.update();
    this.composer.render();
  };
}