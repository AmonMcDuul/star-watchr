import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  PLATFORM_ID,
  OnInit,
  ChangeDetectorRef,
  NgZone
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Body, AstroTime, HelioVector } from 'astronomy-engine';

import { SolarSystemService } from '../../services/solar-system.service';
import { Planet } from '../../models/solar-system/planet.model';

// Constants
const ORBIT_SCALE = 170;
const PLANET_SCALE = 0.65;
const SUN_SIZE = 18;
const ASTEROID_COUNT = 4000;
const KUIPER_COUNT = 5000;

@Component({
  selector: 'app-solar-orbit-atlas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './solar-orbit-atlas.component.html',
  styleUrls: ['./solar-orbit-atlas.component.scss'],
  host: { ngSkipHydration: 'true' }
})
export class SolarOrbitAtlasComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('container', { static: true }) container!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private solar = inject(SolarSystemService);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);
  private cdr = inject(ChangeDetectorRef);

  // Data
  planets: Planet[] = [];
  selectedPlanetId?: string;

  // UI state
  timeSpeed = 1;
  reverse = false;
  followMode = false;
  currentDateTime = new Date();

  // Info panel
  showInfoPanel = false;
  infoPanelContent: any = null;

  // Three.js
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private controls!: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private textureLoader = new THREE.TextureLoader();

  // Object containers
  private planetMeshes: Map<string, {
    mesh: THREE.Mesh,
    pivot: THREE.Object3D,
    axialPivot: THREE.Object3D,
    rings?: THREE.Mesh
  }> = new Map();

  private orbitRings: THREE.Line[] = [];

  // Astronomy
  private simulationTime = new Date();
  private bodies: Record<string, Body> = {
    mercury: Body.Mercury,
    venus: Body.Venus,
    earth: Body.Earth,
    mars: Body.Mars,
    jupiter: Body.Jupiter,
    saturn: Body.Saturn,
    uranus: Body.Uranus,
    neptune: Body.Neptune
  };

  private rotationPeriods: Record<string, number> = {
    mercury: 1407,
    venus: -5832,
    earth: 24,
    mars: 24.6,
    jupiter: 9.9,
    saturn: 10.7,
    uranus: -17,
    neptune: 16
  };

  private axialTilts: Record<string, number> = {
    mercury: 0.03,
    venus: 177,
    earth: 23.4,
    mars: 25,
    jupiter: 3.1,
    saturn: 26.7,
    uranus: 97.8,
    neptune: 28.3
  };

  private inclinations: Record<string, number> = {
    mercury: 7,
    venus: 3.4,
    earth: 0,
    mars: 1.85,
    jupiter: 1.3,
    saturn: 2.5,
    uranus: 0.8,
    neptune: 1.8
  };

  private eccentricities: Record<string, number> = {
    mercury: 0.2056,
    venus: 0.0067,
    earth: 0.0167,
    mars: 0.0934,
    jupiter: 0.0489,
    saturn: 0.0565,
    uranus: 0.0457,
    neptune: 0.0113
  };

  private animationId?: number;
  private lastFrame = 0;

  ngOnInit() {
    this.planets = this.solar.planets();
    this.route.paramMap.subscribe(p => {
      this.selectedPlanetId = p.get('id') ?? undefined;
      if (this.selectedPlanetId) {
        setTimeout(() => this.flyToPlanet(this.selectedPlanetId!), 400);
      }
    });
  }

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    this.planets = this.solar.planets();

    this.initScene();
    this.initPostProcessing();
    this.createBackgroundStars();
    this.createSun();
    this.createPlanets();
    this.createAsteroidBelt();
    this.createKuiperBelt();
    this.createOrbitRings();
    this.setupEventListeners();
    this.animate();
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animationId!);
    this.renderer?.dispose();
    this.composer?.dispose();
    this.scene?.clear();
  }

  // -----------------------------------------
  // Initialisatie
  // -----------------------------------------
  private initScene() {
    const width = this.container.nativeElement.clientWidth;
    const height = this.container.nativeElement.clientHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03030a);

    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 20000);
    this.camera.position.set(0, 220, 520);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.container.nativeElement.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxDistance = 6000;
    this.controls.minDistance = 20;

    const sunLight = new THREE.PointLight(0xffeedd, 2.0, 0, 0);
    sunLight.position.set(0, 0, 0);
    this.scene.add(sunLight);

    const ambient = new THREE.AmbientLight(0x202030);
    this.scene.add(ambient);
  }

  private initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(1024, 1024), 1.0, 0.3, 0.6);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 0.5;
    bloomPass.radius = 0.4;
    this.composer.addPass(bloomPass);
  }

  private setupEventListeners() {
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('click', this.onClick);
  }

  // -----------------------------------------
  // Achtergrond
  // -----------------------------------------
  private createBackgroundStars() {
    const tex = this.textureLoader.load('/assets/img/textures/milkyway.jpg');
    const geo = new THREE.SphereGeometry(8000, 64, 64);
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, transparent: true, opacity: 0.3 });
    const sky = new THREE.Mesh(geo, mat);
    this.scene.add(sky);

    const starsGeo = new THREE.BufferGeometry();
    const starsCount = 4000;
    const positions = new Float32Array(starsCount * 3);
    for (let i = 0; i < starsCount; i++) {
      const r = 4500 + Math.random() * 3000;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.2, transparent: true, opacity: 0.6 });
    const stars = new THREE.Points(starsGeo, starsMat);
    this.scene.add(stars);
  }

  // -----------------------------------------
  // Zon
  // -----------------------------------------
  private createSun() {
    const tex = this.textureLoader.load('/assets/img/textures/sun.jpg');
    const sunMat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffaa33, emissiveIntensity: 1.2 });
    const sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_SIZE, 64, 64), sunMat);
    this.scene.add(sun);

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,200,100,0.9)');
    gradient.addColorStop(0.5, 'rgba(255,100,0,0.4)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const glowTex = new THREE.CanvasTexture(canvas);
    const glowMat = new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false });
    const glowSprite = new THREE.Sprite(glowMat);
    glowSprite.scale.set(45, 45, 1);
    sun.add(glowSprite);
  }

  // -----------------------------------------
  // Planeten
  // -----------------------------------------
  private createPlanets() {
    this.planets.forEach(p => this.createPlanet(p));
  }

  private createPlanet(planet: Planet) {
    const tex = this.textureLoader.load(`/assets/img/textures/${planet.id}.jpg`);
    const size = Math.cbrt(planet.radiusKm ?? 3000) * PLANET_SCALE;
    const geometry = new THREE.SphereGeometry(size, 64, 64);

    const material = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.6,
      metalness: 0.0,
      emissive: 0x000000,
      color: 0xcccccc
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { id: planet.id, type: 'planet' };

    const axialPivot = new THREE.Object3D();
    axialPivot.rotation.z = THREE.MathUtils.degToRad(this.axialTilts[planet.id] ?? 0);
    axialPivot.add(mesh);

    const incPivot = new THREE.Object3D();
    incPivot.rotation.z = THREE.MathUtils.degToRad(this.inclinations[planet.id] ?? 0);
    incPivot.add(axialPivot);

    this.scene.add(incPivot);
    this.planetMeshes.set(planet.id, { mesh, pivot: incPivot, axialPivot });

    if (planet.id === 'saturn') {
      this.createSaturnRings(mesh, size);
    }
  }

  private createSaturnRings(planetMesh: THREE.Mesh, size: number) {
    const tex = this.textureLoader.load('/assets/img/textures/saturn-rings.jpg');
    const inner = size * 1.2;
    const outer = size * 2.5;
    const geometry = new THREE.RingGeometry(inner, outer, 128);
    const material = new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      roughness: 0.5
    });
    const rings = new THREE.Mesh(geometry, material);
    rings.rotation.x = Math.PI / 2;
    planetMesh.add(rings);
    this.planetMeshes.get('saturn')!.rings = rings;
  }

  // -----------------------------------------
  // Banen
  // -----------------------------------------
  private createOrbitRings() {
    this.planets.forEach(planet => {
      const a = Math.log(planet.semiMajorAxisAU + 1) * ORBIT_SCALE;
      const e = this.eccentricities[planet.id] ?? 0;
      const b = a * Math.sqrt(1 - e * e);
      const c = a * e;

      const points: THREE.Vector3[] = [];
      const steps = 128;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        const x = a * Math.cos(t);
        const z = b * Math.sin(t);
        points.push(new THREE.Vector3(x - c, 0, z));
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      let color = 0x5d74ff;
      switch (planet.id) {
        case 'mercury': color = 0xaaaaaa; break;
        case 'venus': color = 0xffcc88; break;
        case 'earth': color = 0x88aaff; break;
        case 'mars': color = 0xff8866; break;
        case 'jupiter': color = 0xffaa66; break;
        case 'saturn': color = 0xffdd88; break;
        case 'uranus': color = 0xaaddff; break;
        case 'neptune': color = 0x3366cc; break;
      }

      const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3 });
      const ellipse = new THREE.LineLoop(geometry, material);
      ellipse.rotation.z = THREE.MathUtils.degToRad(this.inclinations[planet.id] ?? 0);
      this.scene.add(ellipse);
      this.orbitRings.push(ellipse);
    });
  }

  // -----------------------------------------
  // Asteroïden
  // -----------------------------------------
  private createAsteroidBelt() {
    const geometry = new THREE.SphereGeometry(0.25, 4, 4);
    const material = new THREE.MeshStandardMaterial({ color: 0xaaaaaa });
    const instancedMesh = new THREE.InstancedMesh(geometry, material, ASTEROID_COUNT);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < ASTEROID_COUNT; i++) {
      const radius = THREE.MathUtils.randFloat(2.2, 3.5);
      const angle = Math.random() * Math.PI * 2;
      const r = Math.log(radius + 1) * ORBIT_SCALE;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = THREE.MathUtils.randFloatSpread(1.5);

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.5 + Math.random() * 1.0);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(instancedMesh);
  }

  private createKuiperBelt() {
    const geometry = new THREE.SphereGeometry(0.3, 4, 4);
    const material = new THREE.MeshStandardMaterial({ color: 0x88aaff });
    const instancedMesh = new THREE.InstancedMesh(geometry, material, KUIPER_COUNT);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < KUIPER_COUNT; i++) {
      const radius = THREE.MathUtils.randFloat(35, 55);
      const angle = Math.random() * Math.PI * 2;
      const r = Math.log(radius + 1) * ORBIT_SCALE;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = THREE.MathUtils.randFloatSpread(8);

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(0.5 + Math.random() * 1.5);
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(instancedMesh);
  }

  // -----------------------------------------
  // Animatielus
  // -----------------------------------------
  private animate = () => {
    this.animationId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = (now - this.lastFrame) / 1000;
    this.lastFrame = now;

    let step = delta * this.timeSpeed * (this.reverse ? -1 : 1);
    this.simulationTime = new Date(this.simulationTime.getTime() + step * 86400000);
    const astroTime = new AstroTime(this.simulationTime);

    this.planets.forEach(planet => {
      const body = this.bodies[planet.id];
      if (!body) return;

      const vec = HelioVector(body, astroTime);
      const r = Math.log(Math.sqrt(vec.x * vec.x + vec.y * vec.y) + 1) * ORBIT_SCALE;
      const angle = Math.atan2(vec.y, vec.x);

      const planetData = this.planetMeshes.get(planet.id);
      if (!planetData) return;
      const { pivot, mesh, axialPivot } = planetData;

      pivot.position.x = Math.cos(angle) * r;
      pivot.position.z = Math.sin(angle) * r;

      const rot = this.rotationPeriods[planet.id];
      if (rot) {
        const hours = step * 24;
        const rotAngle = (hours / rot) * Math.PI * 2;
        mesh.rotation.y += rotAngle;
      }
    });

    if (this.followMode && this.selectedPlanetId) {
      const planetData = this.planetMeshes.get(this.selectedPlanetId);
      if (planetData) {
        const worldPos = planetData.mesh.getWorldPosition(new THREE.Vector3());
        this.controls.target.lerp(worldPos, 0.05);
      }
    }

    this.controls.update();
    this.composer.render();

    this.currentDateTime = this.simulationTime;
  };

  // -----------------------------------------
  // Klikdetectie met infopaneel
  // -----------------------------------------
  private onClick = (event: MouseEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    const objects: THREE.Object3D[] = [];
    this.planetMeshes.forEach(p => objects.push(p.mesh));

    const hits = this.raycaster.intersectObjects(objects);
    if (hits.length === 0) return;

    const hit = hits[0].object;
    const id = hit.userData['id'];
    const planet = this.planets.find(p => p.id === id);
    if (!planet) return;

    this.flyToPlanet(id);
    this.infoPanelContent = planet;
    this.showInfoPanel = true;
    this.cdr.detectChanges();
  };

  private flyToPlanet(id: string) {
    const planetData = this.planetMeshes.get(id);
    if (!planetData) return;

    const worldPos = planetData.mesh.getWorldPosition(new THREE.Vector3());
    const targetPos = worldPos.clone().add(new THREE.Vector3(0, 5, 75));

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();

    let t = 0;
    const duration = 800;
    const startTime = performance.now();

    const animate = () => {
      const now = performance.now();
      t = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);

      this.camera.position.lerpVectors(startPos, targetPos, ease);
      this.controls.target.lerpVectors(startTarget, worldPos, ease);

      if (t < 1) {
        requestAnimationFrame(animate);
      } else {
        this.selectedPlanetId = id;
      }
    };
    animate();
  }

  // -----------------------------------------
  // Info panel
  // -----------------------------------------
  hideInfoPanel() {
    this.showInfoPanel = false;
    this.infoPanelContent = null;
  }

  goToPlanetDetails(planet: any) {
    this.router.navigate(['/solar-system/planets', planet.id]);
    this.hideInfoPanel();
  }

  // -----------------------------------------
  // Resize
  // -----------------------------------------
  private onResize = () => {
    const width = this.container.nativeElement.clientWidth;
    const height = this.container.nativeElement.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  };

  // -----------------------------------------
  // Publieke methods
  // -----------------------------------------
  setTimeSpeed(speed: number) {
    this.timeSpeed = speed;
  }

  toggleReverse() {
    this.reverse = !this.reverse;
  }

  toggleFollow() {
    this.followMode = !this.followMode;
  }
}