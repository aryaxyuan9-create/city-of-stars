import { useEffect, useRef, useState, useMemo } from "react";
import { Canvas, useFrame, useThree, useLoader } from "@react-three/fiber";
import { Html, OrbitControls, PerspectiveCamera, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import gsap from "gsap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { X, UploadCloud, Image as ImageIcon, Type, MapPin } from "lucide-react";
import { supabase } from "../lib/supabase";

// 模块级鼠标坐标（归一化 -1~1），子组件可直接读取，无需 prop 传递
export const mouse3D = { x: 0, y: 0 };

const NYC_LOCATIONS = [
  { group: 'Manhattan', places: [
    'Central Park', 'West Village', 'SoHo', 'Lower East Side',
    'Brooklyn Bridge', 'Times Square', 'Harlem', 'Upper West Side',
    'Midtown', 'East Village', 'Chinatown', 'Financial District',
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
      return {
        id: s.id,
        position: [v.x, v.y, v.z] as [number, number, number],
        text: s.text,
        imageUrl: s.imageUrl,
        seed: Math.random(),
        date: s.date,
        taken_at: s.taken_at,
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
function CentralCoreStar({ onUploadClick }: { onUploadClick: () => void }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const dotTexture = useMemo(() => createSoftDotTexture(), []);
  const [hovered, setHovered] = useState(false);
  const rotSpeedRef = useRef(0.001);

  // 当前帧写入的可变缓冲；origPos 存原始坐标用于噪声叠加基准
  const { positions, origPos } = useMemo(() => {
    const count = 2000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 1.5 + Math.random() * 0.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    const origPos = positions.slice(); // 原始坐标快照
    return { positions, origPos };
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
  });

  return (
    <group
      onClick={(e) => { e.stopPropagation(); onUploadClick(); }}
      onPointerOver={() => { setHovered(true); document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = "default"; }}
    >
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={positions.length / 3}
            array={positions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.12}
          color="#FFE082"
          map={dotTexture}
          transparent
          alphaTest={0.01}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

// --- 打字机 hook ---
function useTypewriter(text: string, isActive: boolean, speed = 38) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    if (!isActive) {
      setDisplayed("");
      return;
    }
    let i = 0;
    setDisplayed("");
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, isActive, speed]);

  return displayed;
}

// --- 2. 故事星星 ---
function ParticleStoryStar({
  data,
  isSelected,
  dimmed,
  onClick,
}: {
  data: StoryData;
  isSelected: boolean;
  dimmed: boolean;
  onClick: (data: StoryData) => void;
}) {
  const meshRef = useRef<THREE.Sprite>(null);
  const baseScale = 1;
  const magOffset = useRef({ x: 0, y: 0 });
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
  });

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    gsap.from(mesh.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 1.4, ease: "back.out(2)" });
    const mat = mesh.material as THREE.SpriteMaterial;
    gsap.fromTo(mat, { opacity: 0.35 }, { opacity: 1, duration: 0.22, repeat: 2, yoyo: true, ease: "sine.inOut" });
  }, [data.id]);

  const scale = isSelected ? baseScale * 1.65 : baseScale;

  return (
    <group position={data.position}>
      <sprite
        ref={meshRef}
        scale={[scale * 1.2, scale * 1.2, 1]}
        onClick={(e) => { e.stopPropagation(); onClick(data); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "auto"; }}
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
}: {
  selectedId: string | null;
  stories: StoryData[];
  resetTrigger: number;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const prevId = useRef<string | null>(null);
  const { camera } = useThree();

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
      dampingFactor={0.055}
      minDistance={2.5}
      maxDistance={48}
      maxPolarAngle={Math.PI * 0.92}
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

// --- 5. 场景 ---
function StarFieldScene({
  stories,
  selectedId,
  onSelectStar,
  onUploadClick,
  resetTrigger,
  bloomBoost,
}: {
  stories: StoryData[];
  selectedId: string | null;
  onSelectStar: (data: StoryData) => void;
  onUploadClick: () => void;
  resetTrigger: number;
  bloomBoost: boolean;
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
      <CentralCoreStar onUploadClick={onUploadClick} />

      {/* 故事星星 */}
      <group>
        {stories.map((story) => (
          <ParticleStoryStar
            key={story.id}
            data={story}
            isSelected={selectedId === story.id}
            dimmed={selectedId !== null && selectedId !== story.id}
            onClick={onSelectStar}
          />
        ))}
      </group>

      <CameraRig selectedId={selectedId} stories={stories} resetTrigger={resetTrigger} />

      <EffectComposer enableNormalPass={false} multisampling={0}>
        <SMAA />
        <Bloom
          luminanceThreshold={0.05}
          luminanceSmoothing={0.9}
          mipmapBlur
          intensity={bloomBoost ? 2.4 : 1.8}
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
}: {
  onClose: () => void;
  onUpload: (story: { text: string; imageUrl: string | null; takenAt: string }) => void;
}) {
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
    if (!preview || !text.trim()) {
      alert("Please add a photo and write your story.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("stories").insert({
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
    onUpload({ text, imageUrl: preview, takenAt: takenAt.toISOString() });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      style={{ animation: "cityStarsCardIn 0.3s ease-out both" }}
    >
      <div
        className="relative w-[min(480px,92vw)] rounded-3xl p-8 shadow-2xl"
        style={{ background: '#0a0820', border: '1px solid rgba(230, 230, 250, 0.15)' }}
      >
        <button
          onClick={onClose}
          className="absolute right-5 top-5 transition-colors"
          style={{ color: 'rgba(230, 230, 250, 0.4)' }}
        >
          <X size={20} />
        </button>

        <div className="mb-8 text-center">
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontSize: '1.5rem',
            color: '#E6E6FA',
            fontWeight: 400,
          }}>Light up a memory</h2>
          <div style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '13px',
            fontStyle: 'italic',
            color: 'rgba(196, 174, 244, 0.7)',
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
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <ImageIcon size={15} style={{ color: 'rgba(230, 230, 250, 0.4)' }} />
            <span style={{ color: 'rgba(230, 230, 250, 0.4)' }}>Your NYC moment</span>
          </label>
          <div
            className="group relative flex h-44 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors"
            style={{ background: 'rgba(0, 0, 128, 0.2)', borderColor: 'rgba(230, 230, 250, 0.1)' }}
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

        {/* 文字输入 */}
        <div className="mb-4">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Type size={15} style={{ color: 'rgba(230, 230, 250, 0.4)' }} />
            <span style={{ color: 'rgba(230, 230, 250, 0.4)' }}>Your story</span>
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="a sentence, or just a few words..."
            rows={3}
            className="w-full resize-none rounded-xl p-4 text-sm outline-none transition-colors"
            style={{
              background: 'rgba(0, 0, 128, 0.2)',
              border: '1px solid rgba(230, 230, 250, 0.1)',
              color: '#E6E6FA',
            }}
          />
        </div>

        {/* 地点输入 */}
        <div className="mb-8">
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <MapPin size={15} style={{ color: 'rgba(230, 230, 250, 0.4)' }} />
            <span style={{ color: 'rgba(230, 230, 250, 0.4)' }}>Where in NYC</span>
          </label>
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(0, 0, 128, 0.2)',
              border: '0.5px solid rgba(230, 230, 250, 0.1)',
              borderRadius: '10px',
              padding: '14px 16px',
              color: location ? 'rgba(230, 230, 250, 0.85)' : 'rgba(230, 230, 250, 0.25)',
              fontSize: '13px',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              letterSpacing: '0.03em',
              appearance: 'none',
              cursor: 'pointer',
              outline: 'none',
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
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{
            fontSize: '10px',
            letterSpacing: '0.16em',
            color: 'rgba(230, 230, 250, 0.4)',
            textTransform: 'uppercase',
            marginBottom: '8px',
            fontFamily: "'Playfair Display', Georgia, serif",
          }}>
            Your name
          </div>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="optional"
            maxLength={30}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              background: 'rgba(0, 0, 128, 0.2)',
              border: '0.5px solid rgba(230, 230, 250, 0.1)',
              borderRadius: '10px',
              padding: '14px 16px',
              color: 'rgba(230, 230, 250, 0.85)',
              fontSize: '13px',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              letterSpacing: '0.03em',
              outline: 'none',
            }}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-xl py-3 transition-all active:scale-[0.98]"
          style={{
            background: submitting ? 'rgba(255,236,139,0.5)' : '#FFEC8B',
            color: '#1C1C1C',
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: '1rem',
            cursor: submitting ? 'wait' : 'pointer',
          }}
        >
          {submitting ? 'Uploading...' : 'Light Up This Star ✦'}
        </button>
      </div>
    </div>
  );
}

// --- 螺旋星系位置生成器 ---
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
  const z = (r + spreadR * Math.sin(spreadA)) * Math.sin(angle);
  const y =
    r * yFlatten * (Math.random() - 0.5) +
    (Math.random() - 0.5) * yNoise;

  return new THREE.Vector3(x, y, z);
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
  return { ...s, position: [v.x, v.y, v.z] as [number, number, number] };
});

// --- Story Overlay (Album Atlas style) ---
function StoryOverlay({ story, onClose }: { story: StoryData; onClose: () => void }) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [typingActive, setTypingActive] = useState(false);
  const displayedText = useTypewriter(story.text, typingActive, 45);

  useEffect(() => {
    // Fade in
    if (overlayRef.current) {
      gsap.fromTo(overlayRef.current, { opacity: 0 }, { opacity: 1, duration: 0.7, ease: "power2.inOut" });
    }
    const t1 = setTimeout(() => setImgLoaded(true), 200);
    const t2 = setTimeout(() => setTypingActive(true), 700);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleClose = () => {
    if (overlayRef.current) {
      gsap.to(overlayRef.current, { opacity: 0, duration: 0.4, ease: "power2.inOut", onComplete: onClose });
    } else {
      onClose();
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-40 pointer-events-none"
      style={{ opacity: 0 }}
    >
      {/* Blur backdrop */}
      <div
        className="absolute inset-0"
        style={{ backdropFilter: "blur(16px) brightness(0.55)", background: "rgba(5,3,20,0.5)" }}
      />

      {/* ← Back button */}
      <button
        onClick={handleClose}
        className="pointer-events-auto absolute top-10 left-10 z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm backdrop-blur-md transition-opacity hover:opacity-100"
        style={{
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(230,230,250,0.15)",
          color: "rgba(230,230,250,0.65)",
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: "italic",
          opacity: 0.8,
        }}
      >
        ← Back
      </button>

      {/* Top-right metadata */}
      <div
        className="absolute top-10 right-10 z-10 text-right pointer-events-none"
        style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontStyle: "italic",
          color: "rgba(230,230,250,0.5)",
          fontSize: "11px",
          lineHeight: "2",
          letterSpacing: "0.08em",
        }}
      >
        {story.location && <div style={{ color: "rgba(230,230,250,0.75)", fontSize: "12px" }}>NYC · {story.location}</div>}
        <div>{story.date}</div>
      </div>

      {/* Central photo — center-upper */}
      <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: "18vh" }}>
        <img
          src={story.imageUrl || ""}
          alt=""
          style={{
            maxWidth: "40vw",
            maxHeight: "58vh",
            objectFit: "contain",
            border: "1px solid rgba(255,255,255,0.22)",
            boxShadow: "0 0 80px rgba(255,255,255,0.05), 0 8px 40px rgba(0,0,0,0.6)",
            filter: imgLoaded ? "none" : "blur(12px) grayscale(60%)",
            transition: "filter 1.2s cubic-bezier(0.25,0.46,0.45,0.94)",
          }}
        />
      </div>

      {/* Story text — center-lower */}
      <div
        className="absolute bottom-20 left-0 right-0 flex flex-col items-center px-8 pointer-events-none"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', width: '100%', maxWidth: '52ch' }}>
          <span style={{
            background: '#F5C518',
            padding: '3px 8px 2px',
            fontFamily: "'Courier Prime', monospace",
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#0a0008',
          }}>
            {story.location || 'NYC'}
          </span>

          <span style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '10px',
            letterSpacing: '0.15em',
            color: 'rgba(255, 255, 255, 0.35)',
            textTransform: 'uppercase',
          }}>
            {story.author_name || 'anonymous'}
          </span>
        </div>

        <p
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontStyle: "italic",
            color: "rgba(230,230,250,0.82)",
            fontSize: "clamp(0.85rem, 1.8vw, 1.1rem)",
            letterSpacing: "0.12em",
            lineHeight: "2.2",
            textAlign: "center",
            maxWidth: "52ch",
          }}
        >
          {displayedText}
          <span style={{ animation: "blink 1s step-end infinite" }}>|</span>
        </p>
      </div>
    </div>
  );
}

// --- 主组件 ---
export default function CityOfStars() {
  const [stories, setStories] = useState<StoryData[]>(() => {
    const localStories = readLocalStories();
    return localStories.length > 0 ? localStories : DEFAULT_STORIES;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [distanceFactor, setDistanceFactor] = useState(10);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleReset = () => {
    setSelectedId(null);
    setResetTrigger((n) => n + 1);
  };

  // 启动时从 Supabase 拉取所有故事
  useEffect(() => {
    const fetchStories = async () => {
      // If local cache exists, keep using it to avoid blocking UX on slow cloud queries.
      const localStories = readLocalStories();
      if (localStories.length > 0) {
        setStories(localStories);
      }

      // Don't fetch image_url here — base64 images make rows huge and timeout
      const { data, error } = await supabase
        .from("stories")
        .select("id,text,taken_at,location,author_name")
        .order("taken_at", { ascending: false })
        .limit(120);

      if (error) {
        console.error("Failed to fetch stories:", error);
        // Only show blocking error when no local data is available.
        if (localStories.length === 0) {
          setLoadError(error.message);
        } else {
          setLoadError(null);
        }
        return;
      }

      setLoadError(null);
      if (!data || data.length === 0) return;

      const loadedAsc = [...data].reverse();
      const loaded: StoryData[] = loadedAsc.map((row, i) => {
        const v = galaxyPosition(i, Math.max(data.length, 50), {
          arms: 2, turns: 2.5, radiusMax: 22, spreadFactor: 0.35,
        });
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
        };
      });
      setStories(loaded);
      writeLocalStories(loaded);
    };

    fetchStories();
  }, []);

  const filteredStories = stories.filter(story => {
    if (filter === 'all') return true;
    const date = new Date(story.taken_at || story.date.replace(/\./g, '-'));
    const now = new Date();
    if (filter === 'today') return date.toDateString() === now.toDateString();
    if (filter === 'week')  return (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24) <= 7;
    if (filter === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    return true;
  });

  useEffect(() => {
    const q = () => {
      setDistanceFactor(window.innerWidth < 640 ? 7 : 10);
    };
    q();
    window.addEventListener("resize", q);
    return () => window.removeEventListener("resize", q);
  }, []);

  const handleAddStory = (newStory: { text: string; imageUrl: string | null; takenAt: string }) => {
    const v = galaxyPosition(stories.length, 50, {
      arms: 2, turns: 2.5, radiusMax: 22, spreadFactor: 0.35,
    });
    const pos: [number, number, number] = [v.x, v.y, v.z];
    setStories((prev) => {
      const next = [
        ...prev,
        {
          id: Date.now().toString(),
          position: pos,
          text: newStory.text,
          imageUrl: newStory.imageUrl ?? "https://picsum.photos/400/300?random=99",
          seed: Math.random(),
          date: new Date()
            .toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
            .replace(/\//g, "."),
          taken_at: newStory.takenAt,
        },
      ];
      writeLocalStories(next);
      return next;
    });
  };

  return (
    <div
      className="relative h-screen w-full overflow-hidden"
      style={{
        background:
          "linear-gradient(to bottom, #0d0a1a 0%, #1a0a3a 50%, #2d0f6e 100%)",
      }}
    >
      <style>{`
        @keyframes cityStarsCardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
        @keyframes blink { 50% { opacity: 0; } }
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
          onSelectStar={(s) => {
            setSelectedId((prev) => (prev === s.id ? null : s.id));
            if (s.imageUrl === "") {
              supabase
                .from("stories")
                .select("id,image_url")
                .eq("id", s.id)
                .single()
                .then(({ data }) => {
                  if (data?.image_url) {
                    setStories((prev) =>
                      prev.map((story) =>
                        story.id === s.id ? { ...story, imageUrl: data.image_url } : story
                      )
                    );
                  }
                });
            }
          }}
          onUploadClick={() => setIsUploadModalOpen(true)}
          resetTrigger={resetTrigger}
          bloomBoost={selectedId !== null}
        />
      </Canvas>

      {/* Full-screen story overlay */}
      {selectedId !== null && (() => {
        const story = stories.find((s) => s.id === selectedId);
        return story ? <StoryOverlay story={story} onClose={handleReset} /> : null;
      })()}

      {/* Filter UI */}
      <div className="pointer-events-auto absolute top-8 left-0 right-0 z-20 flex justify-center gap-2">
        {(['all', 'today', 'week', 'month'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              color: filter === f ? '#FFEC8B' : 'rgba(230, 230, 250, 0.35)',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontSize: '13px',
              letterSpacing: '0.05em',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 12px',
              borderBottom: filter === f ? '1px solid #FFEC8B' : '1px solid transparent',
              transition: 'color 0.3s, border-color 0.3s',
            }}
          >
            {f === 'all' ? 'All' : f === 'today' ? 'Today' : f === 'week' ? 'This week' : 'This month'}
          </button>
        ))}
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
      <div className="pointer-events-none absolute bottom-10 left-0 right-0 z-10 flex flex-col items-center text-white">
        <h1 className="font-serif tracking-tight" style={{ fontSize: '2.6rem', color: '#f0db13' }}>City of Stars</h1>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '15px',
          fontStyle: 'italic',
          fontWeight: 400,
          color: 'rgba(255, 255, 255, 0.82)',
          letterSpacing: '0.04em',
          lineHeight: 1,
        }}>
          somewhere in these streets, your story is waiting
        </div>
      </div>

      {/* 上传模态框 */}
      {isUploadModalOpen && (
        <UploadModal
          onClose={() => setIsUploadModalOpen(false)}
          onUpload={handleAddStory}
        />
      )}
    </div>
  );
}
