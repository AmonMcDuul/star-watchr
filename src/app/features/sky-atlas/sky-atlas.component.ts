import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  HostListener,
  signal,
  ChangeDetectorRef
} from '@angular/core';

import * as THREE from 'three';
import { StarCatalogService } from '../../services/star-catalog.service';
import { MessierService } from '../../services/messier.service';
import { CommonModule } from '@angular/common';
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
  size: number; // pixel size for shader
}

interface MessierSpriteData {
  object: any;
  sprite: THREE.Sprite;
  position: THREE.Vector3;
  label: THREE.Sprite;
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

  // THREE core
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private composer!: EffectComposer;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Groups
  private skySphere = new THREE.Group();
  private starGroup = new THREE.Group();
  private constellationLineGroup = new THREE.Group();
  private constellationNameGroup = new THREE.Group();
  private messierGroup = new THREE.Group();
  private labelGroup = new THREE.Group();
  private gridGroup = new THREE.Group();
  private highlightGroup = new THREE.Group();

  // Animation
  private frameId = 0;

  // Star data storage
  private stars: StarData[] = [];
  private messierSprites: MessierSpriteData[] = [];

  // Textures
  private starTexture!: THREE.CanvasTexture;
  private messierTexture!: THREE.CanvasTexture;
  private messierHoverTexture!: THREE.CanvasTexture;

  // Touch/mobile handling
  private touchStartDistance = 0;
  private initialFov = 60;
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };

  // Hover state
  private hoveredMessier: MessierSpriteData | null = null;
  private mousePos = { x: 0, y: 0 };

  // UI State (signals for reactivity)
  showConstellations = signal(true);
  showConstellationNames = signal(true);
  showStarNames = signal(false);
  showMessier = signal(true);
  showMessierNames = signal(true);
  showGrid = signal(true);
  showInfoPanel = signal(false);
  showSearch = signal(false);
  nightMode = signal(false);

  // Info panel data
  infoPanelContent = signal<any>(null);
  infoPanelPosition = signal({ x: 0, y: 0 });

  // Hover tooltip
  hoverTooltipContent = signal<string | null>(null);
  hoverTooltipPosition = signal({ x: 0, y: 0 });

  // Search
  searchQuery = '';
  searchResults: any[] = [];
  showSearchResults = false;

  // =====================================================
  // LIFECYCLE
  // =====================================================

  async ngAfterViewInit() {
    await this.catalog.load();
    await this.messierService.load();

    this.createTextures();
    this.initThree();
    this.initPostProcessing();
    this.buildSky();
    // Milky Way verwijderd (veroorzaakte vreemde vierkantjes)
    this.animate();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frameId);
    this.renderer.dispose();
    this.composer.dispose();
    this.canvasRef.nativeElement.removeEventListener('wheel', this.onMouseWheel);
    this.canvasRef.nativeElement.removeEventListener('touchstart', this.onTouchStart);
    this.canvasRef.nativeElement.removeEventListener('touchmove', this.onTouchMove);
    this.canvasRef.nativeElement.removeEventListener('touchend', this.onTouchEnd);
    this.canvasRef.nativeElement.removeEventListener('mousemove', this.onMouseMove);
    this.canvasRef.nativeElement.removeEventListener('click', this.onClick);
  }

  // =====================================================
  // TEXTURE CREATION (verbeterd: hogere resolutie, vloeiender)
  // =====================================================

  private createTextures() {
    // Sterrentextuur – 128x128 voor vloeiendere glow
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 128;
    starCanvas.height = 128;
    const starCtx = starCanvas.getContext('2d')!;
    
    const gradient = starCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,230,0.9)');
    gradient.addColorStop(0.6, 'rgba(255,220,150,0.4)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    starCtx.fillStyle = gradient;
    starCtx.fillRect(0, 0, 128, 128);
    this.starTexture = new THREE.CanvasTexture(starCanvas);

    // Messier-textuur – subtiele ring, hogere resolutie (64x64)
    const messierCanvas = document.createElement('canvas');
    messierCanvas.width = 64;
    messierCanvas.height = 64;
    const messierCtx = messierCanvas.getContext('2d')!;
    
    messierCtx.clearRect(0, 0, 64, 64);
    messierCtx.strokeStyle = 'rgba(136, 255, 204, 0.8)';
    messierCtx.lineWidth = 2;
    messierCtx.beginPath();
    messierCtx.arc(32, 32, 12, 0, Math.PI * 2);
    messierCtx.stroke();
    
    messierCtx.fillStyle = 'rgba(136, 255, 204, 0.2)';
    messierCtx.beginPath();
    messierCtx.arc(32, 32, 8, 0, Math.PI * 2);
    messierCtx.fill();
    
    this.messierTexture = new THREE.CanvasTexture(messierCanvas);

    // Hover-textuur – groter en feller
    const hoverCanvas = document.createElement('canvas');
    hoverCanvas.width = 64;
    hoverCanvas.height = 64;
    const hoverCtx = hoverCanvas.getContext('2d')!;
    
    hoverCtx.clearRect(0, 0, 64, 64);
    hoverCtx.strokeStyle = 'white';
    hoverCtx.lineWidth = 2.5;
    hoverCtx.beginPath();
    hoverCtx.arc(32, 32, 16, 0, Math.PI * 2);
    hoverCtx.stroke();
    
    hoverCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    hoverCtx.beginPath();
    hoverCtx.arc(32, 32, 12, 0, Math.PI * 2);
    hoverCtx.fill();
    
    this.messierHoverTexture = new THREE.CanvasTexture(hoverCanvas);
  }

  // =====================================================
  // THREE INIT
  // =====================================================

  private initThree() {
    const canvas = this.canvasRef.nativeElement;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03030a);

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      60,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, 1);

    // Controls
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableZoom = false;
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = -0.4;
    this.controls.enableRotate = true;
    this.controls.target.set(0, 0, 1);

    this.scene.add(this.skySphere);
    this.scene.add(this.highlightGroup);

    this.skySphere.add(
      this.starGroup,
      this.constellationLineGroup,
      this.constellationNameGroup,
      this.messierGroup,
      this.labelGroup,
      this.gridGroup
    );

    // Event listeners
    canvas.addEventListener('wheel', this.onMouseWheel, { passive: false });
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('click', this.onClick);
  }

  private initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        this.canvasRef.nativeElement.clientWidth,
        this.canvasRef.nativeElement.clientHeight
      ),
      0.15, // iets subtieler
      0.2,
      0.6
    );
    this.composer.addPass(bloomPass);
  }

  // =====================================================
  // ZOOM HANDLING
  // =====================================================

  private onMouseWheel = (event: WheelEvent) => {
    event.preventDefault();
    
    const zoomSpeed = this.camera.fov < 30 ? 0.03 : 0.06;
    this.camera.fov += event.deltaY * 0.01 * zoomSpeed * 60;
    this.camera.fov = THREE.MathUtils.clamp(this.camera.fov, 5.0, 120);
    this.camera.updateProjectionMatrix();
    
    this.updateLabelSizes();
  };

  private onTouchStart = (event: TouchEvent) => {
    if (event.touches.length === 2) {
      event.preventDefault();
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
      
      const zoomFactor = this.touchStartDistance / distance;
      this.camera.fov = THREE.MathUtils.clamp(
        this.initialFov * zoomFactor,
        5.0,
        120
      );
      
      this.camera.updateProjectionMatrix();
      this.updateLabelSizes();
    }
  };

  private onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length === 0 && Date.now() - this.touchStartTime < 300) {
      const dx = Math.abs(event.changedTouches[0].clientX - this.touchStartPos.x);
      const dy = Math.abs(event.changedTouches[0].clientY - this.touchStartPos.y);
      
      if (dx < 10 && dy < 10) {
        this.handleClick(event.changedTouches[0].clientX, event.changedTouches[0].clientY);
      }
    }
  };

  private onMouseMove = (event: MouseEvent) => {
    this.mousePos.x = event.clientX;
    this.mousePos.y = event.clientY;
    this.checkHover(event.clientX, event.clientY);
  };

  private onClick = (event: MouseEvent) => {
    this.handleClick(event.clientX, event.clientY);
  };

  // =====================================================
  // HOVER & CLICK HANDLING
  // =====================================================

  private checkHover(x: number, y: number) {
    if (!this.showMessier()) return;

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    this.mouse.x = ((x - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((y - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const sprites = this.messierSprites.map(m => m.sprite);
    const intersects = this.raycaster.intersectObjects(sprites);

    if (intersects.length > 0) {
      const hitSprite = intersects[0].object as THREE.Sprite;
      const messierData = this.messierSprites.find(m => m.sprite === hitSprite);
      
      if (messierData && this.hoveredMessier !== messierData) {
        // Reset previous hover
        if (this.hoveredMessier) {
          this.hoveredMessier.sprite.material.map = this.messierTexture;
          this.hoveredMessier.sprite.scale.set(2.5, 2.5, 1);
        }
        
        // Set new hover
        this.hoveredMessier = messierData;
        this.hoveredMessier.sprite.material.map = this.messierHoverTexture;
        this.hoveredMessier.sprite.scale.set(4.0, 4.0, 1);
        this.hoveredMessier.sprite.material.needsUpdate = true;
        
        // Show tooltip
        this.hoverTooltipContent.set(`M${messierData.object.messierNumber}: ${messierData.object.name}`);
        this.hoverTooltipPosition.set({ x, y });
      }
    } else if (this.hoveredMessier) {
      // No hover, reset
      this.hoveredMessier.sprite.material.map = this.messierTexture;
      this.hoveredMessier.sprite.scale.set(2.5, 2.5, 1);
      this.hoveredMessier.sprite.material.needsUpdate = true;
      this.hoveredMessier = null;
      this.hoverTooltipContent.set(null);
    }
  }

  private handleClick(x: number, y: number) {
    if (!this.showMessier()) return;

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
        this.infoPanelContent.set(messierData.object);
        this.infoPanelPosition.set({ x, y });
        this.showInfoPanel.set(true);
        this.cdr.detectChanges(); // Ensure update
      }
    }
  }

  hideInfoPanel() {
    this.showInfoPanel.set(false);
    this.infoPanelContent.set(null);
  }

  goToMessierDetails(m: any) {
    this.messierService.selectMessierByNumber(m.messierNumber);
    this.router.navigate(['/dso', 'M' + m.messierNumber]);
    this.hideInfoPanel();
  }

  // =====================================================
  // SKY BUILD
  // =====================================================

  private buildSky() {
    this.clearGroups();
    this.createStars();
    this.createConstellations();
    this.createMessierObjects();
    this.createCelestialGrid();
    this.rebuildLabels();
  }

  private clearGroups() {
    const groups = [
      this.starGroup, 
      this.constellationLineGroup, 
      this.constellationNameGroup,
      this.messierGroup, 
      this.labelGroup, 
      this.gridGroup,
      this.highlightGroup
    ];
    
    groups.forEach(group => {
      while(group.children.length) group.remove(group.children[0]);
    });
    
    this.stars = [];
    this.messierSprites = [];
  }

  // =====================================================
  // STERS – eigen shader met per-ster grootte (gebaseerd op magnitude)
  // =====================================================

  private createStars() {
    const stars = this.catalog.getStarsNear(0, 0, 180);
    
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    
    stars.forEach(star => {
      const pos = this.raDecToXYZ(star.ra, star.dec, 100);
      const color = this.magnitudeToColor(star.mag);
      
      positions.push(pos.x, pos.y, pos.z);
      colors.push(color.r, color.g, color.b);
      
      // Bepaal grootte in pixels op basis van magnitude (zichtbaar bij alle zoom-niveaus)
      let size = 5.0 * (6.5 - star.mag) * 0.7;
      if (star.mag < 0) size *= 1.5;
      else if (star.mag < 1) size *= 1.3;
      else if (star.mag < 2) size *= 1.1;
      
      size = Math.min(20, Math.max(2, size)); // tussen 2 en 20 pixels
      
      sizes.push(size);
      
      this.stars.push({
        position: pos,
        name: star.name,
        magnitude: star.mag,
        color: color,
        ra: star.ra,
        dec: star.dec,
        size: size
      });
    });
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    
    // Eigen shader voor punten met per-ster grootte en glow
    const vertexShader = `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size; // vaste pixelgrootte (geen attenuatie)
        gl_Position = projectionMatrix * mvPosition;
      }
    `;
    
    const fragmentShader = `
      uniform sampler2D pointTexture;
      varying vec3 vColor;
      void main() {
        vec4 texColor = texture2D(pointTexture, gl_PointCoord);
        // Gebruik de alpha van de textuur om een ronde glow te maken
        gl_FragColor = vec4(vColor, texColor.a);
      }
    `;
    
    const material = new THREE.ShaderMaterial({
      uniforms: {
        pointTexture: { value: this.starTexture }
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending, // voor glow-effect
      depthWrite: false
    });
    
    const points = new THREE.Points(geometry, material);
    this.starGroup.add(points);
  }

  // =====================================================
  // CONSTELLATIES – lijnen + grotere namen
  // =====================================================

  private createConstellations() {
    const constellations = this.catalog.getConstellations();
    
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x88aaff,
      opacity: 0.4,
      transparent: true
    });
    
    constellations.forEach(constellation => {
      constellation.lines.forEach((line: any) => {
        const from = this.raDecToXYZ(line.from.ra, line.from.dec, 99.5);
        const to = this.raDecToXYZ(line.to.ra, line.to.dec, 99.5);
        
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        this.constellationLineGroup.add(new THREE.Line(geometry, lineMaterial));
      });
      
      const center = this.calculateConstellationCenter(constellation);
      // Groter label: font 40, schaaldivisor 20 (was 40)
      const label = this.createLabel(constellation.name, '#aaccff', 40, 20);
      label.position.copy(center);
      this.constellationNameGroup.add(label);
    });
  }

  // =====================================================
  // MESSIER OBJECTEN – sprites en labels
  // =====================================================

  private createMessierObjects() {
    this.messierService.all().forEach((obj, index) => {
      const ra = this.raToDeg(obj.rightAscension);
      const dec = this.decToDeg(obj.declination);
      const pos = this.raDecToXYZ(ra, dec, 99);
      
      // Sprite (iets groter dan voorheen)
      const sprite = this.createMessierSprite();
      sprite.position.copy(pos);
      sprite.scale.set(2.5, 2.5, 1);
      this.messierGroup.add(sprite);
      
      // Label – kleiner, maar goed leesbaar
      const labelText = `M${obj.messierNumber}`;
      const label = this.createLabel(labelText, '#88ff88', 16, 40);
      label.position.copy(pos.clone().multiplyScalar(1.03));
      this.labelGroup.add(label);
      
      this.messierSprites.push({
        object: obj,
        sprite,
        position: pos,
        label
      });
    });
  }

  private createMessierSprite(): THREE.Sprite {
    const material = new THREE.SpriteMaterial({ 
      map: this.messierTexture, 
      transparent: true,
      blending: THREE.NormalBlending,
      depthTest: true,
      depthWrite: false,
      alphaTest: 0.1 // voorkom vreemde randen
    });
    return new THREE.Sprite(material);
  }

  // =====================================================
  // HEMELROOSTER – subtiel
  // =====================================================

  private createCelestialGrid() {
    const gridMaterial = new THREE.LineBasicMaterial({ 
      color: 0x446688, 
      opacity: 0.08, 
      transparent: true 
    });
    
    // RA lijnen
    for (let ra = 0; ra < 360; ra += 30) {
      const points: THREE.Vector3[] = [];
      for (let dec = -85; dec <= 85; dec += 5) {
        points.push(this.raDecToXYZ(ra, dec, 99.8));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }
    
    // Dec lijnen
    for (let dec = -80; dec <= 80; dec += 20) {
      const points: THREE.Vector3[] = [];
      for (let ra = 0; ra <= 360; ra += 10) {
        points.push(this.raDecToXYZ(ra, dec, 99.8));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }
    
    // Evenaar
    const equatorPoints: THREE.Vector3[] = [];
    for (let ra = 0; ra <= 360; ra += 5) {
      equatorPoints.push(this.raDecToXYZ(ra, 0, 99.8));
    }
    const equatorGeo = new THREE.BufferGeometry().setFromPoints(equatorPoints);
    const equatorMat = new THREE.LineBasicMaterial({ color: 0x6688aa, opacity: 0.15, transparent: true });
    this.gridGroup.add(new THREE.Line(equatorGeo, equatorMat));
    
    this.gridGroup.visible = this.showGrid();
  }

  // =====================================================
  // LABELS – dynamisch aanpassen
  // =====================================================

  private rebuildLabels() {
    while(this.labelGroup.children.length) {
      this.labelGroup.remove(this.labelGroup.children[0]);
    }
    
    // Messier labels
    this.messierSprites.forEach(m => {
      const label = this.createLabel(`M${m.object.messierNumber}`, '#88ff88', 16, 40);
      label.position.copy(m.position.clone().multiplyScalar(1.03));
      this.labelGroup.add(label);
      m.label = label;
    });
    
    // Sterrennamen (alleen heldere sterren)
    if (this.showStarNames()) {
      this.stars
        .filter(s => s.name && s.magnitude < 2.5)
        .forEach(star => {
          const fontSize = star.magnitude < 1 ? 22 : 18;
          // Gebruik scaleDivisor = 25 om labels groter te maken bij uitzoomen
          const label = this.createLabel(star.name!, '#ffd700', fontSize, 40);
          label.position.copy(star.position.clone().multiplyScalar(1.04));
          this.labelGroup.add(label);
        });
    }
  }

  private updateLabelSizes() {
    const zoomFactor = Math.max(0.5, Math.min(2.0, 60 / this.camera.fov));
    
    this.labelGroup.children.forEach(child => {
      if (child instanceof THREE.Sprite && child.userData['baseWidth']) {
        child.scale.set(
          child.userData['baseWidth'] * zoomFactor,
          child.userData['baseHeight'] * zoomFactor,
          1
        );
      }
    });
  }

  // =====================================================
  // HELPERS – omrekeningen en labels
  // =====================================================

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
      const from = this.raDecToXYZ(line.from.ra, line.from.dec, 101);
      const to = this.raDecToXYZ(line.to.ra, line.to.dec, 101);
      center.add(from);
      center.add(to);
      count += 2;
    });
    
    return center.divideScalar(count);
  }

  private magnitudeToColor(mag: number): THREE.Color {
    if (mag < -0.5) return new THREE.Color('#fffaf0');
    if (mag < 0.5) return new THREE.Color('#fff4e0');
    if (mag < 1.5) return new THREE.Color('#ffefd0');
    if (mag < 2.5) return new THREE.Color('#ffe8c0');
    if (mag < 3.5) return new THREE.Color('#ffdfb0');
    if (mag < 4.5) return new THREE.Color('#f0d8b0');
    return new THREE.Color('#e0e0f0');
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

  /**
   * Maak een sprite met canvas tekst.
   * @param text label tekst
   * @param color kleur
   * @param fontSize lettergrootte in pixels
   * @param scaleDivisor deler voor breedte/hoogte (kleiner = groter label)
   */
  private createLabel(text: string, color: string, fontSize: number = 20, scaleDivisor: number = 40): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    ctx.font = `500 ${fontSize}px 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
    const metrics = ctx.measureText(text);
    const padding = 12;
    const width = metrics.width + padding * 2;
    const height = fontSize + padding * 2;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.font = `500 ${fontSize}px 'Inter', -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textBaseline = 'middle';
    
    // Achtergrond
    ctx.fillStyle = 'rgba(5, 10, 20, 0.85)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Afgeronde rechthoek
    const radius = 12;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(width - radius, 0);
    ctx.quadraticCurveTo(width, 0, width, radius);
    ctx.lineTo(width, height - radius);
    ctx.quadraticCurveTo(width, height, width - radius, height);
    ctx.lineTo(radius, height);
    ctx.quadraticCurveTo(0, height, 0, height - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    
    // Rand
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.stroke();
    
    // Tekst
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, padding, fontSize/2 + padding);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    const sprite = new THREE.Sprite(material);
    const zoomFactor = Math.max(0.5, Math.min(2.0, 60 / this.camera.fov));
    const baseWidth = width / scaleDivisor;
    const baseHeight = height / scaleDivisor;
    
    sprite.userData['baseWidth'] = baseWidth;
    sprite.userData['baseHeight'] = baseHeight;
    
    sprite.scale.set(baseWidth * zoomFactor, baseHeight * zoomFactor, 1);
    
    return sprite;
  }

  // =====================================================
  // ZOEKEN
  // =====================================================

  onSearch(query: string) {
    this.searchQuery = query;
    if (query.length < 2) {
      this.searchResults = [];
      this.showSearchResults = false;
      return;
    }
    
    const results: any[] = [];
    
    // Zoek sterren
    this.stars
      .filter(s => s.name && s.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 5)
      .forEach(s => {
        results.push({
          type: 'star',
          name: s.name,
          ra: s.ra,
          dec: s.dec,
          mag: s.magnitude
        });
      });
    
    // Zoek Messier objecten
    this.messierSprites
      .filter(m => 
        m.object.name.toLowerCase().includes(query.toLowerCase()) ||
        `M${m.object.messierNumber}`.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 5)
      .forEach(m => {
        results.push({
          type: 'messier',
          name: `M${m.object.messierNumber}: ${m.object.name}`,
          object: m.object
        });
      });
    
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
      this.infoPanelPosition.set({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      this.showInfoPanel.set(true);
    }
  }

  toggleSearch() {
    this.showSearch.update(v => !v);
    if (!this.showSearch()) {
      this.searchResults = [];
      this.showSearchResults = false;
    }
  }

  // =====================================================
  // UI ACTIES
  // =====================================================

  toggleConstellations() {
    this.showConstellations.update(v => !v);
    this.constellationLineGroup.visible = this.showConstellations();
  }

  toggleConstellationNames() {
    this.showConstellationNames.update(v => !v);
    this.constellationNameGroup.visible = this.showConstellationNames();
  }

  toggleStarNames() {
    this.showStarNames.update(v => !v);
    this.rebuildLabels();
  }

  toggleMessier() {
    this.showMessier.update(v => !v);
    this.messierGroup.visible = this.showMessier();
    this.messierSprites.forEach(m => m.label.visible = this.showMessier() && this.showMessierNames());
  }

  toggleMessierNames() {
    this.showMessierNames.update(v => !v);
    this.messierSprites.forEach(m => m.label.visible = this.showMessierNames());
  }

  toggleGrid() {
    this.showGrid.update(v => !v);
    this.gridGroup.visible = this.showGrid();
  }

  toggleNightMode() {
    this.nightMode.update(v => !v);
    if (this.nightMode()) {
      this.scene.background = new THREE.Color(0x000000);
      this.renderer.toneMappingExposure = 0.5;
    } else {
      this.scene.background = new THREE.Color(0x03030a);
      this.renderer.toneMappingExposure = 1.0;
    }
  }

  resetView() {
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, 1);
    this.controls.target.set(0, 0, 1);
    this.camera.fov = 60;  
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.updateLabelSizes();
  }

  // =====================================================
  // KEYBOARD SHORTCUTS
  // =====================================================

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    
    switch(key) {
      case 'g':
        event.preventDefault();
        this.toggleGrid();
        break;
      case 'c':
        event.preventDefault();
        this.toggleConstellations();
        break;
      case 'n':
        event.preventDefault();
        this.toggleConstellationNames();
        break;
      case 's':
        event.preventDefault();
        this.toggleStarNames();
        break;
      case 'm':
        event.preventDefault();
        this.toggleMessier();
        break;
      case 'r':
      case 'escape':
        event.preventDefault();
        this.resetView();
        break;
      case '/':
        event.preventDefault();
        this.toggleSearch();
        break;
      case 'l':
        event.preventDefault();
        this.toggleNightMode();
        break;
    }
    
    if (event.key === 'Escape' && this.showInfoPanel()) {
      this.hideInfoPanel();
    }
  }

  // =====================================================
  // ANIMATIE LOOP
  // =====================================================

  private animate = () => {
    this.frameId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.composer.render();
  };

  // =====================================================
  // RESIZE
  // =====================================================

  @HostListener('window:resize')
  onResize() {
    const canvas = this.canvasRef.nativeElement;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
  }
}