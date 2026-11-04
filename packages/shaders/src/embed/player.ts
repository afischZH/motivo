/**
 * The standalone embed player (docs/ARCHITECTURE.md 4.22) as JavaScript
 * source, pasted into every embed snippet. No dependencies, no network,
 * no storage. It mirrors `createShaderRuntime` (same vertex shader, same
 * context attributes, same runtime uniforms with one tile = the whole
 * canvas), so a frame equals the editor's export at the same size.
 *
 * Behaviour: draws behind the host's content (`z-index: -1` inside an
 * isolated host), follows the host's size, caps the pixel ratio and the
 * frame rate, pauses off screen and in hidden tabs, shows the still frame
 * `t = 0` when the viewer prefers reduced motion, and recovers from a lost
 * WebGL context. Without WebGL2 it does nothing: the host's background
 * colour (or poster) stays.
 *
 * Kept as a string on purpose: the snippet must run unchanged in any page,
 * bundler or framework. `player.test.ts` executes it against a fake DOM.
 */
export const EMBED_PLAYER_JS = `function musterliShader(host, cfg, opt) {
  "use strict";
  opt = opt || {};
  var noop = { destroy: function () {} };
  if (!host || !cfg || cfg.v !== 1) return noop;
  var fps = Math.min(60, Math.max(1, +opt.fps || 30));
  var maxDpr = Math.min(3, Math.max(0.5, +opt.maxDpr || 1.5));
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : 0;
  var canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;z-index:-1;pointer-events:none";
  if (getComputedStyle(host).position === "static") host.style.position = "relative";
  host.style.isolation = "isolate";
  if (!host.style.backgroundColor) host.style.backgroundColor = cfg.b;
  var gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) return noop;
  host.insertBefore(canvas, host.firstChild);
  var VS = "#version 300 es\\nvoid main() {\\n  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));\\n  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);\\n}\\n";
  var TYPES = { 5126: "1f", 35664: "2f", 35665: "3f", 35666: "4f", 5124: "1i", 35667: "2i", 35668: "3i", 35669: "4i", 5125: "1ui", 36294: "2ui", 36295: "3ui", 36296: "4ui", 35670: "1i", 35674: "M2", 35675: "M3", 35676: "M4" };
  var prog = 0, unis = {}, vao = 0, tex = 0, ok = false;
  var w = 0, h = 0, t = 0, start = 0, raf = 0, last = -1e9, visible = true, lost = false, dead = false;

  function put(u, a) {
    var k = u.k;
    if (k.charAt(0) === "M") gl["uniformMatrix" + k.charAt(1) + "fv"](u.l, false, new Float32Array(a));
    else if (k.slice(-2) === "ui") gl["uniform" + k + "v"](u.l, new Uint32Array(a));
    else if (k.slice(-1) === "i") gl["uniform" + k + "v"](u.l, new Int32Array(a));
    else gl["uniform" + k + "v"](u.l, new Float32Array(a));
  }
  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      if (window.console) console.warn("musterli-shader:", gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return 0;
    }
    return s;
  }
  function init() {
    ok = false;
    unis = {};
    var vs = shader(gl.VERTEX_SHADER, VS), fs = vs && shader(gl.FRAGMENT_SHADER, cfg.f);
    if (!vs || !fs) return;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    var count = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < count; i++) {
      var info = gl.getActiveUniform(prog, i);
      if (!info) continue;
      var name = info.name.replace(/\\[0\\]$/, "");
      var loc = gl.getUniformLocation(prog, info.name);
      if (loc && TYPES[info.type]) unis[name] = { l: loc, k: TYPES[info.type] };
    }
    for (var key in cfg.u) if (unis[key]) put(unis[key], [].concat(cfg.u[key]));
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    if (cfg.p) {
      var bin = atob(cfg.p), bytes = new Uint8Array(bin.length);
      for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
      tex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, bytes.length / 4, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    }
    ok = true;
  }
  function draw() {
    if (!ok || lost || !w || !h) return;
    var n = cfg.n;
    if (n > 0) {
      var x = t * n, i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, f = x - Math.floor(x);
      for (var key in cfg.d) {
        var u = unis[key];
        if (!u) continue;
        var all = cfg.d[key], len = all.length / n, out = new Array(len);
        var smooth = u.k.slice(-1) === "f" || u.k.charAt(0) === "M";
        for (var c = 0; c < len; c++) {
          var a = all[i0 * len + c], b = all[i1 * len + c];
          out[c] = smooth ? a + (b - a) * f : (f < 0.5 ? a : b);
        }
        put(u, out);
      }
    }
    var W = canvas.width, H = canvas.height;
    if (unis.u_resolution) put(unis.u_resolution, [W, H]);
    if (unis.u_tileOrigin) put(unis.u_tileOrigin, [0, 0]);
    if (unis.u_tileSize) put(unis.u_tileSize, [W, H]);
    if (unis.u_design) put(unis.u_design, [w, h]);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function moving() {
    return cfg.l > 0 && cfg.n > 0 && !opt.still && !(reduce && reduce.matches);
  }
  function tick(now) {
    raf = 0;
    if (dead || lost || !visible || document.hidden || !moving()) return;
    if (now - last >= 1000 / fps - 1) {
      last = now;
      t = (((now - start) / 1000 / cfg.l) % 1 + 1) % 1;
      draw();
    }
    raf = requestAnimationFrame(tick);
  }
  function play() {
    if (raf || dead) return;
    if (!moving()) {
      t = 0;
      draw();
      return;
    }
    var now = performance.now();
    start = now - t * cfg.l * 1000;
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function resize() {
    var r = host.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    w = Math.max(1, Math.round(r.width));
    h = Math.max(1, Math.round(r.height));
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    draw();
  }
  function onLost(e) {
    e.preventDefault();
    lost = true;
    pause();
  }
  function onRestored() {
    lost = false;
    init();
    resize();
    play();
  }
  function onVisibility() {
    if (document.hidden) pause();
    else play();
  }
  function onMotion() {
    pause();
    play();
  }
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  document.addEventListener("visibilitychange", onVisibility);
  if (reduce && reduce.addEventListener) reduce.addEventListener("change", onMotion);
  var ro = window.ResizeObserver ? new ResizeObserver(resize) : 0;
  if (ro) ro.observe(host);
  else window.addEventListener("resize", resize);
  var io = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) play();
    else pause();
  }) : 0;
  if (io) io.observe(host);
  init();
  resize();
  play();
  return {
    destroy: function () {
      if (dead) return;
      dead = true;
      pause();
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
      if (io) io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (reduce && reduce.removeEventListener) reduce.removeEventListener("change", onMotion);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      var ext = gl.getExtension("WEBGL_lose_context");
      if (ext) ext.loseContext();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    }
  };
}`;
