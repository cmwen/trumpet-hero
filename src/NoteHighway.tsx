import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { noteName, type Note } from "./music";
const lane = (midi: number) =>
  ([60, 62, 64, 65, 67, 69, 71, 72].indexOf(midi) - 2) * 1.12;
export function NoteHighway({
  notes,
  getBeat,
  reduced,
}: {
  notes: Note[];
  getBeat: () => number;
  reduced: boolean;
}) {
  const root = useRef<HTMLDivElement>(null),
    clock = useRef(getBeat);
  clock.current = getBeat;
  const [fallback, setFallback] = useState(reduced);
  const [positions, setPositions] = useState<number[]>([]);
  useEffect(() => {
    if (reduced) {
      setFallback(true);
      return;
    }
    let renderer: THREE.WebGLRenderer | undefined,
      raf = 0;
    const host = root.current;
    if (!host) return;
    let observer: ResizeObserver | undefined;
    const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
      host.appendChild(renderer.domElement);
      renderer.domElement.setAttribute("aria-hidden", "true");
      const scene = new THREE.Scene();
      scene.fog = new THREE.FogExp2(0x101c27, 0.035);
      const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 70);
      camera.position.set(0, 7, 11);
      camera.lookAt(0, 0, -9);
      const material = (color: number, opacity = 1) => {
        const m = new THREE.MeshBasicMaterial({
          color,
          transparent: opacity < 1,
          opacity,
        });
        resources.push(m);
        return m;
      };
      const railGeometry = new THREE.BoxGeometry(0.018, 0.02, 42);
      resources.push(railGeometry);
      for (let i = -3; i < 4; i++) {
        const rail = new THREE.Mesh(railGeometry, material(0x526c78, 0.4));
        rail.position.set(i * 1.12, 0, -15);
        scene.add(rail);
      }
      const lineGeometry = new THREE.BoxGeometry(7.8, 0.035, 0.08);
      resources.push(lineGeometry);
      const strike = new THREE.Mesh(lineGeometry, material(0xf4c66b));
      strike.position.set(0, 0.02, 2);
      scene.add(strike);
      const meshes = notes.map((n) => {
        const g = new THREE.BoxGeometry(
          0.72,
          0.18,
          Math.max(0.25, n.length * 1.2),
        );
        resources.push(g);
        const mesh = new THREE.Mesh(
          g,
          material(n.midi === 60 ? 0xf4c66b : 0x6bdac2),
        );
        mesh.position.x = lane(n.midi);
        scene.add(mesh);
        return mesh;
      });
      const resize = () => {
        const w = host.clientWidth,
          h = host.clientHeight;
        renderer!.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        setPositions(
          [60, 62, 64, 65, 67].map(
            (midi) =>
              (new THREE.Vector3(lane(midi), 0, 2).project(camera).x + 1) * 50,
          ),
        );
      };
      observer = new ResizeObserver(resize);
      observer.observe(host);
      resize();
      const draw = () => {
        const beat = clock.current();
        meshes.forEach((mesh, i) => {
          mesh.position.z =
            2 - (notes[i].beat - beat) * 2.2 - notes[i].length * 0.6;
          mesh.visible = mesh.position.z < 7 && mesh.position.z > -45;
        });
        renderer!.render(scene, camera);
        raf = requestAnimationFrame(draw);
      };
      setFallback(false);
      draw();
    } catch {
      setFallback(true);
    }
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      resources.forEach((x) => x.dispose());
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, [notes, reduced]);
  return (
    <div className="highway">
      <div ref={root} className="canvas" />
      {fallback && (
        <div className="flat-notes" aria-label="Static note sequence">
          {notes.map((n, i) => (
            <span key={i}>
              {noteName(n.midi)}
              <small>{n.length.toFixed(1)} beats</small>
            </span>
          ))}
        </div>
      )}
      <div className="lane-captions" aria-hidden="true">
        {["C", "D", "E", "F", "G"].map((label, i) => (
          <span
            key={label}
            style={{
              position: "absolute",
              left: `${positions[i] ?? 50}%`,
              transform: "translateX(-50%)",
            }}
          >
            {label}
          </span>
        ))}
      </div>
      <div className="strike-caption">PLAY HERE</div>
    </div>
  );
}
