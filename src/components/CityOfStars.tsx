import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { Html, OrbitControls, PerspectiveCamera, Stars, Line } from "@react-three/drei";
import { EffectComposer, Bloom, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { X, UploadCloud, Image as ImageIcon, Type, MapPin } from "lucide-react";
import { supabase } from "../lib/supabase";
import { StoryReader } from './StoryReader';
import { IntroPage } from './IntroPage';
import { NYCClock } from './NYCClock';
import { CursorHint } from './CursorHint';

// 模块级鼠标坐标（归一化 -1~1），子组件可直接读取，无需 prop 传递
export const mouse3D = { x: 0, y: 0 };

const NYC_LOCATIONS = [
  { group: 'Manhattan', places: [
    'Central Park', 'West Village', 'SoHo', 'Lower East Side',
    'Brooklyn Bridge', 'Times Square', 'Harlem', 'Upper West Side',
    'Midtown', 'East Village', 'Chinatown', 'Financial District',
    'Roosevelt Island',
  ]},
  { group: 'Brooklyn', places: [
    'Williamsburg', 'DUMBO', 'Bushwick', 'Park Slope',
    'Coney Island', 'Crown Heights', 'Red Hook', 'Greenpoint',
  ]},
  { group: 'Queens', places: [
    'Flushing', 'Astoria', 'Long Island City', 'Jackson Heights',
  ]},
  { group: 'Bronx & Staten Island', places: [
    'The Bronx', 'Staten Island Ferry',
  ]},
];

const STAR_TEXTURES = [
  '/star01.png', '/star02.png', '/star03.png', '/star04.png',
];

function getStarTexture(storyId: string, createdAt?: string): string {
  if (createdAt) {
    const hour = new Date(createdAt).getHours();
    return STAR_TEXTURES[hour % STAR_TEXTURES.length];
  }
  const hash = storyId
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return STAR_TEXTURES[hash % STAR_TEXTURES.length];
}

export type StoryData = {
  id: string;
  position: [number, number, number];
  text: string;
  imageUrl: string;
  seed: number;
  date: string;
  taken_at?: string;
  location?: string;
  author_name?: string;
  title?: string;
  scaleHint?: number;
  isNew?: boolean;
};

type StoredStory = {
  id: string;
  location?: string;
  text: string;
  imageUrl: string;
  date: string;
  taken_at?: string;
};

const LOCAL_STORIES_KEY = "city_of_stars_local_stories_v1";

function readLocalStories(): StoryData[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_STORIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredStory[];
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    return parsed.map((s, i) => {
      const v = galaxyPosition(i, Math.max(parsed.length, 50), {
        arms: 2, turns: 2.5, radiusMax: 22, spreadFactor: 0.35,
      });
      const layer = i % 3;
      return {
        id: s.id,
        position: [v.x, v.y, v.z] as [number, number, number],
        text: s.text,
        imageUrl: s.imageUrl,
        seed: Math.random(),
        date: s.date,
        taken_at: s.taken_at,
        scaleHint: layer === 0 ? 1.6 : layer === 1 ? 1.0 : 0.65,
      };
    });
  } catch (err) {
    console.error("Failed to parse local stories:", err);
    return [];
  }
}

function writeLocalStories(stories: StoryData[]) {
  if (typeof window === "undefined") return;
  const payload: StoredStory[] = stories.map((s) => ({
    id: s.id,
    text: s.text,
    imageUrl: s.imageUrl,
    date: s.date,
    taken_at: s.taken_at,
  }));
  window.localStorage.setItem(LOCAL_STORIES_KEY, JSON.stringify(payload));
}

// --- 柔和圆点贴图 (canvas 生成) ---
function createSoftDotTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.6)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// --- 1. 中央柔和粒子星体 (上传入口) ---
const SPARSE_COUNT = 40;

function CentralCoreStar({ onUploadClick, onHover }: { onUploadClick: () => void; onHover: (t: 'sphere' | null) => void }) {
  const groupRef  = useRef<THREE.Group>(null!);
  const pointsRef = useRef<THREE.Points>(null!);
  const sparseRef = useRef<THREE.Points>(null!);
  const dotTexture = useMemo(() => createSoftDotTexture(), []);
  const [hovered, setHovered] = useState(false);
  const rotSpeedRef = useRef(0.001);

  // 稀疏彩色粒子数据
  const { sparsePositions, sparseBaseColors, sparseColorBuf, sparseFlicker, sparseDepthFactors } = useMemo(() => {
    const neonBlue    = new THREE.Color(80 / 255, 190 / 255, 255 / 255);
    const cyberPurple = new THREE.Color(160 / 255, 80 / 255, 255 / 255);
    const sparsePositions    = new Float32Array(SPARSE_COUNT * 3);
    const sparseBaseColors   = new Float32Array(SPARSE_COUNT * 3);
    const sparseDepthFactors = new Float32Array(SPARSE_COUNT);
    const sparseFlicker: Array<{ speed: number; phase: number }> = [];
    for (let i = 0; i < SPARSE_COUNT; i++) {
      const r     = 2.0 * Math.cbrt(Math.random()); // uniform volume density
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      sparsePositions[i * 3]     = x;
      sparsePositions[i * 3 + 1] = y;
      sparsePositions[i * 3 + 2] = z;
      const c = i % 2 === 0 ? neonBlue : cyberPurple;
      sparseBaseColors[i * 3]     = c.r;
      sparseBaseColors[i * 3 + 1] = c.g;
      sparseBaseColors[i * 3 + 2] = c.b;
      sparseFlicker.push({ speed: 1.5 + Math.random() * 3.5, phase: Math.random() * Math.PI * 2 });
      sparseDepthFactors[i] = Math.min(1.3, Math.max(0.6, 0.95 + 0.35 * (z / 2.0)));
    }
    return { sparsePositions, sparseBaseColors, sparseColorBuf: sparseBaseColors.slice(), sparseFlicker, sparseDepthFactors };
  }, []);

  // 当前帧写入的可变缓冲；origPos 存原始坐标用于噪声叠加基准
  const { positions, origPos, goldColorBuf } = useMemo(() => {
    const count = 2000;
    const positions    = new Float32Array(count * 3);
    const goldColorBuf = new Float32Array(count * 3); // grayscale depth factor, tinted by material color
    for (let i = 0; i < count; i++) {
      const r     = 2.0 * Math.cbrt(Math.random()); // uniform volume density
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      positions[i * 3]     = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const d = Math.min(1.3, Math.max(0.6, 0.95 + 0.35 * (z / 2.0)));
      goldColorBuf[i * 3]     = d;
      goldColorBuf[i * 3 + 1] = d;
      goldColorBuf[i * 3 + 2] = d;
    }
    const origPos = positions.slice(); // 原始坐标快照
    return { positions, origPos, goldColorBuf };
  }, []);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const pts = pointsRef.current;

    // 整体缓慢旋转 + 呼吸浮动
    const targetRotSpeed = hovered ? 0.004 : 0.001;
    rotSpeedRef.current += (targetRotSpeed - rotSpeedRef.current) * 0.05;
    pts.rotation.y += rotSpeedRef.current;
    pts.rotation.x = t * 0.02;
    pts.position.y = Math.sin(t * 0.5) * 0.08;

    // hover 缩放平滑插值
    const targetScale = hovered ? 1.08 : 1.0;
    pts.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.06);

    // 呼吸动画：group 缩放 0.88–1.12，material 透明度 0.7–1.0，周期 ~4s
    const breath = Math.sin(t * Math.PI * 0.5); // period = 4s
    const breathScale = 1.0 + 0.12 * breath;
    groupRef.current.scale.setScalar(breathScale);
    (pts.material as THREE.PointsMaterial).opacity = 0.85 + 0.15 * breath;

    // 逐粒子噪声扰动（有机烟雾感）
    const attr = pts.geometry.attributes.position;
    const buf = attr.array as Float32Array;
    const count = buf.length / 3;
    const NOISE_AMP = 0.018; // 扰动幅度，极微小
    for (let i = 0; i < count; i++) {
      const ox = origPos[i * 3];
      const oy = origPos[i * 3 + 1];
      const oz = origPos[i * 3 + 2];
      // 每个粒子用不同相位的 sin/cos 产生各向异性扰动
      buf[i * 3]     = ox + Math.sin(t * 0.7 + i * 0.317) * NOISE_AMP;
      buf[i * 3 + 1] = oy + Math.cos(t * 0.5 + i * 0.573) * NOISE_AMP;
      buf[i * 3 + 2] = oz + Math.sin(t * 0.9 + i * 0.211) * NOISE_AMP;
    }
    attr.needsUpdate = true;

    // 深度编码：根据当前 z 更新金色粒子顶点颜色亮度（material color "#FFE082" 作为倍增器）
    const goldColorAttr = pts.geometry.attributes.color;
    if (goldColorAttr) {
      const gcBuf = goldColorAttr.array as Float32Array;
      for (let i = 0; i < count; i++) {
        const z = buf[i * 3 + 2];
        const d = Math.min(1.3, Math.max(0.6, 0.95 + 0.35 * (z / 2.0)));
        gcBuf[i * 3]     = d;
        gcBuf[i * 3 + 1] = d;
        gcBuf[i * 3 + 2] = d;
      }
      goldColorAttr.needsUpdate = true;
    }

    // 稀疏彩色闪烁粒子（加入深度系数）
    if (sparseRef.current) {
      const colorAttr = sparseRef.current.geometry.attributes.color;
      const cbuf = colorAttr.array as Float32Array;
      for (let i = 0; i < SPARSE_COUNT; i++) {
        const brightness = (0.5 + 0.5 * Math.sin(t * sparseFlicker[i].speed + sparseFlicker[i].phase))
                           * sparseDepthFactors[i];
        cbuf[i * 3]     = sparseBaseColors[i * 3]     * brightness;
        cbuf[i * 3 + 1] = sparseBaseColors[i * 3 + 1] * brightness;
        cbuf[i * 3 + 2] = sparseBaseColors[i * 3 + 2] * brightness;
      }
      colorAttr.needsUpdate = true;
    }
  });

  return (
    <group
      ref={groupRef}
      onClick={(e) => { e.stopPropagation(); onUploadClick(); }}
      onPointerOver={() => { setHovered(true); document.body.style.cursor = "pointer"; onHover('sphere'); }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; onHover(null); }}
    >
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={goldColorBuf.length / 3}
            array={goldColorBuf}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.12}
          color="#FFE082"
          vertexColors
          map={dotTexture}
          transparent
          alphaTest={0.01}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>

      {/* 稀疏彩色闪烁粒子层 */}
      <points ref={sparseRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={SPARSE_COUNT}
            array={sparsePositions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={SPARSE_COUNT}
            array={sparseColorBuf}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.06}
          vertexColors
          map={dotTexture}
          transparent
          alphaTest={0.001}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

// --- 2. 故事星星 ---
function ParticleStoryStar({
  data,
  isSelected,
  dimmed,
  onClick,
  onHover,
}: {
  data: StoryData;
  isSelected: boolean;
  dimmed: boolean;
  onClick: (data: StoryData) => void;
  onHover: (t: 'star' | null) => void;
}) {
  const meshRef = useRef<THREE.Sprite>(null);
  const birthRef = useRef<number | null>(null);
  const baseScale = data.scaleHint ?? 1.0;
  const magOffset = useRef({ x: 0, y: 0 });
  const breathSpeed = 0.7 + (data.seed % 0.5);
  const breathPhase = data.seed * Math.PI * 2;
  const texturePath = getStarTexture(data.id.toString(), data.taken_at);
  const flareTexture = useLoader(THREE.TextureLoader, texturePath);

  useEffect(() => {
    const mat = meshRef.current?.material as THREE.SpriteMaterial | undefined;
    if (!mat) return;
    gsap.to(mat, { opacity: dimmed ? 0.2 : 0.95, duration: 1.2, ease: "power2.inOut" });
  }, [dimmed]);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    const mesh = meshRef.current;
    if (!mesh) return;

    // 现有逻辑：bob 自然目标值（local 坐标，group 已在 data.position）
    const bobY = Math.sin(t * 0.8 + data.seed * 6) * 0.12;

    // --- 磁力偏移 ---
    const MAGNET_STRENGTH = 0;
    const MAGNET_RADIUS   = 8;
    const RETURN_SPEED    = 0.06;

    const mouseInfluenceX = mouse3D.x * 12;
    const mouseInfluenceY = mouse3D.y * 8;

    // 近似世界坐标：group 在 data.position，mesh local 偏移叠加
    const wx = data.position[0] + magOffset.current.x;
    const wy = data.position[1] + bobY + magOffset.current.y;

    const dx = wx - mouseInfluenceX;
    const dy = wy - mouseInfluenceY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < MAGNET_RADIUS && dist > 0.001) {
      const force = (1 - dist / MAGNET_RADIUS) * MAGNET_STRENGTH;
      magOffset.current.x += (dx / dist) * force * 60;
      magOffset.current.y += (dy / dist) * force * 60;
    } else {
      // 超出范围：lerp 回原位
      magOffset.current.x += (0 - magOffset.current.x) * RETURN_SPEED;
      magOffset.current.y += (0 - magOffset.current.y) * RETURN_SPEED;
    }
    // --- 磁力偏移结束 ---

    // 将 bob + 磁力偏移合并写入 mesh local position
    mesh.position.x = magOffset.current.x;
    mesh.position.y = bobY + magOffset.current.y;

    // 出生动画：前 1.2s 内
    if (data.isNew && birthRef.current === null) {
      birthRef.current = t;
    }

    if (data.isNew && birthRef.current !== null) {
      const age = t - birthRef.current;
      if (age < 1.2) {
        const progress = age / 1.2;
        const eased = 1 - Math.pow(1 - progress, 3);
        const flicker = 1 + 0.4 * Math.sin(age * 25) * (1 - progress);
        const birthScale = (data.scaleHint ?? 1.0) * 1.8;
        mesh.scale.setScalar(eased * birthScale * flicker);
        const mat = mesh.material as THREE.SpriteMaterial;
        mat.opacity = eased;
        return;
      } else {
        data.isNew = false;
      }
    }

    // 深度感知 scale（基于 scaleHint）+ 呼吸动画
    const s = baseScale * (isSelected ? 2.2 : dimmed ? 0.7 : 1.0);
    mesh.scale.setScalar(s * (1 + 0.06 * Math.sin(t * breathSpeed + breathPhase)));
  });

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    gsap.from(mesh.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 1.4, ease: "back.out(2)" });
    const mat = mesh.material as THREE.SpriteMaterial;
    gsap.fromTo(mat, { opacity: 0.35 }, { opacity: 1, duration: 0.22, repeat: 2, yoyo: true, ease: "sine.inOut" });
  }, [data.id]);

  return (
    <group position={data.position}>
      <sprite
        ref={meshRef}
        scale={[baseScale, baseScale, 1]}
        onClick={(e) => { e.stopPropagation(); onClick(data); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; onHover('star'); }}
        onPointerOut={() => { document.body.style.cursor = "auto"; onHover(null); }}
      >
        <spriteMaterial
          map={flareTexture}
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          color={new THREE.Color('#D4AF5F')}
        />
      </sprite>
    </group>
  );
}

// --- 3. CameraRig ---
function CameraRig({
  selectedId,
  stories,
  resetTrigger,
  onCameraReady,
}: {
  selectedId: string | null;
  stories: StoryData[];
  resetTrigger: number;
  onCameraReady?: (cam: THREE.PerspectiveCamera) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const prevId = useRef<string | null>(null);
  const { camera } = useThree();

  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      onCameraReady?.(camera);
    }
  }, [camera]);

  useEffect(() => {
    camera.position.set(8, 4, 20)
    camera.lookAt(0, 0, 0)
  }, []);

  // Fly to selected story
  useEffect(() => {
    if (selectedId == null) {
      prevId.current = null;
      return;
    }
    if (prevId.current === selectedId) return;
    prevId.current = selectedId;

    const story = stories.find((s) => s.id === selectedId);
    const ctrl = controlsRef.current;
    if (!story || !ctrl || !(camera instanceof THREE.PerspectiveCamera)) return;

    const targetPos = new THREE.Vector3(...story.position);
    const endCam = targetPos.clone().add(new THREE.Vector3(0, 0.35, 5));
    const upd = () => ctrl.update();

    gsap.to(camera.position, { x: endCam.x, y: endCam.y, z: endCam.z, duration: 3.5, ease: "power3.inOut", onUpdate: upd });
    gsap.to(ctrl.target, { x: targetPos.x, y: targetPos.y, z: targetPos.z, duration: 3.5, ease: "power3.inOut", onUpdate: upd });
  }, [selectedId, stories, camera]);

  // Return to initial view
  useEffect(() => {
    if (resetTrigger === 0) return;
    const ctrl = controlsRef.current;
    if (!ctrl || !(camera instanceof THREE.PerspectiveCamera)) return;
    const upd = () => ctrl.update();
    gsap.to(camera.position, { x: 0, y: 0.5, z: 20, duration: 2.2, ease: "power3.inOut", onUpdate: upd });
    gsap.to(ctrl.target,     { x: 0, y: 0,   z: 0,  duration: 2.2, ease: "power3.inOut", onUpdate: upd });
  }, [resetTrigger, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.04}
      enablePan={true}
      panSpeed={0.8}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      minDistance={2}
      maxDistance={80}
      maxPolarAngle={Math.PI}
      minPolarAngle={0}
      target={[0, 0, 0]}
    />
  );
}

// --- 4. 星尘粒子系统 ---
// 三层星尘配置
const DUST_LAYERS = [
  { count: 600,  color: 0xffffff,  opacity: 0.9,  size: 0.32 }, // 亮星
  { count: 1400, color: 0xC4AEF4,  opacity: 0.55, size: 0.22 }, // 中星
  { count: 1000, color: 0xA98CE8,  opacity: 0.25, size: 0.14 }, // 暗尘
];

function StarDust() {
  const { scene } = useThree();
  const tickRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const layers: { dust: THREE.Points; phases: Float32Array; speeds: Float32Array; baseColor: THREE.Color }[] = [];

    DUST_LAYERS.forEach(({ count, color, opacity, size }) => {
      const positions = new Float32Array(count * 3);
      const colors    = new Float32Array(count * 3); // vertexColors
      const phases    = new Float32Array(count);     // 每颗星闪烁相位
      const speeds    = new Float32Array(count);     // 每颗星闪烁速度
      const baseColor = new THREE.Color(color);

      for (let i = 0; i < count; i++) {
        // 球面均匀分布（360 度覆盖）
        const r     = 42 + Math.random() * 8;        // 半径 42~50
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        // 初始颜色用基础色填充
        colors[i * 3]     = baseColor.r;
        colors[i * 3 + 1] = baseColor.g;
        colors[i * 3 + 2] = baseColor.b;

        phases[i] = Math.random() * Math.PI * 2;           // 随机初始相位
        speeds[i] = 0.4 + Math.random() * 1.2;             // 0.4~1.6 Hz 闪烁速度
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("color",    new THREE.BufferAttribute(colors, 3));

      const mat = new THREE.PointsMaterial({
        size,
        vertexColors: true,   // 用 vertex color 驱动逐粒子亮度
        transparent: true,
        opacity,
        sizeAttenuation: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const dust = new THREE.Points(geo, mat);
      scene.add(dust);
      layers.push({ dust, phases, speeds, baseColor });
    });

    tickRef.current = function tickDust() {
      const t = performance.now() * 0.001;
      layers.forEach(({ dust, phases, speeds, baseColor }, layerIndex) => {
        const colorAttr = dust.geometry.attributes.color;
        const buf = colorAttr.array as Float32Array;
        const count = phases.length;
        const baseOpacity = DUST_LAYERS[layerIndex].opacity;

        for (let i = 0; i < count; i++) {
          // 每颗星独立闪烁，亮度范围 0.15~1.0
          const brightness = baseOpacity * (0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * speeds[i] + phases[i])));
          buf[i * 3]     = baseColor.r * brightness;
          buf[i * 3 + 1] = baseColor.g * brightness;
          buf[i * 3 + 2] = baseColor.b * brightness;
        }
        colorAttr.needsUpdate = true;
      });
    };

    return () => {
      layers.forEach(({ dust }) => {
        scene.remove(dust);
        dust.geometry.dispose();
        (dust.material as THREE.PointsMaterial).dispose();
      });
    };
  }, [scene]);

  useFrame(() => tickRef.current?.());

  return null;
}

// --- 星座连线 ---
function ConstellationLines({ stories }: { stories: StoryData[] }) {
  if (stories.length < 2) return null;

  const lines: [THREE.Vector3, THREE.Vector3][] = [];

  stories.forEach((story, i) => {
    const pos = new THREE.Vector3(...story.position);
    let nearest: { dist: number; idx: number } | null = null;

    stories.forEach((other, j) => {
      if (i === j) return;
      const otherPos = new THREE.Vector3(...other.position);
      const dist = pos.distanceTo(otherPos);
      if (!nearest || dist < nearest.dist) {
        nearest = { dist, idx: j };
      }
    });

    if (nearest && (nearest as { dist: number; idx: number }).dist < 12) {
      const otherPos = new THREE.Vector3(...stories[(nearest as { dist: number; idx: number }).idx].position);
      lines.push([pos, otherPos]);
    }
  });

  return (
    <>
      {lines.map((pts, i) => (
        <Line
          key={i}
          points={pts}
          color="#C4AEF4"
          lineWidth={0.3}
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      ))}
    </>
  );
}

// --- 5. 场景 ---
function StarFieldScene({
  stories,
  selectedId,
  onSelectStar,
  onUploadClick,
  resetTrigger,
  bloomBoost,
  onCameraReady,
  onHover,
}: {
  stories: StoryData[];
  selectedId: string | null;
  onSelectStar: (data: StoryData) => void;
  onUploadClick: () => void;
  resetTrigger: number;
  bloomBoost: boolean;
  onCameraReady?: (cam: THREE.PerspectiveCamera) => void;
  onHover: (t: 'sphere' | 'star' | null) => void;
}) {
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      mouse3D.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouse3D.y = (e.clientY / window.innerHeight - 0.5) * -2;
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 20]} fov={58} near={0.1} far={200} />
      <ambientLight intensity={0.55} />
      <pointLight position={[10, 12, 8]} intensity={0.4} color="#c4b5fd" />
      <fogExp2 attach="fog" args={["#050510", 0.01]} />

      <Stars radius={90} depth={52} count={4200} factor={3.2} saturation={0.12} fade speed={0.35} />

      {/* 星尘粒子系统 */}
      <StarDust />

      {/* 中央粒子星体 */}
      <CentralCoreStar onUploadClick={onUploadClick} onHover={onHover} />

      {/* 故事星星 */}
      <group>
        {stories.map((story) => (
          <ParticleStoryStar
            key={story.id}
            data={story}
            isSelected={selectedId === story.id}
            dimmed={selectedId !== null && selectedId !== story.id}
            onClick={onSelectStar}
            onHover={onHover}
          />
        ))}
        {/* <ConstellationLines stories={stories} /> */}
      </group>

      <CameraRig selectedId={selectedId} stories={stories} resetTrigger={resetTrigger} onCameraReady={onCameraReady} />

      <EffectComposer enableNormalPass={false} multisampling={0}>
        <SMAA />
        <Bloom
          luminanceThreshold={0.2}
          luminanceSmoothing={0.85}
          mipmapBlur
          intensity={bloomBoost ? 2.4 : 1.4}
          radius={bloomBoost ? 1.0 : 0.9}
        />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </>
  );
}

// --- 5. 上传模态框 ---
function UploadModal({
  onClose,
  onUpload,
  onGetStarScreenPos,
}: {
  onClose: () => void;
  onUpload: (story: { text: string; imageUrl: string | null; takenAt: string; title: string; location: string }) => void;
  onGetStarScreenPos: () => { x: number; y: number };
}) {
  const isMobile = window.innerWidth < 768;
  const modalRef = useRef<HTMLDivElement>(null);
  const [collapsing, setCollapsing] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [location, setLocation] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [takenAt, setTakenAt] = useState<Date>(new Date());
  const [submitting, setSubmitting] = useState(false);
  const [authorName, setAuthorName] = useState("");

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // 读取 EXIF 拍摄时间
      let takenAt: Date | null = null;
      try {
        const exifr = await import('exifr');
        const exif = await exifr.parse(file, ['DateTimeOriginal']);
        if (exif?.DateTimeOriginal) takenAt = exif.DateTimeOriginal;
      } catch (_) {}
      setTakenAt(takenAt || new Date());

      // 压缩图片到 800px 以内，JPEG 0.82，保证 <300KB
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        const MAX = 800;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPreview(canvas.toDataURL("image/jpeg", 0.82));
        URL.revokeObjectURL(objectUrl);
      };
      img.src = objectUrl;
    }
  };

  const handleSubmit = async () => {
    if (!preview || !text.trim() || !authorName.trim()) {
      alert("Please add a photo, write your story, and enter your name.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("stories").insert({
      title: title.trim() || null,
      text,
      image_url: preview,
      taken_at: takenAt.toISOString(),
      location: location.trim() || null,
      author_name: authorName.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      console.error("Cloud upload failed, using local backup:", error);
      alert("Cloud upload failed, but saved on this browser.");
    }
    setTitle('');

    const rect = modalRef.current?.getBoundingClientRect();
    const centerX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const centerY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    setCollapsing(true);

    gsap.to(modalRef.current, {
      scaleX: 0.04,
      scaleY: 0.04,
      opacity: 0,
      duration: 0.55,
      ease: 'power3.in',
      transformOrigin: 'center center',
      onComplete: () => {
        // 全屏滤镜层（落点时闪现）
        const flash = document.createElement('div');
        flash.style.cssText = `
          position: fixed; inset: 0;
          background: radial-gradient(ellipse at center, rgba(245,197,24,0.18) 0%, rgba(74,18,128,0.12) 50%, transparent 80%);
          z-index: 9998;
          pointer-events: none;
          opacity: 0;
        `;
        document.body.appendChild(flash);

        const orb = document.createElement('div');
        orb.style.cssText = `
          position: fixed;
          left: ${centerX - 10}px;
          top: ${centerY - 10}px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: radial-gradient(circle, #ffffff 0%, #fff8c0 25%, rgba(245,197,24,0.5) 60%, rgba(245,197,24,0) 100%);
          box-shadow: 0 0 16px 6px rgba(255,255,255,0.95), 0 0 40px 14px rgba(245,197,24,0.55), 0 0 70px 24px rgba(160,100,255,0.2);
          z-index: 9999;
          pointer-events: none;
        `;
        document.body.appendChild(orb);

        const starPos = onGetStarScreenPos();
        const targetX = starPos.x - 6;
        const targetY = starPos.y - 6;

        // 先飞到屏幕中心（模拟穿越银河）
        gsap.to(orb, {
          left: window.innerWidth / 2 - 6,
          top: window.innerHeight / 2 - 6,
          width: 4,
          height: 4,
          duration: 0.55,
          ease: 'power2.in',
          onComplete: () => {
            // 再从中心减速飞向星星落点
            gsap.to(orb, {
              left: targetX,
              top: targetY,
              width: 10,
              height: 10,
              duration: 1.1,
              ease: 'power2.out',
              onComplete: () => {
                // 落点滤镜闪现
                gsap.to(flash, { opacity: 1, duration: 0.18, ease: 'power2.out',
                  onComplete: () => {
                    gsap.to(flash, { opacity: 0, duration: 0.7, ease: 'power2.in',
                      onComplete: () => { document.body.removeChild(flash); }
                    });
                  }
                });
                // 光点渐隐
                gsap.to(orb, {
                  opacity: 0,
                  width: 28,
                  height: 28,
                  left: targetX - 9,
                  top: targetY - 9,
                  duration: 0.5,
                  ease: 'power2.out',
                  onComplete: () => {
                    document.body.removeChild(orb);
                    onUpload({ text, imageUrl: preview, takenAt: takenAt.toISOString(), title: title.trim(), location });
                    onClose();
                  }
                });
              }
            });
          }
        });
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      style={{ animation: "cityStarsCardIn 0.3s ease-out both" }}
    >
      <div
        ref={modalRef}
        className="relative w-[min(480px,92vw)] p-8"
        style={{
          background: 'rgba(8,4,24,0.88)',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: '24px',
          backdropFilter: 'blur(16px)',
          position: 'relative',
          overflow: 'hidden',
          maxHeight: isMobile ? '90vh' : 'none',
          overflowY: isMobile ? 'auto' : 'visible',
        }}
      >
        {/* 极光内衬 */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '24px', pointerEvents: 'none',
          background: 'linear-gradient(135deg, rgba(160,120,255,0.04) 0%, transparent 60%)',
        }} />

        <button
          onClick={onClose}
          className="absolute right-5 top-5 transition-colors"
          style={{ color: 'rgba(230, 230, 250, 0.3)', zIndex: 1 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(230,230,250,0.75)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(230,230,250,0.3)')}
        >
          <X size={20} />
        </button>

        <div className="mb-8 text-center">
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '1.5rem',
            color: '#E0E0FF',
            fontWeight: 400,
          }}>Light up a memory</h2>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '13px',
            fontStyle: 'italic',
            color: '#A0A0B0',
            letterSpacing: '0.06em',
            textAlign: 'center',
            marginTop: '10px',
            lineHeight: 1.5,
          }}>
            this is a New York City story — where were you?
          </div>
        </div>

        {/* 图片上传 */}
        <div className="mb-5">
          <div
            className="group relative flex h-44 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all"
            style={{ background: 'rgba(10,8,40,0.55)', borderColor: 'rgba(196,174,244,0.15)' }}
          >
            {preview ? (
              <img src={preview} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <div className="text-center transition-colors" style={{ color: 'rgba(230, 230, 250, 0.25)' }}>
                <UploadCloud size={30} className="mx-auto mb-2" />
                <span className="text-xs">click or drag to upload a photo</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="name this moment..."
            maxLength={60}
            className="city-input-field"
          />
        </div>

        {/* Story */}
        <div style={{ marginBottom: '16px' }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="a sentence, or just a few words..."
            rows={5}
            className="city-input-field resize-none"
          />
        </div>

        {/* Where in NYC + Your name — 并排 */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="city-input-field"
            style={{
              color: location ? '#FDF5E6' : '#A0A0B0',
              appearance: 'none',
              cursor: 'pointer',
              paddingLeft: 0,
            }}
          >
            <option value="" disabled style={{ color: '#333' }}>
              where in NYC...
            </option>
            {NYC_LOCATIONS.map(({ group, places }) => (
              <optgroup key={group} label={group}>
                {places.map(place => (
                  <option key={place} value={place}>{place}</option>
                ))}
              </optgroup>
            ))}
            <option value="Somewhere in NYC">Somewhere in NYC</option>
          </select>

          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="your name *"
            maxLength={30}
            className="city-input-field"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: '100%',
            padding: '14px',
            background: submitting
              ? 'rgba(242,180,74,0.3)'
              : 'linear-gradient(90deg, #F2C94C 0%, #F2994A 100%)',
            border: 'none',
            borderRadius: '4px',
            color: '#0a0008',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '14px',
            letterSpacing: '0.06em',
            cursor: submitting ? 'not-allowed' : 'pointer',
            boxShadow: submitting
              ? 'none'
              : '0 0 24px rgba(242,180,74,0.25), 0 0 48px rgba(242,153,74,0.1)',
            transition: 'box-shadow 0.3s',
          }}
        >
          {submitting ? 'Uploading...' : 'Light Up This Star ✦'}
        </button>

        <div style={{
          textAlign: 'center',
          marginTop: '14px',
          fontFamily: 'monospace',
          fontSize: '9px',
          letterSpacing: '0.18em',
          color: 'rgba(160,160,176,0.3)',
          textTransform: 'uppercase',
        }}>
          your photo becomes a star in the sky
        </div>
        {isMobile && (
          <div style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }} />
        )}
      </div>
    </div>
  );
}

// --- 时间轨道位置生成器 ---
function timeBasedPosition(
  story: { taken_at?: string },
  index: number,
  total: number,
  allStories: { taken_at?: string }[]
): THREE.Vector3 {

  // 黄金角螺旋：最均匀的自然分布
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))  // 137.5°
  const angle = index * goldenAngle

  // 半径：时间越新越靠外，但范围收紧
  const t = index / Math.max(total - 1, 1)
  const minR = 3
  const maxR = 14
  const r = minR + t * (maxR - minR)

  const x = r * Math.cos(angle)
  const z = r * Math.sin(angle)

  // Y 轴：按拍摄小时产生轻微高低
  // 凌晨偏低，傍晚偏高，像城市的呼吸节律
  const hour = story.taken_at
    ? new Date(story.taken_at).getHours()
    : 12
  const hourNorm = (hour - 12) / 12
  const y = hourNorm * 2.0 + (Math.random() - 0.5) * 0.8

  // 景深三层：旋转时有层次感
  const layer = index % 3
  const depthShift =
    layer === 0 ? 2.5 + Math.random() * 1.5
    : layer === 1 ? (Math.random() - 0.5) * 2
    : -(2.5 + Math.random() * 2)

  return new THREE.Vector3(x, y, z + depthShift)
}

// --- NYC 地理坐标 → 3D 场景位置 ---
const NYC_COORDS: Record<string, { lng: number; lat: number }> = {
  'Central Park':        { lng: -73.97, lat: 40.78 },
  'West Village':        { lng: -74.00, lat: 40.73 },
  'SoHo':                { lng: -74.00, lat: 40.72 },
  'Lower East Side':     { lng: -73.99, lat: 40.71 },
  'Brooklyn Bridge':     { lng: -73.99, lat: 40.70 },
  'Times Square':        { lng: -73.98, lat: 40.75 },
  'Harlem':              { lng: -73.94, lat: 40.81 },
  'Upper West Side':     { lng: -73.98, lat: 40.78 },
  'Midtown':             { lng: -73.98, lat: 40.75 },
  'East Village':        { lng: -73.98, lat: 40.72 },
  'Chinatown':           { lng: -73.99, lat: 40.71 },
  'Financial District':  { lng: -74.01, lat: 40.70 },
  'Roosevelt Island':    { lng: -73.95, lat: 40.76 },
  'Williamsburg':        { lng: -73.95, lat: 40.71 },
  'DUMBO':               { lng: -73.99, lat: 40.70 },
  'Bushwick':            { lng: -73.92, lat: 40.69 },
  'Park Slope':          { lng: -73.98, lat: 40.67 },
  'Coney Island':        { lng: -73.99, lat: 40.57 },
  'Crown Heights':       { lng: -73.94, lat: 40.67 },
  'Red Hook':            { lng: -74.01, lat: 40.67 },
  'Greenpoint':          { lng: -73.95, lat: 40.73 },
  'Flushing':            { lng: -73.83, lat: 40.76 },
  'Astoria':             { lng: -73.93, lat: 40.77 },
  'Long Island City':    { lng: -73.94, lat: 40.74 },
  'Jackson Heights':     { lng: -73.89, lat: 40.75 },
  'The Bronx':           { lng: -73.89, lat: 40.84 },
  'Staten Island Ferry': { lng: -74.01, lat: 40.64 },
  'Somewhere in NYC':    { lng: -73.97, lat: 40.73 },
}

const NYC_BOUNDS = {
  lngMin: -74.06, lngMax: -73.80,
  latMin: 40.55,  latMax: 40.87,
}

function nycToPosition(
  location: string | null | undefined,
  index: number,
  jitter = 3.5
): THREE.Vector3 {
  const coords = location ? NYC_COORDS[location] : null

  let baseX: number
  let baseZ: number

  if (coords) {
    // 以曼哈顿中心（-73.97, 40.74）为原点
    const centerLng = -73.97
    const centerLat = 40.74

    // 放大映射范围，让星星充分散开
    const lngScale = 160   // 经度差 * 160 = X 轴距离
    const latScale = 200  // 纬度差 * 200 = Z 轴距离

    baseX = (coords.lng - centerLng) * lngScale
    baseZ = -(coords.lat - centerLat) * latScale
    // 负号让北方（高纬度）在上方（负Z = 场景后方偏上）
  } else {
    baseX = (Math.random() - 0.5) * 18
    baseZ = (Math.random() - 0.5) * 14
  }

  // 同区域内随机抖动形成星簇
  const jitterX = (Math.random() - 0.5) * jitter
  const jitterZ = (Math.random() - 0.5) * jitter

  // Y轴高低
  const y = (Math.random() - 0.5) * 3.5 + Math.sin(index * 1.3) * 0.8

  // 景深分层
  const layer = index % 3
  const depthShift =
    layer === 0 ?  2 + Math.random() * 2
    : layer === 1 ? (Math.random() - 0.5) * 2
    : -(2 + Math.random() * 3)

  // 确保距离中心至少 6 单位
  const pos = new THREE.Vector3(
    baseX + jitterX,
    y,
    baseZ + jitterZ + depthShift
  )
  const distFromCenter = Math.sqrt(pos.x * pos.x + pos.z * pos.z)
  if (distFromCenter < 3) {
    const scale = 3 / distFromCenter
    pos.x *= scale
    pos.z *= scale
  }
  return pos
}

// --- 深度分层螺旋星系位置生成器 ---
// layer = index % 3: 0 = near, 1 = mid, 2 = far
function galaxyPosition(
  index: number,
  total: number,
  config: {
    arms?: number;
    turns?: number;
    radiusMax?: number;
    spreadFactor?: number;
    yFlatten?: number;
    yNoise?: number;
    coreRadius?: number;
  } = {}
): THREE.Vector3 {
  const {
    arms = 2,
    turns = 2.5,
    radiusMax = 22,
    spreadFactor = 0.3,
    yFlatten = 0.35,
    yNoise = 1.8,
    coreRadius = 2.5,
  } = config;

  const t = index / Math.max(total - 1, 1);
  const armIndex = index % arms;
  const armOffset = (armIndex / arms) * Math.PI * 2;
  const angle = armOffset + t * Math.PI * 2 * turns;
  const r = coreRadius + t * (radiusMax - coreRadius);

  const maxSpread = r * spreadFactor;
  const spreadR = (Math.random() - 0.5) * 2 * maxSpread;
  const spreadA = Math.random() * Math.PI * 2;

  const x = (r + spreadR * Math.cos(spreadA)) * Math.cos(angle);
  const baseZ = (r + spreadR * Math.sin(spreadA)) * Math.sin(angle);
  const y =
    r * yFlatten * (Math.random() - 0.5) +
    (Math.random() - 0.5) * yNoise;

  // Depth layer offset: near (+8~+14), mid (-2~+2), far (-10~-18)
  const layer = index % 3;
  const depthOffset =
    layer === 0
      ? 8 + Math.random() * 6          // near: +8 to +14
      : layer === 1
      ? (Math.random() - 0.5) * 4      // mid:  -2 to +2
      : -(10 + Math.random() * 8);     // far:  -10 to -18

  return new THREE.Vector3(x, y, baseZ + depthOffset);
}

// --- 默认故事数据 ---
const STORY_SEEDS = [
  { id: "default-1", text: "曼哈顿的落日，把玻璃幕墙染成蜜色。", imageUrl: "https://picsum.photos/400/300?random=11", seed: 0.31, date: "2023.10.12" },
  { id: "default-2", text: "中央公园的雪，安静得像停下的时间。",   imageUrl: "https://picsum.photos/400/300?random=22", seed: 0.77, date: "2023.12.25" },
];

const DEFAULT_STORIES: StoryData[] = STORY_SEEDS.map((s, i) => {
  const v = galaxyPosition(i, STORY_SEEDS.length, {
    arms: 2, turns: 2.5, radiusMax: 22, spreadFactor: 0.28, yFlatten: 0.35,
  });
  const layer = i % 3;
  return { ...s, position: [v.x, v.y, v.z] as [number, number, number], scaleHint: layer === 0 ? 1.6 : layer === 1 ? 1.0 : 0.65 };
});

// --- 主组件 ---
export default function CityOfStars() {
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [showIntro, setShowIntro] = useState(() => !sessionStorage.getItem('hasVisited'));
  const [showAbout, setShowAbout] = useState(false);
  const handleAboutEnter = useCallback(() => setShowAbout(false), []);
  const [stories, setStories] = useState<StoryData[]>(DEFAULT_STORIES);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [readerOpen, setReaderOpen] = useState(false);
  const [readerIndex, setReaderIndex] = useState(0);
  const [distanceFactor, setDistanceFactor] = useState(10);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hoveredType, setHoveredType] = useState<'sphere' | 'star' | null>(null);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null);

  const handleReset = () => {
    setSelectedId(null);
    setResetTrigger((n) => n + 1);
  };

  // 启动时从 Supabase 拉取所有故事
  useEffect(() => {
    const fetchStories = async () => {
      // Don't fetch image_url here — base64 images make rows huge and timeout
      const { data, error } = await supabase
        .from("stories")
        .select("id,text,taken_at,location,author_name,title")
        .order("taken_at", { ascending: false })
        .limit(120);

      if (error) {
        console.error("Failed to fetch stories:", error);
        setLoadError(error.message);
        return;
      }

      setLoadError(null);

      if (!data || data.length === 0) {
        setStories(DEFAULT_STORIES);
        return;
      }

      const loadedAsc = [...data].reverse();
      const loaded: StoryData[] = loadedAsc.map((row, i) => {
        const v = galaxyPosition(i, Math.max(data.length, 50), {
          arms: 2, turns: 2.5, radiusMax: 22, spreadFactor: 0.35,
        });
        const layer = i % 3;
        return {
          id: row.id,
          position: [v.x, v.y, v.z] as [number, number, number],
          text: row.text,
          imageUrl: "", // loaded lazily on click
          seed: Math.random(),
          date: row.taken_at
            ? new Date(row.taken_at).toLocaleDateString("en-US", {
                year: "numeric", month: "short", day: "numeric",
              })
            : "unknown",
          taken_at: row.taken_at ?? undefined,
          location: row.location ?? undefined,
          author_name: row.author_name ?? undefined,
          title: row.title ?? undefined,
          scaleHint: layer === 0 ? 1.6 : layer === 1 ? 1.0 : 0.65,
        };
      });
      setStories(loaded);
    };

    fetchStories();
  }, []);


  const filteredStories = selectedNeighborhood
    ? stories.filter((s) => s.location === selectedNeighborhood)
    : stories;

  useEffect(() => {
    const q = () => {
      setDistanceFactor(window.innerWidth < 640 ? 7 : 10);
    };
    q();
    window.addEventListener("resize", q);
    return () => window.removeEventListener("resize", q);
  }, []);

  const handleAddStory = (newStory: {
    text: string
    imageUrl: string | null
    takenAt: string
    title: string
    location: string
  }) => {
    const v = nycToPosition(newStory.location || null, stories.length)
    const pos: [number, number, number] = [v.x, v.y, v.z]
    const layer = stories.length % 3
    const newId = Date.now().toString()

    const newStoryObj = {
      id: newId,
      position: pos,
      text: newStory.text,
      imageUrl: newStory.imageUrl ?? '',
      seed: Math.random(),
      date: new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric'
      }),
      taken_at: newStory.takenAt,
      title: newStory.title || undefined,
      scaleHint: layer === 0 ? 1.6 : layer === 1 ? 1.0 : 0.65,
    }

    // 阶段1：先加入场景，触发星星出生闪烁
    setStories(prev => [...prev, newStoryObj])

    // 阶段2：1.2s 后相机飞向新星星
    setTimeout(() => {
      setSelectedId(newId)
    }, 1200)

    // 阶段3：相机飞行 3.5s 后打开 StoryReader
    setTimeout(() => {
      const index = stories.length  // 新星星在末尾
      setReaderIndex(index)
      setReaderOpen(true)
    }, 1200 + 3500)
  };

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{
        background:
          "linear-gradient(to bottom, #080514 0%, #120630 40%, #1e0848 70%, #4a1280 100%)",
      }}
    >
      {showIntro && (
        <IntroPage onEnter={() => {
          sessionStorage.setItem('hasVisited', 'true');
          setShowIntro(false);
        }} />
      )}
      <div style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(4,2,10,0.75) 100%)',
      }} />

      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '30%',
        zIndex: 2,
        pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(74,18,128,0.45) 0%, rgba(30,8,72,0.2) 60%, transparent 100%)',
      }} />

      <div style={{
        position: 'absolute',
        top: '-5%',
        left: '-10%',
        width: '55%',
        height: '55%',
        zIndex: 1,
        pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 40% 40%, rgba(100,60,200,0.06) 0%, rgba(60,20,140,0.03) 50%, transparent 70%)',
        transform: 'rotate(-15deg)',
      }} />

      <style>{`
        @keyframes cityStarsCardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes titleGlow {
          0%, 100% { text-shadow: 0 0 24px rgba(232,213,163,0.35), 0 0 48px rgba(196,174,244,0.15); }
          50%       { text-shadow: 0 0 32px rgba(232,213,163,0.55), 0 0 64px rgba(196,174,244,0.25); }
        }
        .city-filter-btn {
          color: rgba(230,230,250,0.35);
          font-family: 'Playfair Display', Georgia, serif;
          font-style: italic;
          font-size: 13px;
          letter-spacing: 0.05em;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 14px;
          border-bottom: 1px solid transparent;
          transition: color 0.25s, border-color 0.25s;
        }
        .city-filter-btn:hover { color: rgba(230,230,250,0.7); }
        .city-filter-btn.active { color: #E8D5A3; border-bottom-color: #E8D5A3; }
        .city-back-btn {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(230,230,250,0.12);
          color: rgba(230,230,250,0.55);
          font-family: 'Playfair Display', Georgia, serif;
          font-style: italic;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .city-back-btn:hover {
          background: rgba(255,255,255,0.11);
          color: rgba(230,230,250,0.9);
          border-color: rgba(230,230,250,0.28);
        }
        .city-input-field {
          width: 100%;
          box-sizing: border-box;
          background: transparent;
          border: none;
          border-bottom: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 0;
          padding: 11px 0;
          font-family: 'Playfair Display', Georgia, serif;
          font-style: italic;
          font-size: 14px;
          color: #FDF5E6;
          outline: none;
          letter-spacing: 0.02em;
          transition: border-color 0.2s;
        }
        .city-input-field:focus {
          border-bottom-color: rgba(255,255,255,0.28);
        }
        .city-input-field::placeholder {
          color: #A0A0B0;
          font-style: italic;
        }
      `}</style>

      <Canvas
        className="h-full w-full"
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance", stencil: false }}
        onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}
        dpr={[1, 2]}
        onPointerMissed={selectedId === null ? undefined : undefined}
      >
        <StarFieldScene
          stories={filteredStories}
          selectedId={selectedId}
          onHover={setHoveredType}
          onSelectStar={(s) => {
            // 懒加载 imageUrl
            if (s.imageUrl === '') {
              supabase
                .from('stories')
                .select('id,image_url')
                .eq('id', s.id)
                .single()
                .then(({ data }) => {
                  if (data?.image_url) {
                    setStories((prev) =>
                      prev.map((story) =>
                        story.id === s.id ? { ...story, imageUrl: data.image_url } : story
                      )
                    )
                  }
                })
            }
            // 触发相机飞行
            setSelectedId(s.id)
            // 飞行动画结束后再打开 StoryReader
            const index = stories.findIndex((story) => story.id === s.id)
            setReaderIndex(index >= 0 ? index : 0)
            setTimeout(() => setReaderOpen(true), 3500)
          }}
          onUploadClick={() => setIsUploadModalOpen(true)}
          resetTrigger={resetTrigger}
          bloomBoost={selectedId !== null}
          onCameraReady={(cam) => { cameraRef.current = cam }}
        />
      </Canvas>

      <NYCClock />
      <CursorHint hoveredType={hoveredType} />

      {/* About button — top-left */}
      {!readerOpen && !isUploadModalOpen && !showAbout && (
        <button
          onClick={() => setShowAbout(true)}
          style={{
            position: 'fixed',
            top: '28px',
            left: '28px',
            zIndex: 30,
            background: 'transparent',
            border: '0.5px solid rgba(255,255,255,0.15)',
            borderRadius: '999px',
            padding: '5px 16px',
            fontFamily: 'monospace',
            fontSize: '9px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.35)',
            cursor: 'pointer',
            transition: 'color 0.2s, border-color 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.75)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
          }}
        >
          about
        </button>
      )}

      {/* About overlay */}
      {showAbout && (
        <IntroPage instant onEnter={handleAboutEnter} onClose={handleAboutEnter} />
      )}

      {/* StoryReader */}
      {readerOpen && (
        <StoryReader
          stories={stories}
          initialIndex={readerIndex}
          onClose={() => { handleReset(); setReaderOpen(false); }}
          onStoryChange={(storyId) => {
            setSelectedId(storyId)
          }}
          onImageLoad={(storyId, imageUrl) => {
            setStories((prev) =>
              prev.map((s) => s.id === storyId ? { ...s, imageUrl } : s)
            )
          }}
        />
      )}


      {/* Neighborhood filter */}
      <div className="pointer-events-auto absolute top-7 left-0 right-0 z-20 flex justify-center">
        <select
          value={selectedNeighborhood ?? ''}
          onChange={(e) => setSelectedNeighborhood(e.target.value || null)}
          style={{
            background: 'rgba(5,3,20,0.55)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(230,230,250,0.1)',
            borderRadius: '999px',
            padding: '5px 20px',
            color: selectedNeighborhood ? 'rgba(232,213,163,0.9)' : 'rgba(230,230,250,0.45)',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '13px',
            letterSpacing: '0.05em',
            appearance: 'none',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="">All neighborhoods</option>
          {NYC_LOCATIONS.map(({ group, places }) => (
            <optgroup key={group} label={group}>
              {places.map((place) => (
                <option key={place} value={place}>{place}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {loadError && (
        <div
          className="pointer-events-none absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-md border px-3 py-2 text-xs"
          style={{
            color: "#ffd1d1",
            background: "rgba(120, 0, 0, 0.35)",
            borderColor: "rgba(255, 150, 150, 0.45)",
          }}
        >
          Failed to load stories from Supabase: {loadError}
        </div>
      )}

      {/* UI 层 */}
      <div className="pointer-events-none absolute bottom-10 left-0 right-0 z-10 flex flex-col items-center text-white" style={{ gap: '10px' }}>
        <h1
          className="font-serif"
          style={{
            fontSize: 'clamp(2rem, 4vw, 2.8rem)',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 400,
            letterSpacing: '0.12em',
            background: 'linear-gradient(135deg, #F0E6C8 0%, #E8D5A3 45%, #C4AEF4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            animation: 'titleGlow 4s ease-in-out infinite',
          }}
        >
          City of Stars
        </h1>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '13px',
          fontStyle: 'italic',
          fontWeight: 400,
          color: 'rgba(255, 255, 255, 0.45)',
          letterSpacing: '0.1em',
          lineHeight: 1.6,
        }}>
          somewhere in these streets, your story is waiting
        </div>
      </div>

      {/* 上传模态框 */}
      {isUploadModalOpen && (
        <UploadModal
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleAddStory}
          onGetStarScreenPos={() => {
            const v = nycToPosition(null, stories.length);
            const canvas = document.querySelector('canvas');
            if (!canvas || !cameraRef.current) return { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
            const rect = canvas.getBoundingClientRect();
            const projected = v.clone().project(cameraRef.current);
            const x = (projected.x * 0.5 + 0.5) * rect.width + rect.left;
            const y = (-projected.y * 0.5 + 0.5) * rect.height + rect.top;
            return { x, y };
          }}
        />
      )}
    </div>
  );
}
