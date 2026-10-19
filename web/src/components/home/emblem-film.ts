// The home hero's 3D sequence. Scroll is the playhead: the emblem arrives whole, comes apart in
// the logo deck's picture order (slide 2: images 3 to 8), locks back together, then hands the
// mark to the header. Client only; imported lazily so three.js never blocks the first paint.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

type PartName = "outer" | "inner" | "disc" | "wedge";
const PARTS: PartName[] = ["outer", "inner", "disc", "wedge"];

// Brand blues sampled from image2.png. The base-color map only modulates these, so the rings
// always read as the flat mark's blues rather than as Meshy's mottled bake.
const COLORS: Record<PartName, string> = {
  outer: "#1088f8",
  inner: "#3e9ff8",
  disc: "#70b8f8",
  wedge: "#70b8f8",
};

type PartPose = { z: number; o: number };
type Pose = { fx: number; fy: number; s: number; ry: number; rx: number; parts: Record<PartName, PartPose> };

const all = (z: number, o: number): Record<PartName, PartPose> => ({
  outer: { z, o },
  inner: { z, o },
  disc: { z, o },
  wedge: { z, o },
});
const GHOST = 0.09;

function poses(portrait: boolean) {
  const side = portrait ? 0 : 1;
  const up = portrait ? 0.24 : 0; // on a phone the part sits above the caption
  const P = (fx: number, s: number, ry: number, rx: number, parts: Partial<Record<PartName, PartPose>>, fy = up): Pose => ({
    fx: fx * side,
    fy,
    s,
    ry,
    rx,
    parts: { ...all(-0.55, GHOST), ...parts },
  });
  return {
    arrive: { fx: 0, fy: 0, s: 1, ry: 0, rx: 0, parts: all(0, 1) } as Pose,
    // 3: outer C alone
    outer: P(-0.34, 0.9, 0.42, -0.1, { outer: { z: 0.35, o: 1 }, disc: { z: -0.95, o: GHOST } }),
    // 4: inner C alone
    inner: P(0.34, 0.9, -0.42, -0.08, { inner: { z: 0.5, o: 1 }, outer: { z: -0.7, o: GHOST } }),
    // 5: center disc alone
    disc: P(-0.34, 0.9, 0.34, 0.06, { disc: { z: 1.0, o: 1 }, outer: { z: -0.7, o: GHOST } }),
    // 6: inner C, disc and the wedge in the opening
    pic5: P(0, 0.86, -0.26, 0.12, { inner: { z: 0.15, o: 1 }, disc: { z: 0.7, o: 1 }, wedge: { z: 0.42, o: 1 }, outer: { z: -0.6, o: GHOST } }, portrait ? 0.18 : 0),
    // 7: disc and wedge alone
    pic6: P(0, 0.86, 0.24, 0.1, { disc: { z: 0.55, o: 1 }, wedge: { z: 0.55, o: 1 }, inner: { z: -0.3, o: GHOST }, outer: { z: -0.6, o: GHOST } }, portrait ? 0.18 : 0),
    // 8: both C's with the wedge; the center is still the empty pale disc
    pic7: P(0, 0.86, -0.16, 0.06, { outer: { z: -0.12, o: 1 }, inner: { z: 0.16, o: 1 }, wedge: { z: 0.16, o: 1 }, disc: { z: 0.34, o: 0.16 } }, portrait ? 0.18 : 0),
    // The lock: whole, flat, frontal. Words sit beside it.
    lock: { fx: portrait ? 0 : -0.36, fy: portrait ? 0.3 : 0, s: portrait ? 0.7 : 0.86, ry: 0, rx: 0, parts: all(0, 1) } as Pose,
    lines: { fx: portrait ? 0 : -0.5, fy: portrait ? 0.5 : 0.04, s: portrait ? 0.42 : 0.6, ry: 0, rx: 0, parts: all(0, 1) } as Pose,
    // The hand-off: the mark shrinks toward the header, where the still mark takes over.
    handoff: { fx: portrait ? -0.7 : -0.92, fy: 1.08, s: 0.14, ry: 0, rx: 0, parts: all(0, 0) } as Pose,
  };
}

// Scroll timeline, in hero progress (0..1). Holds are pairs of equal poses.
function timeline(portrait: boolean): [number, Pose][] {
  const k = poses(portrait);
  return [
    [0.0, k.arrive],
    [0.055, k.arrive],
    [0.115, k.outer],
    [0.215, k.outer],
    [0.27, k.inner],
    [0.345, k.inner],
    [0.4, k.disc],
    [0.465, k.disc],
    [0.51, k.pic5],
    [0.54, k.pic5],
    [0.585, k.pic6],
    [0.615, k.pic6],
    [0.655, k.pic7],
    [0.685, k.pic7],
    [0.745, k.lock], // the lock: the largest change on the page
    [0.86, k.lock],
    [0.9, k.lines],
    [0.965, k.lines],
    [1.0, k.handoff],
  ];
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function sample(track: [number, Pose][], p: number): Pose {
  if (p <= track[0][0]) return track[0][1];
  for (let i = 1; i < track.length; i++) {
    const [p1, b] = track[i];
    const [p0, a] = track[i - 1];
    if (p <= p1) {
      const raw = (p - p0) / Math.max(p1 - p0, 1e-6);
      // The lock closes decisively: fast in, long settle. Everything else eases both ways.
      const t = b === track[14][1] && a !== b ? easeOutExpo(raw) : easeInOut(raw);
      const parts = {} as Record<PartName, PartPose>;
      for (const n of PARTS) parts[n] = { z: lerp(a.parts[n].z, b.parts[n].z, t), o: lerp(a.parts[n].o, b.parts[n].o, t) };
      return { fx: lerp(a.fx, b.fx, t), fy: lerp(a.fy, b.fy, t), s: lerp(a.s, b.s, t), ry: lerp(a.ry, b.ry, t), rx: lerp(a.rx, b.rx, t), parts };
    }
  }
  return track[track.length - 1][1];
}

export type FilmFrame = {
  p: number;
  portrait: boolean;
  /** Screen anchors (px, relative to the stage) for the lock leaders. */
  anchors: Record<"outer" | "inner" | "disc", { x: number; y: number }>;
  /** Right edge of the emblem on screen (px), where the words begin. */
  emblemRight: number;
  emblemTop: number;
  emblemBottom: number;
  emblemHeight: number;
  /** Ring centre on screen (px), for the construction field behind the emblem. */
  center: { x: number; y: number };
};

export type Film = { setProgress(p: number): void; resize(): void; dispose(): void };

const CAMERA_Z = 6;
const FOV = 30;
const HALF_H = Math.tan(((FOV / 2) * Math.PI) / 180) * CAMERA_Z; // 1.6077
const FRONT = 1.035; // the front face sits ahead of z=0; matches the poster's 64.3% height

export async function createFilm(opts: {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  src: string;
  onFrame: (f: FilmFrame) => void;
}): Promise<Film> {
  const { canvas, stage, src, onFrame } = opts;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, CAMERA_Z);

  // Key from upper left, a cool fill, and a rim from behind so the ring edges catch light.
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0x0a1220, 1.15));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(-2.2, 2.6, 4.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fd0ff, 1.4);
  rim.position.set(2.5, -1.2, -3.5);
  scene.add(rim);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(src);

  const pivot = new THREE.Group(); // rotates about the ring centre
  const root = new THREE.Group();
  root.add(pivot);
  scene.add(root);

  const meshes = {} as Record<PartName, THREE.Mesh>;
  const holders = {} as Record<PartName, THREE.Group>;
  // Collect first: re-parenting inside traverse() would mutate the list being walked.
  const found: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) found.push(o as THREE.Mesh);
  });
  found.forEach((mesh) => {
    const name = (mesh.name || mesh.parent?.name || "") as PartName;
    if (!PARTS.includes(name)) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLORS[name]),
      map: src.map ?? null,
      normalMap: src.normalMap ?? null,
      roughnessMap: src.roughnessMap ?? null,
      metalnessMap: src.metalnessMap ?? null,
      // The baked metallic map is near black and the roughness map is glossy noise. Lit as-is the
      // rings crush to a dark lump, so metal comes down and roughness goes up.
      metalness: 0.08,
      roughness: 1.9,
      normalScale: new THREE.Vector2(0.55, 0.55),
      transparent: true,
    });
    // Keep Meshy's texture as surface variation only: the map modulates the brand colour around
    // its own mean luminance (0.257, measured) instead of replacing it.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
           vec4 ccgTex = texture2D( map, vMapUv );
           float ccgLum = dot( ccgTex.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
           diffuseColor.rgb *= clamp( mix( 1.0, ccgLum / 0.257, 0.22 ), 0.82, 1.18 );
         #endif`,
      );
    };
    mat.customProgramCacheKey = () => "ccg-modulated";
    mesh.material = mat;
    const holder = new THREE.Group();
    holder.add(mesh);
    pivot.add(holder);
    meshes[name] = mesh;
    holders[name] = holder;
  });

  let portrait = false;
  let track = timeline(false);
  let fit = 1;
  let width = 1;
  let height = 1;
  let target = 0;
  let current = 0;
  let raf = 0;
  let last = 0;
  let running = false;
  const v = new THREE.Vector3();

  function resize() {
    const r = stage.getBoundingClientRect();
    width = Math.max(1, Math.round(r.width));
    height = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.75 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const nextPortrait = width / height < 0.95;
    if (nextPortrait !== portrait) {
      portrait = nextPortrait;
      track = timeline(portrait);
    }
    // Same rule as the poster's CSS: height-limited at 64.3%, width-limited at 86vw (leaves a gutter).
    fit = Math.min(1, (1.336 * width) / height);
    draw();
  }

  function project(x: number, y: number) {
    v.set(x, y, 0.2);
    pivot.localToWorld(v);
    v.project(camera);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }

  function draw() {
    const p = current;
    const pose = sample(track, p);
    const halfW = HALF_H * (width / height);
    const s = pose.s * fit;
    root.position.set(pose.fx * halfW, pose.fy * HALF_H, 0);
    root.scale.setScalar(s / FRONT);
    pivot.rotation.set(pose.rx, pose.ry, 0);
    for (const n of PARTS) {
      const h = holders[n];
      const m = meshes[n];
      if (!h || !m) continue;
      const pp = pose.parts[n];
      h.position.z = pp.z;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = pp.o;
      mat.depthWrite = pp.o > 0.98;
      m.visible = pp.o > 0.01;
      m.renderOrder = pp.o > 0.98 ? 0 : 1;
    }
    renderer.render(scene, camera);

    root.updateMatrixWorld(true);
    const a45 = Math.SQRT1_2;
    const top = project(0, 1);
    const bottom = project(0, -1);
    onFrame({
      p,
      portrait,
      anchors: {
        outer: project(0.86 * a45 + 0.02, 0.86 * a45),
        inner: project(0.46 * a45 + 0.02, 0.46 * a45),
        disc: project(0.2, 0.07),
      },
      emblemRight: project(0.72, 0).x,
      emblemTop: top.y,
      emblemBottom: bottom.y,
      emblemHeight: bottom.y - top.y,
      center: project(0, 0),
    });
  }

  function tick(now: number) {
    raf = 0;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
    last = now;
    const d = target - current;
    // Scroll writes a target; the playhead walks toward it at a frame-rate independent rate, so
    // uneven wheel events glide and a slow device still lands where the reader stopped.
    current = Math.abs(d) < 0.0004 ? target : current + d * (1 - Math.exp(-dt * 10));
    if (current === target) last = 0;
    draw();
    if (current !== target && running) raf = requestAnimationFrame(tick);
  }

  function setProgress(p: number) {
    target = clamp01(p);
    running = true;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  resize();

  return {
    setProgress,
    resize,
    dispose() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mat = m.material as THREE.MeshStandardMaterial;
          [mat.map, mat.normalMap, mat.roughnessMap, mat.metalnessMap].forEach((t) => t?.dispose());
          mat.dispose();
        }
      });
      renderer.dispose();
    },
  };
}
