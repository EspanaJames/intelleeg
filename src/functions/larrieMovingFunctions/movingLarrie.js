import * as THREE from "three";
import { OrbitControls } from "/src/functions/larrieMovingFunctions/OrbitControls.js";
import { GLTFLoader } from "/src/functions/larrieMovingFunctions/GLTFLoader.js";

let mixer = null;
let clipsByName = {};
let activeAction = null;
let activeClipName = null;

let currentMovementLabel = "rest";
let pendingMovementLabel = null;
let isTransitioning = false;

// Match these with your console available clips:
// ['arm', 'elbow_raised', 'forwardUpShoulder', 'hand_clench', 'Rest', 'sideArm', 'TherealRest']
const MOVEMENT_CLIPS = {
  rest: "TherealRest",
  hand_clench: "hand_clench",
  arm_raised: "arm_raised",
  elbow_raised: "elbow_raised"
};

export function playClipByName(clipName, direction = "forward", onFinished = null) {
  if (!mixer) {
    console.warn("Mixer not ready.");
    return;
  }

  const clip = clipsByName[clipName];

  if (!clip) {
    console.warn(`Clip "${clipName}" not found.`);
    console.log("Available clips:", Object.keys(clipsByName));
    return;
  }

  if (activeAction) {
    activeAction.stop();
  }

  const action = mixer.clipAction(clip);
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = true;
  action.loop = THREE.LoopOnce;

  if (direction === "reverse") {
    action.timeScale = -1;
    action.time = clip.duration;
  } else {
    action.timeScale = 1;
    action.time = 0;
  }

  if (onFinished) {
    const finishedHandler = (event) => {
      if (event.action === action) {
        mixer.removeEventListener("finished", finishedHandler);
        onFinished();
      }
    };

    mixer.addEventListener("finished", finishedHandler);
  }

  action.play();

  activeAction = action;
  activeClipName = clipName;
}

export function playEEGMovement(label) {
  if (!MOVEMENT_CLIPS[label]) {
    label = "rest";
  }

  if (label === currentMovementLabel) {
    return;
  }

  if (isTransitioning) {
    pendingMovementLabel = label;
    return;
  }

  const previousLabel = currentMovementLabel;
  const previousClip = MOVEMENT_CLIPS[previousLabel];
  const nextClip = MOVEMENT_CLIPS[label];

  isTransitioning = true;

  // If already resting, play next directly
  if (previousLabel === "rest") {
    playClipByName(nextClip, "forward", () => {
      currentMovementLabel = label;
      isTransitioning = false;
      runPendingMovement();
    });
    return;
  }

  // Reverse current first
  playClipByName(previousClip, "reverse", () => {
    currentMovementLabel = "rest";

    if (label === "rest") {
      isTransitioning = false;
      runPendingMovement();
      return;
    }

    // Then play next
    playClipByName(nextClip, "forward", () => {
      currentMovementLabel = label;
      isTransitioning = false;
      runPendingMovement();
    });
  });
}

function runPendingMovement() {
  if (pendingMovementLabel && pendingMovementLabel !== currentMovementLabel) {
    const next = pendingMovementLabel;
    pendingMovementLabel = null;
    playEEGMovement(next);
  } else {
    pendingMovementLabel = null;
  }
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

  scene.add(new THREE.AmbientLight(0xffffff, 1.5));

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
      object.position.y -= center.y - size.y / 2;

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

      mixer = new THREE.AnimationMixer(object);

      gltf.animations.forEach((clip) => {
        clipsByName[clip.name] = clip;
        console.log("Clip name:", clip.name);
      });

      console.log("Available clips:", Object.keys(clipsByName));

      setTimeout(() => {
        if (clipsByName["TherealRest"]) {
          playClipByName("TherealRest", "forward");
          currentMovementLabel = "rest";
        } else if (clipsByName["Rest"]) {
          playClipByName("Rest", "forward");
          currentMovementLabel = "rest";
        }
      }, 300);
    },
    undefined,
    (error) => {
      console.error("GLTF load error:", error);
    }
  );

  // Manual keyboard controls
  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "1") {
      playEEGMovement("hand_clench");
    } else if (key === "2") {
      playEEGMovement("elbow_raised");
    } else if (key === "3") {
      playEEGMovement("arm_raised");
    } else if (key === "4") {
      playEEGMovement("rest");
    }
  });

  // Manual button controls
  window.manualHand = () => playEEGMovement("hand_clench");
  window.manualElbow = () => playEEGMovement("elbow_raised");
  window.manualArm = () => playEEGMovement("arm_raised");
  window.manualRest = () => playEEGMovement("rest");

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();

    if (mixer) {
      mixer.update(delta);
    }

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