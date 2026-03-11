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
interface StarData {
  position: THREE.Vector3;
  name?: string;
  magnitude: number;
  color: THREE.Color;
  ra: number;
  dec: number;
  size: number;
  bv?: number;
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
  // D's zijn altijd zichtbaar, dus geen toggle nodig
  @Input() showGrid: boolean = true;
  @Input() starDensity: 'sparse' | 'normal' | 'dense' = 'normal';
  @Input() nightMode: boolean = false;

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
  private dsoGroup = new THREE.Group();
  private dsoImageGroup = new THREE.Group();
  private gridGroup = new THREE.Group();
  private targetHighlightGroup = new THREE.Group();

  // ===== DATA =====
  private stars: StarData[] = [];
  public dsoSprites: DSOSpriteData[] = [];
  private targetPosition = new THREE.Vector3();

  // ===== TEXTURES =====
  private textures: {
    star: THREE.CanvasTexture;
    dsoNormal: THREE.CanvasTexture;
    dsoHover: THREE.CanvasTexture;
    highlight: THREE.CanvasTexture;
  } = {} as any;

  // ===== ANIMATION =====
  private frameId = 0;
  public targetFov: number;

  // ===== RESIZE =====
  private resizeObserver!: ResizeObserver;
  private resizeThrottleTimeout: any;

  // ===== ZOOM STATE =====
  private touchStartDistance = 0;
  private initialFov = 3;
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };
  private isZooming = false;
  private zoomTimeout: any;
  
  // ===== DOUBLE TAP =====
  private lastTapTime = 0;
  private lastTapPosition = { x: 0, y: 0 };
  
  // ===== ZOOM ANIMATION =====
  private zoomAnimationFrame: number | null = null;

  // ===== HOVER STATE =====
  private hoveredDSO: DSOSpriteData | null = null;

  // ===== UI STATE =====
  showInfoPanel = false;
  infoPanelContent: any = null;
  
  hoverTooltipContent: string | null = null;
  hoverTooltipPosition = { x: 0, y: 0 };

  showSearchPanel = false;
  searchQuery = '';
  searchResults: any[] = [];

  // ===== ROTATION STATE =====
  private rotationAngle = 0;

  // ===== HUD INFO =====
  hudInfo = {
    ra: '',
    dec: '',
    fov: 0,
    altitude: 0,
    azimuth: 0
  };

  // ===== CONSTANTS =====
  public readonly CONSTANTS = {
    MIN_FOV: 0.2,
    MAX_FOV: 60,
    DEFAULT_FOV: 3,
    SPHERE_RADIUS: 100,
    DOUBLE_TAP_DELAY: 300,
    DOUBLE_TAP_MAX_DIST: 30,
    STAR_SIZE_MULTIPLIER: 4.0,
    MAX_STAR_SIZE: 18,
    MIN_STAR_SIZE: 2,
    BLOOM_STRENGTH: 0.08,
    BLOOM_RADIUS: 0.3,
    BLOOM_THRESHOLD: 0.2
  } as const;

  // ===== BROWSER CHECK =====
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private isTouchDevice = false;

  constructor() {
    this.targetFov = this.fovDegrees;
  }

  // ========== LIFECYCLE ==========
  async ngAfterViewInit() {
    if (!this.isBrowser) return;

    this.isTouchDevice = 'ontouchstart' in window;
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
      if (this.zoomAnimationFrame) {
        cancelAnimationFrame(this.zoomAnimationFrame);
      }
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
      canvas.removeEventListener('dblclick', this.onDoubleClick);
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

    if (changes['nightMode']) {
      this.updateNightMode();
    }

    if (this.shouldRebuildSky(changes)) {
      this.updateVisibility();
    }
  }

  private shouldRebuildSky(changes: SimpleChanges): boolean {
    return !!(changes['showConstellations'] ||
      changes['showConstellationNames'] ||
      changes['showStarNames'] ||
      changes['showGrid']);
  }

  // ========== INITIALIZATION ==========
  private createTextures(): void {
    this.textures = {
      star: this.createStarTexture(),
      dsoNormal: this.createDSONormalTexture(),
      dsoHover: this.createDSOHoverTexture(),
      highlight: this.createHighlightTexture()
    };
  }

  private createStarTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.7, 'rgba(255,255,255,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    
    return new THREE.CanvasTexture(canvas);
  }

  private createDSONormalTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = '#ffaa44';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(32, 32, 16, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255,170,68,0.1)';
    ctx.beginPath();
    ctx.arc(32, 32, 12, 0, Math.PI * 2);
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
  }

  private createDSOHoverTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(32, 32, 18, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(32, 32, 14, 0, Math.PI * 2);
    ctx.fill();
    
    return new THREE.CanvasTexture(canvas);
  }

  private createHighlightTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 128, 128);
    
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(64, 64, 45, 0, Math.PI * 2);
    ctx.stroke();
    
    return new THREE.CanvasTexture(canvas);
  }

  private initThree(): void {
    const canvas = this.canvasRef.nativeElement;
    
    this.renderer = new THREE.WebGLRenderer({ 
      canvas, 
      antialias: true, 
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      depth: true
    });
    
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    
    this.camera = new THREE.PerspectiveCamera(
      this.targetFov,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, 1);

    // Controls met omgekeerde richting (negatieve rotateSpeed)
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = -0.3; // Negatief voor inverted controls
    this.controls.target.set(0, 0, 1);

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
  }

  private initPostProcessing(): void {
    const width = this.canvasRef.nativeElement.clientWidth;
    const height = this.canvasRef.nativeElement.clientHeight;
    
    this.composer = new EffectComposer(this.renderer);
    
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this.CONSTANTS.BLOOM_STRENGTH,
      this.CONSTANTS.BLOOM_RADIUS,
      this.CONSTANTS.BLOOM_THRESHOLD
    );
    this.composer.addPass(bloomPass);
  }

  // ========== EVENT LISTENERS ==========
  private setupEventListeners(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('dblclick', this.onDoubleClick);
  }

  private onWheel = (event: WheelEvent) => {
    event.preventDefault();
    
    if (!this.isZooming) {
      this.isZooming = true;
      this.controls.enableRotate = false;
    }
    
    const zoomSpeed = this.targetFov < 10 ? 0.5 : 1.0;
    this.targetFov += event.deltaY * 0.005 * zoomSpeed;
    this.targetFov = THREE.MathUtils.clamp(this.targetFov, this.CONSTANTS.MIN_FOV, this.CONSTANTS.MAX_FOV);
    
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
    if (event.touches.length === 2 && this.isZooming) {
      event.preventDefault();
      
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      const zoomFactor = this.touchStartDistance / distance;
      this.targetFov = THREE.MathUtils.clamp(
        this.initialFov * zoomFactor,
        this.CONSTANTS.MIN_FOV,
        this.CONSTANTS.MAX_FOV
      );
      
      this.updateLabelSizes();
    }
  };

  private onTouchEnd = (event: TouchEvent) => {
    if (this.isZooming) {
      event.preventDefault();
      if (event.touches.length === 0) {
        this.isZooming = false;
        this.controls.enableRotate = true;
      }
      return;
    }
    
    this.handleTap(event);
  };

  private handleTap(event: TouchEvent) {
    const currentTime = Date.now();
    
    if (event.touches.length === 0 && event.changedTouches.length === 1) {
      const touch = event.changedTouches[0];
      const timeSinceLastTap = currentTime - this.lastTapTime;
      const dx = Math.abs(touch.clientX - this.lastTapPosition.x);
      const dy = Math.abs(touch.clientY - this.lastTapPosition.y);
      
      if (timeSinceLastTap < this.CONSTANTS.DOUBLE_TAP_DELAY && 
          dx < this.CONSTANTS.DOUBLE_TAP_MAX_DIST && 
          dy < this.CONSTANTS.DOUBLE_TAP_MAX_DIST) {
        this.handleDoubleClick(touch.clientX, touch.clientY);
      } else if (currentTime - this.touchStartTime < 300 && 
                 Math.abs(touch.clientX - this.touchStartPos.x) < 10 && 
                 Math.abs(touch.clientY - this.touchStartPos.y) < 10) {
        this.handleClick(touch.clientX, touch.clientY);
      }
      
      this.lastTapTime = currentTime;
      this.lastTapPosition.x = touch.clientX;
      this.lastTapPosition.y = touch.clientY;
    }
  }

  private onMouseMove = (event: MouseEvent) => {
    this.checkHover(event.clientX, event.clientY);
  };

  private onClick = (event: MouseEvent) => {
    this.handleClick(event.clientX, event.clientY);
  };

  private onDoubleClick = (event: MouseEvent) => {
    this.handleDoubleClick(event.clientX, event.clientY);
  };

  // ========== HOVER HANDLING ==========
  private checkHover(x: number, y: number) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const objects = this.dsoSprites.map(m => m.sprite);
    const intersects = this.raycaster.intersectObjects(objects);

    if (intersects.length > 0) {
      const hitSprite = intersects[0].object as THREE.Sprite;
      const dsoData = this.dsoSprites.find(m => m.sprite === hitSprite);
      
      if (dsoData) {
        this.showHoverTooltip(dsoData, rect);
      }
    } else {
      this.hideHoverTooltip();
    }
  }

  private showHoverTooltip(dsoData: DSOSpriteData, rect: DOMRect): void {
    if (this.hoveredDSO !== dsoData) {
      // Reset vorige hover
      if (this.hoveredDSO) {
        this.hoveredDSO.sprite.material.map = this.textures.dsoNormal;
        this.hoveredDSO.sprite.material.needsUpdate = true;
        this.hoveredDSO.sprite.scale.set(3.0, 3.0, 1);
      }
      
      // Toon nieuwe hover
      this.hoveredDSO = dsoData;
      this.hoveredDSO.sprite.material.map = this.textures.dsoHover;
      this.hoveredDSO.sprite.material.needsUpdate = true;
      this.hoveredDSO.sprite.scale.set(4.5, 4.5, 1);
      
      const type = dsoData.object.code === 'M' ? 'Messier' : 'Caldwell';
      const number = dsoData.object.messierNumber || dsoData.object.messierNumber;
      
      this.hoverTooltipContent = `${type} ${number}: ${dsoData.object.name}`;
      
      // Tooltip in het midden van het canvas
      this.hoverTooltipPosition = {
        x: rect.width / 2,
        y: rect.height / 2
      };
      this.cdr.detectChanges();
    }
  }

  private hideHoverTooltip(): void {
    if (this.hoveredDSO) {
      this.hoveredDSO.sprite.material.map = this.textures.dsoNormal;
      this.hoveredDSO.sprite.material.needsUpdate = true;
      this.hoveredDSO.sprite.scale.set(3.0, 3.0, 1);
      this.hoveredDSO = null;
      this.hoverTooltipContent = null;
      this.cdr.detectChanges();
    }
  }

  // ========== CLICK HANDLING ==========
  private handleClick(x: number, y: number) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const sprites = this.dsoSprites.map(m => m.sprite);
    const intersects = this.raycaster.intersectObjects(sprites);

    if (intersects.length > 0) {
      const hitSprite = intersects[0].object as THREE.Sprite;
      const dsoData = this.dsoSprites.find(m => m.sprite === hitSprite);
      
      if (dsoData) {
        this.infoPanelContent = dsoData.object;
        this.showInfoPanel = true;
        this.cdr.detectChanges();
      }
    }
  }

  private handleDoubleClick(x: number, y: number) {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = ((x - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((y - rect.top) / rect.height) * 2 + 1;

    this.mouse.x = mouseX;
    this.mouse.y = mouseY;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const sprites = this.dsoSprites.map(m => m.sprite);
    const intersects = this.raycaster.intersectObjects(sprites);
    
    if (intersects.length > 0) {
      const hitSprite = intersects[0].object as THREE.Sprite;
      const dsoData = this.dsoSprites.find(m => m.sprite === hitSprite);
      if (dsoData) {
        this.zoomToObject(dsoData);
        return;
      }
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(mouseX, mouseY), this.camera);
    const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1);
    const intersectionPoint = new THREE.Vector3();
    const hasIntersection = raycaster.ray.intersectSphere(sphere, intersectionPoint);

    if (hasIntersection) {
      this.zoomToPoint(intersectionPoint, 0.4);
    }
  }

  hideInfoPanel(): void {
    this.showInfoPanel = false;
    this.infoPanelContent = null;
  }

  // ========== ZOOM FUNCTIONS ==========
  public zoomToObject(dsoData: DSOSpriteData): void {
    this.zoomToPoint(dsoData.position, 0.3);
    
    setTimeout(() => {
      this.infoPanelContent = dsoData.object;
      this.showInfoPanel = true;
      this.cdr.detectChanges();
    }, 600);
  }

  private zoomToPoint(targetPoint: THREE.Vector3, zoomFactor: number = 0.4) {
    if (this.zoomAnimationFrame !== null) {
      if (this.isBrowser) {
        cancelAnimationFrame(this.zoomAnimationFrame);
      }
      this.zoomAnimationFrame = null;
    }

    const startDir = this.controls.target.clone().normalize();
    const endDir = targetPoint.clone().normalize();
    const startFov = this.targetFov;
    const endFov = Math.max(this.CONSTANTS.MIN_FOV, Math.min(this.CONSTANTS.MAX_FOV, startFov * zoomFactor));

    const wasDampingEnabled = this.controls.enableDamping;
    this.controls.enableDamping = false;

    const startTime = performance.now();
    const duration = 600;

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
        if (this.isBrowser) {
          this.zoomAnimationFrame = requestAnimationFrame(animateStep);
        }
      } else {
        this.controls.enableDamping = wasDampingEnabled;
        this.zoomAnimationFrame = null;
      }
    };

    if (this.isBrowser) {
      this.zoomAnimationFrame = requestAnimationFrame(animateStep);
    }
  }

  // ========== SEARCH ==========
  searchObjects(): void {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    const allObjects = this.messierService.realAll();
    
    this.searchResults = allObjects.filter(obj => {
      const code = `${obj.code}${obj.messierNumber || obj.messierNumber}`.toLowerCase();
      const name = obj.name?.toLowerCase() || '';
      const type = obj.type?.toLowerCase() || '';
      const constellation = obj.constellation?.toLowerCase() || '';
      
      return code.includes(query) || 
             name.includes(query) || 
             type.includes(query) || 
             constellation.includes(query);
    }).slice(0, 20);
  }

  selectSearchResult(obj: any): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchPanel = false;
    this.goToDSODetails(obj);
  }

  // ========== SKY BUILDING ==========
  public buildSky(): void {
    this.clearGroups();
    this.createStars();
    this.createConstellations();
    this.createDSOObjects();
    this.createGrid();
    this.createTargetHighlight();
    this.updateVisibility();
  }

  private clearGroups(): void {
    [
      this.starGroup,
      this.constellationLineGroup,
      this.constellationNameGroup,
      this.dsoGroup,
      this.dsoImageGroup,
      this.gridGroup,
      this.targetHighlightGroup
    ].forEach(g => {
      while (g.children.length) {
        const child = g.children[0];
        if (child instanceof THREE.BufferGeometry) child.dispose();
        if (child instanceof THREE.Material) {
          if (Array.isArray(child)) {
            child.forEach(m => m.dispose());
          } else {
            child.dispose();
          }
        }
        g.remove(child);
      }
    });
    
    this.stars = [];
    this.dsoSprites = [];
  }

  // ========== STARS ==========
  private createStars(): void {
    const allStars = this.catalog.getStarsNear(this.ra, this.dec, 30);
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];

    allStars.forEach(star => {
      const pos = this.raDecToXYZ(star.ra, star.dec, this.CONSTANTS.SPHERE_RADIUS);
      const color = this.bvToColor(star.ci);
      
      positions.push(pos.x, pos.y, pos.z);
      colors.push(color.r, color.g, color.b);

      let size = this.CONSTANTS.STAR_SIZE_MULTIPLIER * (6.5 - Math.min(star.mag, 6.5)) * 0.6;
      if (star.mag < 1) size *= 1.3;
      else if (star.mag < 2) size *= 1.2;
      else if (star.mag < 4) size *= 1.1;
      size = Math.min(this.CONSTANTS.MAX_STAR_SIZE, Math.max(this.CONSTANTS.MIN_STAR_SIZE, size));

      sizes.push(size);

      this.stars.push({
        position: pos,
        name: star.name,
        magnitude: star.mag,
        color,
        ra: star.ra,
        dec: star.dec,
        size,
        bv: star.ci
      });
    });

    const vertexShader = `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    const fragmentShader = `
      uniform sampler2D pointTexture;
      uniform float nightMode;
      varying vec3 vColor;
      
      void main() {
        vec4 texColor = texture2D(pointTexture, gl_PointCoord);
        
        vec3 finalColor = vColor;
        if (nightMode > 0.5) {
          finalColor = vec3(1.0, 0.3, 0.1) * (vColor.r * 0.3 + vColor.g * 0.6 + vColor.b * 0.1);
        }
        
        gl_FragColor = vec4(finalColor, texColor.a * 0.9);
      }
    `;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));

    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.textures.star },
        nightMode: { value: this.nightMode ? 1 : 0 }
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    this.starGroup.add(new THREE.Points(geometry, material));

    if (this.showStarNames) {
      this.stars
        .filter(s => s.name && s.magnitude < 3.5)
        .forEach(star => {
          const label = this.createLabel(star.name!, '#ffffff', 28, 20);
          label.position.copy(star.position.clone().multiplyScalar(1.05));
          this.starGroup.add(label);
        });
    }
  }

  // ========== CONSTELLATIONS ==========
  private createConstellations(): void {
    const constellations = this.catalog.getConstellationsInView(this.ra, this.dec, 60);
    
    const lineMaterial = new THREE.LineBasicMaterial({ 
      color: this.nightMode ? 0x442211 : 0x88aaff, 
      opacity: this.nightMode ? 0.2 : 0.25, 
      transparent: true 
    });

    constellations.forEach(c => {
      c.lines.forEach((line: any) => {
        const from = this.raDecToXYZ(line.from.ra, line.from.dec, this.CONSTANTS.SPHERE_RADIUS - 0.5);
        const to = this.raDecToXYZ(line.to.ra, line.to.dec, this.CONSTANTS.SPHERE_RADIUS - 0.5);
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        this.constellationLineGroup.add(new THREE.Line(geometry, lineMaterial));
      });

      // Constellation namen
      if (this.showConstellationNames) {
        const center = this.calculateConstellationCenter(c);
        // Iets grotere labels voor betere zichtbaarheid
        const label = this.createLabel(
          c.name, 
          this.nightMode ? '#884422' : '#aaccff', 
          26, // Iets groter
          18  // Kleinere divisor = groter
        );
        label.position.copy(center);
        this.constellationNameGroup.add(label);
      }
    });
  }

  // ========== DSO OBJECTS ==========
  private createDSOObjects(): void {
    const allDSO = this.messierService.realAll();
    const radius = 30;
    
    allDSO.forEach(obj => {
      const ra = this.raToDeg(obj.rightAscension);
      const dec = this.decToDeg(obj.declination);
      const distance = this.angularDistance(this.ra, this.dec, ra, dec);
      
      if (distance > radius) return;

      const type = obj.code === 'M' ? 'messier' : 'caldwell';
      const pos = this.raDecToXYZ(ra, dec, this.CONSTANTS.SPHERE_RADIUS - 1);

      // Sprite met oranje cirkel (altijd zichtbaar)
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
      const sizeScale = Math.max(0.5, Math.min(2.5, sizeArcmin / 30));
      sprite.scale.set(baseScale * sizeScale, baseScale * sizeScale, 1);
      
      sprite.frustumCulled = false;
      this.dsoGroup.add(sprite);

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

    this.dsoSprites.sort((a, b) => a.magnitude - b.magnitude);
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
    
    // Verbeterde shader met circulaire fade
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        nightMode: { value: this.nightMode ? 1 : 0 }
      },
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
        uniform float nightMode;
        varying vec2 vUv;
        
        void main() {
          vec4 color = texture2D(map, vUv);
          
          // Circulaire fade: hoe verder van het centrum, hoe transparanter
          float dist = distance(vUv, vec2(0.5));
          float circle = 1.0 - smoothstep(0.3, 0.7, dist); // Zachte overgang
          
          // Alleen pixels met alpha > 0 tonen, vermenigvuldigd met circle
          float alpha = color.a * circle;
          if (alpha < 0.05) discard;
          
          vec3 finalColor = color.rgb;
          if (nightMode > 0.5) {
            finalColor = vec3(1.0, 0.3, 0.1) * (color.r * 0.3 + color.g * 0.6 + color.b * 0.1);
          }
          
          gl_FragColor = vec4(finalColor, alpha);
        }
      `
    });

    const plane = new THREE.Mesh(geometry, material);
    plane.position.copy(pos);
    plane.lookAt(0, 0, 0);
    plane.userData = obj;

    this.textureLoader.load(
      path, 
      (texture: THREE.Texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        
        if (plane.material instanceof THREE.ShaderMaterial) {
          plane.material.uniforms['map'].value = texture;
        }
      }, 
      undefined, 
      (error: unknown) => {}
    );

    this.dsoImageGroup.add(plane);
    return plane;
  }

  // ========== GRID ==========
  private createGrid(): void {
    while (this.gridGroup.children.length) {
      this.gridGroup.remove(this.gridGroup.children[0]);
    }

    const gridMaterial = new THREE.LineBasicMaterial({ 
      color: this.nightMode ? 0x331100 : 0x446688, 
      opacity: this.nightMode ? 0.2 : 0.2, 
      transparent: true 
    });

    for (let ra = 0; ra < 360; ra += 30) {
      const points: THREE.Vector3[] = [];
      for (let dec = -85; dec <= 85; dec += 5) {
        points.push(this.raDecToXYZ(ra, dec, this.CONSTANTS.SPHERE_RADIUS - 0.2));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    for (let dec = -80; dec <= 80; dec += 30) {
      const points: THREE.Vector3[] = [];
      for (let ra = 0; ra <= 360; ra += 15) {
        points.push(this.raDecToXYZ(ra, dec, this.CONSTANTS.SPHERE_RADIUS - 0.2));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }

    const equatorPoints: THREE.Vector3[] = [];
    for (let ra = 0; ra <= 360; ra += 5) {
      equatorPoints.push(this.raDecToXYZ(ra, 0, this.CONSTANTS.SPHERE_RADIUS - 0.2));
    }
    const equatorGeo = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    const equatorMat = new THREE.LineBasicMaterial({ 
      color: this.nightMode ? 0x442200 : 0x88aaff, 
      opacity: this.nightMode ? 0.25 : 0.3, 
      transparent: true 
    });
    this.gridGroup.add(new THREE.Line(equatorGeo, equatorMat));
  }

  // ========== TARGET HIGHLIGHT ==========
  private createTargetHighlight(): void {
    const targetObj = this.messierService.realAll().find(m =>
      `${m.code}${m.messierNumber || m.messierNumber}` === this.targetName
    );
    
    if (!targetObj) return;

    const ra = this.raToDeg(targetObj.rightAscension);
    const dec = this.decToDeg(targetObj.declination);
    this.targetPosition.copy(this.raDecToXYZ(ra, dec, this.CONSTANTS.SPHERE_RADIUS - 0.5));

    const spriteMat = new THREE.SpriteMaterial({
      map: this.textures.highlight,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });
    
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.copy(this.targetPosition);
    sprite.scale.set(3.0, 3.0, 1);
    this.targetHighlightGroup.add(sprite);
  }

  // ========== VISIBILITY ==========
  private updateVisibility(): void {
    this.constellationLineGroup.visible = this.showConstellations;
    // Constellation namen altijd tonen als showConstellationNames aan staat
    this.constellationNameGroup.visible = this.showConstellationNames;
    // DSO afbeeldingen altijd zichtbaar
    this.dsoImageGroup.visible = true;
    // Oranje cirkels altijd zichtbaar (DSO's zijn altijd aan)
    this.dsoGroup.visible = true;
    this.gridGroup.visible = this.showGrid;
  }

  private updateNightMode(): void {
    const color = this.nightMode ? 0x331100 : 0x446688;
    const opacity = this.nightMode ? 0.2 : 0.2;
    
    this.gridGroup.children.forEach(child => {
      if (child instanceof THREE.Line) {
        if (child.material instanceof THREE.LineBasicMaterial) {
          child.material.color.setHex(color);
          child.material.opacity = opacity;
        }
      }
    });

    this.starGroup.children.forEach(child => {
      if (child instanceof THREE.Points && child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms['nightMode'].value = this.nightMode ? 1 : 0;
      }
    });
  }

  // ========== CENTERING ==========
  centerOnTarget(): void {
    if (!this.camera || !this.controls) return;
    
    const targetDir = this.raDecToXYZ(this.ra, this.dec, 1).normalize();
    this.controls.target.copy(targetDir);
    this.camera.lookAt(targetDir);
    this.targetFov = this.fovDegrees;
    this.camera.fov = this.targetFov;
    this.camera.updateProjectionMatrix();
    this.updateLabelSizes();
    this.updateHUD();
  }

  resetView(): void {
    if (this.zoomAnimationFrame) {
      if (this.isBrowser) {
        cancelAnimationFrame(this.zoomAnimationFrame);
      }
      this.zoomAnimationFrame = null;
    }
    
    this.centerOnTarget();
    this.showInfoPanel = false;
    this.camera.up.set(0, 1, 0);
    this.rotationAngle = 0;
    
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

  // ========== ROTATION ==========
  rotateLeft(): void {
    this.rotateField(15);
  }

  rotateRight(): void {
    this.rotateField(-15);
  }

  private rotateField(degrees: number): void {
    if (!this.camera || !this.controls) return;

    const angle = THREE.MathUtils.degToRad(degrees);
    this.rotationAngle += degrees;

    const viewDir = new THREE.Vector3()
      .subVectors(this.controls.target, this.camera.position)
      .normalize();

    const q = new THREE.Quaternion().setFromAxisAngle(viewDir, angle);
    this.skySphere.quaternion.premultiply(q);
    this.skySphere.quaternion.normalize();
  }

  // ========== DENSITY ==========
  setDensity(density: 'sparse' | 'normal' | 'dense'): void {
    this.starDensity = density;
    this.catalog.setStarDensity(density);
    this.buildSky();
  }

  // ========== TOGGLE FUNCTIONS ==========
  toggleConstellations(): void {
    this.showConstellations = !this.showConstellations;
    this.constellationLineGroup.visible = this.showConstellations;
    this.constellationNameGroup.visible = this.showConstellations && this.showConstellationNames;
  }

  toggleConstellationNames(): void {
    this.showConstellationNames = !this.showConstellationNames;
    this.constellationNameGroup.visible = this.showConstellations && this.showConstellationNames;
  }

  // DSO toggle verwijderd - altijd aan
  // toggleMessier(): void { ... } verwijderd

  toggleGrid(): void {
    this.showGrid = !this.showGrid;
    this.gridGroup.visible = this.showGrid;
  }

  toggleNightMode(): void {
    this.nightMode = !this.nightMode;
    this.updateNightMode();
  }

  // ========== SCREENSHOT ==========
  takeScreenshot(): void {
    if (!this.renderer) return;

    this.composer.render();

    const canvas = this.renderer.domElement;
    const dataUrl = canvas.toDataURL('image/png');
    
    const link = document.createElement('a');
    link.download = `starhop-${this.targetName || 'view'}-${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.png`;
    link.href = dataUrl;
    link.click();
  }

  // ========== HUD UPDATE ==========
  private updateHUD(): void {
    if (!this.camera || !this.controls) return;

    const targetDir = this.controls.target.clone().normalize();
    
    const ra = Math.atan2(targetDir.x, targetDir.z) * 180 / Math.PI;
    const dec = Math.asin(targetDir.y) * 180 / Math.PI;
    
    const raNormalized = (ra + 360) % 360;
    
    const raHours = raNormalized / 15;
    const raH = Math.floor(raHours);
    const raM = Math.floor((raHours - raH) * 60);
    const raS = Math.floor(((raHours - raH) * 60 - raM) * 60);

    this.hudInfo = {
      ra: `${raH.toString().padStart(2, '0')}h ${raM.toString().padStart(2, '0')}m ${raS.toString().padStart(2, '0')}s`,
      dec: `${dec >= 0 ? '+' : ''}${dec.toFixed(2)}°`,
      fov: this.camera.fov,
      altitude: 90 - Math.abs(dec),
      azimuth: (raNormalized + 180) % 360
    };
  }

  // ========== UTILITIES ==========
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
    
    if (t < 0.0) return new THREE.Color('#ffffff');
    if (t < 0.4) return new THREE.Color('#fffef9');
    if (t < 0.8) return new THREE.Color('#fffcf5');
    if (t < 1.2) return new THREE.Color('#fffaf0');
    return new THREE.Color('#fff7ea');
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
    baseFontSize = 28,
    scaleDivisor = 18
  ): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `600 ${baseFontSize}px 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

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

    sprite.userData = { baseWidth, baseHeight, minScale: 1.2, maxScale: 2.0 };
    sprite.scale.set(baseWidth, baseHeight, 1);
    return sprite;
  }

  private updateLabelSizes(): void {
    if (!this.camera) return;

    const zoomFactor = 20 / this.camera.fov;

    [this.constellationNameGroup, this.starGroup].forEach(group => {
      group.children.forEach(child => {
        if (child instanceof THREE.Sprite && child.userData['baseWidth']) {
          const baseWidth = child.userData['baseWidth'];
          const baseHeight = child.userData['baseHeight'];
          const minScale = child.userData['minScale'] || 1.0;
          const maxScale = child.userData['maxScale'] || 2.5;

          const clampedZoom = Math.max(minScale, Math.min(maxScale, zoomFactor));
          child.scale.set(baseWidth * clampedZoom, baseHeight * clampedZoom, 1);
        }
      });
    });
  }

  private setupResizeObserver(): void {
    if (!this.isBrowser) return;

    this.resizeObserver = new ResizeObserver(() => {
      clearTimeout(this.resizeThrottleTimeout);
      this.resizeThrottleTimeout = setTimeout(() => {
        this.zone.run(() => this.onResize());
      }, 100);
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

  // ========== ANIMATION ==========
  private animate = () => {
    if (this.isBrowser) {
      this.frameId = requestAnimationFrame(this.animate);
    }

    if (Math.abs(this.camera.fov - this.targetFov) > 0.01) {
      this.camera.fov += (this.targetFov - this.camera.fov) * 0.1;
      this.camera.updateProjectionMatrix();
      this.updateLabelSizes();
      this.updateHUD();
    }

    this.controls.update();
    this.composer.render();
  };

  // ========== ROUTING ==========
  goToDSODetails(obj: any): void {
    // Forceer navigatie
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate(['/dso', `${obj.code}${obj.messierNumber || obj.messierNumber}`]);
    });
    this.hideInfoPanel();
    this.showSearchPanel = false;
  }
}