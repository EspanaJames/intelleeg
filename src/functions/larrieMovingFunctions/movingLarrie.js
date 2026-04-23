import * as THREE from "three";
import { OrbitControls } from "https://unpkg.com/three@0.129.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.129.0/examples/jsm/loaders/GLTFLoader.js";

let mixer = null;
let clipsByName = {};
let activeAction = null;
let activeClipName = null;
let activeForward = true;

export function playClipByName(clipName) {
  if (!mixer) return;

  const clip = clipsByName[clipName];
  if (!clip) {
    console.warn(`Clip "${clipName}" not found.`);
    return;
  }

  if (activeAction) {
    activeAction.stop();
  }

  const action = mixer.clipAction(clip);
  action.clampWhenFinished = true;
  action.loop = THREE.LoopOnce;
  action.enabled = true;
  action.timeScale = 1;
  action.time = 0;
  action.reset();
  action.play();

  activeAction = action;
  activeClipName = clipName;
  activeForward = false;
}

export function initMovingLarrie() {
  const container = document.getElementById("larrieDisplay");

  if (!container) {
    console.error("larrieDisplay not found");
    return;
  }

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );

  const renderer = new THREE.WebGLRenderer({
    alpha: false,
    antialias: true
  });

  renderer.setClearColor(0x222831, 1);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 10, 5);
  scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight2.position.set(-5, 5, -5);
  scene.add(dirLight2);

  const loader = new GLTFLoader();
  const clock = new THREE.Clock();

  loader.load(
    "../model/LarrieMoving/larrieMovement.gltf",
    (gltf) => {
      const object = gltf.scene;
      scene.add(object);

      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      object.position.x -= center.x;
      object.position.z -= center.z;
      object.position.y -= (center.y - size.y / 2);

      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = 3 / maxDim;
      object.scale.setScalar(scale);

      const newBox = new THREE.Box3().setFromObject(object);
      const newSize = newBox.getSize(new THREE.Vector3());
      const newMaxDim = Math.max(newSize.x, newSize.y, newSize.z);
      const midY = newSize.y * 0.42;
      const distance = newMaxDim * 0.8;

      camera.position.set(distance * 0.8, midY, distance * 0.8);
      camera.lookAt(0, midY, 0);

      controls.target.set(0, midY, 0);
      controls.minDistance = newMaxDim * 0.5;
      controls.maxDistance = newMaxDim * 2.0;
      controls.update();

      console.log("Animations found:", gltf.animations);

      mixer = new THREE.AnimationMixer(object);

      gltf.animations.forEach((clip) => {
        clipsByName[clip.name] = clip;
        console.log("Clip name:", clip.name);
      });

      // Start with TherealRest immediately
      if (clipsByName["TherealRest"]) {
        const startAction = mixer.clipAction(clipsByName["TherealRest"]);
        startAction.clampWhenFinished = true;
        startAction.loop = THREE.LoopOnce;
        startAction.timeScale = 1;
        startAction.reset();
        startAction.play();

        activeAction = startAction;
        activeClipName = "TherealRest";
        activeForward = true;
      } else {
        console.warn('Clip "TherealRest" not found.');
      }
    },
    undefined,
    (error) => {
      console.error("GLTF load error:", error);
    }
  );

  function playClipToggle(clipName) {
    if (!mixer) {
      console.warn("Mixer not ready yet.");
      return;
    }

    const clip = clipsByName[clipName];
    if (!clip) {
      console.warn(`Clip "${clipName}" not found.`);
      console.log("Available clips:", Object.keys(clipsByName));
      return;
    }

    // If switching to a different clip, always start forward first
    if (activeClipName !== clipName) {
      if (activeAction) {
        activeAction.stop();
      }

      activeAction = mixer.clipAction(clip);
      activeAction.clampWhenFinished = true;
      activeAction.loop = THREE.LoopOnce;
      activeAction.enabled = true;
      activeAction.timeScale = 1;
      activeAction.time = 0;
      activeAction.reset();
      activeAction.play();

      activeClipName = clipName;
      activeForward = false; // next press on same key will reverse
      return;
    }

    // Same clip pressed again -> reverse
    if (activeAction) {
      activeAction.stop();
    }

    activeAction = mixer.clipAction(clip);
    activeAction.clampWhenFinished = true;
    activeAction.loop = THREE.LoopOnce;
    activeAction.enabled = true;

    if (activeForward) {
      activeAction.timeScale = 1;
      activeAction.time = 0;
    } else {
      activeAction.timeScale = -1;
      activeAction.time = clip.duration;
    }

    activeAction.play();
    activeForward = !activeForward;
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "1") {
      playClipToggle("Rest");
    } else if (key === "2") {
      playClipToggle("elbowUp");
    } else if (key === "3") {
      playClipToggle("forwardUpShoulder");
    }
  });

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    if (mixer) mixer.update(delta);

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