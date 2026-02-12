// sky-atlas.component.ts
import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  HostListener
} from '@angular/core';

import * as THREE from 'three';
import { StarCatalogService } from '../../services/star-catalog.service';
import { MessierService } from '../../services/messier.service';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  private messier = inject(MessierService);

  // THREE core
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private composer!: EffectComposer;

  // Groups
  private skySphere = new THREE.Group();
  private starGroup = new THREE.Group();
  private constellationLineGroup = new THREE.Group();
  private constellationNameGroup = new THREE.Group();
  private messierGroup = new THREE.Group();
  private labelGroup = new THREE.Group();
  private gridGroup = new THREE.Group();

  // Animation
  private frameId = 0;

  // Star data storage
  private stars: StarData[] = [];

  // Textures
  private starTexture!: THREE.CanvasTexture;

  // UI State
  uiState = {
    showConstellations: true,
    showConstellationNames: true,
    showStarNames: false,
    showMessier: true,
    showMessierNames: true,
    showGrid: true
  };

  // =====================================================
  // LIFECYCLE
  // =====================================================

  async ngAfterViewInit() {
    await this.catalog.load();
    await this.messier.load();

    this.createTextures();
    this.initThree();
    this.initPostProcessing();
    this.buildSky();
    this.animate();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.frameId);
    this.renderer.dispose();
    this.composer.dispose();
  }

  // =====================================================
  // TEXTURE CREATION
  // =====================================================

  private createTextures() {
    const starCanvas = document.createElement('canvas');
    starCanvas.width = 64;
    starCanvas.height = 64;
    const starCtx = starCanvas.getContext('2d')!;
    
    const gradient = starCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.4, 'rgba(255,255,200,0.8)');
    gradient.addColorStop(0.7, 'rgba(255,200,100,0.3)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    starCtx.fillStyle = gradient;
    starCtx.fillRect(0, 0, 64, 64);
    this.starTexture = new THREE.CanvasTexture(starCanvas);
  }

  // =====================================================
  // THREE INIT - ECHTE STELLARIUM MODE!
  // =====================================================

private initThree() {
  const canvas = this.canvasRef.nativeElement;

  this.renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true
  });
  this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  this.renderer.toneMapping = THREE.ReinhardToneMapping;
  this.renderer.toneMappingExposure = 1.2;

  this.scene = new THREE.Scene();
  this.scene.background = new THREE.Color(0x03030a);

  // Camera - PRECIES IN HET CENTRUM
  this.camera = new THREE.PerspectiveCamera(
    60,
    canvas.clientWidth / canvas.clientHeight,
    0.01,
    200
  );
  this.camera.position.set(0, 0, 0);
  this.camera.lookAt(0, 0, 1);

  // Controls - MET OMGEKEERDE MUIS!
  this.controls = new OrbitControls(this.camera, canvas);
  this.controls.enableZoom = false;
  this.controls.enablePan = false;
  this.controls.enableDamping = true;
  this.controls.dampingFactor = 0.08;
  
  this.controls.rotateSpeed = -0.6;  // NEGATIEF!
  
  this.controls.enableRotate = true;
  this.controls.target.set(0, 0, 1);

  this.scene.add(this.skySphere);

  this.skySphere.add(
    this.starGroup,
    this.constellationLineGroup,
    this.constellationNameGroup,
    this.messierGroup,
    this.labelGroup,
    this.gridGroup
  );

  canvas.addEventListener('wheel', this.onMouseWheel, { passive: false });
}

private onMouseWheel = (event: WheelEvent) => {
  event.preventDefault();
  
  const zoomSpeed = 0.08;
  
  // scroll omlaag (positieve deltaY) = uitzoomen (FOV groter)
  this.camera.fov += event.deltaY * zoomSpeed;  // PLUS zoals standaard!
  
  this.camera.fov = THREE.MathUtils.clamp(this.camera.fov, 2.0, 120);
  
  this.camera.updateProjectionMatrix();
};

  private initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(
        this.canvasRef.nativeElement.clientWidth,
        this.canvasRef.nativeElement.clientHeight
      ),
      0.6,
      0.4,
      0.85
    );
    this.composer.addPass(bloomPass);
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
      this.gridGroup
    ];
    
    groups.forEach(group => {
      while(group.children.length) group.remove(group.children[0]);
    });
    
    this.stars = [];
  }

  // =====================================================
  // STARS - GECORRIGEERD VOOR BINNENKANT BOL!
  // =====================================================

  private createStars() {
    const stars = this.catalog.getStarsNear(0, 0, 180);
    
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    
    stars.forEach(star => {
      // 🔥 GEFIXED: RA/Dec mapping voor binnenkant bol
      const pos = this.raDecToXYZ(star.ra, star.dec, 100);
      const color = this.magnitudeToColor(star.mag);
      
      positions.push(pos.x, pos.y, pos.z);
      colors.push(color.r, color.g, color.b);
      
      const size = Math.max(1.0, (5 - star.mag) * 0.7);
      sizes.push(size);
      
      this.stars.push({
        position: pos,
        name: star.name,
        magnitude: star.mag,
        color: color
      });
    });
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
    
    const material = new THREE.PointsMaterial({
      size: 1,
      vertexColors: true,
      map: this.starTexture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    const points = new THREE.Points(geometry, material);
    this.starGroup.add(points);
  }

  // =====================================================
  // CONSTELLATIONS - OOK GECORRIGEERD
  // =====================================================

  private createConstellations() {
    const constellations = this.catalog.getConstellations();
    
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x88aaff,
      opacity: 0.6,
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
      const label = this.createLabel(constellation.name, '#aaccff', 26);
      label.position.copy(center);
      this.constellationNameGroup.add(label);
    });
  }

  // =====================================================
  // MESSIER OBJECTEN
  // =====================================================

  private createMessierObjects() {
    this.messier.all().forEach((obj, index) => {
      const ra = this.raToDeg(obj.rightAscension);
      const dec = this.decToDeg(obj.declination);
      const pos = this.raDecToXYZ(ra, dec, 98);
      
      const sprite = this.createMessierSprite(0x88ffcc);
      sprite.position.copy(pos);
      sprite.scale.set(8, 8, 1);
      this.messierGroup.add(sprite);
      
      const label = this.createLabel(`M${obj.messierNumber}`, '#88ff88', 22);
      label.position.copy(pos.clone().multiplyScalar(1.06));
      this.labelGroup.add(label);
    });
  }

  private createMessierSprite(color: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    
    const c = new THREE.Color(color);
    
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, `rgba(${c.r * 255}, ${c.g * 255}, ${c.b * 255}, 0.9)`);
    gradient.addColorStop(0.6, `rgba(${c.r * 255}, ${c.g * 255}, ${c.b * 255}, 0.3)`);
    gradient.addColorStop(1, `rgba(0, 0, 0, 0)`);
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    
    const texture = new THREE.CanvasTexture(canvas);
    return new THREE.Sprite(new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true
    }));
  }

  // =====================================================
  // CELESTIAL GRID
  // =====================================================

  private createCelestialGrid() {
    const gridMaterial = new THREE.LineBasicMaterial({ 
      color: 0x446688, 
      opacity: 0.15, 
      transparent: true 
    });
    
    for (let ra = 0; ra < 360; ra += 30) {
      const points: THREE.Vector3[] = [];
      for (let dec = -90; dec <= 90; dec += 10) {
        points.push(this.raDecToXYZ(ra, dec, 99.8));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }
    
    for (let dec = -80; dec <= 80; dec += 30) {
      const points: THREE.Vector3[] = [];
      for (let ra = 0; ra <= 360; ra += 15) {
        points.push(this.raDecToXYZ(ra, dec, 99.8));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.gridGroup.add(new THREE.Line(geometry, gridMaterial));
    }
    
    this.gridGroup.visible = this.uiState.showGrid;
  }

  // =====================================================
  // LABELS - GROTERE OFFSET VANUIT CENTRUM
  // =====================================================

  private rebuildLabels() {
    while(this.labelGroup.children.length) {
      this.labelGroup.remove(this.labelGroup.children[0]);
    }
    
    if (this.uiState.showStarNames) {
      this.stars
        .filter(s => s.name && s.magnitude < 2.0)
        .forEach(star => {
          const label = this.createLabel(star.name!, '#ffd700', 24);
          label.position.copy(star.position.clone().multiplyScalar(1.05));
          this.labelGroup.add(label);
        });
    }
    
    if (this.uiState.showMessierNames) {
      this.messierGroup.children.forEach((obj, index) => {
        const label = this.createLabel(`M${index + 1}`, '#88ff88', 22);
        label.position.copy(obj.position.clone().multiplyScalar(1.06));
        this.labelGroup.add(label);
      });
    }
  }

  // =====================================================
  // HELPERS - GECORRIGEERD VOOR BINNENKANT BOL!
  // =====================================================

  private raDecToXYZ(ra: number, dec: number, radius: number): THREE.Vector3 {
    // 🔥 CRUCIAL: Deze mapping zorgt dat je vanuit centrum naar binnenkant kijkt
    const raRad = THREE.MathUtils.degToRad(ra - 90); // 90 graden offset
    const decRad = THREE.MathUtils.degToRad(dec);
    
    // Juiste oriëntatie voor binnenkant bol
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
    if (mag < 0) return new THREE.Color('#fff9e6');
    if (mag < 1) return new THREE.Color('#fff4d9');
    if (mag < 2) return new THREE.Color('#ffefcc');
    if (mag < 3) return new THREE.Color('#ffe5b3');
    if (mag < 4) return new THREE.Color('#ffd699');
    return new THREE.Color('#c0c8e0');
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

  private createLabel(text: string, color: string, fontSize: number = 24): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    
    ctx.font = `bold ${fontSize}px 'Inter', Arial, sans-serif`;
    const metrics = ctx.measureText(text);
    const padding = 12;
    const width = metrics.width + padding * 2;
    const height = fontSize + padding * 2;
    
    canvas.width = width;
    canvas.height = height;
    
    ctx.font = `bold ${fontSize}px 'Inter', Arial, sans-serif`;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.fillRect(0, 0, width, height);
    
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.fillText(text, padding, fontSize + padding - 4);
    
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
      map: texture, 
      transparent: true,
      depthTest: true,
      depthWrite: false,
      sizeAttenuation: true
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(width / 25, height / 25, 1);
    
    return sprite;
  }

  // =====================================================
  // UI ACTIONS
  // =====================================================

  toggleConstellations() {
    this.uiState.showConstellations = !this.uiState.showConstellations;
    this.constellationLineGroup.visible = this.uiState.showConstellations;
  }

  toggleConstellationNames() {
    this.uiState.showConstellationNames = !this.uiState.showConstellationNames;
    this.constellationNameGroup.visible = this.uiState.showConstellationNames;
  }

  toggleStarNames() {
    this.uiState.showStarNames = !this.uiState.showStarNames;
    this.rebuildLabels();
  }

  toggleMessier() {
    this.uiState.showMessier = !this.uiState.showMessier;
    this.messierGroup.visible = this.uiState.showMessier;
  }

  toggleMessierNames() {
    this.uiState.showMessierNames = !this.uiState.showMessierNames;
    this.rebuildLabels();
  }

  toggleGrid() {
    this.uiState.showGrid = !this.uiState.showGrid;
    this.gridGroup.visible = this.uiState.showGrid;
  }

resetView() {
  this.camera.position.set(0, 0, 0);
  this.camera.lookAt(0, 0, 1);
  this.controls.target.set(0, 0, 1);
  this.camera.fov = 60;  
  this.camera.updateProjectionMatrix();
  this.controls.update();
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
    }
  }

  // =====================================================
  // ANIMATION LOOP
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