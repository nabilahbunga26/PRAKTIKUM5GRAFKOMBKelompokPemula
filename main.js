import { Mat4, degToRad, normalMatrixFromMat4 } from "./math3d.js";

/* ───────────────────────── WebGL2 context ───────────────────────── */
const canvas = document.getElementById("glCanvas");
const gl = canvas.getContext("webgl2");
const statusBadge = document.getElementById("statusBadge");

if (!gl) {
  statusBadge.textContent = "WEBGL2 TIDAK TERSEDIA";
  statusBadge.classList.add("off");
  throw new Error("WebGL2 tidak tersedia.");
}
gl.enable(gl.DEPTH_TEST);

/* ───────────────────────── Shader helpers ───────────────────────── */
function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error("Shader compile error:\n" + info);
  }
  return shader;
}

function createProgram(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("Program link error:\n" + info);
  }
  return p;
}

// .trim() wajib: "#version 300 es" harus jadi karakter pertama
const program = createProgram(
  createShader(gl.VERTEX_SHADER, document.getElementById("vertex-shader").textContent.trim()),
  createShader(gl.FRAGMENT_SHADER, document.getElementById("fragment-shader").textContent.trim())
);
gl.useProgram(program);

const attr = {
  position: gl.getAttribLocation(program, "a_position"),
  normal: gl.getAttribLocation(program, "a_normal"),
  texCoord: gl.getAttribLocation(program, "a_texCoord"),
};

const U = {};
[
  "u_model", "u_view", "u_projection", "u_normalMatrix", "u_uvScale",
  "u_lightPosition", "u_lightColor", "u_cameraPosition",
  "u_ambientStrength", "u_shininess", "u_texture",
  "u_useTexture", "u_useAmbient", "u_useDiffuse", "u_useSpecular", "u_unlit",
].forEach((name) => (U[name] = gl.getUniformLocation(program, name)));

/* ───────────────────────── Geometry ─────────────────────────
   Semua bentuk = triangle list non-indexed dengan:
   positions, flat normals (per-triangle), smooth normals (per-vertex), UV   */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l < 1e-9 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

/** Kumpulkan triangle: tiap vertex = {p, n(smooth), uv} */
class MeshBuilder {
  constructor() {
    this.pos = []; this.flat = []; this.smooth = []; this.uv = [];
  }
  triangle(v0, v1, v2) {
    let fn = normalize(cross(sub(v1.p, v0.p), sub(v2.p, v0.p)));
    const avg = add(add(v0.n, v1.n), v2.n);
    if (fn[0] === 0 && fn[1] === 0 && fn[2] === 0) fn = normalize(avg); // triangle degenerate (kutub bola)
    else if (dot(fn, avg) < 0) fn = mul(fn, -1);                      // arahkan keluar
    for (const v of [v0, v1, v2]) {
      this.pos.push(...v.p);
      this.flat.push(...fn);
      this.smooth.push(...v.n);
      this.uv.push(...v.uv);
    }
  }
  build() {
    return {
      positions: new Float32Array(this.pos),
      flat: new Float32Array(this.flat),
      smooth: new Float32Array(this.smooth),
      uvs: new Float32Array(this.uv),
      count: this.pos.length / 3,
    };
  }
}

function buildParametric(nu, nv, fn, uRep, vRep) {
  const grid = [];
  for (let i = 0; i <= nu; i++) {
    grid[i] = [];
    for (let j = 0; j <= nv; j++) {
      const s = fn(i / nu, j / nv);
      grid[i][j] = { p: s.p, n: s.n, uv: [(i / nu) * uRep, (j / nv) * vRep] };
    }
  }
  const mb = new MeshBuilder();
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = grid[i][j], b = grid[i + 1][j], c = grid[i + 1][j + 1], d = grid[i][j + 1];
      mb.triangle(a, b, c);
      mb.triangle(a, c, d);
    }
  }
  return mb.build();
}

function buildCube() {
  const mb = new MeshBuilder();
  const faces = [
    { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },   // front
    { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] }, // back
    { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },  // left
    { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },  // right
    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },  // top
    { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },  // bottom
  ];
  const corner = (f, su, sv) => {
    const p = add(add(mul(f.n, 0.5), mul(f.u, 0.5 * su)), mul(f.v, 0.5 * sv));
    // smooth normal kubus = arah pusat -> sudut (sesuai modul)
    return { p, n: normalize(p), uv: [(su + 1) / 2, (sv + 1) / 2] };
  };
  for (const f of faces) {
    const c00 = corner(f, -1, -1), c10 = corner(f, 1, -1);
    const c11 = corner(f, 1, 1), c01 = corner(f, -1, 1);
    mb.triangle(c00, c10, c11);
    mb.triangle(c00, c11, c01);
  }
  return mb.build();
}

function buildSphere() {
  const r = 0.85;
  return buildParametric(64, 40, (u, v) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    const n = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    return { p: mul(n, r), n };
  }, 2, 1);
}

function buildTorus() {
  const R = 0.65, r = 0.28;
  return buildParametric(64, 32, (u, v) => {
    const th = u * Math.PI * 2, ph = v * Math.PI * 2;
    const n = [Math.cos(ph) * Math.cos(th), Math.sin(ph), Math.cos(ph) * Math.sin(th)];
    const p = [(R + r * Math.cos(ph)) * Math.cos(th), r * Math.sin(ph), (R + r * Math.cos(ph)) * Math.sin(th)];
    return { p, n };
  }, Math.round((R / r) * 2), 2);
}

function buildTorusKnot() {
  const P = 2, Q = 3, scale = 0.85, tube = 0.17;
  const curve = (t) => {
    const qp = (Q / P) * t, cs = Math.cos(qp);
    return [scale * (2 + cs) * 0.5 * Math.cos(t), scale * (2 + cs) * 0.5 * Math.sin(t), scale * Math.sin(qp) * 0.5];
  };
  // panjang kurva -> jumlah pengulangan UV supaya kotak texture ~ persegi
  let len = 0, prev = curve(0);
  for (let i = 1; i <= 2000; i++) {
    const cur = curve((i / 2000) * Math.PI * 2 * P);
    len += Math.hypot(...sub(cur, prev));
    prev = cur;
  }
  const vRep = 2;
  const uRep = Math.max(1, Math.round((len / (2 * Math.PI * tube)) * vRep));

  return buildParametric(260, 20, (u, v) => {
    const t = u * Math.PI * 2 * P, ph = v * Math.PI * 2;
    const p1 = curve(t), p2 = curve(t + 0.01);
    const T = sub(p2, p1);
    const B = normalize(cross(T, add(p2, p1)));
    const N = normalize(cross(B, T));
    const n = normalize(add(mul(N, Math.cos(ph)), mul(B, Math.sin(ph))));
    return { p: add(p1, mul(n, tube)), n };
  }, uRep, vRep);
}

function createMesh(geo) {
  const makeBuffer = (data) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  };
  const bind = (buffer, loc, size) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  };
  const posBuf = makeBuffer(geo.positions);
  const uvBuf = makeBuffer(geo.uvs);
  const flatBuf = makeBuffer(geo.flat);
  const smoothBuf = makeBuffer(geo.smooth);

  const makeVao = (normalBuf) => {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    bind(posBuf, attr.position, 3);
    bind(normalBuf, attr.normal, 3);
    bind(uvBuf, attr.texCoord, 2);
    gl.bindVertexArray(null);
    return vao;
  };
  return { count: geo.count, FLAT: makeVao(flatBuf), SMOOTH: makeVao(smoothBuf) };
}

const meshes = {
  cube: createMesh(buildCube()),
  torus: createMesh(buildTorus()),
  knot: createMesh(buildTorusKnot()),
  sphere: createMesh(buildSphere()),
};

/* ───────────────────────── State ───────────────────────── */
const DEFAULTS = {
  shape: "cube",
  shading: "FLAT",
  textureOn: true,
  textureSource: "checker",
  filter: "LINEAR",
  wrap: "REPEAT",
  ambient: 0.18,
  shininess: 32,
  uvScale: 1,
  comps: { ambient: true, diffuse: true, specular: true },
  scale: [1, 1, 1],
  rotate: true,
  lightOrbit: false,
  cameraOrbit: false,
};

const state = JSON.parse(JSON.stringify(DEFAULTS));
const cube = { rotationX: 20, rotationY: 30 };
const light = { position: [2, 2, 3], color: [1, 1, 1] };
const camera = { position: [0, 1.4, 4], target: [0, 0, 0], up: [0, 1, 0] };

/* ───────────────────────── Textures ───────────────────────── */
function createCheckerCanvas() {
  const size = 32, cells = 8, cell = size / cells;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#ffffff" : "#ff69b4";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  return c;
}

function createFallbackImageCanvas() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, "#ff69b4"); g.addColorStop(1, "#ffffff");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#c2185b"; ctx.font = "bold 72px monospace"; ctx.fillText("ITS", 24, 96);
  return c;
}

const checkerTex = gl.createTexture();
const imageTex = gl.createTexture();

function uploadSource(tex, source) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  applyTexParams(tex);
}

uploadSource(checkerTex, createCheckerCanvas());
uploadSource(imageTex, createFallbackImageCanvas()); // placeholder sampai assets/texture.png selesai dimuat

const img = new Image();
img.onload = () => {
  try { uploadSource(imageTex, img); }
  catch (e) { console.warn("Image texture ditolak (jalankan lewat local server):", e); }
};
img.onerror = () => console.warn("assets/texture.png gagal dimuat — memakai texture cadangan.");
img.src = "./assets/texture.png";

/* ───────────────────────── Texture parameters & reset ───────────────────────── */
function applyTexParams(tex) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const min = { NEAREST: gl.NEAREST, LINEAR: gl.LINEAR, LINEAR_MIPMAP: gl.LINEAR_MIPMAP_LINEAR }[state.filter];
  const mag = state.filter === "NEAREST" ? gl.NEAREST : gl.LINEAR;
  const wrap = state.wrap === "CLAMP_TO_EDGE" ? gl.CLAMP_TO_EDGE : gl.REPEAT;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
}
function applyAllTexParams() { applyTexParams(checkerTex); applyTexParams(imageTex); }
applyAllTexParams();

function resetScene() {
  const d = JSON.parse(JSON.stringify(DEFAULTS));
  Object.assign(state, d);
  light.position = [2, 2, 3];
  camera.position = [0, 1.4, 4];
  cube.rotationX = 20;
  cube.rotationY = 30;
  applyAllTexParams();
}

/* ───────────────────────── Input ───────────────────────── */
const keys = {};
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k.startsWith("arrow")) e.preventDefault();
  if (e.repeat) return;

  if (k === "f") state.shading = state.shading === "FLAT" ? "SMOOTH" : "FLAT";
  else if (k === "t") state.textureOn = !state.textureOn;
  else if (k === "l") state.lightOrbit = !state.lightOrbit;
  else if (k === "p") state.rotate = !state.rotate;
  else if (k === "r") resetScene();
});
window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
window.addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

const $ = (id) => document.getElementById(id);

$("shapeSelect").addEventListener("change", (e) => { state.shape = e.target.value; e.target.blur(); });
$("textureSource").addEventListener("change", (e) => { state.textureSource = e.target.value; e.target.blur(); });
$("filterSelect").addEventListener("change", (e) => { state.filter = e.target.value; applyAllTexParams(); e.target.blur(); });
$("wrapSelect").addEventListener("change", (e) => { state.wrap = e.target.value; applyAllTexParams(); e.target.blur(); });

$("ambientRange").addEventListener("input", (e) => { state.ambient = parseFloat(e.target.value); });
$("shininessRange").addEventListener("input", (e) => { state.shininess = parseFloat(e.target.value); });
$("uvRange").addEventListener("input", (e) => { state.uvScale = parseFloat(e.target.value); });
["lightX", "lightY", "lightZ"].forEach((id, i) =>
  $(id).addEventListener("input", (e) => { light.position[i] = parseFloat(e.target.value); }));
["scaleX", "scaleY", "scaleZ"].forEach((id, i) =>
  $(id).addEventListener("input", (e) => { state.scale[i] = parseFloat(e.target.value); }));

$("compAmbient").addEventListener("change", (e) => { state.comps.ambient = e.target.checked; });
$("compDiffuse").addEventListener("change", (e) => { state.comps.diffuse = e.target.checked; });
$("compSpecular").addEventListener("change", (e) => { state.comps.specular = e.target.checked; });

$("shadingBtn").addEventListener("click", (e) => { state.shading = state.shading === "FLAT" ? "SMOOTH" : "FLAT"; e.target.blur(); });
$("textureBtn").addEventListener("click", (e) => { state.textureOn = !state.textureOn; e.target.blur(); });
$("lightOrbitBtn").addEventListener("click", (e) => { state.lightOrbit = !state.lightOrbit; e.target.blur(); });
$("cameraOrbitBtn").addEventListener("click", (e) => { state.cameraOrbit = !state.cameraOrbit; e.target.blur(); });
$("rotateBtn").addEventListener("click", (e) => { state.rotate = !state.rotate; e.target.blur(); });
$("resetBtn").addEventListener("click", (e) => { resetScene(); e.target.blur(); });

/* ───────────────────────── Update ───────────────────────── */
function update(dt) {
  if (state.rotate) {
    cube.rotationX += 20 * dt;
    cube.rotationY += 35 * dt;
  }

  // light: keyboard (state-based)
  const ls = 2.0, lp = light.position;
  if (keys["arrowleft"]) lp[0] -= ls * dt;
  if (keys["arrowright"]) lp[0] += ls * dt;
  if (keys["arrowup"]) lp[1] += ls * dt;
  if (keys["arrowdown"]) lp[1] -= ls * dt;
  if (keys["w"]) lp[2] -= ls * dt;
  if (keys["s"]) lp[2] += ls * dt;

  // light orbit mengelilingi objek pada bidang XZ
  if (state.lightOrbit) {
    const r = Math.hypot(lp[0], lp[2]);
    const a = Math.atan2(lp[2], lp[0]) + 1.2 * dt;
    lp[0] = Math.cos(a) * r;
    lp[2] = Math.sin(a) * r;
  }
  for (let i = 0; i < 3; i++) lp[i] = Math.max(-6, Math.min(6, lp[i]));

  // camera: Q/E geser X, orbit memutar mengelilingi sumbu Y
  const cp = camera.position;
  if (keys["q"]) cp[0] -= 2.0 * dt;
  if (keys["e"]) cp[0] += 2.0 * dt;
  if (state.cameraOrbit) {
    const a = 0.6 * dt, c = Math.cos(a), s = Math.sin(a);
    const x = cp[0], z = cp[2];
    cp[0] = x * c + z * s;
    cp[2] = -x * s + z * c;
  }
}

function createModelMatrix() {
  const rx = Mat4.rotationX(degToRad(cube.rotationX));
  const ry = Mat4.rotationY(degToRad(cube.rotationY));
  const s = Mat4.scaling(state.scale[0], state.scale[1], state.scale[2]);
  // scale (lokal) -> rotasi X -> rotasi Y
  return Mat4.multiply(ry, Mat4.multiply(rx, s));
}

/* ───────────────────────── Draw ───────────────────────── */
function setCommonUniforms(model, unlit) {
  gl.uniformMatrix4fv(U.u_model, false, model);
  gl.uniformMatrix3fv(U.u_normalMatrix, false, normalMatrixFromMat4(model));
  gl.uniform1i(U.u_unlit, unlit ? 1 : 0);
}

function drawScene() {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.10, 0.03, 0.07, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.useProgram(program);

  const view = Mat4.lookAt(camera.position, camera.target, camera.up);
  const projection = Mat4.perspective(degToRad(60), canvas.width / canvas.height, 0.1, 100.0);
  gl.uniformMatrix4fv(U.u_view, false, view);
  gl.uniformMatrix4fv(U.u_projection, false, projection);

  gl.uniform3fv(U.u_lightPosition, light.position);
  gl.uniform3fv(U.u_lightColor, light.color);
  gl.uniform3fv(U.u_cameraPosition, camera.position);
  gl.uniform1f(U.u_ambientStrength, state.ambient);
  gl.uniform1f(U.u_shininess, state.shininess);
  gl.uniform1f(U.u_uvScale, state.uvScale);
  gl.uniform1i(U.u_useTexture, state.textureOn ? 1 : 0);
  gl.uniform1i(U.u_useAmbient, state.comps.ambient ? 1 : 0);
  gl.uniform1i(U.u_useDiffuse, state.comps.diffuse ? 1 : 0);
  gl.uniform1i(U.u_useSpecular, state.comps.specular ? 1 : 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, state.textureSource === "image" ? imageTex : checkerTex);
  gl.uniform1i(U.u_texture, 0);

  // objek utama
  const mesh = meshes[state.shape];
  setCommonUniforms(createModelMatrix(), false);
  gl.bindVertexArray(mesh[state.shading]);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.count);

  // penanda posisi light (kubus kecil tanpa lighting)
  const marker = meshes.cube;
  const lp = light.position;
  const markerModel = Mat4.multiply(Mat4.translation(lp[0], lp[1], lp[2]), Mat4.scaling(0.12, 0.12, 0.12));
  setCommonUniforms(markerModel, true);
  gl.bindVertexArray(marker.FLAT);
  gl.drawArrays(gl.TRIANGLES, 0, marker.count);
  gl.bindVertexArray(null);
}

/* ───────────────────────── UI sync / HUD ───────────────────────── */
function setValue(el, v) { if (el.value !== String(v)) el.value = v; }
function setText(el, v) { if (el.textContent !== v) el.textContent = v; }

function updateUI() {
  const lp = light.position;
  setValue($("shapeSelect"), state.shape);
  setValue($("textureSource"), state.textureSource);
  setValue($("filterSelect"), state.filter);
  setValue($("wrapSelect"), state.wrap);

  setValue($("ambientRange"), state.ambient);
  setValue($("shininessRange"), state.shininess);
  setValue($("uvRange"), state.uvScale);
  ["lightX", "lightY", "lightZ"].forEach((id, i) => {
    $(id).value = lp[i];
    setText($(id + "Out"), lp[i].toFixed(2));
  });
  ["scaleX", "scaleY", "scaleZ"].forEach((id, i) => {
    $(id).value = state.scale[i];
    setText($(id + "Out"), state.scale[i].toFixed(2));
  });
  setText($("ambientOut"), state.ambient.toFixed(2));
  setText($("shininessOut"), String(Math.round(state.shininess)));
  setText($("uvOut"), state.uvScale.toFixed(2));

  $("compAmbient").checked = state.comps.ambient;
  $("compDiffuse").checked = state.comps.diffuse;
  $("compSpecular").checked = state.comps.specular;

  $("textureBtn").classList.toggle("on", state.textureOn);
  $("lightOrbitBtn").classList.toggle("on", state.lightOrbit);
  $("cameraOrbitBtn").classList.toggle("on", state.cameraOrbit);
  $("shadingBtn").classList.toggle("on", state.shading === "SMOOTH");
  $("rotateBtn").classList.toggle("on", !state.rotate);
  setText($("rotateBtn"), state.rotate ? "Stop Object Rotation (P)" : "Resume Object Rotation (P)");

  setText($("hudShading"), state.shading);
  setText($("hudLight"), `(${lp[0].toFixed(2)}, ${lp[1].toFixed(2)}, ${lp[2].toFixed(2)})`);
  setText($("hudTexture"), state.textureOn ? (state.textureSource === "image" ? "IMAGE" : "CHECKER") : "OFF");
  setText($("hudFilter"), state.filter);
  setText($("hudWrap"), state.wrap);
  setText($("hudCamera"), state.cameraOrbit ? "ORBIT ON" : "ORBIT OFF");
  setText($("hudShininess"), String(Math.round(state.shininess)));
  setText($("hudUv"), state.uvScale.toFixed(2));

  const lit = state.comps.ambient || state.comps.diffuse || state.comps.specular;
  setText(statusBadge, `${state.rotate ? "RUNNING" : "ROTATION STOPPED"} · LIGHTING ${lit ? "ON" : "OFF"}`);
  statusBadge.classList.toggle("warn", !state.rotate);
  statusBadge.classList.toggle("off", !lit);
}

/* ───────────────────────── Loop ───────────────────────── */
let lastTime = 0;
function render(time) {
  let dt = (time - lastTime) * 0.001;
  lastTime = time;
  dt = Math.min(Math.max(dt, 0), 0.05);

  update(dt);
  drawScene();
  updateUI();
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
