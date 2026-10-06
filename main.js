import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { TransformControls } from 'three/addons/TransformControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// ---------- 基础场景 ----------
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  50,
  viewport.clientWidth / viewport.clientHeight,
  0.1,
  200
);
camera.position.set(5, 5, 8);

// 所有用户创建的模型都放进 modelGroup，方便导出与射线检测
const modelGroup = new THREE.Group();
modelGroup.name = '饰品模型';
scene.add(modelGroup);

// 灯光
const ambient = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
dirLight.position.set(6, 10, 6);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
dirLight.shadow.camera.left = -15;
dirLight.shadow.camera.right = 15;
dirLight.shadow.camera.top = 15;
dirLight.shadow.camera.bottom = -15;
dirLight.shadow.bias = -0.0001;
scene.add(dirLight);

// 地面（不参与导出）
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.95, metalness: 0 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(20, 20, 0x4a4d57, 0x33353d);
grid.position.y = 0.001;
scene.add(grid);

// 控制器
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0.8, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.08;
orbit.update();

const transform = new TransformControls(camera, renderer.domElement);
transform.setSize(0.8);
scene.add(transform);
transform.addEventListener('dragging-changed', (e) => {
  orbit.enabled = !e.value;
});
transform.addEventListener('objectChange', () => refreshInspector());

// ---------- 状态 ----------
let selected = null;
let currentTool = 'translate';
let extrudeAxis = 'x';

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// ---------- 材质与工具函数 ----------
function makeMaterial(color = 0xffffff) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
  });
}

function setObjectMaterial(obj, color = 0xffffff) {
  obj.traverse((c) => {
    if (c.isMesh) {
      c.material = makeMaterial(color);
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
}

function getTopLevel(obj) {
  let o = obj;
  while (o.parent && o.parent !== modelGroup) o = o.parent;
  return o;
}

function setHighlight(obj, on) {
  if (!obj) return;
  obj.traverse((c) => {
    if (c.isMesh && c.material && !Array.isArray(c.material)) {
      c.material.emissive.setHex(on ? 0x5a4a1a : 0x000000);
    }
  });
}

// 把对象底部放到 y=0 的地面上
function placeOnGround(obj) {
  const box = new THREE.Box3().setFromObject(obj);
  obj.position.y += -box.min.y;
}

function deepClone(obj) {
  if (obj.isMesh) {
    const m = new THREE.Mesh(obj.geometry, obj.material.clone());
    m.name = obj.name;
    m.position.copy(obj.position);
    m.rotation.copy(obj.rotation);
    m.scale.copy(obj.scale);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }
  const g = new THREE.Group();
  g.name = obj.name;
  g.position.copy(obj.position);
  g.rotation.copy(obj.rotation);
  g.scale.copy(obj.scale);
  obj.children.forEach((c) => g.add(deepClone(c)));
  return g;
}

function addObject(obj, name) {
  obj.name = name;
  setObjectMaterial(obj);
  placeOnGround(obj);
  // 轻微随机偏移，避免多个对象完全重叠
  obj.position.x += (Math.random() - 0.5) * 0.6;
  obj.position.z += (Math.random() - 0.5) * 0.6;
  modelGroup.add(obj);
  setSelected(obj);
}

// ---------- 基础形状 ----------
function createPrimitive(shape) {
  let geo;
  switch (shape) {
    case 'box': geo = new THREE.BoxGeometry(1, 1, 1); break;
    case 'sphere': geo = new THREE.SphereGeometry(0.6, 32, 18); break;
    case 'cylinder': geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 32); break;
    case 'cone': geo = new THREE.ConeGeometry(0.6, 1.2, 32); break;
    case 'torus': geo = new THREE.TorusGeometry(0.6, 0.22, 16, 48); break;
    case 'tetra': geo = new THREE.TetrahedronGeometry(0.8); break;
    case 'plane': geo = new THREE.BoxGeometry(1.6, 0.1, 1.6); break;
    case 'circle': geo = new THREE.CylinderGeometry(0.6, 0.6, 0.12, 40); break;
    default: geo = new THREE.BoxGeometry(1, 1, 1);
  }
  return new THREE.Mesh(geo, makeMaterial());
}

// ---------- 饰品模板 ----------
function createTemplate(kind) {
  const group = new THREE.Group();

  if (kind === 'bracelet') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.18, 16, 64), makeMaterial());
    ring.name = '手链环';
    group.add(ring);
    const count = 12;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), makeMaterial());
      bead.name = '珠子' + (i + 1);
      bead.position.set(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
      group.add(bead);
    }
  } else if (kind === 'hat') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 1.2, 32), makeMaterial());
    crown.name = '帽身';
    crown.position.y = 0.6;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.12, 32), makeMaterial());
    brim.name = '帽檐';
    brim.position.y = 0.05;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), makeMaterial());
    pom.name = '帽球';
    pom.position.y = 1.35;
    group.add(crown, brim, pom);
  } else if (kind === 'ring') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.18, 16, 48), makeMaterial());
    ring.name = '戒环';
    group.add(ring);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), makeMaterial());
    gem.name = '宝石';
    gem.position.y = 0.78;
    group.add(gem);
  } else if (kind === 'necklace') {
    const chain = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.09, 12, 80), makeMaterial());
    chain.name = '链环';
    group.add(chain);
    const pendant = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.16), makeMaterial());
    pendant.name = '吊坠';
    pendant.position.y = -1.58;
    group.add(pendant);
  }

  return group;
}

// ---------- 选择 ----------
function setSelected(obj) {
  if (selected === obj) return;
  setHighlight(selected, false);
  selected = obj;
  setHighlight(selected, true);
  refreshInspector();
  applyTool();
}

function selectAt(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(modelGroup, true);
  if (hits.length > 0) {
    setSelected(getTopLevel(hits[0].object));
  } else {
    setSelected(null);
  }
}

// ---------- 工具栏 ----------
function applyTool() {
  transform.detach();
  transform.enabled = false;
  document.getElementById('extrudePanel').hidden = true;

  if (currentTool === 'select') return;

  const mode = currentTool === 'rotate' ? 'rotate'
    : currentTool === 'translate' ? 'translate'
      : 'scale';
  transform.setMode(mode);

  if (currentTool === 'scale') {
    transform.axis = 'XYZ';
  } else if (currentTool === 'extrude') {
    transform.axis = extrudeAxis.toUpperCase();
    document.getElementById('extrudePanel').hidden = false;
    updateAxisButtons();
  } else {
    transform.axis = null;
  }

  if (selected) {
    transform.attach(selected);
    transform.enabled = true;
  }
}

function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('.tool').forEach((b) => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });
  applyTool();
}

function updateAxisButtons() {
  document.querySelectorAll('.axis').forEach((b) => {
    b.classList.toggle('active', b.dataset.axis === extrudeAxis);
  });
}

function applySpace() {
  const local = document.getElementById('spaceToggle').checked;
  transform.setSpace(local ? 'local' : 'world');
}

function applyWireframe() {
  const on = document.getElementById('wireToggle').checked;
  modelGroup.traverse((c) => {
    if (c.isMesh && c.material && !Array.isArray(c.material)) {
      c.material.wireframe = on;
    }
  });
}

// ---------- 属性面板 ----------
const el = (id) => document.getElementById(id);
const vecInputs = {
  pos: [el('posX'), el('posY'), el('posZ')],
  rot: [el('rotX'), el('rotY'), el('rotZ')],
  scl: [el('sclX'), el('sclY'), el('sclZ')],
};

function setInput(input, value) {
  if (document.activeElement !== input) input.value = value;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function refreshInspector() {
  const empty = el('inspectorEmpty');
  const body = el('inspectorBody');
  if (!selected) {
    empty.hidden = false;
    body.hidden = true;
    return;
  }
  empty.hidden = true;
  body.hidden = false;

  el('propName').value = selected.name || '';

  setInput(vecInputs.pos[0], round2(selected.position.x));
  setInput(vecInputs.pos[1], round2(selected.position.y));
  setInput(vecInputs.pos[2], round2(selected.position.z));

  setInput(vecInputs.rot[0], round2(THREE.MathUtils.radToDeg(selected.rotation.x)));
  setInput(vecInputs.rot[1], round2(THREE.MathUtils.radToDeg(selected.rotation.y)));
  setInput(vecInputs.rot[2], round2(THREE.MathUtils.radToDeg(selected.rotation.z)));

  setInput(vecInputs.scl[0], round2(selected.scale.x));
  setInput(vecInputs.scl[1], round2(selected.scale.y));
  setInput(vecInputs.scl[2], round2(selected.scale.z));

  // 取第一个网格的颜色作为代表色
  let color = '#ffffff';
  selected.traverse((c) => {
    if (c.isMesh && c.material && !Array.isArray(c.material)) {
      color = '#' + c.material.color.getHexString();
    }
  });
  el('propColor').value = color;
}

function setObjectColor(obj, color) {
  obj.traverse((c) => {
    if (c.isMesh) {
      if (Array.isArray(c.material)) c.material.forEach((m) => m.color.set(color));
      else c.material.color.set(color);
    }
  });
}

// ---------- 对象操作 ----------
function deleteSelected() {
  if (!selected) return;
  setHighlight(selected, false);
  transform.detach();
  transform.enabled = false;
  selected.parent.remove(selected);
  setSelected(null);
}

function duplicateSelected() {
  if (!selected) return;
  const clone = deepClone(selected);
  modelGroup.add(clone);
  setSelected(clone);
}

function ungroupSelected() {
  if (!selected || selected.children.length === 0) return;
  const children = [...selected.children];
  children.forEach((c) => modelGroup.attach(c));
  selected.parent.remove(selected);
  setSelected(null);
}

function clearScene() {
  setHighlight(selected, false);
  transform.detach();
  transform.enabled = false;
  while (modelGroup.children.length > 0) {
    modelGroup.remove(modelGroup.children[0]);
  }
  setSelected(null);
}

function resetView() {
  camera.position.set(5, 5, 8);
  orbit.target.set(0, 0.8, 0);
  orbit.update();
}

// ---------- 导出 GLB ----------
function exportGLB() {
  const exporter = new GLTFExporter();
  exporter.parse(
    modelGroup,
    (result) => {
      const blob = new Blob([result], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '饰品白模.glb';
      a.click();
      URL.revokeObjectURL(url);
    },
    (err) => console.error('导出失败', err),
    { binary: true }
  );
}

// ---------- 事件绑定 ----------
// 形状按钮
document.getElementById('shapeGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.shape');
  if (!btn || !btn.dataset.shape) return;
  addObject(createPrimitive(btn.dataset.shape), btn.dataset.shape);
});

// 模板按钮
document.getElementById('templateGrid').addEventListener('click', (e) => {
  const btn = e.target.closest('.shape');
  if (!btn || !btn.dataset.template) return;
  addObject(createTemplate(btn.dataset.template), btn.dataset.template);
});

// 工具按钮
document.querySelectorAll('.tool').forEach((b) => {
  b.addEventListener('click', () => setTool(b.dataset.tool));
});

// 拉伸轴向
document.querySelectorAll('.axis').forEach((b) => {
  b.addEventListener('click', () => {
    extrudeAxis = b.dataset.axis;
    updateAxisButtons();
    if (currentTool === 'extrude') {
      transform.axis = extrudeAxis.toUpperCase();
    }
  });
});

// 对象操作按钮
el('btnDuplicate').addEventListener('click', duplicateSelected);
el('btnDelete').addEventListener('click', deleteSelected);
el('btnUngroup').addEventListener('click', ungroupSelected);
el('btnClear').addEventListener('click', clearScene);
el('btnCenter').addEventListener('click', resetView);
el('btnExport').addEventListener('click', exportGLB);

el('spaceToggle').addEventListener('change', applySpace);
el('wireToggle').addEventListener('change', applyWireframe);

// 属性输入
el('propName').addEventListener('input', (e) => { if (selected) selected.name = e.target.value; });
el('propColor').addEventListener('input', (e) => { if (selected) setObjectColor(selected, e.target.value); });

function bindVec(group, apply) {
  vecInputs[group].forEach((input, i) => {
    input.addEventListener('input', () => {
      if (!selected) return;
      const v = parseFloat(input.value);
      if (Number.isNaN(v)) return;
      apply(selected, i, v);
    });
  });
}
bindVec('pos', (obj, i, v) => { obj.position.setComponent(i, v); });
bindVec('rot', (obj, i, v) => { obj.rotation.setComponent(i, THREE.MathUtils.degToRad(v)); });
bindVec('scl', (obj, i, v) => { obj.scale.setComponent(i, v); });

// 选择：指针按下时进行拾取（避开变换手柄）
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  if (transform.enabled && (transform.axis !== null || transform.dragging)) return;
  selectAt(e.clientX, e.clientY);
});

// 键盘快捷键
window.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  switch (e.key.toLowerCase()) {
    case 'q': setTool('select'); break;
    case 'w': setTool('translate'); break;
    case 'e': setTool('rotate'); break;
    case 'r': setTool('scale'); break;
    case 't': setTool('extrude'); break;
    case 'delete':
    case 'backspace':
      e.preventDefault();
      deleteSelected();
      break;
    case 'escape':
      setSelected(null);
      break;
    case 'd':
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); duplicateSelected(); }
      break;
  }
});

// 窗口尺寸
window.addEventListener('resize', () => {
  camera.aspect = viewport.clientWidth / viewport.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewport.clientWidth, viewport.clientHeight);
});

// ---------- 渲染循环 ----------
function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}
animate();

// 初始化
setTool('translate');
refreshInspector();
