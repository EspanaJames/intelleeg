import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.129.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";


export function initLarrie() {

 
  const container = document.getElementById("larrieCanvas");
  if (!container) {
    console.error("larrieCanvas not found");
    return;
  }

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(0, 1, 10.5);

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true
  });

  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = true;
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.enableDamping = false;

  const topLight = new THREE.DirectionalLight(0xffffff, 1);
  topLight.position.set(5, 10, 5);
  scene.add(topLight);

  const ambientLight = new THREE.AmbientLight(0x404040, 2);
  scene.add(ambientLight);

  const loader = new GLTFLoader();
  let object;

  loader.load(
    "../model/Larrie/scene.gltf",
    (gltf) => {
      object = gltf.scene;

      object.scale.set(2, 2, 2);

      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      object.position.sub(center);

      scene.add(object);
    },
    undefined,
    (error) => {
      console.error("GLTF load error:", error);
    }
  );

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  window.addEventListener("resize", () => {
    const width = container.clientWidth;
    const height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  });
}