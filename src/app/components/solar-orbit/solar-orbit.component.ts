import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  PLATFORM_ID,
  OnInit
} from '@angular/core';

import { ActivatedRoute, Router } from '@angular/router';

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { Body, AstroTime, HelioVector } from 'astronomy-engine';

import { SolarSystemService } from '../../services/solar-system.service';
import { Planet } from '../../models/solar-system/planet.model';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

const ORBIT_SCALE = 170;
const PLANET_SCALE = 0.65;

@Component({
  selector: 'app-solar-orbit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './solar-orbit.component.html',
  styleUrl: './solar-orbit.component.scss',
  host: { ngSkipHydration: 'true' }
})
export class SolarOrbitComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('container', { static: true })
  container!: ElementRef<HTMLDivElement>;
  private route = inject(ActivatedRoute);
  private selectedPlanetId?: string;
  planets: Planet[] = [];
  timeOffset = 0;
  zoomLevel: 'solar' | 'planet' | 'moon' = 'solar';
  private lastFrame = performance.now();
  private solar = inject(SolarSystemService);
  private router = inject(Router);

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;

  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  private textureLoader = new THREE.TextureLoader();

  private planetMeshes: Record<string, THREE.Mesh> = {};
  private orbitTrails: Record<string, THREE.Line> = {};

  private moonSystems: Record<string, {
    mesh: THREE.Object3D;
    distance: number;
    speed: number;
    angle: number;
  }[]> = {};

  private animationId?: number;

  private simulationTime = new Date();
  timeSpeed = 0;

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


  /* orbital inclination in degrees */

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
  private platformId = inject(PLATFORM_ID);

  ngOnInit() {
    this.planets = this.solar.planets();
    this.route.paramMap.subscribe(p => {

    this.selectedPlanetId = p.get('id') ?? undefined;

    if(this.selectedPlanetId){
      const mesh = this.planetMeshes[this.selectedPlanetId];
      if(mesh) this.flyTo(mesh);
    }

  });
  }

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.initScene();

    this.createMilkyWay();
    this.createSun();
    this.createPlanets();

    this.createAsteroidBelt();
    this.createKuiperBelt();

    this.animate();

    window.addEventListener('resize', this.onResize);

    this.renderer.domElement.addEventListener(
      'click',
      e => this.onClick(e)
    );
    if (this.selectedPlanetId) {
      setTimeout(() => {
        const mesh = this.planetMeshes[this.selectedPlanetId!];
        if (mesh) {
          this.flyTo(mesh);
        }
      }, 400);
    }
  }

  ngOnDestroy() {
    cancelAnimationFrame(this.animationId!);
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }

  /* ------------------ scene ------------------ */

  private initScene() {

    const width = this.container.nativeElement.clientWidth;
    const height = this.container.nativeElement.clientHeight;

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      60,
      width / height,
      .1,
      10000
    );

    this.camera.position.set(0, 220, 520);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true
    });

    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(width, height);

    this.container.nativeElement.appendChild(
      this.renderer.domElement
    );

    this.controls = new OrbitControls(
      this.camera,
      this.renderer.domElement
    );

    this.controls.enableDamping = true;
    this.controls.dampingFactor = .08;

    this.controls.maxDistance = 4500;
    this.controls.minDistance = 25;

    const light = new THREE.PointLight('#ffffff', 2);
    this.scene.add(light);

    const ambient = new THREE.AmbientLight('#aab7ff', .45);
    this.scene.add(ambient);

  }

  /* ------------------ sky ------------------ */

  private createMilkyWay() {

    const tex = this.textureLoader.load(
      '/assets/img/textures/milkyway.jpg'
    );

    const geo = new THREE.SphereGeometry(6000, 64, 64);

    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      side: THREE.BackSide,
      opacity: .35,
      transparent: true
    });

    const sky = new THREE.Mesh(geo, mat);

    this.scene.add(sky);

  }

  /* ------------------ sun ------------------ */

  private createSun() {

    const tex = this.textureLoader.load(
      '/assets/img/textures/sun.jpg'
    );

    const sun = new THREE.Mesh(

      new THREE.SphereGeometry(18, 64, 64),

      new THREE.MeshBasicMaterial({
        map: tex
      })

    );

    this.scene.add(sun);

  }

  /* ------------------ planets ------------------ */

  private createPlanets() {

    const planets = this.solar.planets();

    planets.forEach(p => this.createPlanet(p));

  }

  private createPlanet(planet: Planet) {

    const tex = this.textureLoader.load(
      `/assets/img/textures/${planet.id}.jpg`
    );

    const size =
      Math.cbrt(planet.radiusKm ?? 3000) * PLANET_SCALE;

    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 32),
      new THREE.MeshStandardMaterial({ map: tex })
    );

    mesh.userData = { id: planet.id };

    /* orbit plane */

    const orbitPivot = new THREE.Object3D();

    const inc = THREE.MathUtils.degToRad(
      this.inclinations[planet.id] ?? 0
    );

    orbitPivot.rotation.z = inc;

    /* axial tilt */

    const axialPivot = new THREE.Object3D();

    axialPivot.rotation.z =
      THREE.MathUtils.degToRad(
        this.axialTilts[planet.id] ?? 0
      );

    axialPivot.add(mesh);
    orbitPivot.add(axialPivot);

    this.scene.add(orbitPivot);

    this.planetMeshes[planet.id] = mesh;

    this.createOrbitRing(planet);
    this.createOrbitTrail(planet);

    this.createMoons(planet, mesh);

    if (planet.id === 'saturn') {
      this.createSaturnRings(mesh, size);
    }

    const label = this.createLabel(planet.name);
    label.position.y = size * 3;
    mesh.add(label);
  }

  goToPlanet(id:string){

    const mesh=this.planetMeshes[id];

    if(!mesh)return;

    this.flyTo(mesh);

  }

  /* ------------------ orbit ring ------------------ */

  private createOrbitRing(planet: Planet) {

    const a = Math.log(planet.semiMajorAxisAU + 1) * ORBIT_SCALE;

    const e = this.eccentricities[planet.id] ?? 0;

    const b = a * Math.sqrt(1 - e * e);

    const curve = new THREE.EllipseCurve(
      0,
      0,
      a,
      b,
      0,
      Math.PI * 2,
      false,
      0
    );

    const points = curve.getPoints(256);

    const geometry = new THREE.BufferGeometry().setFromPoints(
      points.map(p => new THREE.Vector3(p.x, 0, p.y))
    );

    const material = new THREE.LineBasicMaterial({
      color: '#5d74ff',
      transparent: true,
      opacity: 0.7
    });

    const ellipse = new THREE.LineLoop(geometry, material);

    /* orbital inclination */

    const inc = THREE.MathUtils.degToRad(
      this.inclinations[planet.id] ?? 0
    );

    ellipse.rotation.z = inc;

    this.scene.add(ellipse);

  }

  /* ------------------ orbit trails ------------------ */

  private createOrbitTrail(planet: Planet) {

    const points: THREE.Vector3[] = [];

    for (let i = 0; i < 360; i++) {

      points.push(new THREE.Vector3(0, 0, 0));

    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);

    const mat = new THREE.LineBasicMaterial({
      color: '#8899ff',
      transparent: true,
      opacity: .5
    });

    const line = new THREE.Line(geo, mat);

    // this.scene.add(line);

    this.orbitTrails[planet.id] = line;

  }

  /* ------------------ moons ------------------ */
private createMoons(planet: Planet, planetMesh: THREE.Mesh) {

  const moons = this.solar.moons()
    .filter(m => m.parentPlanet === planet.id);

  this.moonSystems[planet.id] = [];

  moons.forEach(moon => {

    const size =
      Math.cbrt(moon.radiusKm ?? 500) * 1.2;

    const geo = new THREE.SphereGeometry(size, 16, 16);

    const mat = new THREE.MeshStandardMaterial({
      color: '#cccccc'
    });

    const mesh = new THREE.Mesh(geo, mat);

    const pivot = new THREE.Object3D();

    const dist =
      THREE.MathUtils.randFloat(size * 22, size * 40);

    mesh.position.x = dist;

    pivot.add(mesh);
    planetMesh.add(pivot);

    this.moonSystems[planet.id].push({

      mesh: pivot,
      distance: dist,
      speed: THREE.MathUtils.randFloat(.02,.05),
      angle: Math.random()*Math.PI*2

    });

  });

}

  /* ------------------ saturn rings ------------------ */

  private createSaturnRings(planet: THREE.Mesh, size: number) {

    const tex = this.textureLoader.load(
      '/assets/img/textures/saturn-rings.jpg'
    );

    const inner = size * 1.15;
    const outer = size * 2.2;

    const geo = new THREE.RingGeometry(inner, outer, 128);

    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      roughness: 0.7,
      metalness: 0
    });

    const rings = new THREE.Mesh(geo, mat);

    rings.rotation.x = Math.PI / 2;

    planet.add(rings);

  }

  /* ------------------ asteroid belt ------------------ */

  private createAsteroidBelt() {

    const count = 2000;

    const geo = new THREE.SphereGeometry(.45, 6, 6);

    const mat = new THREE.MeshStandardMaterial({
      color: '#a2a2a2'
    });

    for (let i = 0; i < count; i++) {

      const mesh = new THREE.Mesh(geo, mat);

      const radius =
        THREE.MathUtils.randFloat(3.0, 3.6);

      const angle = Math.random() * Math.PI * 2;

      const r = Math.log(radius + 1) * ORBIT_SCALE;

      mesh.position.x = Math.cos(angle) * r;
      mesh.position.z = Math.sin(angle) * r;

      mesh.position.y =
        THREE.MathUtils.randFloatSpread(4);

      this.scene.add(mesh);

    }

  }

  /* ------------------ kuiper belt ------------------ */

  private createKuiperBelt() {

    const count = 2500;

    const geo = new THREE.SphereGeometry(.5, 6, 6);

    const mat = new THREE.MeshStandardMaterial({
      color: '#7686a5'
    });

    for (let i = 0; i < count; i++) {

      const mesh = new THREE.Mesh(geo, mat);

      const radius =
        THREE.MathUtils.randFloat(35, 50);

      const angle = Math.random() * Math.PI * 2;

      const r = Math.log(radius + 1) * ORBIT_SCALE;

      mesh.position.x = Math.cos(angle) * r;
      mesh.position.z = Math.sin(angle) * r;

      mesh.position.y =
        THREE.MathUtils.randFloatSpread(8);

      this.scene.add(mesh);

    }

  }

  /* ------------------ labels ------------------ */

  private createLabel(text: string) {

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = 256;
    canvas.height = 64;

    ctx.fillStyle = 'white';
    ctx.font = '28px sans-serif';
    ctx.fillText(text, 10, 40);

    const tex = new THREE.CanvasTexture(canvas);

    const mat = new THREE.SpriteMaterial({ map: tex });

    const sprite = new THREE.Sprite(mat);

    // sprite.scale.set(16, 4, 1);

    return sprite;

  }

  /* ------------------ animation ------------------ */

  private animate = () => {

    this.animationId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const realDelta =
      (now - this.lastFrame) / 1000;

    this.lastFrame = now;

    const daysPerSecond = this.timeSpeed;

    this.simulationTime = new Date(
      this.simulationTime.getTime() +
      realDelta * daysPerSecond * 86400000
    );
    const time = new AstroTime(this.simulationTime);

    Object.entries(this.planetMeshes)
      .forEach(([id, mesh]) => {

        const body = this.bodies[id];
        if (!body) return;

        const pos = HelioVector(body, time);

        const r = Math.log(
          Math.sqrt(pos.x * pos.x + pos.y * pos.y) + 1
        ) * ORBIT_SCALE;

        const angle = Math.atan2(pos.y, pos.x);

        const orbitPivot = mesh.parent?.parent as THREE.Object3D;

        orbitPivot.position.x = Math.cos(angle) * r;
        orbitPivot.position.z = Math.sin(angle) * r;

        const trail = this.orbitTrails[id];

        if (trail) {

          const geo = trail.geometry as THREE.BufferGeometry;

          const positions = geo.attributes['position'];

          for (let i = positions.count - 1; i > 0; i--) {

            positions.setXYZ(
              i,
              positions.getX(i - 1),
              positions.getY(i - 1),
              positions.getZ(i - 1)
            );

          }

          positions.setXYZ(
            0,
            mesh.position.x,
            mesh.position.y,
            mesh.position.z
          );

          positions.needsUpdate = true;

        }
        const rot = this.rotationPeriods[id];

        if (rot) {

          const simulatedHours =
            realDelta * daysPerSecond * 24;

          const rotation =
            (simulatedHours / rot) *
            Math.PI * 2;

          mesh.rotation.y += rotation;

        }
      });

    Object.values(this.moonSystems).forEach(moons => {

      moons.forEach(m => {

        m.angle += 0.01 * m.speed * this.timeSpeed;

        m.mesh.rotation.y = m.angle;

      });

    });

    this.controls.update();

    this.renderer.render(
      this.scene,
      this.camera
    );

  };

  /* ------------------ camera fly ------------------ */
  private flyTo(mesh: THREE.Mesh) {

    const pos = new THREE.Vector3();
    mesh.getWorldPosition(pos);

    const offset = new THREE.Vector3(0, 20, 40);

    const targetPos = pos.clone().add(offset);

    const start = this.camera.position.clone();

    let t = 0;

    const animate = () => {

      t += .03;

      if (t >= 1) return;

      this.camera.position.lerpVectors(
        start,
        targetPos,
        t
      );

      this.controls.target.lerp(pos, 1);

      requestAnimationFrame(animate);

    };

    animate();

  }

  /* ------------------ click select ------------------ */

  private onClick(event: MouseEvent) {

    const rect = this.renderer.domElement.getBoundingClientRect();

    this.mouse.x =
      ((event.clientX - rect.left) / rect.width) * 2 - 1;

    this.mouse.y =
      -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(
      this.mouse,
      this.camera
    );

    const hits = this.raycaster.intersectObjects(
      Object.values(this.planetMeshes)
    );

    if (!hits.length) return;

    const mesh = hits[0].object as THREE.Mesh;

    const id = mesh.userData['id'];

    if (!id) return;

    this.flyTo(mesh);

    setTimeout(() => {
      this.router.navigate(['/solar-system/planets', id]);
    }, 900);

  }

  /* ------------------ resize ------------------ */

  private onResize = () => {

    const width = this.container.nativeElement.clientWidth;
    const height = this.container.nativeElement.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);

  }

  /* ------------------ time speed ------------------ */

setTimeSpeed(speed:number){

  const map:Record<number,number>={
    0:0,      // pause
    1:1,      // 1 day/sec
    10:10,    // 10 days/sec
    100:100,
    1000:1000
  };

  this.timeSpeed = map[speed] ?? 0;

}

  updateTime(){

    const d=new Date();

    d.setDate(
      d.getDate()+Number(this.timeOffset)
    );

    this.simulationTime=d;

  }

  // helpers
  setZoom(level:'solar'|'planet'|'moon'){

    this.zoomLevel=level;

    if(level==='solar'){

      this.controls.maxDistance=4500;
      this.controls.minDistance=25;

    }

    if(level==='planet'){

      this.controls.maxDistance=800;
      this.controls.minDistance=10;

    }

    if(level==='moon'){

      this.controls.maxDistance=120;
      this.controls.minDistance=2;

    }

  }

}