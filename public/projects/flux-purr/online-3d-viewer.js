/**
 * Bundled by jsDelivr using Rollup v4.62.2 and esbuild v0.28.1.
 * Original file: /npm/online-3d-viewer@0.18.0/build/engine/o3dv.module.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
import * as Tr from "https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm";
import * as I from "https://cdn.jsdelivr.net/npm/three@0.176.0/+esm";
import { ThreeMFLoader as Gn } from "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/3MFLoader.js/+esm";
import { AMFLoader as Rn } from "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/AMFLoader.js/+esm";
import { ColladaLoader as Sn } from "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/ColladaLoader.js/+esm";
import { FBXLoader as En } from "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/FBXLoader.js/+esm";
import { SVGLoader as Mr } from "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/SVGLoader.js/+esm";
import { TGALoader as Cr } from "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/TGALoader.js/+esm";
import { VRMLLoader as An } from "https://cdn.jsdelivr.net/npm/three@0.176.0/examples/jsm/loaders/VRMLLoader.js/+esm";
function Tt(s) {
  return s != null;
}
function Nn(s, e) {
  return s ?? e;
}
function jt(s, e) {
  if (Tt(s)) for (const t of Object.keys(s)) Tt(s[t]) && (e[t] = s[t]);
}
function yr(s) {
  return Object.keys(s).length === 0;
}
function Ir(s, ...e) {
  return s.replace(/{([0-9]+)}/g, (t, r) => (e[r] === void 0 ? t : e[r]));
}
function vr(s) {
  return s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
class Fn {
  constructor() {
    this.eventListeners = new Map();
  }
  AddEventListener(e, t) {
    this.eventListeners.has(e) || this.eventListeners.set(e, []),
      this.eventListeners.get(e).push(t);
  }
  HasEventListener(e) {
    return this.eventListeners.has(e);
  }
  GetEventNotifier(e) {
    return () => {
      this.NotifyEventListeners(e);
    };
  }
  NotifyEventListeners(e, ...t) {
    if (!this.eventListeners.has(e)) return;
    const r = this.eventListeners.get(e);
    for (const i of r) i(...t);
  }
}
let tt = null,
  Mt = null;
function Pn(s) {
  tt = s;
}
function Vn(s) {
  Mt = s;
}
function b(s) {
  return tt === null || Mt === null || !tt[s] || !tt[s][Mt] ? s : tt[s][Mt];
}
function _t(s, ...e) {
  return Ir(b(s), ...e);
}
class kt {
  constructor() {
    (this.count = null), (this.current = null), (this.callbacks = null);
  }
  Run(e, t) {
    (this.count = e),
      (this.current = 0),
      (this.callbacks = t),
      e === 0 ? this.TaskReady() : this.RunOnce();
  }
  RunBatch(e, t, r) {
    let i = 0;
    e > 0 && (i = parseInt((e - 1) / t, 10) + 1),
      this.Run(i, {
        runTask: (n, l) => {
          const o = n * t,
            a = Math.min((n + 1) * t, e) - 1;
          r.runTask(o, a, l);
        },
        onReady: r.onReady,
      });
  }
  RunOnce() {
    setTimeout(() => {
      this.callbacks.runTask(this.current, this.TaskReady.bind(this));
    }, 0);
  }
  TaskReady() {
    (this.current += 1),
      this.current < this.count
        ? this.RunOnce()
        : this.callbacks.onReady && this.callbacks.onReady();
  }
}
function Wt(s) {
  setTimeout(() => {
    s();
  }, 10);
}
function wr(s, e) {
  new kt().Run(s, e);
}
function br(s, e, t) {
  new kt().RunBatch(s, e, t);
}
function Er(s) {
  function e(t) {
    t() &&
      setTimeout(() => {
        e(t);
      }, 10);
  }
  e(s);
}
const We = 1e-8,
  Ln = 1e-4,
  Dn = 57.29577951308232,
  He = 0.017453292519943;
function rt(s) {
  return Math.abs(s) < We;
}
function Ht(s, e) {
  return e - s > We;
}
function Sr(s, e) {
  return s - e > We;
}
function yt(s, e) {
  return e - s > -1e-8;
}
function It(s, e) {
  return s - e > -1e-8;
}
function O(s, e) {
  return Math.abs(e - s) < We;
}
function On(s, e, t) {
  return Math.abs(e - s) < t;
}
function Te(s) {
  return s > We;
}
function it(s) {
  return s < -1e-8;
}
const V = { X: 1, Y: 2, Z: 3 };
class D {
  constructor(e, t) {
    (this.x = e), (this.y = t);
  }
  Clone() {
    return new D(this.x, this.y);
  }
}
function Ie(s, e) {
  return O(s.x, e.x) && O(s.y, e.y);
}
function Bn(s, e) {
  return new D(s.x + e.x, s.y + e.y);
}
function nt(s, e) {
  return new D(s.x - e.x, s.y - e.y);
}
function vt(s, e) {
  return Math.sqrt((s.x - e.x) * (s.x - e.x) + (s.y - e.y) * (s.y - e.y));
}
function qt(s, e) {
  return s.x * e.x + s.y * e.y;
}
class L {
  constructor(e, t, r) {
    (this.r = e), (this.g = t), (this.b = r);
  }
  Set(e, t, r) {
    (this.r = e), (this.g = t), (this.b = r);
  }
  Clone() {
    return new L(this.r, this.g, this.b);
  }
}
class $e {
  constructor(e, t, r, i) {
    (this.r = e), (this.g = t), (this.b = r), (this.a = i);
  }
  Set(e, t, r, i) {
    (this.r = e), (this.g = t), (this.b = r), (this.a = i);
  }
  Clone() {
    return new $e(this.r, this.g, this.b, this.a);
  }
}
function te(s) {
  return parseInt(Math.round(s * 255), 10);
}
function st(s) {
  return s / 255;
}
function Pe(s, e, t) {
  return new L(te(s), te(e), te(t));
}
function ve(s) {
  return s < 0.04045 ? s * 0.0773993808 : (s * 0.9478672986 + 0.0521327014) ** 2.4;
}
function lt(s) {
  return s < 0.0031308 ? s * 12.92 : 1.055 * s ** 0.41666 - 0.055;
}
function H(s) {
  let e = parseInt(s, 10).toString(16);
  for (; e.length < 2; ) e = "0" + e;
  return e;
}
function Ar(s) {
  const e = H(s.r),
    t = H(s.g),
    r = H(s.b);
  return e + t + r;
}
function Un(s) {
  const e = H(s.r),
    t = H(s.g),
    r = H(s.b),
    i = H(s.a);
  return e + t + r + i;
}
function zn(s) {
  if (s.length !== 6) return null;
  const e = parseInt(s.substring(0, 2), 16),
    t = parseInt(s.substring(2, 4), 16),
    r = parseInt(s.substring(4, 6), 16);
  return new L(e, t, r);
}
function jn(s) {
  if (s.length !== 6 && s.length !== 8) return null;
  let e = parseInt(s.substring(0, 2), 16),
    t = parseInt(s.substring(2, 4), 16),
    r = parseInt(s.substring(4, 6), 16),
    i = 255;
  return s.length === 8 && (i = parseInt(s.substring(6, 8), 16)), new $e(e, t, r, i);
}
function _n(s) {
  return new L(s[0], s[1], s[2]);
}
function qe(s, e) {
  return s.r === e.r && s.g === e.g && s.b === e.b;
}
class Xe {
  constructor() {
    (this.name = null),
      (this.mimeType = null),
      (this.buffer = null),
      (this.offset = new D(0, 0)),
      (this.scale = new D(1, 1)),
      (this.rotation = 0);
  }
  IsValid() {
    return this.name !== null && this.buffer !== null;
  }
  HasTransformation() {
    return !Ie(this.offset, new D(0, 0)) || !Ie(this.scale, new D(1, 1)) || !O(this.rotation, 0);
  }
  IsEqual(e) {
    return !(
      this.name !== e.name ||
      this.mimeType !== e.mimeType ||
      !Ie(this.offset, e.offset) ||
      !Ie(this.scale, e.scale) ||
      !O(this.rotation, e.rotation)
    );
  }
}
function Ve(s, e) {
  return s === null && e === null ? !0 : s === null || e === null ? !1 : s.IsEqual(e);
}
const de = { Phong: 1, Physical: 2 },
  X = { Model: 1, DefaultFace: 2, DefaultLine: 3 };
class Gr {
  constructor(e) {
    (this.type = e),
      (this.source = X.Model),
      (this.name = ""),
      (this.color = new L(0, 0, 0)),
      (this.vertexColors = !1);
  }
  IsEqual(e) {
    return !(
      this.type !== e.type ||
      this.source !== e.source ||
      this.name !== e.name ||
      !qe(this.color, e.color) ||
      this.vertexColors !== e.vertexColors
    );
  }
}
class Xt extends Gr {
  constructor(e) {
    super(e),
      (this.emissive = new L(0, 0, 0)),
      (this.opacity = 1),
      (this.transparent = !1),
      (this.diffuseMap = null),
      (this.bumpMap = null),
      (this.normalMap = null),
      (this.emissiveMap = null),
      (this.alphaTest = 0),
      (this.multiplyDiffuseMap = !1);
  }
  IsEqual(e) {
    return !(
      !super.IsEqual(e) ||
      !qe(this.emissive, e.emissive) ||
      !O(this.opacity, e.opacity) ||
      this.transparent !== e.transparent ||
      !Ve(this.diffuseMap, e.diffuseMap) ||
      !Ve(this.bumpMap, e.bumpMap) ||
      !Ve(this.normalMap, e.normalMap) ||
      !Ve(this.emissiveMap, e.emissiveMap) ||
      !O(this.alphaTest, e.alphaTest) ||
      this.multiplyDiffuseMap !== e.multiplyDiffuseMap
    );
  }
}
class Me extends Xt {
  constructor() {
    super(de.Phong),
      (this.ambient = new L(0, 0, 0)),
      (this.specular = new L(0, 0, 0)),
      (this.shininess = 0),
      (this.specularMap = null);
  }
  IsEqual(e) {
    return !(
      !super.IsEqual(e) ||
      !qe(this.ambient, e.ambient) ||
      !qe(this.specular, e.specular) ||
      !O(this.shininess, e.shininess) ||
      !Ve(this.specularMap, e.specularMap)
    );
  }
}
class Yt extends Xt {
  constructor() {
    super(de.Physical), (this.metalness = 0), (this.roughness = 1), (this.metalnessMap = null);
  }
  IsEqual(e) {
    return !(
      !super.IsEqual(e) ||
      !O(this.metalness, e.metalness) ||
      !O(this.roughness, e.roughness) ||
      !Ve(this.metalnessMap, e.metalnessMap)
    );
  }
}
function kn(s, e) {
  return !(
    s.name !== e.name ||
    s.mimeType !== e.mimeType ||
    !Ie(s.offset, e.offset) ||
    !Ie(s.scale, e.scale) ||
    !O(s.rotation, e.rotation)
  );
}
const Rr = new Set();
function wt(s) {
  return new Promise((e, t) => {
    if (Rr.has(s)) {
      e();
      return;
    }
    const r = document.createElement("script");
    (r.type = "text/javascript"),
      (r.src = s),
      (r.onload = () => {
        Rr.add(s), e();
      }),
      (r.onerror = () => {
        t();
      }),
      document.head.appendChild(r);
  });
}
function Ye(s, e, t) {
  let r = s.substring(e),
    i = r.indexOf(t);
  return i !== -1 && (r = r.substring(0, i)), r.trim();
}
function Je(s, e) {
  if (e !== null) {
    const t = s.indexOf(e);
    t !== -1 && (s = s.substring(0, t).trim());
  }
  return s.split(/\s+/u);
}
function Le(s, e) {
  function t(n, l) {
    const o = n.trim();
    o.length > 0 && l(o);
  }
  let r = 0,
    i = s.indexOf(
      `
`,
      r
    );
  for (; i !== -1; )
    t(s.substring(r, i), e),
      (r = i + 1),
      (i = s.indexOf(
        `
`,
        r
      ));
  t(s.substring(r), e);
}
function Nr(s) {
  return (s & (s - 1)) === 0;
}
function Wn(s) {
  if (Nr(s)) return s;
  const e = 2 ** Math.ceil(Math.log(s) / Math.log(2));
  return parseInt(e, 10);
}
function ye(s) {
  (s.transparent = !1), Ht(s.opacity, 1) && (s.transparent = !0);
}
class Ke {
  constructor(e) {
    (this.model = e), (this.colorToMaterialIndex = new Map());
  }
  GetMaterialIndex(e, t, r, i) {
    let n = H(e) + H(t) + H(r),
      l = i != null;
    if ((l && (n += H(i)), this.colorToMaterialIndex.has(n)))
      return this.colorToMaterialIndex.get(n);
    {
      const o = new Me();
      (o.name = n.toUpperCase()),
        (o.color = new L(e, t, r)),
        l && i < 255 && ((o.opacity = i / 255), ye(o));
      const a = this.model.AddMaterial(o);
      return this.colorToMaterialIndex.set(n, a), a;
    }
  }
}
let bt = null;
function Jt(s) {
  return new Promise((e, t) => {
    if (bt !== null) {
      e(new Worker(bt));
      return;
    }
    const r = "https://cdn.jsdelivr.net/npm/occt-import-js@0.0.22/dist/";
    fetch(r + "occt-import-js-worker.js")
      .then((i) => (i.ok ? i.text() : t()))
      .then((i) => {
        (i = i.replace("occt-import-js.js", r + "occt-import-js.js")),
          (i = i.replace("return path", "return '" + r + "occt-import-js.wasm'"));
        const n = new Blob([i], { type: "text/javascript" });
        return (bt = URL.createObjectURL(n)), e(new Worker(bt));
      })
      .catch(t);
  });
}
function ot(s) {
  return s === "rhino3dm"
    ? wt("https://cdn.jsdelivr.net/npm/rhino3dm@8.17.0/rhino3dm.min.js")
    : s === "webifc"
      ? wt("https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api-iife.js")
      : s === "draco3d"
        ? wt("https://cdn.jsdelivr.net/npm/draco3d@1.5.7/draco_decoder_nodejs.min.js")
        : null;
}
const we = { Url: 1, File: 2, Decompressed: 3 },
  Y = { Text: 1, Binary: 2 };
function oe(s) {
  let e = s,
    t = e.indexOf("?");
  t !== -1 && (e = e.substring(0, t));
  let r = e.lastIndexOf("/");
  return r === -1 && (r = e.lastIndexOf("\\")), r !== -1 && (e = e.substring(r + 1)), decodeURI(e);
}
function at(s) {
  const e = oe(s),
    t = e.lastIndexOf(".");
  return t === -1 ? "" : e.substring(t + 1).toLowerCase();
}
function Fr(s, e) {
  return new Promise((t, r) => {
    const i = new XMLHttpRequest();
    i.open("GET", s, !0),
      (i.onprogress = (n) => {
        e(n.loaded, n.total);
      }),
      (i.onload = () => {
        i.status === 200 ? t(i.response) : r();
      }),
      (i.onerror = () => {
        r();
      }),
      (i.responseType = "arraybuffer"),
      i.send(null);
  });
}
function Pr(s, e) {
  return new Promise((t, r) => {
    const i = new FileReader();
    (i.onprogress = (n) => {
      e(n.loaded, n.total);
    }),
      (i.onloadend = (n) => {
        n.target.readyState === FileReader.DONE && t(n.target.result);
      }),
      (i.onerror = () => {
        r();
      }),
      i.readAsArrayBuffer(s);
  });
}
function Vr(s) {
  for (let e = 0; e < s.length; e++) {
    let t = s[e];
    t.indexOf("www.dropbox.com") !== -1
      ? ((t = t.replace("www.dropbox.com", "dl.dropbox.com")), (s[e] = t))
      : t.indexOf("github.com") !== -1 &&
        ((t = t.replace("github.com", "raw.githubusercontent.com")),
        (t = t.replace("/blob", "")),
        (s[e] = t));
  }
}
function Hn(s) {
  const e = /^https?:\/\/\S+$/g;
  return s.match(e) !== null;
}
class v {
  constructor(e, t, r) {
    (this.x = e), (this.y = t), (this.z = r);
  }
  Length() {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }
  MultiplyScalar(e) {
    return (this.x *= e), (this.y *= e), (this.z *= e), this;
  }
  Normalize() {
    const e = this.Length();
    return e > 0 && this.MultiplyScalar(1 / e), this;
  }
  Offset(e, t) {
    const r = e.Clone().Normalize();
    return (this.x += r.x * t), (this.y += r.y * t), (this.z += r.z * t), this;
  }
  Rotate(e, t, r) {
    const i = e.Clone().Normalize(),
      n = i.x,
      l = i.y,
      o = i.z,
      a = this.x - r.x,
      u = this.y - r.y,
      h = this.z - r.z,
      d = Math.sin(t),
      f = Math.cos(t);
    return (
      (this.x = -n * (-n * a - l * u - o * h) * (1 - f) + a * f + (-o * u + l * h) * d),
      (this.y = -l * (-n * a - l * u - o * h) * (1 - f) + u * f + (o * a - n * h) * d),
      (this.z = -o * (-n * a - l * u - o * h) * (1 - f) + h * f + (-l * a + n * u) * d),
      (this.x += r.x),
      (this.y += r.y),
      (this.z += r.z),
      this
    );
  }
  Clone() {
    return new v(this.x, this.y, this.z);
  }
}
function be(s, e) {
  return O(s.x, e.x) && O(s.y, e.y) && O(s.z, e.z);
}
function Lr(s, e) {
  return new v(s.x + e.x, s.y + e.y, s.z + e.z);
}
function ae(s, e) {
  return new v(s.x - e.x, s.y - e.y, s.z - e.z);
}
function me(s, e) {
  return Math.sqrt(
    (s.x - e.x) * (s.x - e.x) + (s.y - e.y) * (s.y - e.y) + (s.z - e.z) * (s.z - e.z)
  );
}
function Kt(s, e) {
  return s.x * e.x + s.y * e.y + s.z * e.z;
}
function Dr(s, e) {
  const t = s.Clone().Normalize(),
    r = e.Clone().Normalize();
  if (be(t, r)) return 0;
  const i = Kt(t, r);
  return Math.acos(i);
}
function De(s, e) {
  const t = new v(0, 0, 0);
  return (
    (t.x = s.y * e.z - s.z * e.y), (t.y = s.z * e.x - s.x * e.z), (t.z = s.x * e.y - s.y * e.x), t
  );
}
function Et(s, e, t) {
  return Math.sqrt(s * s + e * e + t * t);
}
function Ee(s) {
  return new v(s[0], s[1], s[2]);
}
class Or {
  constructor() {
    (this.indices = []),
      (this.vertices = []),
      (this.colors = []),
      (this.normals = []),
      (this.uvs = []),
      (this.material = null);
  }
  GetBounds() {
    const e = [1 / 0, 1 / 0, 1 / 0],
      t = [-1 / 0, -1 / 0, -1 / 0];
    for (let r = 0; r < this.vertices.length / 3; r++)
      for (let i = 0; i < 3; i++)
        (e[i] = Math.min(e[i], this.vertices[r * 3 + i])),
          (t[i] = Math.max(t[i], this.vertices[r * 3 + i]));
    return { min: e, max: t };
  }
  GetByteLength(e, t) {
    const r = this.indices.length,
      i = this.vertices.length + this.colors.length + this.normals.length + this.uvs.length;
    return r * e + i * t;
  }
}
class Br {
  constructor() {
    this.primitives = [];
  }
  PrimitiveCount() {
    return this.primitives.length;
  }
  GetPrimitive(e) {
    return this.primitives[e];
  }
  GetByteLength(e, t) {
    let r = 0;
    for (let i = 0; i < this.primitives.length; i++) {
      const n = this.primitives[i];
      r += n.GetByteLength(e, t);
    }
    return r;
  }
}
function Zt(s) {
  function e(o, a, u, h) {
    function d(p, g, x) {
      return g !== null ? p.GetVertexColor(g) : x ? new L(0, 0, 0) : null;
    }
    function f(p, g, x) {
      return g !== null ? p.GetTextureUV(g) : x ? new D(0, 0) : null;
    }
    function c(p, g, x) {
      const C = p.VertexColorCount() > 0,
        T = p.TextureUVCount() > 0,
        M = p.GetVertex(g.vertex),
        y = p.GetNormal(g.normal),
        w = x.vertices.length / 3;
      x.indices.push(w), x.vertices.push(M.x, M.y, M.z);
      const E = d(p, g.color, C);
      E !== null && x.colors.push(E.r / 255, E.g / 255, E.b / 255), x.normals.push(y.x, y.y, y.z);
      const S = f(p, g.uv, T);
      return S !== null && x.uvs.push(S.x, S.y), { index: w, color: E, normal: y, uv: S };
    }
    function m(p, g, x) {
      function C(y, w, E) {
        if (E === null && w === null) return !0;
        const S = d(y, w, !0);
        return qe(E, S);
      }
      function T(y, w, E) {
        const S = y.GetNormal(w);
        return be(E, S);
      }
      function M(y, w, E) {
        if (E === null && w === null) return !0;
        const S = f(y, w, !0);
        return Ie(E, S);
      }
      for (let y = 0; y < g.length; y++) {
        const w = g[y],
          E = C(p, x.color, w.color),
          S = T(p, x.normal, w.normal),
          F = M(p, x.uv, w.uv);
        if (E && S && F) return w;
      }
      return null;
    }
    if (h.has(a.vertex)) {
      const p = h.get(a.vertex),
        g = m(o, p, a);
      if (g !== null) u.indices.push(g.index);
      else {
        const x = c(o, a, u);
        p.push(x);
      }
    } else {
      const p = c(o, a, u);
      h.set(a.vertex, [p]);
    }
  }
  const t = new Br(),
    r = s.TriangleCount();
  if (r === 0) return null;
  const i = [];
  for (let o = 0; o < r; o++) i.push(o);
  i.sort((o, a) => {
    const u = s.GetTriangle(o),
      h = s.GetTriangle(a);
    return u.mat - h.mat;
  });
  let n = null,
    l = null;
  for (let o = 0; o < i.length; o++) {
    const a = i[o],
      u = s.GetTriangle(a);
    (n === null || n.material !== u.mat) &&
      ((n = new Or()), (n.material = u.mat), (l = new Map()), t.primitives.push(n));
    const h = { vertex: u.v0, color: u.c0, normal: u.n0, uv: u.u0 },
      d = { vertex: u.v1, color: u.c1, normal: u.n1, uv: u.u1 },
      f = { vertex: u.v2, color: u.c2, normal: u.n2, uv: u.u2 };
    e(s, h, n, l), e(s, d, n, l), e(s, f, n, l);
  }
  return t;
}
function fe(s) {
  return new TextDecoder("utf-8").decode(s);
}
function qn(s) {
  let e = "",
    t = new Uint8Array(s);
  for (let r = 0; r < t.byteLength; r++) e += String.fromCharCode(t[r]);
  return e;
}
function Xn(s) {
  const e = new ArrayBuffer(s.length),
    t = new Uint8Array(e);
  for (let r = 0; r < s.length; r++) t[r] = s.charCodeAt(r);
  return e;
}
function Qt(s) {
  return new TextEncoder().encode(s).buffer;
}
function St(s) {
  const e = "data:";
  if (!s.startsWith(e)) return null;
  const t = s.indexOf(";");
  if (t === -1) return null;
  const r = s.indexOf(",");
  if (r === -1) return null;
  const i = s.substring(e.length, e.length + t - 5),
    n = atob(s.substring(r + 1)),
    l = new ArrayBuffer(n.length),
    o = new Uint8Array(l);
  for (let a = 0; a < n.length; a++) o[a] = n.charCodeAt(a);
  return { mimeType: i, buffer: l };
}
function ut(s) {
  if (s == null) return "";
  const e = s.split("/");
  return e.length === 0 ? "" : e[e.length - 1];
}
function At(s) {
  const e = new Blob([s]);
  return URL.createObjectURL(e);
}
function Ur(s, e) {
  const t = new Blob([s], { type: e });
  return URL.createObjectURL(t);
}
function zr(s) {
  URL.revokeObjectURL(s);
}
class J {
  constructor(e) {
    (this.name = e), (this.content = null);
  }
  GetName() {
    return this.name;
  }
  SetName(e) {
    this.name = e;
  }
  GetTextContent() {
    return fe(this.content);
  }
  GetBufferContent() {
    return this.content;
  }
  SetTextContent(e) {
    const t = Qt(e);
    this.content = t;
  }
  SetBufferContent(e) {
    this.content = e;
  }
}
class Se {
  constructor() {}
  CanExport(e, t) {
    return !1;
  }
  Export(e, t, r) {
    const i = [];
    this.ExportContent(e, t, i, () => {
      r(i);
    });
  }
  ExportContent(e, t, r, i) {}
  GetExportedMaterialName(e) {
    return this.GetExportedName(e, b("Material"));
  }
  GetExportedMeshName(e) {
    return this.GetExportedName(e, b("Mesh"));
  }
  GetExportedName(e, t) {
    return e.length === 0 ? t : e;
  }
}
class jr extends Se {
  constructor() {
    super(), (this.rhino = null);
  }
  CanExport(e, t) {
    return e === Y.Binary && t === "3dm";
  }
  ExportContent(e, t, r, i) {
    this.rhino === null
      ? ot("rhino3dm")
          .then(() => {
            rhino3dm().then((n) => {
              (this.rhino = n), this.ExportRhinoContent(e, r, i);
            });
          })
          .catch(() => {
            i();
          })
      : this.ExportRhinoContent(e, r, i);
  }
  ExportRhinoContent(e, t, r) {
    function i(u) {
      return { r: u.r, g: u.g, b: u.b, a: 255 };
    }
    const n = new J("model.3dm");
    t.push(n);
    const l = new this.rhino.File3dm();
    e.EnumerateTransformedMeshInstances((u) => {
      const h = Zt(u);
      for (let d = 0; d < h.PrimitiveCount(); d++) {
        const f = h.GetPrimitive(d),
          c = {
            data: {
              attributes: {
                position: { itemSize: 3, type: "Float32Array", array: f.vertices },
                normal: { itemSize: 3, type: "Float32Array", array: f.normals },
              },
              index: { type: "Uint16Array", array: f.indices },
            },
          },
          m = e.GetMaterial(f.material),
          p = new this.rhino.Material();
        (p.name = this.GetExportedMaterialName(m.name)),
          m.type === de.Phong &&
            ((p.ambientColor = i(m.ambient)), (p.specularColor = i(m.specular))),
          (p.diffuseColor = i(m.color)),
          (p.transparency = 1 - m.opacity);
        const g = l.materials().count;
        l.materials().add(p);
        const x = new this.rhino.Mesh.createFromThreejsJSON(c),
          C = new this.rhino.ObjectAttributes();
        (C.name = this.GetExportedMeshName(u.GetName())),
          (C.materialSource = this.rhino.ObjectMaterialSource.MaterialFromObject),
          (C.materialIndex = g),
          l.objects().add(x, C);
      }
    });
    const o = new this.rhino.File3dmWriteOptions();
    o.version = 6;
    const a = l.toByteArrayOptions(o);
    n.SetBufferContent(a), r();
  }
}
const U = { Text: 1, Integer: 2, Number: 3, Boolean: 4, Percent: 5, Color: 6 };
class z {
  constructor(e, t, r) {
    (this.type = e), (this.name = t), (this.value = r);
  }
  Clone() {
    return this.type === U.Color
      ? new z(this.type, this.name, this.value.Clone())
      : new z(this.type, this.name, this.value);
  }
}
class xe {
  constructor(e) {
    (this.name = e), (this.properties = []);
  }
  PropertyCount() {
    return this.properties.length;
  }
  AddProperty(e) {
    this.properties.push(e);
  }
  GetProperty(e) {
    return this.properties[e];
  }
  Clone() {
    const e = new xe(this.name);
    for (const t of this.properties) e.AddProperty(t.Clone());
    return e;
  }
}
function _r(s) {
  return s.type === U.Text
    ? vr(s.value)
    : s.type === U.Integer
      ? s.value.toLocaleString()
      : s.type === U.Number
        ? s.value.toLocaleString(void 0, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : s.type === U.Boolean
          ? s.value
            ? b("True")
            : b("False")
          : s.type === U.Percent
            ? parseInt(s.value * 100, 10).toString() + "%"
            : s.type === U.Color
              ? "#" + Ar(s.value)
              : null;
}
function Yn() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (e) => {
    const t = (Math.random() * 16) | 0;
    return (e === "x" ? t : (t & 3) | 8).toString(16);
  });
}
class kr extends Se {
  constructor() {
    super();
  }
  CanExport(e, t) {
    return e === Y.Text && t === "bim";
  }
  ExportContent(e, t, r, i) {
    const n = { schema_version: "1.1.0", meshes: [], elements: [], info: {} };
    this.ExportProperties(e.GetModel(), n.info);
    let l = 0;
    e.EnumerateTransformedMeshInstances((a) => {
      const u = { mesh_id: l, coordinates: [], indices: [] };
      a.EnumerateVertices((m) => {
        u.coordinates.push(m.x, m.y, m.z);
      }),
        a.EnumerateTriangleVertexIndices((m, p, g) => {
          u.indices.push(m, p, g);
        });
      let h = {
          mesh_id: l,
          type: "Other",
          color: { r: 200, g: 200, b: 200, a: 255 },
          vector: { x: 0, y: 0, z: 0 },
          rotation: { qx: 0, qy: 0, qz: 0, qw: 1 },
          guid: Yn(),
          info: {},
        },
        d = null,
        f = !0,
        c = [];
      for (let m = 0; m < a.TriangleCount(); m++) {
        const p = a.GetTriangle(m),
          g = e.GetMaterial(p.mat),
          x = {
            r: Math.round(g.color.r),
            g: Math.round(g.color.g),
            b: Math.round(g.color.b),
            a: te(g.opacity),
          };
        c.push(x.r, x.g, x.b, x.a),
          f &&
            (d === null
              ? (d = x)
              : (d.r !== x.r || d.g !== x.g || d.b !== x.b || d.a !== x.a) &&
                ((f = !1), (d = null)));
      }
      f ? (h.color = d) : (h.face_colors = c),
        (h.info.Name = a.GetName()),
        this.ExportProperties(a, h.info),
        n.meshes.push(u),
        n.elements.push(h),
        (l += 1);
    });
    const o = new J("model.bim");
    o.SetTextContent(JSON.stringify(n, null, 4)), r.push(o), i();
  }
  ExportProperties(e, t) {
    for (let r = 0; r < e.PropertyGroupCount(); r++) {
      const i = e.GetPropertyGroup(r);
      for (let n = 0; n < i.PropertyCount(); n++) {
        const l = i.GetProperty(n);
        t[l.name] = _r(l);
      }
    }
  }
}
class ht {
  constructor(e, t) {
    (this.arrayBuffer = new ArrayBuffer(e)),
      (this.dataView = new DataView(this.arrayBuffer)),
      (this.isLittleEndian = t),
      (this.position = 0);
  }
  GetPosition() {
    return this.position;
  }
  SetPosition(e) {
    this.position = e;
  }
  End() {
    return this.position >= this.arrayBuffer.byteLength;
  }
  GetBuffer() {
    return this.arrayBuffer;
  }
  WriteArrayBuffer(e) {
    const t = new Uint8Array(e);
    new Uint8Array(this.arrayBuffer).set(t, this.position), (this.position += e.byteLength);
  }
  WriteBoolean8(e) {
    this.dataView.setInt8(this.position, e ? 1 : 0), (this.position = this.position + 1);
  }
  WriteCharacter8(e) {
    this.dataView.setInt8(this.position, e), (this.position = this.position + 1);
  }
  WriteUnsignedCharacter8(e) {
    this.dataView.setUint8(this.position, e), (this.position = this.position + 1);
  }
  WriteInteger16(e) {
    this.dataView.setInt16(this.position, e, this.isLittleEndian),
      (this.position = this.position + 2);
  }
  WriteUnsignedInteger16(e) {
    this.dataView.setUint16(this.position, e, this.isLittleEndian),
      (this.position = this.position + 2);
  }
  WriteInteger32(e) {
    this.dataView.setInt32(this.position, e, this.isLittleEndian),
      (this.position = this.position + 4);
  }
  WriteUnsignedInteger32(e) {
    this.dataView.setUint32(this.position, e, this.isLittleEndian),
      (this.position = this.position + 4);
  }
  WriteFloat32(e) {
    this.dataView.setFloat32(this.position, e, this.isLittleEndian),
      (this.position = this.position + 4);
  }
  WriteDouble64(e) {
    this.dataView.setFloat64(this.position, e, this.isLittleEndian),
      (this.position = this.position + 8);
  }
}
class _e {
  constructor(e, t, r, i) {
    (this.x = e), (this.y = t), (this.z = r), (this.w = i);
  }
  Clone() {
    return new _e(this.x, this.y, this.z, this.w);
  }
}
class pe {
  constructor(e, t, r, i) {
    (this.x = e), (this.y = t), (this.z = r), (this.w = i);
  }
}
function Jn(s, e) {
  return O(s.x, e.x) && O(s.y, e.y) && O(s.z, e.z) && O(s.w, e.w);
}
function $t(s) {
  return new pe(s[0], s[1], s[2], s[3]);
}
function Wr(s, e) {
  const t = e / 2,
    r = Math.sin(t);
  return new pe(s.x * r, s.y * r, s.z * r, Math.cos(t));
}
function Kn(s, e, t, r) {
  const i = Math.cos(s / 2),
    n = Math.cos(e / 2),
    l = Math.cos(t / 2),
    o = Math.sin(s / 2),
    a = Math.sin(e / 2),
    u = Math.sin(t / 2);
  const h = new pe(0, 0, 0, 1);
  if (r === "XYZ")
    (h.x = o * n * l + i * a * u),
      (h.y = i * a * l - o * n * u),
      (h.z = i * n * u + o * a * l),
      (h.w = i * n * l - o * a * u);
  else if (r === "YXZ")
    (h.x = o * n * l + i * a * u),
      (h.y = i * a * l - o * n * u),
      (h.z = i * n * u - o * a * l),
      (h.w = i * n * l + o * a * u);
  else if (r === "ZXY")
    (h.x = o * n * l - i * a * u),
      (h.y = i * a * l + o * n * u),
      (h.z = i * n * u + o * a * l),
      (h.w = i * n * l - o * a * u);
  else if (r === "ZYX")
    (h.x = o * n * l - i * a * u),
      (h.y = i * a * l + o * n * u),
      (h.z = i * n * u - o * a * l),
      (h.w = i * n * l + o * a * u);
  else if (r === "YZX")
    (h.x = o * n * l + i * a * u),
      (h.y = i * a * l + o * n * u),
      (h.z = i * n * u - o * a * l),
      (h.w = i * n * l - o * a * u);
  else if (r === "XZY")
    (h.x = o * n * l - i * a * u),
      (h.y = i * a * l - o * n * u),
      (h.z = i * n * u + o * a * l),
      (h.w = i * n * l + o * a * u);
  else return null;
  return h;
}
class j {
  constructor(e) {
    (this.matrix = null), e != null && (this.matrix = e);
  }
  IsValid() {
    return this.matrix !== null;
  }
  Set(e) {
    return (this.matrix = e), this;
  }
  Get() {
    return this.matrix;
  }
  Clone() {
    const e = [
      this.matrix[0],
      this.matrix[1],
      this.matrix[2],
      this.matrix[3],
      this.matrix[4],
      this.matrix[5],
      this.matrix[6],
      this.matrix[7],
      this.matrix[8],
      this.matrix[9],
      this.matrix[10],
      this.matrix[11],
      this.matrix[12],
      this.matrix[13],
      this.matrix[14],
      this.matrix[15],
    ];
    return new j(e);
  }
  CreateIdentity() {
    return (this.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), this;
  }
  IsIdentity() {
    const e = new j().CreateIdentity().Get();
    for (let t = 0; t < 16; t++) if (!O(this.matrix[t], e[t])) return !1;
    return !0;
  }
  CreateTranslation(e, t, r) {
    return (this.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, e, t, r, 1]), this;
  }
  CreateRotation(e, t, r, i) {
    const n = e + e,
      l = t + t,
      o = r + r,
      a = e * n,
      u = e * l,
      h = e * o,
      d = t * l,
      f = t * o,
      c = r * o,
      m = i * n,
      p = i * l,
      g = i * o;
    return (
      (this.matrix = [
        1 - (d + c),
        u + g,
        h - p,
        0,
        u - g,
        1 - (a + c),
        f + m,
        0,
        h + p,
        f - m,
        1 - (a + d),
        0,
        0,
        0,
        0,
        1,
      ]),
      this
    );
  }
  CreateRotationAxisAngle(e, t) {
    const r = Wr(e, t);
    return this.CreateRotation(r.x, r.y, r.z, r.w);
  }
  CreateScale(e, t, r) {
    return (this.matrix = [e, 0, 0, 0, 0, t, 0, 0, 0, 0, r, 0, 0, 0, 0, 1]), this;
  }
  ComposeTRS(e, t, r) {
    const i = e.x,
      n = e.y,
      l = e.z,
      o = t.x,
      a = t.y,
      u = t.z,
      h = t.w,
      d = r.x,
      f = r.y,
      c = r.z,
      m = o + o,
      p = a + a,
      g = u + u,
      x = o * m,
      C = o * p,
      T = o * g,
      M = a * p,
      y = a * g,
      w = u * g,
      E = h * m,
      S = h * p,
      F = h * g;
    return (
      (this.matrix = [
        (1 - (M + w)) * d,
        (C + F) * d,
        (T - S) * d,
        0,
        (C - F) * f,
        (1 - (x + w)) * f,
        (y + E) * f,
        0,
        (T + S) * c,
        (y - E) * c,
        (1 - (x + M)) * c,
        0,
        i,
        n,
        l,
        1,
      ]),
      this
    );
  }
  DecomposeTRS() {
    let e = new v(this.matrix[12], this.matrix[13], this.matrix[14]),
      t = Et(this.matrix[0], this.matrix[1], this.matrix[2]),
      r = Et(this.matrix[4], this.matrix[5], this.matrix[6]),
      i = Et(this.matrix[8], this.matrix[9], this.matrix[10]),
      n = this.Determinant();
    it(n) && (t *= -1);
    let l = new v(t, r, i),
      o = this.matrix[0] / t,
      a = this.matrix[4] / r,
      u = this.matrix[8] / i,
      h = this.matrix[1] / t,
      d = this.matrix[5] / r,
      f = this.matrix[9] / i,
      c = this.matrix[2] / t,
      m = this.matrix[6] / r,
      p = this.matrix[10] / i,
      g = null,
      x = o + d + p;
    if (x > 0) {
      const C = Math.sqrt(x + 1) * 2;
      g = new pe((m - f) / C, (u - c) / C, (h - a) / C, 0.25 * C);
    } else if (o > d && o > p) {
      const C = Math.sqrt(1 + o - d - p) * 2;
      g = new pe(0.25 * C, (a + h) / C, (u + c) / C, (m - f) / C);
    } else if (d > p) {
      const C = Math.sqrt(1 + d - o - p) * 2;
      g = new pe((a + h) / C, 0.25 * C, (f + m) / C, (u - c) / C);
    } else {
      const C = Math.sqrt(1 + p - o - d) * 2;
      g = new pe((u + c) / C, (f + m) / C, 0.25 * C, (h - a) / C);
    }
    return { translation: e, rotation: g, scale: l };
  }
  Determinant() {
    const e = this.matrix[0],
      t = this.matrix[1],
      r = this.matrix[2],
      i = this.matrix[3],
      n = this.matrix[4],
      l = this.matrix[5],
      o = this.matrix[6],
      a = this.matrix[7],
      u = this.matrix[8],
      h = this.matrix[9],
      d = this.matrix[10],
      f = this.matrix[11],
      c = this.matrix[12],
      m = this.matrix[13],
      p = this.matrix[14],
      g = this.matrix[15],
      x = e * l - t * n,
      C = e * o - r * n,
      T = e * a - i * n,
      M = t * o - r * l,
      y = t * a - i * l,
      w = r * a - i * o,
      E = u * m - h * c,
      S = u * p - d * c,
      F = u * g - f * c,
      P = h * p - d * m,
      G = h * g - f * m,
      R = d * g - f * p;
    return x * R - C * G + T * P + M * F - y * S + w * E;
  }
  Invert() {
    const e = this.matrix[0],
      t = this.matrix[1],
      r = this.matrix[2],
      i = this.matrix[3],
      n = this.matrix[4],
      l = this.matrix[5],
      o = this.matrix[6],
      a = this.matrix[7],
      u = this.matrix[8],
      h = this.matrix[9],
      d = this.matrix[10],
      f = this.matrix[11],
      c = this.matrix[12],
      m = this.matrix[13],
      p = this.matrix[14],
      g = this.matrix[15],
      x = e * l - t * n,
      C = e * o - r * n,
      T = e * a - i * n,
      M = t * o - r * l,
      y = t * a - i * l,
      w = r * a - i * o,
      E = u * m - h * c,
      S = u * p - d * c,
      F = u * g - f * c,
      P = h * p - d * m,
      G = h * g - f * m,
      R = d * g - f * p,
      N = x * R - C * G + T * P + M * F - y * S + w * E;
    if (O(N, 0)) return null;
    const W = [
      (l * R - o * G + a * P) / N,
      (r * G - t * R - i * P) / N,
      (m * w - p * y + g * M) / N,
      (d * y - h * w - f * M) / N,
      (o * F - n * R - a * S) / N,
      (e * R - r * F + i * S) / N,
      (p * T - c * w - g * C) / N,
      (u * w - d * T + f * C) / N,
      (n * G - l * F + a * E) / N,
      (t * F - e * G - i * E) / N,
      (c * y - m * T + g * x) / N,
      (h * T - u * y - f * x) / N,
      (l * S - n * P - o * E) / N,
      (e * P - t * S + r * E) / N,
      (m * C - c * M - p * x) / N,
      (u * M - h * C + d * x) / N,
    ];
    return new j(W);
  }
  Transpose() {
    const e = [
      this.matrix[0],
      this.matrix[4],
      this.matrix[8],
      this.matrix[12],
      this.matrix[1],
      this.matrix[5],
      this.matrix[9],
      this.matrix[13],
      this.matrix[2],
      this.matrix[6],
      this.matrix[10],
      this.matrix[14],
      this.matrix[3],
      this.matrix[7],
      this.matrix[11],
      this.matrix[15],
    ];
    return new j(e);
  }
  InvertTranspose() {
    const e = this.Invert();
    return e === null ? null : e.Transpose();
  }
  MultiplyVector(e) {
    const t = e.x,
      r = e.y,
      i = e.z,
      n = e.w,
      l = this.matrix[0],
      o = this.matrix[1],
      a = this.matrix[2],
      u = this.matrix[3],
      h = this.matrix[4],
      d = this.matrix[5],
      f = this.matrix[6],
      c = this.matrix[7],
      m = this.matrix[8],
      p = this.matrix[9],
      g = this.matrix[10],
      x = this.matrix[11],
      C = this.matrix[12],
      T = this.matrix[13],
      M = this.matrix[14],
      y = this.matrix[15];
    return new _e(
      t * l + r * h + i * m + n * C,
      t * o + r * d + i * p + n * T,
      t * a + r * f + i * g + n * M,
      t * u + r * c + i * x + n * y
    );
  }
  MultiplyMatrix(e) {
    const t = this.matrix[0],
      r = this.matrix[1],
      i = this.matrix[2],
      n = this.matrix[3],
      l = this.matrix[4],
      o = this.matrix[5],
      a = this.matrix[6],
      u = this.matrix[7],
      h = this.matrix[8],
      d = this.matrix[9],
      f = this.matrix[10],
      c = this.matrix[11],
      m = this.matrix[12],
      p = this.matrix[13],
      g = this.matrix[14],
      x = this.matrix[15],
      C = e.matrix[0],
      T = e.matrix[1],
      M = e.matrix[2],
      y = e.matrix[3],
      w = e.matrix[4],
      E = e.matrix[5],
      S = e.matrix[6],
      F = e.matrix[7],
      P = e.matrix[8],
      G = e.matrix[9],
      R = e.matrix[10],
      N = e.matrix[11],
      W = e.matrix[12],
      ne = e.matrix[13],
      se = e.matrix[14],
      he = e.matrix[15],
      ee = [
        t * C + r * w + i * P + n * W,
        t * T + r * E + i * G + n * ne,
        t * M + r * S + i * R + n * se,
        t * y + r * F + i * N + n * he,
        l * C + o * w + a * P + u * W,
        l * T + o * E + a * G + u * ne,
        l * M + o * S + a * R + u * se,
        l * y + o * F + a * N + u * he,
        h * C + d * w + f * P + c * W,
        h * T + d * E + f * G + c * ne,
        h * M + d * S + f * R + c * se,
        h * y + d * F + f * N + c * he,
        m * C + p * w + g * P + x * W,
        m * T + p * E + g * G + x * ne,
        m * M + p * S + g * R + x * se,
        m * y + p * F + g * N + x * he,
      ];
    return new j(ee);
  }
}
function Hr(s, e) {
  const t = s.Get(),
    r = e.Get();
  for (let i = 0; i < 16; i++) if (!O(t[i], r[i])) return !1;
  return !0;
}
class ie {
  constructor(e) {
    e != null ? (this.matrix = e) : ((this.matrix = new j()), this.matrix.CreateIdentity());
  }
  SetMatrix(e) {
    return (this.matrix = e), this;
  }
  GetMatrix() {
    return this.matrix;
  }
  IsIdentity() {
    return this.matrix.IsIdentity();
  }
  AppendMatrix(e) {
    return (this.matrix = this.matrix.MultiplyMatrix(e)), this;
  }
  Append(e) {
    return this.AppendMatrix(e.GetMatrix()), this;
  }
  TransformCoord3D(e) {
    const t = new _e(e.x, e.y, e.z, 1),
      r = this.matrix.MultiplyVector(t);
    return new v(r.x, r.y, r.z);
  }
  Clone() {
    const e = this.matrix.Clone();
    return new ie(e);
  }
}
function Zn(s, e) {
  return Hr(s.GetMatrix(), e.GetMatrix());
}
function Gt(s) {
  return s.LineCount() === 0 && s.TriangleCount() === 0;
}
function Rt(s, e, t) {
  const r = ae(e, s),
    i = ae(t, s),
    n = De(r, i);
  return n.Normalize(), n;
}
function dt(s, e) {
  if (!e.IsIdentity()) {
    for (let t = 0; t < s.VertexCount(); t++) {
      const r = s.GetVertex(t),
        i = e.TransformCoord3D(r);
      (r.x = i.x), (r.y = i.y), (r.z = i.z);
    }
    if (s.NormalCount() > 0) {
      const t = e.GetMatrix().InvertTranspose();
      if (t !== null) {
        const r = new ie(t);
        for (let i = 0; i < s.NormalCount(); i++) {
          const n = s.GetNormal(i),
            l = r.TransformCoord3D(n);
          (n.x = l.x), (n.y = l.y), (n.z = l.z);
        }
      }
    }
  }
}
function qr(s) {
  for (let e = 0; e < s.TriangleCount(); e++) {
    const t = s.GetTriangle(e),
      r = t.v1;
    (t.v1 = t.v2), (t.v2 = r);
  }
}
class Xr {
  constructor() {}
  VertexCount() {
    return 0;
  }
  VertexColorCount() {
    return 0;
  }
  NormalCount() {
    return 0;
  }
  TextureUVCount() {
    return 0;
  }
  LineCount() {
    return 0;
  }
  LineSegmentCount() {
    return 0;
  }
  TriangleCount() {
    return 0;
  }
  EnumerateVertices(e) {}
  EnumerateTriangleVertexIndices(e) {}
  EnumerateTriangleVertices(e) {}
}
class Nt extends Xr {
  constructor() {
    super(), (this.name = ""), (this.propertyGroups = []);
  }
  GetName() {
    return this.name;
  }
  SetName(e) {
    this.name = e;
  }
  PropertyGroupCount() {
    return this.propertyGroups.length;
  }
  AddPropertyGroup(e) {
    return this.propertyGroups.push(e), this.propertyGroups.length - 1;
  }
  GetPropertyGroup(e) {
    return this.propertyGroups[e];
  }
  CloneProperties(e) {
    for (const t of this.propertyGroups) e.AddPropertyGroup(t.Clone());
  }
}
class Ze {
  constructor(e, t) {
    (this.nodeId = e), (this.meshIndex = t);
  }
  IsEqual(e) {
    return this.nodeId === e.nodeId && this.meshIndex === e.meshIndex;
  }
  GetKey() {
    return this.nodeId.toString() + ":" + this.meshIndex.toString();
  }
}
class Ft extends Nt {
  constructor(e, t, r) {
    super(), (this.id = e), (this.node = t), (this.mesh = r);
  }
  GetId() {
    return this.id;
  }
  GetTransformation() {
    return this.node.GetWorldTransformation();
  }
  GetMesh() {
    return this.mesh;
  }
  VertexCount() {
    return this.mesh.VertexCount();
  }
  VertexColorCount() {
    return this.mesh.VertexColorCount();
  }
  NormalCount() {
    return this.mesh.NormalCount();
  }
  TextureUVCount() {
    return this.mesh.TextureUVCount();
  }
  LineCount() {
    return this.mesh.LineCount();
  }
  LineSegmentCount() {
    return this.mesh.LineSegmentCount();
  }
  TriangleCount() {
    return this.mesh.TriangleCount();
  }
  EnumerateVertices(e) {
    const t = this.node.GetWorldTransformation();
    t.IsIdentity()
      ? this.mesh.EnumerateVertices(e)
      : this.mesh.EnumerateVertices((r) => {
          const i = t.TransformCoord3D(r);
          e(i);
        });
  }
  EnumerateTriangleVertexIndices(e) {
    this.mesh.EnumerateTriangleVertexIndices(e);
  }
  EnumerateTriangleVertices(e) {
    const t = this.node.GetWorldTransformation();
    t.IsIdentity()
      ? this.mesh.EnumerateTriangleVertices(e)
      : this.mesh.EnumerateTriangleVertices((r, i, n) => {
          const l = t.TransformCoord3D(r),
            o = t.TransformCoord3D(i),
            a = t.TransformCoord3D(n);
          e(l, o, a);
        });
  }
  PropertyGroupCount() {
    return this.mesh.PropertyGroupCount();
  }
  AddPropertyGroup(e) {
    return this.mesh.AddPropertyGroup(e);
  }
  GetPropertyGroup(e) {
    return this.mesh.GetPropertyGroup(e);
  }
  GetTransformedMesh() {
    const e = this.node.GetWorldTransformation(),
      t = this.mesh.Clone();
    return dt(t, e), t;
  }
}
const Yr = { UNSIGNED_INT: 5125, FLOAT: 5126 },
  ft = { ARRAY_BUFFER: 34962, ELEMENT_ARRAY_BUFFER: 34963 };
class Jr extends Se {
  constructor() {
    super(),
      (this.components = {
        index: { type: Yr.UNSIGNED_INT, size: 4 },
        number: { type: Yr.FLOAT, size: 4 },
      });
  }
  CanExport(e, t) {
    return (e === Y.Text && t === "gltf") || (e === Y.Binary && t === "glb");
  }
  ExportContent(e, t, r, i) {
    t === Y.Text ? this.ExportAsciiContent(e, r) : t === Y.Binary && this.ExportBinaryContent(e, r),
      i();
  }
  ExportAsciiContent(e, t) {
    const r = new J("model.gltf"),
      i = new J("model.bin");
    t.push(r), t.push(i);
    const n = this.GetMeshData(e),
      l = this.GetMainBuffer(n),
      o = this.GetMainJson(e, n);
    o.buffers.push({ uri: i.GetName(), byteLength: l.byteLength });
    const a = new Map();
    this.ExportMaterials(e, o, (u) => {
      const h = oe(u.name);
      if (a.has(h)) return a.get(h);
      {
        const d = new J(h);
        d.SetBufferContent(u.buffer), t.push(d);
        const f = o.textures.length;
        return a.set(h, f), o.images.push({ uri: h }), o.textures.push({ source: f }), f;
      }
    }),
      r.SetTextContent(JSON.stringify(o, null, 4)),
      i.SetBufferContent(l);
  }
  ExportBinaryContent(e, t) {
    function r(M) {
      const y = M % 4;
      return y === 0 ? M : M + (4 - y);
    }
    function i(M, y, w) {
      for (let E = 0; E < w; E++) M.WriteUnsignedCharacter8(y);
    }
    const n = new J("model.glb");
    t.push(n);
    let l = this.GetMeshData(e),
      o = this.GetMainBuffer(l),
      a = this.GetMainJson(e, l),
      u = [],
      h = o.byteLength,
      d = new Map();
    this.ExportMaterials(e, a, (M) => {
      const y = oe(M.name),
        w = at(M.name);
      if (d.has(y)) return d.get(y);
      {
        const E = a.bufferViews.length,
          S = a.textures.length;
        d.set(y, S);
        const F = M.buffer;
        return (
          u.push(F),
          a.bufferViews.push({ buffer: 0, byteOffset: h, byteLength: F.byteLength }),
          (h += F.byteLength),
          a.images.push({ bufferView: E, mimeType: "image/" + w }),
          a.textures.push({ source: S }),
          S
        );
      }
    });
    let f = o.byteLength;
    for (let M = 0; M < u.length; M++) {
      const y = u[M];
      f += y.byteLength;
    }
    const c = r(f);
    a.buffers.push({ byteLength: c });
    const m = JSON.stringify(a),
      p = Qt(m),
      g = p.byteLength,
      x = r(g),
      C = 20 + x + 8 + c,
      T = new ht(C, !0);
    T.WriteUnsignedInteger32(1179937895),
      T.WriteUnsignedInteger32(2),
      T.WriteUnsignedInteger32(C),
      T.WriteUnsignedInteger32(x),
      T.WriteUnsignedInteger32(1313821514),
      T.WriteArrayBuffer(p),
      i(T, 32, x - g),
      T.WriteUnsignedInteger32(c),
      T.WriteUnsignedInteger32(5130562),
      T.WriteArrayBuffer(o);
    for (let M = 0; M < u.length; M++) {
      const y = u[M];
      T.WriteArrayBuffer(y);
    }
    i(T, 0, c - f), n.SetBufferContent(T.GetBuffer());
  }
  GetMeshData(e) {
    const t = [];
    return (
      e.EnumerateMeshes((r) => {
        const i = Zt(r);
        t.push({ name: r.GetName(), buffer: i, offsets: [], sizes: [] });
      }),
      t
    );
  }
  GetMainBuffer(e) {
    let t = 0;
    for (const i of e)
      t += i.buffer.GetByteLength(this.components.index.size, this.components.number.size);
    const r = new ht(t, !0);
    for (const i of e)
      for (let n = 0; n < i.buffer.PrimitiveCount(); n++) {
        const l = i.buffer.GetPrimitive(n),
          o = r.GetPosition();
        for (let a = 0; a < l.indices.length; a++) r.WriteUnsignedInteger32(l.indices[a]);
        for (let a = 0; a < l.vertices.length; a++) r.WriteFloat32(l.vertices[a]);
        for (let a = 0; a < l.colors.length; a++) r.WriteFloat32(ve(l.colors[a]));
        for (let a = 0; a < l.normals.length; a++) r.WriteFloat32(l.normals[a]);
        for (let a = 0; a < l.uvs.length; a++) {
          let u = l.uvs[a];
          a % 2 === 1 && (u *= -1), r.WriteFloat32(u);
        }
        i.offsets.push(o), i.sizes.push(r.GetPosition() - o);
      }
    return r.GetBuffer();
  }
  GetMainJson(e, t) {
    class r {
      constructor(d, f) {
        (this.mainJson = d), (this.byteOffset = f);
      }
      AddBufferView(d, f) {
        const c = { buffer: 0, byteOffset: this.byteOffset, byteLength: d, target: f };
        return (
          this.mainJson.bufferViews.push(c),
          (this.byteOffset += d),
          this.mainJson.bufferViews.length - 1
        );
      }
    }
    function i(h, d) {
      for (const f of d.GetMeshIndices()) {
        const c = new Ze(d.GetId(), f);
        if (h.IsMeshInstanceVisible(c)) return !0;
      }
      for (const f of d.GetChildNodes()) if (i(h, f)) return !0;
      return !1;
    }
    function n(h, d, f, c) {
      if (c.IsMeshNode()) for (const m of c.GetMeshIndices()) l(h, d, f, c, m, !0);
      else if (i(h, c)) {
        const m = {},
          p = c.GetName();
        p.length > 0 && (m.name = p),
          c.GetTransformation().IsIdentity() ||
            (m.matrix = c.GetTransformation().GetMatrix().Get()),
          f.push(m),
          d.push(f.length - 1),
          (m.children = []),
          o(h, m.children, f, c);
      }
    }
    function l(h, d, f, c, m, p) {
      const g = new Ze(c.GetId(), m);
      if (!h.IsMeshInstanceVisible(g)) return;
      const x = { mesh: h.MapMeshIndex(m) };
      p &&
        (c.GetTransformation().IsIdentity() ||
          (x.matrix = c.GetTransformation().GetMatrix().Get())),
        f.push(x),
        d.push(f.length - 1);
    }
    function o(h, d, f, c) {
      for (const m of c.GetChildNodes()) n(h, d, f, m);
      for (const m of c.GetMeshIndices()) l(h, d, f, c, m, !1);
    }
    const a = {
        asset: { generator: "https://3dviewer.net", version: "2.0" },
        scene: 0,
        scenes: [{ nodes: [] }],
        nodes: [],
        materials: [],
        meshes: [],
        buffers: [],
        bufferViews: [],
        accessors: [],
      },
      u = e.GetModel().GetRootNode();
    o(e, a.scenes[0].nodes, a.nodes, u);
    for (const h of t) {
      const d = { name: this.GetExportedMeshName(h.name), primitives: [] },
        f = h.buffer.primitives;
      for (let c = 0; c < f.length; c++) {
        let m = f[c],
          p = new r(a, h.offsets[c]),
          g = p.AddBufferView(
            m.indices.length * this.components.index.size,
            ft.ELEMENT_ARRAY_BUFFER
          ),
          x = p.AddBufferView(m.vertices.length * this.components.number.size, ft.ARRAY_BUFFER),
          C = null;
        m.colors.length > 0 &&
          (C = p.AddBufferView(m.colors.length * this.components.number.size, ft.ARRAY_BUFFER));
        let T = p.AddBufferView(m.normals.length * this.components.number.size, ft.ARRAY_BUFFER),
          M = null;
        m.uvs.length > 0 &&
          (M = p.AddBufferView(m.uvs.length * this.components.number.size, ft.ARRAY_BUFFER));
        const y = { attributes: {}, mode: 4, material: m.material },
          w = m.GetBounds();
        a.accessors.push({
          bufferView: g,
          byteOffset: 0,
          componentType: this.components.index.type,
          count: m.indices.length,
          type: "SCALAR",
        }),
          (y.indices = a.accessors.length - 1),
          a.accessors.push({
            bufferView: x,
            byteOffset: 0,
            componentType: this.components.number.type,
            count: m.vertices.length / 3,
            min: w.min,
            max: w.max,
            type: "VEC3",
          }),
          (y.attributes.POSITION = a.accessors.length - 1),
          C !== null &&
            (a.accessors.push({
              bufferView: C,
              byteOffset: 0,
              componentType: this.components.number.type,
              count: m.colors.length / 3,
              type: "VEC3",
            }),
            (y.attributes.COLOR_0 = a.accessors.length - 1)),
          a.accessors.push({
            bufferView: T,
            byteOffset: 0,
            componentType: this.components.number.type,
            count: m.normals.length / 3,
            type: "VEC3",
          }),
          (y.attributes.NORMAL = a.accessors.length - 1),
          M !== null &&
            (a.accessors.push({
              bufferView: M,
              byteOffset: 0,
              componentType: this.components.number.type,
              count: m.uvs.length / 2,
              type: "VEC2",
            }),
            (y.attributes.TEXCOORD_0 = a.accessors.length - 1)),
          d.primitives.push(y);
      }
      a.meshes.push(d);
    }
    return a;
  }
  ExportMaterials(e, t, r) {
    function i(n, l, o, a) {
      function u(g, x) {
        return [ve(g.r / 255), ve(g.g / 255), ve(g.b / 255), x];
      }
      function h(g) {
        return [ve(g.r / 255), ve(g.g / 255), ve(g.b / 255)];
      }
      function d(g, x, C) {
        if (x === null || !x.IsValid()) return null;
        g.images === void 0 && (g.images = []), g.textures === void 0 && (g.textures = []);
        const M = { index: C(x) };
        if (x.HasTransformation()) {
          const y = "KHR_texture_transform";
          g.extensionsUsed === void 0 && (g.extensionsUsed = []),
            g.extensionsUsed.indexOf(y) === -1 && g.extensionsUsed.push(y),
            (M.extensions = {
              KHR_texture_transform: {
                offset: [x.offset.x, -x.offset.y],
                scale: [x.scale.x, x.scale.y],
                rotation: -x.rotation,
              },
            });
        }
        return M;
      }
      const f = {
        name: n.GetExportedMaterialName(o.name),
        pbrMetallicRoughness: { baseColorFactor: u(o.color, o.opacity) },
        emissiveFactor: h(o.emissive),
        doubleSided: !0,
        alphaMode: "OPAQUE",
      };
      o.transparent && (f.alphaMode = "BLEND");
      const c = d(l, o.diffuseMap, a);
      if (
        (c !== null &&
          (o.multiplyDiffuseMap ||
            (f.pbrMetallicRoughness.baseColorFactor = u(new L(255, 255, 255), o.opacity)),
          (f.pbrMetallicRoughness.baseColorTexture = c)),
        o.type === de.Physical)
      ) {
        const g = d(l, o.metalnessMap, a);
        g !== null
          ? (f.pbrMetallicRoughness.metallicRoughnessTexture = g)
          : ((f.pbrMetallicRoughness.metallicFactor = o.metalness),
            (f.pbrMetallicRoughness.roughnessFactor = o.roughness));
      }
      const m = d(l, o.normalMap, a);
      m !== null && (f.normalTexture = m);
      const p = d(l, o.emissiveMap, a);
      p !== null && (f.emissiveTexture = p), l.materials.push(f);
    }
    for (let n = 0; n < e.MaterialCount(); n++) {
      const l = e.GetMaterial(n);
      i(this, t, l, r);
    }
  }
}
class Kr {
  constructor(e) {
    (this.transformation = new ie()), (this.isMeshVisible = (t) => !0), jt(e, this);
  }
}
class Zr {
  constructor(e, t) {
    (this.model = e),
      (this.settings = t || new Kr()),
      (this.visibleMeshes = null),
      (this.meshToVisibleMeshIndex = null);
  }
  GetModel() {
    return this.model;
  }
  MaterialCount() {
    return this.model.MaterialCount();
  }
  GetMaterial(e) {
    return this.model.GetMaterial(e);
  }
  VertexCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.VertexCount();
      }),
      e
    );
  }
  TriangleCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.TriangleCount();
      }),
      e
    );
  }
  MeshCount() {
    let e = 0;
    return (
      this.EnumerateMeshes((t) => {
        e += 1;
      }),
      e
    );
  }
  EnumerateMeshes(e) {
    this.FillVisibleMeshCache();
    for (let t = 0; t < this.model.MeshCount(); t++)
      if (this.visibleMeshes.has(t)) {
        const r = this.model.GetMesh(t);
        e(r);
      }
  }
  MapMeshIndex(e) {
    return this.FillVisibleMeshCache(), this.meshToVisibleMeshIndex.get(e);
  }
  IsMeshInstanceVisible(e) {
    return this.settings.isMeshVisible(e);
  }
  MeshInstanceCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += 1;
      }),
      e
    );
  }
  EnumerateMeshInstances(e) {
    this.model.EnumerateMeshInstances((t) => {
      this.settings.isMeshVisible(t.GetId()) && e(t);
    });
  }
  EnumerateTransformedMeshInstances(e) {
    this.EnumerateMeshInstances((t) => {
      const r = t.GetTransformation();
      this.settings.transformation.IsIdentity() || r.Append(this.settings.transformation);
      const n = t.GetMesh().Clone();
      r.IsIdentity() || dt(n, r), e(n);
    });
  }
  EnumerateVerticesAndTriangles(e) {
    const t = [];
    this.EnumerateTransformedMeshInstances((i) => {
      t.push(i);
    });
    for (const i of t)
      i.EnumerateVertices((n) => {
        e.onVertex(n.x, n.y, n.z);
      });
    let r = 0;
    for (const i of t)
      i.EnumerateTriangleVertexIndices((n, l, o) => {
        e.onTriangle(n + r, l + r, o + r);
      }),
        (r += i.VertexCount());
  }
  EnumerateTrianglesWithNormals(e) {
    this.EnumerateTransformedMeshInstances((t) => {
      t.EnumerateTriangleVertices((r, i, n) => {
        const l = Rt(r, i, n);
        e(r, i, n, l);
      });
    });
  }
  FillVisibleMeshCache() {
    if (this.visibleMeshes !== null && this.meshToVisibleMeshIndex !== null) return;
    (this.visibleMeshes = new Set()),
      this.model.EnumerateMeshInstances((t) => {
        const r = t.GetId();
        this.settings.isMeshVisible(r) && this.visibleMeshes.add(r.meshIndex);
      }),
      (this.meshToVisibleMeshIndex = new Map());
    let e = 0;
    for (let t = 0; t < this.model.MeshCount(); t++)
      this.visibleMeshes.has(t) && (this.meshToVisibleMeshIndex.set(t, e), (e += 1));
  }
}
class Oe {
  constructor() {
    (this.text = ""), (this.indentation = 0);
  }
  GetText() {
    return this.text;
  }
  Indent(e) {
    this.indentation += e;
  }
  WriteArrayLine(e) {
    this.WriteLine(e.join(" "));
  }
  WriteLine(e) {
    this.WriteIndentation(),
      this.Write(
        e +
          `
`
      );
  }
  WriteIndentation() {
    for (let e = 0; e < this.indentation; e++) this.Write("  ");
  }
  Write(e) {
    this.text += e;
  }
}
class Qr extends Se {
  constructor() {
    super();
  }
  CanExport(e, t) {
    return e === Y.Text && t === "obj";
  }
  ExportContent(e, t, r, i) {
    function n(m, p, g, x) {
      if (g === null || !g.IsValid()) return;
      const C = oe(g.name);
      if ((m.WriteArrayLine([p, C]), x.findIndex((M) => M.GetName() === C) === -1)) {
        const M = new J(C);
        M.SetBufferContent(g.buffer), x.push(M);
      }
    }
    const l = new J("model.mtl"),
      o = new J("model.obj");
    r.push(l), r.push(o);
    const a = new Oe();
    a.WriteLine(this.GetHeaderText());
    for (let m = 0; m < e.MaterialCount(); m++) {
      const p = e.GetMaterial(m);
      a.WriteArrayLine(["newmtl", this.GetExportedMaterialName(p.name)]),
        a.WriteArrayLine(["Kd", p.color.r / 255, p.color.g / 255, p.color.b / 255]),
        a.WriteArrayLine(["d", p.opacity]),
        p.type === de.Phong &&
          (a.WriteArrayLine(["Ka", p.ambient.r / 255, p.ambient.g / 255, p.ambient.b / 255]),
          a.WriteArrayLine(["Ks", p.specular.r / 255, p.specular.g / 255, p.specular.b / 255]),
          a.WriteArrayLine(["Ns", p.shininess * 1e3])),
        n(a, "map_Kd", p.diffuseMap, r),
        p.type === de.Phong && n(a, "map_Ks", p.specularMap, r),
        n(a, "bump", p.bumpMap, r);
    }
    l.SetTextContent(a.GetText());
    const u = new Oe();
    u.WriteLine(this.GetHeaderText()), u.WriteArrayLine(["mtllib", l.GetName()]);
    let h = 0,
      d = 0,
      f = 0,
      c = null;
    e.EnumerateTransformedMeshInstances((m) => {
      u.WriteArrayLine(["g", this.GetExportedMeshName(m.GetName())]);
      for (let p = 0; p < m.VertexCount(); p++) {
        const g = m.GetVertex(p);
        u.WriteArrayLine(["v", g.x, g.y, g.z]);
      }
      for (let p = 0; p < m.NormalCount(); p++) {
        const g = m.GetNormal(p);
        u.WriteArrayLine(["vn", g.x, g.y, g.z]);
      }
      for (let p = 0; p < m.TextureUVCount(); p++) {
        const g = m.GetTextureUV(p);
        u.WriteArrayLine(["vt", g.x, g.y]);
      }
      for (let p = 0; p < m.TriangleCount(); p++) {
        let g = m.GetTriangle(p),
          x = g.v0 + h + 1,
          C = g.v1 + h + 1,
          T = g.v2 + h + 1,
          M = g.n0 + d + 1,
          y = g.n1 + d + 1,
          w = g.n2 + d + 1,
          E = "",
          S = "",
          F = "";
        if (
          (g.HasTextureUVs() && ((E = g.u0 + f + 1), (S = g.u1 + f + 1), (F = g.u2 + f + 1)),
          g.mat !== null)
        ) {
          const P = e.GetMaterial(g.mat),
            G = this.GetExportedMaterialName(P.name);
          G !== c && (u.WriteArrayLine(["usemtl", G]), (c = G));
        }
        u.WriteArrayLine(["f", [x, E, M].join("/"), [C, S, y].join("/"), [T, F, w].join("/")]);
      }
      for (let p = 0; p < m.LineCount(); p++) {
        const g = m.GetLine(p),
          x = [];
        for (let C = 0; C < g.vertices.length; C++) x.push(g.vertices[C] + h + 1);
        if (g.mat !== null) {
          const C = e.GetMaterial(g.mat),
            T = this.GetExportedMaterialName(C.name);
          T !== c && (u.WriteArrayLine(["usemtl", T]), (c = T));
        }
        u.WriteArrayLine(["l", x.join(" ")]);
      }
      (h += m.VertexCount()), (d += m.NormalCount()), (f += m.TextureUVCount());
    }),
      o.SetTextContent(u.GetText()),
      i();
  }
  GetHeaderText() {
    return "# exported by https://3dviewer.net";
  }
}
class $r extends Se {
  constructor() {
    super();
  }
  CanExport(e, t) {
    return e === Y.Text && t === "off";
  }
  ExportContent(e, t, r, i) {
    const n = new J("model.off");
    r.push(n);
    const l = new Oe();
    l.WriteLine("OFF"),
      l.WriteArrayLine([e.VertexCount(), e.TriangleCount(), 0]),
      e.EnumerateVerticesAndTriangles({
        onVertex: (o, a, u) => {
          l.WriteArrayLine([o, a, u]);
        },
        onTriangle: (o, a, u) => {
          l.WriteArrayLine([3, o, a, u]);
        },
      }),
      n.SetTextContent(l.GetText()),
      i();
  }
}
class ei extends Se {
  constructor() {
    super();
  }
  CanExport(e, t) {
    return (e === Y.Text || e === Y.Binary) && t === "ply";
  }
  ExportContent(e, t, r, i) {
    t === Y.Text ? this.ExportText(e, r) : this.ExportBinary(e, r), i();
  }
  ExportText(e, t) {
    const r = new J("model.ply");
    t.push(r);
    const i = new Oe(),
      n = e.VertexCount(),
      l = e.TriangleCount(),
      o = this.GetHeaderText("ascii", n, l);
    i.Write(o),
      e.EnumerateVerticesAndTriangles({
        onVertex: (a, u, h) => {
          i.WriteArrayLine([a, u, h]);
        },
        onTriangle: (a, u, h) => {
          i.WriteArrayLine([3, a, u, h]);
        },
      }),
      r.SetTextContent(i.GetText());
  }
  ExportBinary(e, t) {
    const r = new J("model.ply");
    t.push(r);
    const i = e.VertexCount(),
      n = e.TriangleCount(),
      l = this.GetHeaderText("binary_little_endian", i, n),
      o = l.length + i * 3 * 4 + n * 13,
      a = new ht(o, !0);
    for (let u = 0; u < l.length; u++) a.WriteUnsignedCharacter8(l.charCodeAt(u));
    e.EnumerateVerticesAndTriangles({
      onVertex: (u, h, d) => {
        a.WriteFloat32(u), a.WriteFloat32(h), a.WriteFloat32(d);
      },
      onTriangle: (u, h, d) => {
        a.WriteUnsignedCharacter8(3), a.WriteInteger32(u), a.WriteInteger32(h), a.WriteInteger32(d);
      },
    }),
      r.SetBufferContent(a.GetBuffer());
  }
  GetHeaderText(e, t, r) {
    const i = new Oe();
    return (
      i.WriteLine("ply"),
      i.WriteLine("format " + e + " 1.0"),
      i.WriteLine("element vertex " + t),
      i.WriteLine("property float x"),
      i.WriteLine("property float y"),
      i.WriteLine("property float z"),
      i.WriteLine("element face " + r),
      i.WriteLine("property list uchar int vertex_index"),
      i.WriteLine("end_header"),
      i.GetText()
    );
  }
}
class ti extends Se {
  constructor() {
    super();
  }
  CanExport(e, t) {
    return (e === Y.Text || e === Y.Binary) && t === "stl";
  }
  ExportContent(e, t, r, i) {
    t === Y.Text ? this.ExportText(e, r) : this.ExportBinary(e, r), i();
  }
  ExportText(e, t) {
    const r = new J("model.stl");
    t.push(r);
    const i = new Oe();
    i.WriteLine("solid Model"),
      e.EnumerateTrianglesWithNormals((n, l, o, a) => {
        i.WriteArrayLine(["facet", "normal", a.x, a.y, a.z]),
          i.Indent(1),
          i.WriteLine("outer loop"),
          i.Indent(1),
          i.WriteArrayLine(["vertex", n.x, n.y, n.z]),
          i.WriteArrayLine(["vertex", l.x, l.y, l.z]),
          i.WriteArrayLine(["vertex", o.x, o.y, o.z]),
          i.Indent(-1),
          i.WriteLine("endloop"),
          i.Indent(-1),
          i.WriteLine("endfacet");
      }),
      i.WriteLine("endsolid Model"),
      r.SetTextContent(i.GetText());
  }
  ExportBinary(e, t) {
    const r = new J("model.stl");
    t.push(r);
    const i = e.TriangleCount(),
      n = 80,
      l = n + 4 + i * 50,
      o = new ht(l, !0);
    for (let a = 0; a < n; a++) o.WriteUnsignedCharacter8(0);
    o.WriteUnsignedInteger32(i),
      e.EnumerateTrianglesWithNormals((a, u, h, d) => {
        o.WriteFloat32(d.x),
          o.WriteFloat32(d.y),
          o.WriteFloat32(d.z),
          o.WriteFloat32(a.x),
          o.WriteFloat32(a.y),
          o.WriteFloat32(a.z),
          o.WriteFloat32(u.x),
          o.WriteFloat32(u.y),
          o.WriteFloat32(u.z),
          o.WriteFloat32(h.x),
          o.WriteFloat32(h.y),
          o.WriteFloat32(h.z),
          o.WriteUnsignedInteger16(0);
      }),
      r.SetBufferContent(o.GetBuffer());
  }
}
class Qn {
  constructor() {
    this.exporters = [new Qr(), new ti(), new ei(), new $r(), new Jr(), new jr(), new kr()];
  }
  AddExporter(e) {
    this.exporters.push(e);
  }
  Export(e, t, r, i, n) {
    let l = null;
    for (let a = 0; a < this.exporters.length; a++) {
      const u = this.exporters[a];
      if (u.CanExport(r, i)) {
        l = u;
        break;
      }
    }
    if (l === null) {
      n.onError();
      return;
    }
    const o = new Zr(e, t);
    l.Export(o, r, (a) => {
      a.length === 0 ? n.onError() : n.onSuccess(a);
    });
  }
}
class er {
  constructor(e, t) {
    (this.min = e), (this.max = t);
  }
  GetMin() {
    return this.min;
  }
  GetMax() {
    return this.max;
  }
  GetCenter() {
    return new v(
      (this.min.x + this.max.x) / 2,
      (this.min.y + this.max.y) / 2,
      (this.min.z + this.max.z) / 2
    );
  }
}
class ri {
  constructor() {
    (this.box = new er(new v(1 / 0, 1 / 0, 1 / 0), new v(-1 / 0, -1 / 0, -1 / 0))),
      (this.isValid = !1);
  }
  GetBox() {
    return this.isValid ? this.box : null;
  }
  AddPoint(e) {
    (this.box.min.x = Math.min(this.box.min.x, e.x)),
      (this.box.min.y = Math.min(this.box.min.y, e.y)),
      (this.box.min.z = Math.min(this.box.min.z, e.z)),
      (this.box.max.x = Math.max(this.box.max.x, e.x)),
      (this.box.max.y = Math.max(this.box.max.y, e.y)),
      (this.box.max.z = Math.max(this.box.max.z, e.z)),
      (this.isValid = !0);
  }
}
class Bt {
  constructor(e, t) {
    (this.beg = e), (this.end = t);
  }
  Clone() {
    return new Bt(this.beg, this.end);
  }
}
function ii(s, e) {
  const t = nt(s.end, s.beg),
    r = nt(e, s.beg),
    i = qt(t, r),
    n = qt(t, t);
  if (rt(n)) return s.beg.Clone();
  let l = i / n;
  return (l = Math.max(0, Math.min(1, l))), new D(s.beg.x + l * t.x, s.beg.y + l * t.y);
}
function ni(s, e) {
  const t = ii(s, e);
  return vt(t, e);
}
class Ut {
  constructor(e, t) {
    (this.boundingBox = e), (this.level = t), (this.pointItems = []), (this.childNodes = []);
  }
  AddPoint(e, t, r) {
    const i = this.FindNodeForPoint(e);
    if (i === null || i.FindPointDirectly(e) !== null) return !1;
    if (i.pointItems.length < r.maxPointsPerNode || i.level >= r.maxTreeDepth)
      return i.AddPointDirectly(e, t), !0;
    {
      i.CreateChildNodes();
      const n = i.pointItems;
      i.pointItems = [];
      for (let l = 0; l < n.length; l++) {
        const o = n[l];
        if (!i.AddPoint(o.point, o.data, r)) return !1;
      }
      return i.AddPoint(e, t, r);
    }
  }
  FindPoint(e) {
    const t = this.FindNodeForPoint(e);
    return t === null ? null : t.FindPointDirectly(e);
  }
  AddPointDirectly(e, t) {
    this.pointItems.push({ point: e, data: t });
  }
  FindPointDirectly(e) {
    for (let t = 0; t < this.pointItems.length; t++) {
      const r = this.pointItems[t];
      if (be(e, r.point)) return r.data;
    }
    return null;
  }
  FindNodeForPoint(e) {
    if (!this.IsPointInBounds(e)) return null;
    if (this.childNodes.length === 0) return this;
    for (let t = 0; t < this.childNodes.length; t++) {
      const i = this.childNodes[t].FindNodeForPoint(e);
      if (i !== null) return i;
    }
    return null;
  }
  CreateChildNodes() {
    function e(o, a, u, h, d, f, c) {
      const m = new er(new v(a, u, h), new v(a + d, u + f, h + c));
      o.childNodes.push(new Ut(m, o.level + 1));
    }
    const t = this.boundingBox.min,
      r = this.boundingBox.GetCenter(),
      i = (this.boundingBox.max.x - this.boundingBox.min.x) / 2,
      n = (this.boundingBox.max.y - this.boundingBox.min.y) / 2,
      l = (this.boundingBox.max.z - this.boundingBox.min.z) / 2;
    e(this, t.x, t.y, t.z, i, n, l),
      e(this, r.x, t.y, t.z, i, n, l),
      e(this, t.x, r.y, t.z, i, n, l),
      e(this, r.x, r.y, t.z, i, n, l),
      e(this, t.x, t.y, r.z, i, n, l),
      e(this, r.x, t.y, r.z, i, n, l),
      e(this, t.x, r.y, r.z, i, n, l),
      e(this, r.x, r.y, r.z, i, n, l);
  }
  IsPointInBounds(e) {
    return (
      It(e.x, this.boundingBox.min.x) &&
      It(e.y, this.boundingBox.min.y) &&
      It(e.z, this.boundingBox.min.z) &&
      yt(e.x, this.boundingBox.max.x) &&
      yt(e.y, this.boundingBox.max.y) &&
      yt(e.z, this.boundingBox.max.z)
    );
  }
}
class si {
  constructor(e, t) {
    (this.options = { maxPointsPerNode: 10, maxTreeDepth: 10 }),
      t !== void 0 &&
        (t.maxPointsPerNode !== void 0 && (this.options.maxPointsPerNode = t.maxPointsPerNode),
        t.maxTreeDepth !== void 0 && (this.options.maxTreeDepth = t.maxTreeDepth)),
      (this.rootNode = new Ut(e, 0));
  }
  AddPoint(e, t) {
    return this.rootNode.AddPoint(e, t, this.options);
  }
  FindPoint(e) {
    return this.rootNode.FindPoint(e);
  }
}
function $n(s, e, t) {
  const r = e / t;
  return s * (r * r * (3 - 2 * r));
}
function es(s, e, t) {
  return (e * s) / t;
}
function li(s, e, t) {
  const r = e / t,
    i = r * r;
  return s * (i / (2 * (i - r) + 1));
}
function Pt(s, e, t, r) {
  const i = ae(e, s).Normalize(),
    n = me(s, e),
    l = [];
  for (let o = 0; o < t; o++) {
    const a = r(n, o, t - 1);
    l.push(s.Clone().Offset(i, a));
  }
  return l;
}
class tr {
  constructor(e, t, r) {
    (this.name = e), (this.source = t), (this.data = r);
  }
}
function oi(s) {
  const e = [];
  for (const t of s) {
    const r = oe(t);
    e.push(new tr(r, we.Url, t));
  }
  return e;
}
function ai(s) {
  const e = [];
  for (const t of s) {
    const r = oe(t.name);
    e.push(new tr(r, we.File, t));
  }
  return e;
}
class rr {
  constructor(e, t, r) {
    (this.name = oe(e)),
      (this.extension = at(e)),
      (this.source = t),
      (this.data = r),
      (this.content = null);
  }
  SetContent(e) {
    this.content = e;
  }
}
class ir {
  constructor() {
    this.files = [];
  }
  FillFromInputFiles(e) {
    this.files = [];
    for (const t of e) {
      const r = new rr(t.name, t.source, t.data);
      this.files.push(r);
    }
  }
  ExtendFromFileList(e) {
    const t = e.GetFiles();
    for (let r = 0; r < t.length; r++) {
      const i = t[r];
      this.ContainsFileByPath(i.name) || this.files.push(i);
    }
  }
  GetFiles() {
    return this.files;
  }
  GetContent(e) {
    wr(this.files.length, {
      runTask: (t, r) => {
        e.onFileListProgress(t, this.files.length),
          this.GetFileContent(this.files[t], { onReady: r, onProgress: e.onFileLoadProgress });
      },
      onReady: e.onReady,
    });
  }
  ContainsFileByPath(e) {
    return this.FindFileByPath(e) !== null;
  }
  FindFileByPath(e) {
    const t = oe(e).toLowerCase();
    for (let r = 0; r < this.files.length; r++) {
      const i = this.files[r];
      if (i.name.toLowerCase() === t) return i;
    }
    return null;
  }
  IsOnlyUrlSource() {
    if (this.files.length === 0) return !1;
    for (let e = 0; e < this.files.length; e++) {
      const t = this.files[e];
      if (t.source !== we.Url && t.source !== we.Decompressed) return !1;
    }
    return !0;
  }
  AddFile(e) {
    this.files.push(e);
  }
  GetFileContent(e, t) {
    if (e.content !== null) {
      t.onReady();
      return;
    }
    let r = null;
    if (e.source === we.Url) r = Fr(e.data, t.onProgress);
    else if (e.source === we.File) r = Pr(e.data, t.onProgress);
    else {
      t.onReady();
      return;
    }
    r.then((i) => {
      e.SetContent(i);
    })
      .catch(() => {})
      .finally(() => {
        t.onReady();
      });
  }
}
class ts {
  constructor() {
    this.nextId = 0;
  }
  GenerateId() {
    const e = this.nextId;
    return (this.nextId += 1), e;
  }
}
class Ae {
  constructor() {
    (this.name = ""),
      (this.parent = null),
      (this.transformation = new ie()),
      (this.childNodes = []),
      (this.meshIndices = []),
      (this.idGenerator = new ts()),
      (this.id = this.idGenerator.GenerateId());
  }
  IsEmpty() {
    return this.childNodes.length === 0 && this.meshIndices.length === 0;
  }
  IsMeshNode() {
    return this.childNodes.length === 0 && this.meshIndices.length === 1;
  }
  GetId() {
    return this.id;
  }
  GetName() {
    return this.name;
  }
  SetName(e) {
    this.name = e;
  }
  HasParent() {
    return this.parent !== null;
  }
  GetParent() {
    return this.parent;
  }
  GetTransformation() {
    return this.transformation;
  }
  GetWorldTransformation() {
    let e = this.transformation.Clone(),
      t = this.parent;
    for (; t !== null; ) e.Append(t.transformation), (t = t.parent);
    return e;
  }
  SetTransformation(e) {
    this.transformation = e;
  }
  AddChildNode(e) {
    return (
      (e.parent = this),
      (e.idGenerator = this.idGenerator),
      (e.id = e.idGenerator.GenerateId()),
      this.childNodes.push(e),
      this.childNodes.length - 1
    );
  }
  RemoveChildNode(e) {
    e.parent = null;
    const t = this.childNodes.indexOf(e);
    this.childNodes.splice(t, 1);
  }
  GetChildNodes() {
    return this.childNodes;
  }
  ChildNodeCount() {
    return this.childNodes.length;
  }
  GetChildNode(e) {
    return this.childNodes[e];
  }
  AddMeshIndex(e) {
    return this.meshIndices.push(e), this.meshIndices.length - 1;
  }
  MeshIndexCount() {
    return this.meshIndices.length;
  }
  GetMeshIndex(e) {
    return this.meshIndices[e];
  }
  GetMeshIndices() {
    return this.meshIndices;
  }
  Enumerate(e) {
    e(this);
    for (const t of this.childNodes) t.Enumerate(e);
  }
  EnumerateChildren(e) {
    for (const t of this.childNodes) e(t), t.EnumerateChildren(e);
  }
  EnumerateMeshIndices(e) {
    for (const t of this.meshIndices) e(t);
    for (const t of this.childNodes) t.EnumerateMeshIndices(e);
  }
}
const Vt = { Unknown: 0, Millimeter: 1, Centimeter: 2, Meter: 3, Inch: 4, Foot: 5 };
class Lt extends Nt {
  constructor() {
    super(),
      (this.unit = Vt.Unknown),
      (this.root = new Ae()),
      (this.materials = []),
      (this.meshes = []);
  }
  GetUnit() {
    return this.unit;
  }
  SetUnit(e) {
    this.unit = e;
  }
  GetRootNode() {
    return this.root;
  }
  NodeCount() {
    let e = 0;
    return (
      this.root.Enumerate((t) => {
        e += 1;
      }),
      e - 1
    );
  }
  MaterialCount() {
    return this.materials.length;
  }
  MeshCount() {
    return this.meshes.length;
  }
  MeshInstanceCount() {
    let e = 0;
    return (
      this.root.Enumerate((t) => {
        e += t.MeshIndexCount();
      }),
      e
    );
  }
  VertexCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.VertexCount();
      }),
      e
    );
  }
  VertexColorCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.VertexColorCount();
      }),
      e
    );
  }
  NormalCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.NormalCount();
      }),
      e
    );
  }
  TextureUVCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.TextureUVCount();
      }),
      e
    );
  }
  LineCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.LineCount();
      }),
      e
    );
  }
  LineSegmentCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.LineSegmentCount();
      }),
      e
    );
  }
  TriangleCount() {
    let e = 0;
    return (
      this.EnumerateMeshInstances((t) => {
        e += t.TriangleCount();
      }),
      e
    );
  }
  AddMaterial(e) {
    return this.materials.push(e), this.materials.length - 1;
  }
  GetMaterial(e) {
    return this.materials[e];
  }
  AddMesh(e) {
    return this.meshes.push(e), this.meshes.length - 1;
  }
  AddMeshToRootNode(e) {
    const t = this.AddMesh(e);
    return this.root.AddMeshIndex(t), t;
  }
  RemoveMesh(e) {
    this.meshes.splice(e, 1),
      this.root.Enumerate((t) => {
        for (let r = 0; r < t.meshIndices.length; r++)
          t.meshIndices[r] === e
            ? (t.meshIndices.splice(r, 1), (r -= 1))
            : t.meshIndices[r] > e && (t.meshIndices[r] -= 1);
      });
  }
  GetMesh(e) {
    return this.meshes[e];
  }
  GetMeshInstance(e) {
    let t = null;
    if (
      (this.root.Enumerate((l) => {
        l.GetId() === e.nodeId && (t = l);
      }),
      t === null || t.GetMeshIndices().indexOf(e.meshIndex) === -1)
    )
      return null;
    const i = this.GetMesh(e.meshIndex),
      n = new Ze(t.GetId(), e.meshIndex);
    return new Ft(n, t, i);
  }
  EnumerateMeshes(e) {
    for (const t of this.meshes) e(t);
  }
  EnumerateMeshInstances(e) {
    this.root.Enumerate((t) => {
      for (const r of t.GetMeshIndices()) {
        const i = new Ze(t.GetId(), r),
          n = this.GetMesh(r),
          l = new Ft(i, t, n);
        e(l);
      }
    });
  }
  EnumerateTransformedMeshInstances(e) {
    this.EnumerateMeshInstances((t) => {
      const r = t.GetTransformedMesh();
      e(r);
    });
  }
  EnumerateVertices(e) {
    this.EnumerateMeshInstances((t) => {
      t.EnumerateVertices(e);
    });
  }
  EnumerateTriangleVertexIndices(e) {
    this.EnumerateMeshInstances((t) => {
      t.EnumerateTriangleVertexIndices(e);
    });
  }
  EnumerateTriangleVertices(e) {
    this.EnumerateMeshInstances((t) => {
      t.EnumerateTriangleVertices(e);
    });
  }
}
class ui {
  constructor() {
    (this.edges = []), (this.triangles = []);
  }
}
class hi {
  constructor(e, t) {
    (this.vertex1 = e), (this.vertex2 = t), (this.triangles = []);
  }
}
class di {
  constructor(e, t) {
    (this.edge = e), (this.reversed = t);
  }
}
class fi {
  constructor() {
    (this.triEdge1 = null), (this.triEdge2 = null), (this.triEdge3 = null);
  }
}
class ci {
  constructor() {
    (this.vertices = []),
      (this.edges = []),
      (this.triangleEdges = []),
      (this.triangles = []),
      (this.edgeStartToEndVertexMap = new Map());
  }
  AddVertex() {
    return this.vertices.push(new ui()), this.vertices.length - 1;
  }
  AddTriangle(e, t, r) {
    function i(u, h, d) {
      u[h].triangles.push(d);
    }
    function n(u, h, d, f) {
      const c = u[d],
        m = h[f];
      c.edges.push(m.edge);
    }
    function l(u, h, d, f) {
      const c = h[d];
      u[c.edge].triangles.push(f);
    }
    const o = this.triangles.length,
      a = new fi();
    (a.triEdge1 = this.AddTriangleEdge(e, t)),
      (a.triEdge2 = this.AddTriangleEdge(t, r)),
      (a.triEdge3 = this.AddTriangleEdge(r, e)),
      i(this.vertices, e, o),
      i(this.vertices, t, o),
      i(this.vertices, r, o),
      n(this.vertices, this.triangleEdges, e, a.triEdge1),
      n(this.vertices, this.triangleEdges, t, a.triEdge2),
      n(this.vertices, this.triangleEdges, r, a.triEdge3),
      l(this.edges, this.triangleEdges, a.triEdge1, o),
      l(this.edges, this.triangleEdges, a.triEdge2, o),
      l(this.edges, this.triangleEdges, a.triEdge3, o),
      this.triangles.push(a);
  }
  AddTriangleEdge(e, t) {
    let r = e,
      i = t,
      n = !1;
    t < e && ((r = t), (i = e), (n = !0));
    const l = this.AddEdge(r, i);
    return this.triangleEdges.push(new di(l, n)), this.triangleEdges.length - 1;
  }
  AddEdge(e, t) {
    this.edgeStartToEndVertexMap.has(e) || this.edgeStartToEndVertexMap.set(e, []);
    const r = this.edgeStartToEndVertexMap.get(e);
    for (let n = 0; n < r.length; n++) {
      const l = r[n];
      if (l.endVertex === t) return l.edgeIndex;
    }
    const i = this.edges.length;
    return r.push({ endVertex: t, edgeIndex: i }), this.edges.push(new hi(e, t)), i;
  }
}
function nr(s) {
  let e = !0;
  return (
    s.EnumerateMeshInstances((t) => {
      Gt(t) || (e = !1);
    }),
    e
  );
}
function mi(s) {
  const e = new ri();
  return (
    s.EnumerateVertices((t) => {
      e.AddPoint(t);
    }),
    e.GetBox()
  );
}
function pi(s) {
  function e(n, l, o) {
    let a = l.FindPoint(n);
    return a === null && ((a = o.AddVertex()), l.AddPoint(n, a)), a;
  }
  const t = mi(s),
    r = new si(t),
    i = new ci();
  return (
    s.EnumerateTriangleVertices((n, l, o) => {
      const a = e(n, r, i),
        u = e(l, r, i),
        h = e(o, r, i);
      i.AddTriangle(a, u, h);
    }),
    i
  );
}
function gi(s) {
  function e(t, r, i) {
    const n = t.triangles[r],
      l = t.triangleEdges[n.triEdge1],
      o = t.triangleEdges[n.triEdge2],
      a = t.triangleEdges[n.triEdge3];
    return l.edge === i ? l.reversed : o.edge === i ? o.reversed : a.edge === i ? a.reversed : null;
  }
  if (s instanceof Lt) {
    let t = !0;
    return (
      s.EnumerateMeshInstances((r) => {
        t && (t = gi(r));
      }),
      t
    );
  } else {
    const t = pi(s);
    for (let r = 0; r < t.edges.length; r++) {
      const i = t.edges[r];
      if (i.triangles.length !== 2) return !1;
      const n = e(t, i.triangles[0], r),
        l = e(t, i.triangles[1], r);
      if (n === null || l === null || n === l) return !1;
    }
    return !0;
  }
}
function rs(s) {
  const e = [];
  for (let t = 0; t < s.MaterialCount(); t++) {
    const r = s.GetMaterial(t);
    r.source !== X.Model && !r.vertexColors && e.push(r);
  }
  return e;
}
function is(s, e, t) {
  for (let r = 0; r < s.MaterialCount(); r++) {
    const i = s.GetMaterial(r);
    i.source === X.DefaultFace ? (i.color = e) : i.source === X.DefaultLine && (i.color = t);
  }
}
class $ extends Nt {
  constructor() {
    super(),
      (this.vertices = []),
      (this.vertexColors = []),
      (this.normals = []),
      (this.uvs = []),
      (this.lines = []),
      (this.triangles = []);
  }
  VertexCount() {
    return this.vertices.length;
  }
  VertexColorCount() {
    return this.vertexColors.length;
  }
  NormalCount() {
    return this.normals.length;
  }
  TextureUVCount() {
    return this.uvs.length;
  }
  LineCount() {
    return this.lines.length;
  }
  LineSegmentCount() {
    let e = 0;
    for (const t of this.lines) e += t.SegmentCount();
    return e;
  }
  TriangleCount() {
    return this.triangles.length;
  }
  AddVertex(e) {
    return this.vertices.push(e), this.vertices.length - 1;
  }
  SetVertex(e, t) {
    this.vertices[e] = t;
  }
  GetVertex(e) {
    return this.vertices[e];
  }
  AddVertexColor(e) {
    return this.vertexColors.push(e), this.vertexColors.length - 1;
  }
  SetVertexColor(e, t) {
    this.vertexColors[e] = t;
  }
  GetVertexColor(e) {
    return this.vertexColors[e];
  }
  AddNormal(e) {
    return this.normals.push(e), this.normals.length - 1;
  }
  SetNormal(e, t) {
    this.normals[e] = t;
  }
  GetNormal(e) {
    return this.normals[e];
  }
  AddTextureUV(e) {
    return this.uvs.push(e), this.uvs.length - 1;
  }
  SetTextureUV(e, t) {
    this.uvs[e] = t;
  }
  GetTextureUV(e) {
    return this.uvs[e];
  }
  AddLine(e) {
    return this.lines.push(e), this.lines.length - 1;
  }
  GetLine(e) {
    return this.lines[e];
  }
  AddTriangle(e) {
    return this.triangles.push(e), this.triangles.length - 1;
  }
  GetTriangle(e) {
    return this.triangles[e];
  }
  EnumerateVertices(e) {
    for (const t of this.vertices) e(t);
  }
  EnumerateTriangleVertexIndices(e) {
    for (const t of this.triangles) e(t.v0, t.v1, t.v2);
  }
  EnumerateTriangleVertices(e) {
    for (const t of this.triangles) {
      const r = this.vertices[t.v0],
        i = this.vertices[t.v1],
        n = this.vertices[t.v2];
      e(r, i, n);
    }
  }
  Clone() {
    const e = new $();
    e.SetName(this.GetName()), this.CloneProperties(e);
    for (let t = 0; t < this.VertexCount(); t++) {
      const r = this.GetVertex(t);
      e.AddVertex(r.Clone());
    }
    for (let t = 0; t < this.VertexColorCount(); t++) {
      const r = this.GetVertexColor(t);
      e.AddVertexColor(r.Clone());
    }
    for (let t = 0; t < this.NormalCount(); t++) {
      const r = this.GetNormal(t);
      e.AddNormal(r.Clone());
    }
    for (let t = 0; t < this.TextureUVCount(); t++) {
      const r = this.GetTextureUV(t);
      e.AddTextureUV(r.Clone());
    }
    for (let t = 0; t < this.LineCount(); t++) {
      const r = this.GetLine(t);
      e.AddLine(r.Clone());
    }
    for (let t = 0; t < this.TriangleCount(); t++) {
      const r = this.GetTriangle(t);
      e.AddTriangle(r.Clone());
    }
    return e;
  }
}
class q {
  constructor(e, t, r) {
    (this.v0 = e),
      (this.v1 = t),
      (this.v2 = r),
      (this.c0 = null),
      (this.c1 = null),
      (this.c2 = null),
      (this.n0 = null),
      (this.n1 = null),
      (this.n2 = null),
      (this.u0 = null),
      (this.u1 = null),
      (this.u2 = null),
      (this.mat = null),
      (this.curve = null);
  }
  HasVertices() {
    return this.v0 !== null && this.v1 !== null && this.v2 !== null;
  }
  HasVertexColors() {
    return this.c0 !== null && this.c1 !== null && this.c2 !== null;
  }
  HasNormals() {
    return this.n0 !== null && this.n1 !== null && this.n2 !== null;
  }
  HasTextureUVs() {
    return this.u0 !== null && this.u1 !== null && this.u2 !== null;
  }
  SetVertices(e, t, r) {
    return (this.v0 = e), (this.v1 = t), (this.v2 = r), this;
  }
  SetVertexColors(e, t, r) {
    return (this.c0 = e), (this.c1 = t), (this.c2 = r), this;
  }
  SetNormals(e, t, r) {
    return (this.n0 = e), (this.n1 = t), (this.n2 = r), this;
  }
  SetTextureUVs(e, t, r) {
    return (this.u0 = e), (this.u1 = t), (this.u2 = r), this;
  }
  SetMaterial(e) {
    return (this.mat = e), this;
  }
  SetCurve(e) {
    return (this.curve = e), this;
  }
  Clone() {
    const e = new q(this.v0, this.v1, this.v2);
    return (
      e.SetVertexColors(this.c0, this.c1, this.c2),
      e.SetNormals(this.n0, this.n1, this.n2),
      e.SetTextureUVs(this.u0, this.u1, this.u2),
      e.SetMaterial(this.mat),
      e.SetCurve(this.curve),
      e
    );
  }
}
function xi() {
  const s = document.createElement("canvas");
  document.body.appendChild(s);
  const e = { canvas: s, antialias: !0 },
    t = new I.WebGLRenderer(e);
  (t.outputColorSpace = I.LinearSRGBColorSpace), t.setClearColor("#ffffff", 1), t.setSize(10, 10);
  const r = new I.Scene(),
    i = new I.AmbientLight(8947848);
  r.add(i);
  const n = new I.DirectionalLight(8947848);
  n.position.set(0, 0, 1), r.add(n);
  const l = new I.PerspectiveCamera(45, 1, 0.1, 1e3);
  l.position.set(0, 0, 1), l.up.set(0, 1, 0), l.lookAt(new I.Vector3(0, 0, 0)), r.add(l);
  const o = new I.PlaneGeometry(1, 1),
    a = new I.Mesh(o, new I.MeshPhongMaterial({ color: 13369344 }));
  r.add(a), t.render(r, l);
  const u = t.getContext(),
    h = new Uint8Array(4);
  u.readPixels(5, 5, 1, 1, u.RGBA, u.UNSIGNED_BYTE, h), document.body.removeChild(s);
  const d = 50;
  return h[0] < d && h[1] < d && h[2] < d;
}
const ge = { Phong: 1, Physical: 2 };
function Ci(s) {
  let e = 0,
    t = 0;
  for (let r = 0; r < s.MaterialCount(); r++) {
    const i = s.GetMaterial(r);
    i.type === de.Phong ? (e += 1) : i.type === de.Physical && (t += 1);
  }
  return e >= t ? ge.Phong : ge.Physical;
}
class sr {
  Convert(e) {
    return null;
  }
}
class ns extends sr {
  Convert(e) {
    return new I.Color().copyLinearToSRGB(e);
  }
}
class Ti extends sr {
  Convert(e) {
    return new I.Color().copySRGBToLinear(e);
  }
}
function lr(s) {
  return Pe(s.r, s.g, s.b);
}
function K(s) {
  return new I.Color(s.r / 255, s.g / 255, s.b / 255);
}
function Qe(s, e, t) {
  const r = new $(),
    i = s.attributes.position.array,
    n = s.attributes.position.itemSize || 3;
  for (let h = 0; h < i.length; h += n) {
    const d = i[h],
      f = i[h + 1],
      c = i[h + 2];
    r.AddVertex(new v(d, f, c));
  }
  const l = s.attributes.color !== void 0;
  if (l) {
    const h = s.attributes.color.array,
      d = s.attributes.color.itemSize || 3;
    for (let f = 0; f < h.length; f += d) {
      let c = new I.Color(h[f], h[f + 1], h[f + 2]);
      t !== null && (c = t.Convert(c)), r.AddVertexColor(lr(c));
    }
  }
  const o = s.attributes.normal !== void 0;
  if (o) {
    const h = s.attributes.normal.array,
      d = s.attributes.normal.itemSize || 3;
    for (let f = 0; f < h.length; f += d) {
      const c = h[f],
        m = h[f + 1],
        p = h[f + 2];
      r.AddNormal(new v(c, m, p));
    }
  }
  const a = s.attributes.uv !== void 0;
  if (a) {
    const h = s.attributes.uv.array,
      d = s.attributes.uv.itemSize || 2;
    for (let f = 0; f < h.length; f += d) {
      const c = h[f],
        m = h[f + 1];
      r.AddTextureUV(new D(c, m));
    }
  }
  let u = null;
  if (s.index !== null) u = s.index.array;
  else {
    u = [];
    for (let h = 0; h < i.length / 3; h++) u.push(h);
  }
  for (let h = 0; h < u.length; h += 3) {
    const d = u[h],
      f = u[h + 1],
      c = u[h + 2],
      m = new q(d, f, c);
    l && m.SetVertexColors(d, f, c),
      o && m.SetNormals(d, f, c),
      a && m.SetTextureUVs(d, f, c),
      e !== null && m.SetMaterial(e),
      r.AddTriangle(m);
  }
  return r;
}
function Mi(s, e, t) {
  let r = null;
  return (
    s.type === "MeshPhongMaterial"
      ? (r = new I.MeshPhongMaterial({ color: K(e), side: I.DoubleSide }))
      : s.type === "MeshStandardMaterial"
        ? (r = new I.MeshStandardMaterial({ color: K(e), side: I.DoubleSide }))
        : s.type === "LineBasicMaterial" && (r = new I.LineBasicMaterial({ color: K(e) })),
    r !== null &&
      t &&
      ((r.polygonOffset = !0), (r.polygonOffsetUnit = 1), (r.polygonOffsetFactor = 1)),
    r
  );
}
function yi(s, e, t) {
  const r = new Map(),
    i = [];
  for (const n of s) {
    if (r.has(n.type)) {
      i.push(r.get(n.type));
      continue;
    }
    const l = Mi(n, e, t);
    r.set(n.type, l), i.push(l);
  }
  return i;
}
function Ii(s) {
  s !== null &&
    s.traverse((e) => {
      if (e.isMesh || e.isLineSegments) {
        if (Array.isArray(e.material)) for (const t of e.material) t.dispose();
        else e.material.dispose();
        (e.userData = null), e.geometry.dispose();
      }
    });
}
function vi(s, e, t, r, i) {
  function n(u, h, d, f, c, m) {
    const p = new I.Vector3(c[3 * m], c[3 * m + 1], c[3 * m + 2]);
    p.applyMatrix4(f.matrixWorld);
    const g = p.project(u);
    return new D(((g.x + 1) * h) / 2, (-(g.y - 1) * d) / 2);
  }
  let l = r.geometry.attributes.position.array,
    o = l.length / 6,
    a = 1 / 0;
  for (let u = 0; u < o; u++) {
    const h = new Bt(n(s, e, t, r, l, 2 * u), n(s, e, t, r, l, 2 * u + 1));
    a = Math.min(a, ni(h, i));
  }
  return a;
}
class ss {
  constructor(e) {
    (this.params = {
      defaultLineMaterialColor: new L(0, 0, 0),
      defaultMaterialColor: new L(0, 0, 0),
    }),
      jt(e, this.params),
      (this.defaultLineMaterialIndex = null),
      (this.defaultMaterialIndex = null);
  }
  Finalize(e) {
    this.Reset(), this.FinalizeMeshes(e), this.FinalizeMaterials(e), this.FinalizeNodes(e);
  }
  FinalizeMaterials(e) {
    if (e.VertexColorCount() === 0) return;
    const t = new Map();
    for (let r = 0; r < e.MeshCount(); r++) {
      const i = e.GetMesh(r);
      for (let n = 0; n < i.TriangleCount(); n++) {
        const l = i.GetTriangle(n),
          o = l.HasVertexColors();
        t.has(l.mat) ? o || t.set(l.mat, !1) : t.set(l.mat, o);
      }
    }
    for (const [r, i] of t) {
      const n = e.GetMaterial(r);
      n.vertexColors = i;
    }
  }
  FinalizeMeshes(e) {
    for (let t = 0; t < e.MeshCount(); t++) {
      const r = e.GetMesh(t);
      if (Gt(r)) {
        e.RemoveMesh(t), (t = t - 1);
        continue;
      }
      this.FinalizeMesh(e, r);
    }
  }
  FinalizeMesh(e, t) {
    function r(n) {
      function l(u, h, d, f, c) {
        function m(C, T) {
          for (let M = 0; M < C.length; M++) {
            const y = C[M];
            if (be(y, T)) return !0;
          }
          return !1;
        }
        const p = [],
          g = c.get(d);
        for (let C = 0; C < g.length; C++) {
          const T = g[C],
            M = u.GetTriangle(T);
          if (h.curve === M.curve) {
            const y = f[T];
            m(p, y) || p.push(y);
          }
        }
        let x = new v(0, 0, 0);
        for (let C = 0; C < p.length; C++) x = Lr(x, p[C]);
        return x.MultiplyScalar(1 / p.length), x.Normalize(), u.AddNormal(x);
      }
      const o = [],
        a = new Map();
      for (let u = 0; u < n.VertexCount(); u++) a.set(u, []);
      for (let u = 0; u < n.TriangleCount(); u++) {
        const h = n.GetTriangle(u),
          d = n.GetVertex(h.v0),
          f = n.GetVertex(h.v1),
          c = n.GetVertex(h.v2),
          m = Rt(d, f, c);
        o.push(m), a.get(h.v0).push(u), a.get(h.v1).push(u), a.get(h.v2).push(u);
      }
      for (let u = 0; u < n.TriangleCount(); u++) {
        const h = n.GetTriangle(u);
        if (!h.HasNormals()) {
          const d = l(n, h, h.v0, o, a),
            f = l(n, h, h.v1, o, a),
            c = l(n, h, h.v2, o, a);
          h.SetNormals(d, f, c);
        }
      }
    }
    const i = { calculateCurveNormals: !1 };
    for (let n = 0; n < t.LineCount(); n++) {
      const l = t.GetLine(n);
      l.mat === null && (l.mat = this.GetDefaultMaterialIndex(e, X.DefaultLine));
    }
    for (let n = 0; n < t.TriangleCount(); n++) {
      const l = t.GetTriangle(n);
      this.FinalizeTriangle(t, l, i),
        l.mat === null && (l.mat = this.GetDefaultMaterialIndex(e, X.DefaultFace));
    }
    i.calculateCurveNormals && r(t);
  }
  FinalizeTriangle(e, t, r) {
    if (!t.HasNormals())
      if (t.curve === null || t.curve === 0) {
        const i = e.GetVertex(t.v0),
          n = e.GetVertex(t.v1),
          l = e.GetVertex(t.v2),
          o = Rt(i, n, l),
          a = e.AddNormal(o);
        t.SetNormals(a, a, a);
      } else r.calculateCurveNormals = !0;
    t.curve === null && (t.curve = 0);
  }
  FinalizeNodes(e) {
    const t = e.GetRootNode(),
      r = [];
    t.EnumerateChildren((i) => {
      i.IsEmpty() && r.push(i);
    });
    for (let i = 0; i < r.length; i++) {
      const n = r[i],
        l = n.GetParent();
      l !== null && (l.RemoveChildNode(n), l.IsEmpty() && r.push(l));
    }
  }
  GetDefaultMaterialIndex(e, t) {
    function r(i, n, l, o) {
      if (n !== null) return n;
      const a = new Me();
      return (a.color = o), (a.source = l), i.AddMaterial(a);
    }
    return t === X.DefaultLine
      ? ((this.defaultLineMaterialIndex = r(
          e,
          this.defaultLineMaterialIndex,
          X.DefaultLine,
          this.params.defaultLineMaterialColor
        )),
        this.defaultLineMaterialIndex)
      : t === X.DefaultFace
        ? ((this.defaultMaterialIndex = r(
            e,
            this.defaultMaterialIndex,
            X.DefaultFace,
            this.params.defaultMaterialColor
          )),
          this.defaultMaterialIndex)
        : null;
  }
  Reset() {
    (this.defaultLineMaterialIndex = null), (this.defaultMaterialIndex = null);
  }
}
function wi(s, e) {
  new ss(e).Finalize(s);
}
function ls(s) {
  function e(n) {
    return n != null;
  }
  function t(n) {
    return !(!e(n) || isNaN(n));
  }
  function r(n, l) {
    return !(!t(n) || n < 0 || n >= l);
  }
  function i(n, l) {
    function o(a, u, h) {
      return !(
        !r(h.v0, u.VertexCount()) ||
        !r(h.v1, u.VertexCount()) ||
        !r(h.v2, u.VertexCount()) ||
        (h.HasVertexColors() &&
          (!r(h.c0, u.VertexColorCount()) ||
            !r(h.c1, u.VertexColorCount()) ||
            !r(h.c2, u.VertexColorCount()))) ||
        !r(h.n0, u.NormalCount()) ||
        !r(h.n1, u.NormalCount()) ||
        !r(h.n2, u.NormalCount()) ||
        (h.HasTextureUVs() &&
          (!r(h.u0, u.TextureUVCount()) ||
            !r(h.u1, u.TextureUVCount()) ||
            !r(h.u2, u.TextureUVCount()))) ||
        !r(h.mat, a.MaterialCount()) ||
        !t(h.curve)
      );
    }
    for (let a = 0; a < l.VertexCount(); a++) {
      const u = l.GetVertex(a);
      if (!t(u.x) || !t(u.y) || !t(u.z)) return !1;
    }
    for (let a = 0; a < l.VertexColorCount(); a++) {
      const u = l.GetVertexColor(a);
      if (!t(u.r) || !t(u.g) || !t(u.b)) return !1;
    }
    for (let a = 0; a < l.NormalCount(); a++) {
      const u = l.GetNormal(a);
      if (!t(u.x) || !t(u.y) || !t(u.z)) return !1;
    }
    for (let a = 0; a < l.TextureUVCount(); a++) {
      const u = l.GetTextureUV(a);
      if (!t(u.x) || !t(u.y)) return !1;
    }
    for (let a = 0; a < l.TriangleCount(); a++) {
      const u = l.GetTriangle(a);
      if (!o(n, l, u)) return !1;
    }
    return !0;
  }
  for (let n = 0; n < s.MeshCount(); n++) {
    const l = s.GetMesh(n);
    if (!i(s, l)) return !1;
  }
  return !0;
}
class re {
  constructor() {
    (this.name = null),
      (this.extension = null),
      (this.callbacks = null),
      (this.model = null),
      (this.error = null),
      (this.message = null);
  }
  Import(e, t, r, i) {
    this.Clear(),
      (this.name = e),
      (this.extension = t),
      (this.callbacks = i),
      (this.model = new Lt()),
      (this.error = !1),
      (this.message = null),
      this.ResetContent(),
      this.ImportContent(r, () => {
        this.CreateResult(i);
      });
  }
  Clear() {
    (this.name = null),
      (this.extension = null),
      (this.callbacks = null),
      (this.model = null),
      (this.error = null),
      (this.message = null),
      this.ClearContent();
  }
  CreateResult(e) {
    if (this.error) {
      e.onError(), e.onComplete();
      return;
    }
    if (nr(this.model)) {
      this.SetError(b("The model doesn't contain any meshes.")), e.onError(), e.onComplete();
      return;
    }
    wi(this.model, {
      defaultLineMaterialColor: this.callbacks.getDefaultLineMaterialColor(),
      defaultMaterialColor: this.callbacks.getDefaultMaterialColor(),
    }),
      e.onSuccess(),
      e.onComplete();
  }
  CanImportExtension(e) {
    return !1;
  }
  GetUpDirection() {
    return V.Z;
  }
  ClearContent() {}
  ResetContent() {}
  ImportContent(e, t) {}
  GetModel() {
    return this.model;
  }
  SetError(e) {
    (this.error = !0), e != null && (this.message = e);
  }
  WasError() {
    return this.error;
  }
  GetErrorMessage() {
    return this.message;
  }
}
class et {
  constructor(e) {
    (this.vertices = e), (this.mat = null);
  }
  HasVertices() {
    return this.vertices !== null && this.vertices.length >= 2;
  }
  GetVertices() {
    return this.vertices;
  }
  SetMaterial(e) {
    return (this.mat = e), this;
  }
  SegmentCount() {
    return this.vertices === null ? 0 : this.vertices.length - 1;
  }
  Clone() {
    const e = new et([...this.vertices]);
    return e.SetMaterial(this.mat), e;
  }
}
class bi extends re {
  constructor() {
    super(), (this.rhino = null);
  }
  CanImportExtension(e) {
    return e === "3dm";
  }
  GetUpDirection() {
    return V.Z;
  }
  ClearContent() {
    (this.instanceIdToObject = null), (this.instanceIdToDefinition = null);
  }
  ResetContent() {
    (this.instanceIdToObject = new Map()), (this.instanceIdToDefinition = new Map());
  }
  ImportContent(e, t) {
    this.rhino === null
      ? ot("rhino3dm")
          .then(() => {
            rhino3dm().then((r) => {
              (this.rhino = r), this.ImportRhinoContent(e), t();
            });
          })
          .catch(() => {
            this.SetError(b("Failed to load rhino3dm.")), t();
          })
      : (this.ImportRhinoContent(e), t());
  }
  ImportRhinoContent(e) {
    const t = this.rhino.File3dm.fromByteArray(e);
    if (t === null) {
      this.SetError(b("Failed to read Rhino file."));
      return;
    }
    this.ImportRhinoDocument(t),
      nr(this.model) &&
        this.SetError(
          b(
            "The model doesn't contain any 3D meshes. Try to save the model while you are in shaded view in Rhino."
          )
        );
  }
  ImportRhinoDocument(e) {
    this.InitRhinoInstances(e), this.ImportRhinoUserStrings(e), this.ImportRhinoGeometry(e);
  }
  InitRhinoInstances(e) {
    const t = e.objects();
    for (let i = 0; i < t.count; i++) {
      const n = t.get(i),
        l = n.attributes();
      l.isInstanceDefinitionObject && this.instanceIdToObject.set(l.id, n);
    }
    const r = e.instanceDefinitions();
    for (let i = 0; i < r.count; i++) {
      const n = r.get(i);
      this.instanceIdToDefinition.set(n.id, n);
    }
  }
  ImportRhinoUserStrings(e) {
    const t = e.strings();
    if (t.count > 0) {
      const r = new xe(b("Document user texts"));
      for (let i = 0; i < t.count; i++) {
        const n = t.get(i);
        r.AddProperty(new z(U.Text, n[0], n[1]));
      }
      this.model.AddPropertyGroup(r);
    }
  }
  ImportRhinoGeometry(e) {
    const t = e.objects();
    for (let r = 0; r < t.count; r++) {
      const i = t.get(r);
      this.ImportRhinoGeometryObject(e, i, []);
    }
  }
  ImportRhinoGeometryObject(e, t, r) {
    const i = t.geometry(),
      n = t.attributes(),
      l = i.objectType;
    if (!(n.isInstanceDefinitionObject && r.length === 0)) {
      if (l === this.rhino.ObjectType.Mesh) this.ImportRhinoGeometryAsMesh(e, i, t, r);
      else if (l === this.rhino.ObjectType.Extrusion) {
        const o = i.getMesh(this.rhino.MeshType.Any);
        o !== null && (this.ImportRhinoGeometryAsMesh(e, o, t, r), o.delete());
      } else if (l === this.rhino.ObjectType.Brep) {
        const o = new this.rhino.Mesh(),
          a = i.faces();
        for (let u = 0; u < a.count; u++) {
          const h = a.get(u),
            d = h.getMesh(this.rhino.MeshType.Any);
          d && (o.append(d), d.delete()), h.delete();
        }
        a.delete(), o.compact(), this.ImportRhinoGeometryAsMesh(e, o, t, r), o.delete();
      } else if (l === this.rhino.ObjectType.SubD) {
        i.subdivide(3);
        const o = this.rhino.Mesh.createFromSubDControlNet(i, !0);
        o !== null && (this.ImportRhinoGeometryAsMesh(e, o, t, r), o.delete());
      } else if (l === this.rhino.ObjectType.Curve) this.ImportRhinoGeometryAsMesh(e, i, t, r);
      else if (l === this.rhino.ObjectType.InstanceReference) {
        const o = i.parentIdefId;
        if (this.instanceIdToDefinition.has(o)) {
          const u = this.instanceIdToDefinition.get(o).getObjectIds();
          for (let h = 0; h < u.length; h++) {
            const d = u[h];
            if (this.instanceIdToObject.has(d)) {
              const f = this.instanceIdToObject.get(d);
              r.push(t), this.ImportRhinoGeometryObject(e, f, r), r.pop();
            }
          }
        }
      }
    }
  }
  ImportRhinoGeometryAsMesh(e, t, r, i) {
    function n(h) {
      const d = h.domain[1] - h.domain[0],
        f = Math.max(parseInt(d / 0.2, 10), 1),
        c = d / f,
        m = [];
      for (let p = 0; p <= f; p++)
        if (p === f && h.isClosed) m.push(m[0]);
        else {
          const g = t.pointAt(h.domain[0] + p * c);
          m.push(o.AddVertex(Ee(g)));
        }
      return new et(m);
    }
    let l = this.GetMaterialIndex(e, r, i),
      o = null;
    if (t.objectType === this.rhino.ObjectType.Mesh) {
      const h = t.toThreejsJSON();
      o = Qe(h.data, l, null);
    } else if (t.objectType === this.rhino.ObjectType.Curve) {
      if (((o = new $()), t instanceof this.rhino.LineCurve)) {
        const h = o.AddVertex(Ee(t.line.from)),
          d = o.AddVertex(Ee(t.line.to)),
          f = new et([h, d]);
        f.SetMaterial(l), o.AddLine(f);
      } else if (t instanceof this.rhino.NurbsCurve) {
        const h = n(t);
        h.SetMaterial(l), o.AddLine(h);
      } else if (t instanceof this.rhino.ArcCurve) {
        const h = n(t);
        h.SetMaterial(l), o.AddLine(h);
      }
    }
    if (o === null) return null;
    const a = r.attributes();
    o.SetName(a.name);
    const u = a.getUserStrings();
    if (u.length > 0) {
      const h = new xe(b("User texts"));
      for (let d = 0; d < u.length; d++) {
        const f = u[d];
        h.AddProperty(new z(U.Text, f[0], f[1]));
      }
      o.AddPropertyGroup(h);
    }
    if (i.length !== 0) {
      let h = new j().CreateIdentity();
      for (let f = i.length - 1; f >= 0; f--) {
        const p = i[f].geometry().xform.toFloatArray(!1),
          g = new j(p);
        h = h.MultiplyMatrix(g);
      }
      const d = new ie(h);
      dt(o, d);
    }
    this.model.AddMeshToRootNode(o);
  }
  GetMaterialIndex(e, t, r) {
    function i(a, u, h) {
      const d = u.attributes();
      if (d.materialSource === a.ObjectMaterialSource.MaterialFromObject) {
        const f = d.materialIndex;
        if (f > -1) return e.materials().get(f);
      } else if (d.materialSource === a.ObjectMaterialSource.MaterialFromLayer) {
        const f = d.layerIndex;
        if (f > -1) {
          const c = e.layers().get(f),
            m = c.renderMaterialIndex;
          if (m > -1) return e.materials().get(m);
          if (u.geometry().objectType === a.ObjectType.Curve) {
            const g = new a.Material();
            return (g.name = c.name), (g.diffuseColor = c.color), g;
          }
        }
      } else if (d.materialSource === a.ObjectMaterialSource.MaterialFromParent && h.length !== 0)
        return i(a, h[0], []);
      return null;
    }
    function n(a, u) {
      function h(g, x) {
        g.Set(x.r, x.g, x.b);
      }
      function d(g) {
        return g.r === 0 && g.g === 0 && g.b === 0;
      }
      function f(g) {
        return g.r === 255 && g.g === 255 && g.b === 255;
      }
      let c = null,
        m = a.physicallyBased();
      m.supported
        ? ((c = new Yt()), (c.metalness = m.metallic ? 1 : 0), (c.roughness = m.roughness))
        : ((c = new Me()), h(c.ambient, a.ambientColor), h(c.specular, a.specularColor)),
        (c.name = a.name),
        h(c.color, a.diffuseColor),
        (c.opacity = 1 - a.transparency),
        ye(c),
        d(c.color) && !f(a.reflectionColor) && h(c.color, a.reflectionColor),
        d(c.color) && !f(a.transparentColor) && h(c.color, a.transparentColor);
      const p = a.getBitmapTexture();
      if (p) {
        const g = new Xe(),
          x = oe(p.fileName),
          C = u.getFileBuffer(x);
        (g.name = x), (g.buffer = C), (c.diffuseMap = g);
      }
      return c;
    }
    function l(a, u, h) {
      const d = n(u, h);
      for (let f = 0; f < a.MaterialCount(); f++) if (a.GetMaterial(f).IsEqual(d)) return f;
      return a.AddMaterial(d);
    }
    const o = i(this.rhino, t, r);
    return o === null ? null : l(this.model, o, this.callbacks);
  }
}
class Ge {
  constructor(e, t) {
    (this.arrayBuffer = e),
      (this.dataView = new DataView(e)),
      (this.isLittleEndian = t),
      (this.position = 0);
  }
  GetPosition() {
    return this.position;
  }
  SetPosition(e) {
    this.position = e;
  }
  GetByteLength() {
    return this.arrayBuffer.byteLength;
  }
  Skip(e) {
    this.position = this.position + e;
  }
  End() {
    return this.position >= this.arrayBuffer.byteLength;
  }
  ReadArrayBuffer(e) {
    const t = new Uint8Array(this.arrayBuffer),
      r = new ArrayBuffer(e),
      i = new Uint8Array(r),
      n = t.subarray(this.position, this.position + e);
    return i.set(n, 0), (this.position += e), r;
  }
  ReadBoolean8() {
    const e = this.dataView.getInt8(this.position);
    return (this.position = this.position + 1), !!e;
  }
  ReadCharacter8() {
    const e = this.dataView.getInt8(this.position);
    return (this.position = this.position + 1), e;
  }
  ReadUnsignedCharacter8() {
    const e = this.dataView.getUint8(this.position);
    return (this.position = this.position + 1), e;
  }
  ReadInteger16() {
    const e = this.dataView.getInt16(this.position, this.isLittleEndian);
    return (this.position = this.position + 2), e;
  }
  ReadUnsignedInteger16() {
    const e = this.dataView.getUint16(this.position, this.isLittleEndian);
    return (this.position = this.position + 2), e;
  }
  ReadInteger32() {
    const e = this.dataView.getInt32(this.position, this.isLittleEndian);
    return (this.position = this.position + 4), e;
  }
  ReadUnsignedInteger32() {
    const e = this.dataView.getUint32(this.position, this.isLittleEndian);
    return (this.position = this.position + 4), e;
  }
  ReadFloat32() {
    const e = this.dataView.getFloat32(this.position, this.isLittleEndian);
    return (this.position = this.position + 4), e;
  }
  ReadDouble64() {
    const e = this.dataView.getFloat64(this.position, this.isLittleEndian);
    return (this.position = this.position + 8), e;
  }
}
const A = {
  MAIN3DS: 19789,
  EDIT3DS: 15677,
  EDIT_MATERIAL: 45055,
  MAT_NAME: 40960,
  MAT_AMBIENT: 40976,
  MAT_DIFFUSE: 40992,
  MAT_SPECULAR: 41008,
  MAT_SHININESS: 41024,
  MAT_SHININESS_STRENGTH: 41025,
  MAT_TRANSPARENCY: 41040,
  MAT_COLOR_F: 16,
  MAT_COLOR: 17,
  MAT_LIN_COLOR: 18,
  MAT_LIN_COLOR_F: 19,
  MAT_TEXMAP: 41472,
  MAT_TEXMAP_NAME: 41728,
  MAT_TEXMAP_UOFFSET: 41816,
  MAT_TEXMAP_VOFFSET: 41818,
  MAT_TEXMAP_USCALE: 41812,
  MAT_TEXMAP_VSCALE: 41814,
  MAT_TEXMAP_ROTATION: 41820,
  PERCENTAGE: 48,
  PERCENTAGE_F: 49,
  EDIT_OBJECT: 16384,
  OBJ_TRIMESH: 16640,
  TRI_VERTEX: 16656,
  TRI_TEXVERTEX: 16704,
  TRI_FACE: 16672,
  TRI_TRANSFORMATION: 16736,
  TRI_MATERIAL: 16688,
  TRI_SMOOTH: 16720,
  KF3DS: 45056,
  OBJECT_NODE: 45058,
  OBJECT_HIERARCHY: 45072,
  OBJECT_INSTANCE_NAME: 45073,
  OBJECT_PIVOT: 45075,
  OBJECT_POSITION: 45088,
  OBJECT_ROTATION: 45089,
  OBJECT_SCALE: 45090,
  OBJECT_ID: 45104,
};
class os {
  constructor() {
    (this.id = -1),
      (this.name = ""),
      (this.flags = -1),
      (this.parentId = -1),
      (this.instanceName = ""),
      (this.pivot = [0, 0, 0]),
      (this.positions = []),
      (this.rotations = []),
      (this.scales = []);
  }
}
class as {
  constructor() {
    (this.nodes = []), (this.nodeIdToNode = new Map());
  }
  IsEmpty() {
    return this.nodes.length === 0;
  }
  AddNode(e) {
    this.nodes.push(e), this.nodeIdToNode.set(e.nodeId, e);
  }
  GetNodes() {
    return this.nodes;
  }
}
class Ei extends re {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "3ds";
  }
  GetUpDirection() {
    return V.Z;
  }
  ClearContent() {
    (this.materialNameToIndex = null), (this.meshNameToIndex = null), (this.nodeList = null);
  }
  ResetContent() {
    (this.materialNameToIndex = new Map()),
      (this.meshNameToIndex = new Map()),
      (this.nodeList = new as());
  }
  ImportContent(e, t) {
    this.ProcessBinary(e), t();
  }
  ProcessBinary(e) {
    const t = new Ge(e, !0),
      r = t.GetByteLength();
    this.ReadChunks(t, r, (i, n) => {
      i === A.MAIN3DS ? this.ReadMainChunk(t, n) : this.SkipChunk(t, n);
    });
  }
  ReadMainChunk(e, t) {
    const r = this.GetChunkEnd(e, t);
    this.ReadChunks(e, r, (i, n) => {
      i === A.EDIT3DS
        ? this.ReadEditorChunk(e, n)
        : i === A.KF3DS
          ? this.ReadKeyFrameChunk(e, n)
          : this.SkipChunk(e, n);
    }),
      this.BuildNodeHierarchy();
  }
  ReadEditorChunk(e, t) {
    const r = this.GetChunkEnd(e, t);
    this.ReadChunks(e, r, (i, n) => {
      i === A.EDIT_MATERIAL
        ? this.ReadMaterialChunk(e, n)
        : i === A.EDIT_OBJECT
          ? this.ReadObjectChunk(e, n)
          : this.SkipChunk(e, n);
    });
  }
  ReadMaterialChunk(e, t) {
    let r = new Me(),
      i = this.GetChunkEnd(e, t),
      n = null,
      l = null;
    this.ReadChunks(e, i, (a, u) => {
      a === A.MAT_NAME
        ? (r.name = this.ReadName(e))
        : a === A.MAT_AMBIENT
          ? (r.ambient = this.ReadColorChunk(e, u))
          : a === A.MAT_DIFFUSE
            ? (r.color = this.ReadColorChunk(e, u))
            : a === A.MAT_SPECULAR
              ? (r.specular = this.ReadColorChunk(e, u))
              : a === A.MAT_SHININESS
                ? (n = this.ReadPercentageChunk(e, u))
                : a === A.MAT_SHININESS_STRENGTH
                  ? (l = this.ReadPercentageChunk(e, u))
                  : a === A.MAT_TRANSPARENCY
                    ? ((r.opacity = 1 - this.ReadPercentageChunk(e, u)), ye(r))
                    : a === A.MAT_TEXMAP
                      ? ((r.diffuseMap = this.ReadTextureMapChunk(e, u)), ye(r))
                      : this.SkipChunk(e, u);
    }),
      n !== null && l !== null && (r.shininess = (n * l) / 10);
    const o = this.model.AddMaterial(r);
    this.materialNameToIndex.set(r.name, o);
  }
  ReadTextureMapChunk(e, t) {
    const r = new Xe(),
      i = this.GetChunkEnd(e, t);
    return (
      this.ReadChunks(e, i, (n, l) => {
        if (n === A.MAT_TEXMAP_NAME) {
          const o = this.ReadName(e),
            a = this.callbacks.getFileBuffer(o);
          (r.name = o), (r.buffer = a);
        } else
          n === A.MAT_TEXMAP_UOFFSET
            ? (r.offset.x = e.ReadFloat32())
            : n === A.MAT_TEXMAP_VOFFSET
              ? (r.offset.y = e.ReadFloat32())
              : n === A.MAT_TEXMAP_USCALE
                ? (r.scale.x = e.ReadFloat32())
                : n === A.MAT_TEXMAP_VSCALE
                  ? (r.scale.y = e.ReadFloat32())
                  : n === A.MAT_TEXMAP_ROTATION
                    ? (r.rotation = e.ReadFloat32() * He)
                    : this.SkipChunk(e, l);
      }),
      r
    );
  }
  ReadColorChunk(e, t) {
    let r = new L(0, 0, 0),
      i = this.GetChunkEnd(e, t),
      n = !1;
    return (
      this.ReadChunks(e, i, (l, o) => {
        l === A.MAT_COLOR
          ? n ||
            ((r.r = e.ReadUnsignedCharacter8()),
            (r.g = e.ReadUnsignedCharacter8()),
            (r.b = e.ReadUnsignedCharacter8()))
          : l === A.MAT_LIN_COLOR
            ? ((r.r = e.ReadUnsignedCharacter8()),
              (r.g = e.ReadUnsignedCharacter8()),
              (r.b = e.ReadUnsignedCharacter8()),
              (n = !0))
            : l === A.MAT_COLOR_F
              ? n ||
                ((r.r = te(e.ReadFloat32())),
                (r.g = te(e.ReadFloat32())),
                (r.b = te(e.ReadFloat32())))
              : l === A.MAT_LIN_COLOR_F
                ? ((r.r = te(e.ReadFloat32())),
                  (r.g = te(e.ReadFloat32())),
                  (r.b = te(e.ReadFloat32())),
                  (n = !0))
                : this.SkipChunk(e, o);
      }),
      r
    );
  }
  ReadPercentageChunk(e, t) {
    let r = 0,
      i = this.GetChunkEnd(e, t);
    return (
      this.ReadChunks(e, i, (n, l) => {
        n === A.PERCENTAGE
          ? (r = e.ReadUnsignedInteger16() / 100)
          : n === A.PERCENTAGE_F
            ? (r = e.ReadFloat32())
            : this.SkipChunk(e, l);
      }),
      r
    );
  }
  ReadObjectChunk(e, t) {
    const r = this.GetChunkEnd(e, t),
      i = this.ReadName(e);
    this.ReadChunks(e, r, (n, l) => {
      n === A.OBJ_TRIMESH ? this.ReadMeshChunk(e, l, i) : this.SkipChunk(e, l);
    });
  }
  ReadMeshChunk(e, t, r) {
    function i(h, d) {
      if (!d.IsValid()) return;
      const f = d.Determinant(),
        c = it(f);
      c && (d = new j().CreateScale(-1, 1, 1).MultiplyMatrix(d));
      const m = d.Invert();
      if (m === null) return;
      const p = new ie(m);
      dt(h, p), c && qr(h);
    }
    const n = new $();
    n.SetName(r);
    let l = this.GetChunkEnd(e, t),
      o = null;
    if (
      (this.ReadChunks(e, l, (h, d) => {
        h === A.TRI_VERTEX
          ? this.ReadVerticesChunk(n, e)
          : h === A.TRI_TEXVERTEX
            ? this.ReadTextureVerticesChunk(n, e)
            : h === A.TRI_FACE
              ? this.ReadFacesChunk(n, e, d)
              : h === A.TRI_TRANSFORMATION
                ? (o = this.ReadTransformationChunk(e))
                : this.SkipChunk(e, d);
      }),
      n.VertexCount() === n.TextureUVCount())
    )
      for (let h = 0; h < n.TriangleCount(); h++) {
        const d = n.GetTriangle(h);
        d.SetTextureUVs(d.v0, d.v1, d.v2);
      }
    const a = new j(o);
    i(n, a);
    const u = this.model.AddMesh(n);
    this.meshNameToIndex.set(n.GetName(), u);
  }
  ReadVerticesChunk(e, t) {
    const r = t.ReadUnsignedInteger16();
    for (let i = 0; i < r; i++) {
      const n = t.ReadFloat32(),
        l = t.ReadFloat32(),
        o = t.ReadFloat32();
      e.AddVertex(new v(n, l, o));
    }
  }
  ReadTextureVerticesChunk(e, t) {
    const r = t.ReadUnsignedInteger16();
    for (let i = 0; i < r; i++) {
      const n = t.ReadFloat32(),
        l = t.ReadFloat32();
      e.AddTextureUV(new D(n, l));
    }
  }
  ReadFacesChunk(e, t, r) {
    const i = this.GetChunkEnd(t, r),
      n = t.ReadUnsignedInteger16();
    for (let l = 0; l < n; l++) {
      const o = t.ReadUnsignedInteger16(),
        a = t.ReadUnsignedInteger16(),
        u = t.ReadUnsignedInteger16();
      t.ReadUnsignedInteger16(), e.AddTriangle(new q(o, a, u));
    }
    this.ReadChunks(t, i, (l, o) => {
      l === A.TRI_MATERIAL
        ? this.ReadFaceMaterialsChunk(e, t)
        : l === A.TRI_SMOOTH
          ? this.ReadFaceSmoothingGroupsChunk(e, n, t)
          : this.SkipChunk(t, o);
    });
  }
  ReadFaceMaterialsChunk(e, t) {
    const r = this.ReadName(t),
      i = this.materialNameToIndex.get(r),
      n = t.ReadUnsignedInteger16();
    for (let l = 0; l < n; l++) {
      const o = t.ReadUnsignedInteger16(),
        a = e.GetTriangle(o);
      i !== void 0 && (a.mat = i);
    }
  }
  ReadFaceSmoothingGroupsChunk(e, t, r) {
    for (let i = 0; i < t; i++) {
      const n = r.ReadUnsignedInteger32(),
        l = e.GetTriangle(i);
      l.curve = n;
    }
  }
  ReadTransformationChunk(e) {
    const t = [];
    for (let r = 0; r < 4; r++) {
      for (let i = 0; i < 3; i++) t.push(e.ReadFloat32());
      r < 3 ? t.push(0) : t.push(1);
    }
    return t;
  }
  ReadKeyFrameChunk(e, t) {
    const r = this.GetChunkEnd(e, t);
    this.ReadChunks(e, r, (i, n) => {
      i === A.OBJECT_NODE ? this.ReadObjectNodeChunk(e, n) : this.SkipChunk(e, n);
    });
  }
  BuildNodeHierarchy() {
    function e(r, i) {
      function n(u) {
        return u.positions.length === 0 ? [0, 0, 0] : u.positions[0];
      }
      function l(u) {
        function h(f) {
          let c = [0, 0, 0, 1],
            m = Math.sqrt(f[0] * f[0] + f[1] * f[1] + f[2] * f[2]);
          if (m > 0) {
            const p = f[3] * -0.5,
              g = Math.sin(p) / m;
            c = [g * f[0], g * f[1], g * f[2], Math.cos(p)];
          }
          return c;
        }
        if (u.rotations.length === 0) return [0, 0, 0, 1];
        const d = u.rotations[0];
        return h(d);
      }
      function o(u) {
        return u.scales.length === 0 ? [1, 1, 1] : u.scales[0];
      }
      let a = new j();
      if ((a.ComposeTRS(Ee(n(r)), $t(l(r)), Ee(o(r))), i)) {
        const u = r.pivot;
        a = new j().CreateTranslation(-u[0], -u[1], -u[2]).MultiplyMatrix(a);
      }
      return new ie(a);
    }
    const t = this.model.GetRootNode();
    if (this.nodeList.IsEmpty()) for (let r = 0; r < this.model.MeshCount(); r++) t.AddMeshIndex(r);
    else {
      const r = new Map();
      for (const i of this.nodeList.GetNodes()) {
        const n = new Ae();
        i.name.length > 0 &&
          i.name !== "$$$DUMMY" &&
          (n.SetName(i.name),
          i.instanceName.length > 0 && n.SetName(n.GetName() + " " + i.instanceName)),
          i.parentId === 65535 || !r.has(i.parentId)
            ? t.AddChildNode(n)
            : r.get(i.parentId).AddChildNode(n),
          r.set(i.id, n);
        const l = this.meshNameToIndex.has(i.name);
        n.SetTransformation(e(i, l)), l && n.AddMeshIndex(this.meshNameToIndex.get(i.name));
      }
    }
  }
  ReadObjectNodeChunk(e, t) {
    function r(l, o, a) {
      const u = [];
      o.Skip(10);
      const h = o.ReadInteger32();
      for (let d = 0; d < h; d++) {
        o.ReadInteger32(), o.ReadUnsignedInteger16() !== 0 && o.ReadFloat32();
        let c = null;
        if (a === A.OBJECT_ROTATION) {
          const m = o.ReadFloat32();
          (c = l.ReadVector(o)), (c[3] = m);
        } else c = l.ReadVector(o);
        u.push(c);
      }
      return u;
    }
    const i = new os(),
      n = this.GetChunkEnd(e, t);
    this.ReadChunks(e, n, (l, o) => {
      l === A.OBJECT_HIERARCHY
        ? ((i.name = this.ReadName(e)),
          (i.flags = e.ReadUnsignedInteger32()),
          (i.parentId = e.ReadUnsignedInteger16()))
        : l === A.OBJECT_INSTANCE_NAME
          ? (i.instanceName = this.ReadName(e))
          : l === A.OBJECT_PIVOT
            ? (i.pivot = this.ReadVector(e))
            : l === A.OBJECT_POSITION
              ? (i.positions = r(this, e, A.OBJECT_POSITION))
              : l === A.OBJECT_ROTATION
                ? (i.rotations = r(this, e, A.OBJECT_ROTATION))
                : l === A.OBJECT_SCALE
                  ? (i.scales = r(this, e, A.OBJECT_SCALE))
                  : l === A.OBJECT_ID
                    ? (i.id = e.ReadUnsignedInteger16())
                    : this.SkipChunk(e, o);
    }),
      this.nodeList.AddNode(i);
  }
  ReadName(e) {
    let t = "",
      r = 0,
      i = 0;
    for (; i < 64 && ((r = e.ReadCharacter8()), r !== 0); )
      (t = t + String.fromCharCode(r)), (i = i + 1);
    return t;
  }
  ReadVector(e) {
    return [e.ReadFloat32(), e.ReadFloat32(), e.ReadFloat32()];
  }
  ReadChunks(e, t, r) {
    for (; e.GetPosition() <= t - 6; ) {
      const i = e.ReadUnsignedInteger16(),
        n = e.ReadUnsignedInteger32();
      r(i, n);
    }
  }
  GetChunkEnd(e, t) {
    return e.GetPosition() + t - 6;
  }
  SkipChunk(e, t) {
    e.Skip(t - 6);
  }
}
const Z = {
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
  },
  ce = { SCALAR: 0, VEC2: 1, VEC3: 2, VEC4: 3, MAT2: 4, MAT3: 5, MAT4: 6 },
  Be = { TRIANGLES: 4, TRIANGLE_STRIP: 5, TRIANGLE_FAN: 6 },
  or = { GLTF_STRING: 1179937895, JSON_CHUNK_TYPE: 1313821514, BINARY_CHUNK_TYPE: 5130562 };
function ct(s) {
  return Pe(lt(s[0]), lt(s[1]), lt(s[2]));
}
function us(s, e) {
  function t(r, i) {
    let n = r;
    return i === Z.UNSIGNED_BYTE ? (n /= 255) : i === Z.UNSIGNED_SHORT && (n /= 65535), te(lt(n));
  }
  return new L(t(s[0], e), t(s[1], e), t(s[2], e));
}
class hs {
  constructor(e) {
    (this.reader = new Ge(e, !0)),
      (this.componentType = null),
      (this.dataType = null),
      (this.byteStride = null),
      (this.dataCount = null),
      (this.sparseReader = null);
  }
  SetComponentType(e) {
    this.componentType = e;
  }
  SetDataType(e) {
    e === "SCALAR"
      ? (this.dataType = ce.SCALAR)
      : e === "VEC2"
        ? (this.dataType = ce.VEC2)
        : e === "VEC3"
          ? (this.dataType = ce.VEC3)
          : e === "VEC4"
            ? (this.dataType = ce.VEC4)
            : e === "MAT2"
              ? (this.dataType = ce.MAT2)
              : e === "MAT3"
                ? (this.dataType = ce.MAT3)
                : e === "MAT4" && (this.dataType = ce.MAT4);
  }
  SetByteStride(e) {
    this.byteStride = e;
  }
  SetDataCount(e) {
    this.dataCount = e;
  }
  SetSparseReader(e, t) {
    this.sparseReader = { indexReader: e, valueReader: t };
  }
  ReadArrayBuffer(e) {
    return this.reader.ReadArrayBuffer(e);
  }
  GetDataCount() {
    return this.dataCount;
  }
  ReadData() {
    if (this.dataType === null) return null;
    if (this.dataType === ce.SCALAR) {
      const e = this.ReadComponent();
      return this.SkipBytesByStride(1), e;
    } else if (this.dataType === ce.VEC2) {
      const e = this.ReadComponent(),
        t = this.ReadComponent();
      return this.SkipBytesByStride(2), new D(e, t);
    } else if (this.dataType === ce.VEC3) {
      const e = this.ReadComponent(),
        t = this.ReadComponent(),
        r = this.ReadComponent();
      return this.SkipBytesByStride(3), new v(e, t, r);
    } else if (this.dataType === ce.VEC4) {
      const e = this.ReadComponent(),
        t = this.ReadComponent(),
        r = this.ReadComponent(),
        i = this.ReadComponent();
      return this.SkipBytesByStride(4), new _e(e, t, r, i);
    }
    return null;
  }
  EnumerateData(e) {
    if (this.sparseReader === null) for (let t = 0; t < this.dataCount; t++) e(this.ReadData());
    else {
      const t = [];
      for (let i = 0; i < this.sparseReader.indexReader.GetDataCount(); i++) {
        const n = this.sparseReader.indexReader.ReadData(),
          l = this.sparseReader.valueReader.ReadData();
        t.push({ index: n, value: l });
      }
      let r = 0;
      for (let i = 0; i < this.dataCount; i++) {
        const n = this.ReadData();
        r < t.length && t[r].index === i ? (e(t[r].value), (r += 1)) : e(n);
      }
    }
  }
  SkipBytes(e) {
    this.reader.Skip(e);
  }
  ReadComponent() {
    return this.componentType === null
      ? null
      : this.componentType === Z.BYTE
        ? this.reader.ReadCharacter8()
        : this.componentType === Z.UNSIGNED_BYTE
          ? this.reader.ReadUnsignedCharacter8()
          : this.componentType === Z.SHORT
            ? this.reader.ReadInteger16()
            : this.componentType === Z.UNSIGNED_SHORT
              ? this.reader.ReadUnsignedInteger16()
              : this.componentType === Z.UNSIGNED_INT
                ? this.reader.ReadInteger32()
                : this.componentType === Z.FLOAT
                  ? this.reader.ReadFloat32()
                  : null;
  }
  SkipBytesByStride(e) {
    if (this.byteStride === null) return;
    const t = e * this.GetComponentSize();
    this.reader.Skip(this.byteStride - t);
  }
  GetComponentSize() {
    return this.componentType === Z.BYTE || this.componentType === Z.UNSIGNED_BYTE
      ? 1
      : this.componentType === Z.SHORT || this.componentType === Z.UNSIGNED_SHORT
        ? 2
        : this.componentType === Z.UNSIGNED_INT || this.componentType === Z.FLOAT
          ? 4
          : 0;
  }
}
class ds {
  constructor() {
    (this.supportedExtensions = [
      "KHR_draco_mesh_compression",
      "KHR_materials_pbrSpecularGlossiness",
      "KHR_texture_transform",
    ]),
      (this.draco = null);
  }
  LoadLibraries(e, t) {
    if (e === void 0) {
      t.onSuccess();
      return;
    }
    this.draco === null && e.indexOf("KHR_draco_mesh_compression") !== -1
      ? ot("draco3d")
          .then(() => {
            DracoDecoderModule().then((r) => {
              (this.draco = r), t.onSuccess();
            });
          })
          .catch(() => {
            t.onError(b("Failed to load draco decoder."));
          })
      : t.onSuccess();
  }
  GetUnsupportedExtensions(e) {
    const t = [];
    if (e === void 0) return t;
    for (let r = 0; r < e.length; r++) {
      const i = e[r];
      this.supportedExtensions.indexOf(i) === -1 && t.push(i);
    }
    return t;
  }
  ProcessMaterial(e, t, r) {
    if (e.extensions === void 0) return null;
    const i = e.extensions.KHR_materials_pbrSpecularGlossiness;
    if (i === void 0) return null;
    const n = new Me(),
      l = i.diffuseFactor;
    l !== void 0 && ((n.color = ct(l)), (n.opacity = l[3]));
    const o = i.diffuseTexture;
    o !== void 0 && (n.diffuseMap = r(o));
    const a = i.specularFactor;
    a !== void 0 && (n.specular = ct(a));
    const u = i.specularGlossinessTexture;
    u !== void 0 && (n.specularMap = r(u));
    const h = i.glossinessFactor;
    return h !== void 0 && (n.shininess = h), n;
  }
  ProcessTexture(e, t) {
    if (e.extensions === void 0) return;
    const r = e.extensions.KHR_texture_transform;
    r !== void 0 &&
      (r.offset !== void 0 && ((t.offset.x = r.offset[0]), (t.offset.y = -r.offset[1])),
      r.scale !== void 0 && ((t.scale.x = r.scale[0]), (t.scale.y = r.scale[1])),
      r.rotation !== void 0 && (t.rotation = -r.rotation));
  }
  ProcessPrimitive(e, t, r, i) {
    function n(R, N, W, ne, se) {
      const he = N.GetAttributeByUniqueId(W, ne),
        ee = he.num_components(),
        Ce = W.num_points() * ee,
        xr = Ce * 4,
        zt = R._malloc(xr);
      N.GetAttributeDataArrayForAllPoints(W, he, R.DT_FLOAT32, xr, zt);
      const le = new Float32Array(R.HEAPF32.buffer, zt, Ce).slice();
      if (ee === 2) for (let _ = 0; _ < le.length; _ += 2) se(new D(le[_ + 0], le[_ + 1]));
      else if (ee === 3)
        for (let _ = 0; _ < le.length; _ += 3) se(new v(le[_ + 0], le[_ + 1], le[_ + 2]));
      else if (ee === 4)
        for (let _ = 0; _ < le.length; _ += 4)
          se(new _e(le[_ + 0], le[_ + 1], le[_ + 2], le[_ + 3]));
      R._free(zt);
    }
    if (
      this.draco === null ||
      r.extensions === void 0 ||
      r.extensions.KHR_draco_mesh_compression === void 0
    )
      return !1;
    const l = new this.draco.Decoder(),
      o = new this.draco.DecoderBuffer(),
      a = r.extensions.KHR_draco_mesh_compression,
      u = t.bufferViews[a.bufferView],
      d = e.GetReaderFromBufferView(u).ReadArrayBuffer(u.byteLength);
    if (
      (o.Init(new Int8Array(d), d.byteLength),
      l.GetEncodedGeometryType(o) !== this.draco.TRIANGULAR_MESH)
    )
      return !0;
    const c = new this.draco.Mesh();
    if (!l.DecodeBufferToMesh(o, c).ok()) return !0;
    const p = a.attributes.POSITION !== void 0,
      g = !1,
      x = a.attributes.NORMAL !== void 0,
      C = a.attributes.TEXCOORD_0 !== void 0;
    if (!p) return !0;
    const T = i.VertexCount(),
      M = i.VertexColorCount(),
      y = i.NormalCount(),
      w = i.TextureUVCount();
    n(this.draco, l, c, a.attributes.POSITION, (R) => {
      i.AddVertex(R);
    }),
      x &&
        n(this.draco, l, c, a.attributes.NORMAL, (R) => {
          i.AddNormal(R);
        }),
      C &&
        n(this.draco, l, c, a.attributes.TEXCOORD_0, (R) => {
          (R.y = -R.y), i.AddTextureUV(R);
        });
    const S = c.num_faces() * 3,
      F = S * 4,
      P = this.draco._malloc(F);
    l.GetTrianglesUInt32Array(c, F, P);
    const G = new Uint32Array(this.draco.HEAPU32.buffer, P, S).slice();
    for (let R = 0; R < G.length; R += 3) {
      const N = G[R],
        W = G[R + 1],
        ne = G[R + 2];
      e.AddTriangle(r, i, N, W, ne, g, x, C, T, M, y, w);
    }
    return this.draco._free(P), !0;
  }
}
class Si extends re {
  constructor() {
    super(), (this.gltfExtensions = new ds());
  }
  CanImportExtension(e) {
    return e === "gltf" || e === "glb";
  }
  GetUpDirection() {
    return V.Y;
  }
  ClearContent() {
    (this.bufferContents = null), (this.imageIndexToTextureParams = null);
  }
  ResetContent() {
    (this.bufferContents = []), (this.imageIndexToTextureParams = new Map());
  }
  ImportContent(e, t) {
    this.extension === "gltf"
      ? this.ProcessGltf(e, t)
      : this.extension === "glb" && this.ProcessBinaryGltf(e, t);
  }
  ProcessGltf(e, t) {
    const r = fe(e),
      i = JSON.parse(r);
    if (i.asset.version !== "2.0") {
      this.SetError(b("Invalid glTF version.")), t();
      return;
    }
    for (let n = 0; n < i.buffers.length; n++) {
      let l = null,
        o = i.buffers[n],
        a = St(o.uri);
      if (a !== null) l = a.buffer;
      else {
        const u = this.callbacks.getFileBuffer(o.uri);
        u !== null && (l = u);
      }
      if (l === null) {
        this.SetError(b("One of the requested buffers is missing.")), t();
        return;
      }
      this.bufferContents.push(l);
    }
    this.ProcessMainFile(i, t);
  }
  ProcessBinaryGltf(e, t) {
    function r(u) {
      const h = u.ReadUnsignedInteger32(),
        d = u.ReadUnsignedInteger32(),
        f = u.ReadArrayBuffer(h);
      return { type: d, buffer: f };
    }
    const i = new Ge(e, !0);
    if (i.ReadUnsignedInteger32() !== or.GLTF_STRING) {
      this.SetError(b("Invalid glTF file.")), t();
      return;
    }
    if (i.ReadUnsignedInteger32() !== 2) {
      this.SetError(b("Invalid glTF version.")), t();
      return;
    }
    if (i.ReadUnsignedInteger32() !== i.GetByteLength()) {
      this.SetError(b("Invalid glTF file.")), t();
      return;
    }
    let a = null;
    for (; !i.End(); ) {
      const u = r(i);
      u.type === or.JSON_CHUNK_TYPE
        ? (a = fe(u.buffer))
        : u.type === or.BINARY_CHUNK_TYPE && this.bufferContents.push(u.buffer);
    }
    if (a !== null) {
      const u = JSON.parse(a);
      this.ProcessMainFile(u, t);
    }
  }
  ProcessMainFile(e, t) {
    const r = this.gltfExtensions.GetUnsupportedExtensions(e.extensionsRequired);
    if (r.length > 0) {
      this.SetError(_t("Unsupported extension: {0}.", r.join(", "))), t();
      return;
    }
    this.gltfExtensions.LoadLibraries(e.extensionsRequired, {
      onSuccess: () => {
        this.ImportModel(e), t();
      },
      onError: (i) => {
        this.SetError(i), t();
      },
    });
  }
  ImportModel(e) {
    const t = e.materials;
    if (t !== void 0) for (const i of t) this.ImportMaterial(e, i);
    const r = e.meshes;
    if (r !== void 0) for (const i of r) this.ImportMesh(e, i);
    this.ImportProperties(this.model, e.asset, b("Asset properties")), this.ImportScene(e);
  }
  ImportProperties(e, t, r) {
    if (t == null) return;
    const i = new xe(r);
    for (const n in t)
      if (Object.hasOwn(t, n)) {
        let l = null,
          o = t[n];
        typeof o == "string"
          ? (l = new z(U.Text, n, o))
          : typeof o == "number" &&
            (Number.isInteger(o) ? (l = new z(U.Integer, n, o)) : (l = new z(U.Number, n, o))),
          l !== null && i.AddProperty(l);
      }
    i.PropertyCount() !== 0 && e.AddPropertyGroup(i);
  }
  GetDefaultScene(e) {
    const t = e.scene || 0;
    return t >= e.scenes.length ? null : e.scenes[t];
  }
  ImportMaterial(e, t) {
    let r = new Yt();
    if (
      (t.name !== void 0 && (r.name = t.name),
      (r.color = ct([1, 1, 1])),
      t.pbrMetallicRoughness !== void 0)
    ) {
      const n = t.pbrMetallicRoughness.baseColorFactor;
      n !== void 0 && ((r.color = ct(n)), (r.opacity = n[3]));
      const l = t.pbrMetallicRoughness.metallicFactor;
      l !== void 0 && (r.metalness = l);
      const o = t.pbrMetallicRoughness.roughnessFactor;
      o !== void 0 && (r.roughness = o);
      const a = t.emissiveFactor;
      a !== void 0 && (r.emissive = ct(a)),
        (r.diffuseMap = this.ImportTexture(e, t.pbrMetallicRoughness.baseColorTexture)),
        (r.metalnessMap = this.ImportTexture(e, t.pbrMetallicRoughness.metallicRoughnessTexture)),
        (r.normalMap = this.ImportTexture(e, t.normalTexture)),
        (r.emissiveMap = this.ImportTexture(e, t.emissiveTexture)),
        r.diffuseMap !== null && (r.multiplyDiffuseMap = !0);
      const u = t.alphaMode;
      u !== void 0 &&
        (u === "BLEND"
          ? (r.transparent = !0)
          : u === "MASK" && ((r.transparent = !0), (r.alphaTest = t.alphaCutoff || 0.5)));
    }
    const i = this.gltfExtensions.ProcessMaterial(t, r, (n) => this.ImportTexture(e, n));
    i !== null && (r = i), this.model.AddMaterial(r);
  }
  ImportTexture(e, t) {
    if (t == null) return null;
    let r = new Xe(),
      n = e.textures[t.index].source,
      l = e.images[n],
      o = null;
    if (this.imageIndexToTextureParams.has(n)) o = this.imageIndexToTextureParams.get(n);
    else {
      o = { name: null, mimeType: null, buffer: null };
      const a = n.toString();
      if (l.uri !== void 0) {
        const u = St(l.uri);
        if (u !== null)
          (o.name = "Embedded_" + a + "." + ut(u.mimeType)),
            (o.mimeType = u.mimeType),
            (o.buffer = u.buffer);
        else {
          const h = this.callbacks.getFileBuffer(l.uri);
          (o.name = l.uri), (o.buffer = h);
        }
      } else if (l.bufferView !== void 0) {
        const u = e.bufferViews[l.bufferView],
          h = this.GetReaderFromBufferView(u);
        if (h !== null) {
          const d = h.ReadArrayBuffer(u.byteLength);
          (o.name = "Binary_" + a + "." + ut(l.mimeType)),
            (o.mimeType = l.mimeType),
            (o.buffer = d);
        }
      }
      this.imageIndexToTextureParams.set(n, o);
    }
    return (
      (r.name = o.name),
      (r.mimeType = o.mimeType),
      (r.buffer = o.buffer),
      this.gltfExtensions.ProcessTexture(t, r),
      r
    );
  }
  ImportMesh(e, t) {
    const r = new $();
    this.model.AddMesh(r), t.name !== void 0 && r.SetName(t.name);
    for (let i = 0; i < t.primitives.length; i++) {
      const n = t.primitives[i];
      this.ImportPrimitive(e, n, r);
    }
    this.ImportProperties(r, t.extras, b("Mesh properties"));
  }
  ImportPrimitive(e, t, r) {
    function i(x, C, T) {
      const M = C.attributes[T];
      if (M === void 0) return !1;
      const y = x.accessors[M];
      return !(y === void 0 || y.count === 0);
    }
    if (this.gltfExtensions.ProcessPrimitive(this, e, t, r) || t.attributes === void 0) return;
    let n = i(e, t, "POSITION"),
      l = i(e, t, "COLOR_0"),
      o = i(e, t, "NORMAL"),
      a = i(e, t, "TEXCOORD_0"),
      u = t.indices !== void 0,
      h = Be.TRIANGLES;
    if (
      (t.mode !== void 0 && (h = t.mode),
      h !== Be.TRIANGLES && h !== Be.TRIANGLE_STRIP && h !== Be.TRIANGLE_FAN)
    )
      return;
    const d = r.VertexCount(),
      f = r.VertexColorCount(),
      c = r.NormalCount(),
      m = r.TextureUVCount();
    if (n) {
      const x = e.accessors[t.attributes.POSITION],
        C = this.GetReaderFromAccessor(e, x);
      if (C === null) return;
      C.EnumerateData((T) => {
        r.AddVertex(T);
      });
    } else return;
    const p = r.VertexCount() - d;
    if (l) {
      const x = e.accessors[t.attributes.COLOR_0],
        C = this.GetReaderFromAccessor(e, x);
      if (C === null) return;
      C.EnumerateData((T) => {
        const M = us([T.x, T.y, T.z], C.componentType);
        r.AddVertexColor(M);
      }),
        r.VertexColorCount() - f !== p && (l = !1);
    }
    if (o) {
      const x = e.accessors[t.attributes.NORMAL],
        C = this.GetReaderFromAccessor(e, x);
      if (C === null) return;
      C.EnumerateData((T) => {
        r.AddNormal(T);
      }),
        r.NormalCount() - c !== p && (o = !1);
    }
    if (a) {
      const x = e.accessors[t.attributes.TEXCOORD_0],
        C = this.GetReaderFromAccessor(e, x);
      if (C === null) return;
      C.EnumerateData((T) => {
        (T.y = -T.y), r.AddTextureUV(T);
      }),
        r.TextureUVCount() - m !== p && (a = !1);
    }
    const g = [];
    if (u) {
      const x = e.accessors[t.indices],
        C = this.GetReaderFromAccessor(e, x);
      if (C === null) return;
      C.EnumerateData((T) => {
        g.push(T);
      });
    } else {
      const x = r.VertexCount() - d;
      for (let C = 0; C < x; C++) g.push(C);
    }
    if (h === Be.TRIANGLES)
      for (let x = 0; x < g.length; x += 3) {
        const C = g[x],
          T = g[x + 1],
          M = g[x + 2];
        this.AddTriangle(t, r, C, T, M, l, o, a, d, f, c, m);
      }
    else if (h === Be.TRIANGLE_STRIP)
      for (let x = 0; x < g.length - 2; x++) {
        let C = g[x],
          T = g[x + 1],
          M = g[x + 2];
        if (x % 2 === 1) {
          const y = T;
          (T = M), (M = y);
        }
        this.AddTriangle(t, r, C, T, M, l, o, a, d, f, c, m);
      }
    else if (h === Be.TRIANGLE_FAN)
      for (let x = 1; x < g.length - 1; x++) {
        const C = g[0],
          T = g[x],
          M = g[x + 1];
        this.AddTriangle(t, r, C, T, M, l, o, a, d, f, c, m);
      }
  }
  AddTriangle(e, t, r, i, n, l, o, a, u, h, d, f) {
    const c = new q(u + r, u + i, u + n);
    l && c.SetVertexColors(h + r, h + i, h + n),
      o && c.SetNormals(d + r, d + i, d + n),
      a && c.SetTextureUVs(f + r, f + i, f + n),
      e.material !== void 0 && (c.mat = e.material),
      t.AddTriangle(c);
  }
  ImportScene(e) {
    const t = this.GetDefaultScene(e);
    if (t === null) return;
    const r = this.model.GetRootNode();
    for (const i of t.nodes) {
      const n = e.nodes[i];
      this.ImportNode(e, n, r);
    }
    this.ImportProperties(this.model, t.extras, b("Scene properties"));
  }
  ImportNode(e, t, r) {
    function i(l) {
      const o = new j().CreateIdentity();
      if (l.matrix !== void 0) o.Set(l.matrix);
      else {
        let a = [0, 0, 0],
          u = [0, 0, 0, 1],
          h = [1, 1, 1];
        l.translation !== void 0 && (a = l.translation),
          l.rotation !== void 0 && (u = l.rotation),
          l.scale !== void 0 && (h = l.scale),
          o.ComposeTRS(Ee(a), $t(u), Ee(h));
      }
      return new ie(o);
    }
    if (t.children === void 0 && t.mesh === void 0) return;
    const n = new Ae();
    if (
      (t.name !== void 0 && n.SetName(t.name),
      n.SetTransformation(i(t)),
      r.AddChildNode(n),
      t.children !== void 0)
    )
      for (const l of t.children) {
        const o = e.nodes[l];
        this.ImportNode(e, o, n);
      }
    if (t.mesh !== void 0) {
      const l = this.model.GetMesh(t.mesh);
      this.ImportProperties(l, t.extras, b("Node properties")), n.AddMeshIndex(t.mesh);
    }
  }
  GetReaderFromBufferView(e) {
    const t = e.buffer || 0,
      r = this.bufferContents[t];
    if (r == null) return null;
    const i = new hs(r);
    i.SkipBytes(e.byteOffset || 0);
    const n = e.byteStride;
    return n !== void 0 && n !== 0 && i.SetByteStride(n), i;
  }
  GetReaderFromAccessor(e, t) {
    const r = t.bufferView || 0,
      i = e.bufferViews[r],
      n = this.GetReaderFromBufferView(i);
    if (n === null) return null;
    if (
      (n.SetComponentType(t.componentType),
      n.SetDataType(t.type),
      n.SetDataCount(t.count),
      n.SkipBytes(t.byteOffset || 0),
      t.sparse !== void 0)
    ) {
      const l = this.GetReaderFromSparseAccessor(
          e,
          t.sparse.indices,
          t.sparse.indices.componentType,
          "SCALAR",
          t.sparse.count
        ),
        o = this.GetReaderFromSparseAccessor(
          e,
          t.sparse.values,
          t.componentType,
          t.type,
          t.sparse.count
        );
      l !== null && o !== null && n.SetSparseReader(l, o);
    }
    return n;
  }
  GetReaderFromSparseAccessor(e, t, r, i, n) {
    if (t.bufferView === void 0) return null;
    const l = e.bufferViews[t.bufferView],
      o = this.GetReaderFromBufferView(l);
    return o === null
      ? null
      : (o.SetComponentType(r),
        o.SetDataType(i),
        o.SetDataCount(n),
        o.SkipBytes(t.byteOffset || 0),
        o);
  }
}
class Ai extends re {
  constructor() {
    super(), (this.ifc = null);
  }
  CanImportExtension(e) {
    return e === "ifc";
  }
  GetUpDirection() {
    return V.Y;
  }
  ClearContent() {
    (this.expressIDToMesh = null), (this.colorToMaterial = null);
  }
  ResetContent() {
    (this.expressIDToMesh = new Map()), (this.colorToMaterial = new Ke(this.model));
  }
  ImportContent(e, t) {
    this.ifc === null
      ? ot("webifc")
          .then(() => {
            (this.ifc = new WebIFC.IfcAPI()),
              this.ifc.Init().then(() => {
                this.ImportIfcContent(e), t();
              });
          })
          .catch(() => {
            this.SetError(b("Failed to load web-ifc.")), t();
          })
      : (this.ImportIfcContent(e), t());
  }
  ImportIfcContent(e) {
    const t = new Uint8Array(e),
      r = this.ifc.OpenModel(t, { COORDINATE_TO_ORIGIN: !0 }),
      i = this.ifc.LoadAllGeometry(r);
    for (let n = 0; n < i.size(); n++) {
      const l = i.get(n);
      l.geometries.size() > 0 && this.ImportIfcMesh(r, l);
    }
    this.ImportProperties(r), this.ifc.CloseModel(r);
  }
  ImportIfcMesh(e, t) {
    const r = new $();
    r.SetName(_t("Mesh {0}", t.expressID.toString()));
    let i = 0;
    const n = t.geometries;
    for (let l = 0; l < n.size(); l++) {
      const o = n.get(l),
        a = this.ifc.GetGeometry(e, o.geometryExpressID),
        u = this.ifc.GetVertexArray(a.GetVertexData(), a.GetVertexDataSize()),
        h = this.ifc.GetIndexArray(a.GetIndexData(), a.GetIndexDataSize()),
        d = this.GetMaterialIndexByColor(o.color),
        f = new j(o.flatTransformation),
        c = new ie(f);
      for (let m = 0; m < u.length; m += 6) {
        const p = u[m],
          g = u[m + 1],
          x = u[m + 2],
          C = new v(p, g, x),
          T = c.TransformCoord3D(C);
        r.AddVertex(T);
      }
      for (let m = 0; m < h.length; m += 3) {
        const p = h[m],
          g = h[m + 1],
          x = h[m + 2],
          C = new q(i + p, i + g, i + x);
        C.SetMaterial(d), r.AddTriangle(C);
      }
      i += u.length / 6;
    }
    this.expressIDToMesh.set(t.expressID, r), this.model.AddMeshToRootNode(r);
  }
  ImportProperties(e) {
    const t = this.ifc.GetLineIDsWithType(e, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let r = 0; r < t.size(); r++) {
      const i = t.get(r),
        n = this.ifc.GetLine(e, i);
      Array.isArray(n.RelatingPropertyDefinition) ||
        n.RelatedObjects.forEach((l) => {
          let o = null;
          if (
            (this.expressIDToMesh.has(l.value)
              ? (o = this.expressIDToMesh.get(l.value))
              : this.ifc.GetLine(e, l.value, !0).type === WebIFC.IFCBUILDING && (o = this.model),
            o === null)
          )
            return;
          const a = n.RelatingPropertyDefinition,
            u = this.ifc.GetLine(e, a.value, !0);
          if (!u || !u.HasProperties) return;
          const h = new xe(u.Name.value);
          u.HasProperties.forEach((d) => {
            if (
              !d ||
              !d.Name ||
              !d.NominalValue ||
              !d.NominalValue.constructor ||
              d.type !== WebIFC.IFCPROPERTYSINGLEVALUE
            )
              return;
            let f = this.GetIFCString(d.Name.value),
              c = null,
              m = null;
            switch (d.NominalValue.constructor.name) {
              case "IfcText":
              case "IfcLabel":
              case "IfcIdentifier":
              case WebIFC.IFCLABEL:
                c = new z(U.Text, f, this.GetIFCString(d.NominalValue.value));
                break;
              case "IfcBoolean":
              case "IfcLogical":
                (m = b("Unknown")),
                  d.NominalValue.value === "T"
                    ? (m = b("True"))
                    : d.NominalValue.value === "F" && (m = b("False")),
                  (c = new z(U.Text, f, m));
                break;
              case "IfcInteger":
              case "IfcCountMeasure":
                c = new z(U.Integer, f, d.NominalValue.value);
                break;
              case "IfcReal":
              case "IfcLengthMeasure":
              case "IfcPositiveLengthMeasure":
              case "IfcAreaMeasure":
              case "IfcVolumeMeasure":
              case "IfcRatioMeasure":
              case "IfcPositiveRatioMeasure":
              case "IfcMassMeasure":
              case "IfcMassPerLengthMeasure":
              case "IfcPlaneAngleMeasure":
              case "IfcThermalTransmittanceMeasure":
                c = new z(U.Number, f, d.NominalValue.value);
                break;
              default:
                console.log(d);
                break;
            }
            c !== null && h.AddProperty(c);
          }),
            h.PropertyCount() > 0 && o.AddPropertyGroup(h);
        });
    }
  }
  GetMaterialIndexByColor(e) {
    const t = Pe(e.x, e.y, e.z),
      r = parseInt(e.w * 255, 10);
    return this.colorToMaterial.GetMaterialIndex(t.r, t.g, t.b, r);
  }
  GetIFCString(e) {
    let t = this.DecodeIFCString(e);
    return t.length === 0 && (t = "-"), t;
  }
  DecodeIFCString(e) {
    const t = /\\X2\\(.*?)\\X0\\/giu;
    let r = e,
      i = t.exec(e);
    for (; i; ) {
      const n = String.fromCharCode(parseInt(i[1], 16));
      (r = r.replace(i[0], n)), (i = t.exec(e));
    }
    return r;
  }
}
class fs {
  constructor(e) {
    (this.mesh = e),
      (this.globalToMeshVertices = new Map()),
      (this.globalToMeshVertexColors = new Map()),
      (this.globalToMeshNormals = new Map()),
      (this.globalToMeshUvs = new Map());
  }
  AddVertex(e, t) {
    return this.GetMeshIndex(e, t, this.globalToMeshVertices, (r) =>
      this.mesh.AddVertex(new v(r.x, r.y, r.z))
    );
  }
  AddVertexColor(e, t) {
    return this.GetMeshIndex(e, t, this.globalToMeshVertexColors, (r) =>
      this.mesh.AddVertexColor(new L(r.r, r.g, r.b))
    );
  }
  AddNormal(e, t) {
    return this.GetMeshIndex(e, t, this.globalToMeshNormals, (r) =>
      this.mesh.AddNormal(new v(r.x, r.y, r.z))
    );
  }
  AddUV(e, t) {
    return this.GetMeshIndex(e, t, this.globalToMeshUvs, (r) =>
      this.mesh.AddTextureUV(new D(r.x, r.y))
    );
  }
  AddLine(e) {
    this.mesh.AddLine(e);
  }
  AddTriangle(e) {
    this.mesh.AddTriangle(e);
  }
  GetMeshIndex(e, t, r, i) {
    if (isNaN(e) || e < 0 || e >= t.length) return null;
    if (r.has(e)) return r.get(e);
    {
      const n = t[e],
        l = i(n);
      return r.set(e, l), l;
    }
  }
}
function Dt(s, e, t) {
  return Pe(parseFloat(s), parseFloat(e), parseFloat(t));
}
class Gi extends re {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "obj";
  }
  GetUpDirection() {
    return V.Y;
  }
  ClearContent() {
    (this.globalVertices = null),
      (this.globalVertexColors = null),
      (this.globalNormals = null),
      (this.globalUvs = null),
      (this.currentMeshConverter = null),
      (this.currentMaterial = null),
      (this.currentMaterialIndex = null),
      (this.meshNameToConverter = null),
      (this.materialNameToIndex = null);
  }
  ResetContent() {
    (this.globalVertices = []),
      (this.globalVertexColors = []),
      (this.globalNormals = []),
      (this.globalUvs = []),
      (this.currentMeshConverter = null),
      (this.currentMaterial = null),
      (this.currentMaterialIndex = null),
      (this.meshNameToConverter = new Map()),
      (this.materialNameToIndex = new Map());
  }
  ImportContent(e, t) {
    const r = fe(e);
    Le(r, (i) => {
      this.WasError() || this.ProcessLine(i);
    }),
      t();
  }
  ProcessLine(e) {
    if (e[0] === "#") return;
    const t = Je(e, "#");
    if (t.length === 0) return;
    const r = t[0].toLowerCase();
    t.shift(), !this.ProcessMeshParameter(r, t, e) && this.ProcessMaterialParameter(r, t, e);
  }
  AddNewMesh(e) {
    if (this.meshNameToConverter.has(e))
      this.currentMeshConverter = this.meshNameToConverter.get(e);
    else {
      const t = new $();
      t.SetName(e),
        this.model.AddMeshToRootNode(t),
        (this.currentMeshConverter = new fs(t)),
        this.meshNameToConverter.set(e, this.currentMeshConverter);
    }
  }
  ProcessMeshParameter(e, t, r) {
    if (e === "g" || e === "o") {
      if (t.length === 0) return !0;
      const i = Ye(r, e.length, "#");
      return this.AddNewMesh(i), !0;
    } else {
      if (e === "v")
        return (
          t.length < 3 ||
            (this.globalVertices.push(new v(parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2]))),
            t.length >= 6 && this.globalVertexColors.push(Dt(t[3], t[4], t[5]))),
          !0
        );
      if (e === "vn")
        return (
          t.length < 3 ||
            this.globalNormals.push(new v(parseFloat(t[0]), parseFloat(t[1]), parseFloat(t[2]))),
          !0
        );
      if (e === "vt")
        return t.length < 2 || this.globalUvs.push(new D(parseFloat(t[0]), parseFloat(t[1]))), !0;
      if (e === "l") {
        if (t.length < 2) return !0;
        this.ProcessLineCommand(t);
      } else if (e === "f") return t.length < 3 || this.ProcessFaceCommand(t), !0;
    }
    return !1;
  }
  ProcessMaterialParameter(e, t, r) {
    function i(l) {
      let o = new Map(),
        a = null;
      for (let u = 0; u < l.length - 1; u++) {
        const h = l[u];
        if (h.startsWith("-")) {
          (a = h), o.set(a, []);
          continue;
        }
        a !== null && o.get(a).push(h);
      }
      return o;
    }
    function n(l, o) {
      const a = new Xe(),
        u = l[l.length - 1],
        h = o.getFileBuffer(u);
      (a.name = u), (a.buffer = h);
      const d = i(l);
      if (d.has("-o")) {
        const f = d.get("-o");
        f.length > 0 && (a.offset.x = parseFloat(f[0])),
          f.length > 1 && (a.offset.y = parseFloat(f[1]));
      }
      if (d.has("-s")) {
        const f = d.get("-s");
        f.length > 0 && (a.scale.x = parseFloat(f[0])),
          f.length > 1 && (a.scale.y = parseFloat(f[1]));
      }
      return a;
    }
    if (e === "newmtl") {
      if (t.length === 0) return !0;
      const l = new Me(),
        o = Ye(r, e.length, "#"),
        a = this.model.AddMaterial(l);
      return (l.name = o), (this.currentMaterial = l), this.materialNameToIndex.set(o, a), !0;
    } else if (e === "usemtl") {
      if (t.length === 0) return !0;
      const l = Ye(r, e.length, "#");
      return (
        this.materialNameToIndex.has(l) &&
          (this.currentMaterialIndex = this.materialNameToIndex.get(l)),
        !0
      );
    } else if (e === "mtllib") {
      if (t.length === 0) return !0;
      const l = Ye(r, e.length, "#"),
        o = this.callbacks.getFileBuffer(l);
      if (o !== null) {
        const a = fe(o);
        Le(a, (u) => {
          this.WasError() || this.ProcessLine(u);
        });
      }
      return !0;
    } else {
      if (e === "map_kd")
        return (
          this.currentMaterial === null ||
            t.length === 0 ||
            ((this.currentMaterial.diffuseMap = n(t, this.callbacks)), ye(this.currentMaterial)),
          !0
        );
      if (e === "map_ks")
        return (
          this.currentMaterial === null ||
            t.length === 0 ||
            (this.currentMaterial.specularMap = n(t, this.callbacks)),
          !0
        );
      if (e === "map_bump" || e === "bump")
        return (
          this.currentMaterial === null ||
            t.length === 0 ||
            (this.currentMaterial.bumpMap = n(t, this.callbacks)),
          !0
        );
      if (e === "ka")
        return (
          this.currentMaterial === null ||
            t.length < 3 ||
            (this.currentMaterial.ambient = Dt(t[0], t[1], t[2])),
          !0
        );
      if (e === "kd")
        return (
          this.currentMaterial === null ||
            t.length < 3 ||
            (this.currentMaterial.color = Dt(t[0], t[1], t[2])),
          !0
        );
      if (e === "ks")
        return (
          this.currentMaterial === null ||
            t.length < 3 ||
            (this.currentMaterial.specular = Dt(t[0], t[1], t[2])),
          !0
        );
      if (e === "ns")
        return (
          this.currentMaterial === null ||
            t.length < 1 ||
            (this.currentMaterial.shininess = parseFloat(t[0]) / 1e3),
          !0
        );
      if (e === "tr")
        return (
          this.currentMaterial === null ||
            t.length < 1 ||
            ((this.currentMaterial.opacity = 1 - parseFloat(t[0])), ye(this.currentMaterial)),
          !0
        );
      if (e === "d")
        return (
          this.currentMaterial === null ||
            t.length < 1 ||
            ((this.currentMaterial.opacity = parseFloat(t[0])), ye(this.currentMaterial)),
          !0
        );
    }
    return !1;
  }
  ProcessLineCommand(e) {
    this.currentMeshConverter === null && this.AddNewMesh("");
    const t = [];
    for (let i = 0; i < e.length; i++) {
      const n = e[i].split("/"),
        l = this.GetRelativeIndex(parseInt(n[0], 10), this.globalVertices.length),
        o = this.currentMeshConverter.AddVertex(l, this.globalVertices);
      if (o === null) {
        this.SetError(b("Invalid vertex index."));
        break;
      }
      t.push(o);
    }
    const r = new et(t);
    this.currentMaterialIndex !== null && (r.mat = this.currentMaterialIndex),
      this.currentMeshConverter.AddLine(r);
  }
  ProcessFaceCommand(e) {
    const t = [],
      r = [],
      i = [],
      n = [];
    this.currentMeshConverter === null && this.AddNewMesh("");
    for (let l = 0; l < e.length; l++) {
      const o = e[l].split("/");
      t.push(this.GetRelativeIndex(parseInt(o[0], 10), this.globalVertices.length)),
        this.globalVertices.length === this.globalVertexColors.length &&
          r.push(this.GetRelativeIndex(parseInt(o[0], 10), this.globalVertices.length)),
        o.length > 1 &&
          o[1].length > 0 &&
          n.push(this.GetRelativeIndex(parseInt(o[1], 10), this.globalUvs.length)),
        o.length > 2 &&
          o[2].length > 0 &&
          i.push(this.GetRelativeIndex(parseInt(o[2], 10), this.globalNormals.length));
    }
    for (let l = 0; l < t.length - 2; l++) {
      const o = this.currentMeshConverter.AddVertex(t[0], this.globalVertices),
        a = this.currentMeshConverter.AddVertex(t[l + 1], this.globalVertices),
        u = this.currentMeshConverter.AddVertex(t[l + 2], this.globalVertices);
      if (o === null || a === null || u === null) {
        this.SetError(b("Invalid vertex index."));
        break;
      }
      const h = new q(o, a, u);
      if (r.length === t.length) {
        const d = this.currentMeshConverter.AddVertexColor(r[0], this.globalVertexColors),
          f = this.currentMeshConverter.AddVertexColor(r[l + 1], this.globalVertexColors),
          c = this.currentMeshConverter.AddVertexColor(r[l + 2], this.globalVertexColors);
        if (d === null || f === null || c === null) {
          this.SetError(b("Invalid vertex color index."));
          break;
        }
        h.SetVertexColors(d, f, c);
      }
      if (i.length === t.length) {
        const d = this.currentMeshConverter.AddNormal(i[0], this.globalNormals),
          f = this.currentMeshConverter.AddNormal(i[l + 1], this.globalNormals),
          c = this.currentMeshConverter.AddNormal(i[l + 2], this.globalNormals);
        if (d === null || f === null || c === null) {
          this.SetError(b("Invalid normal index."));
          break;
        }
        h.SetNormals(d, f, c);
      }
      if (n.length === t.length) {
        const d = this.currentMeshConverter.AddUV(n[0], this.globalUvs),
          f = this.currentMeshConverter.AddUV(n[l + 1], this.globalUvs),
          c = this.currentMeshConverter.AddUV(n[l + 2], this.globalUvs);
        if (d === null || f === null || c === null) {
          this.SetError(b("Invalid uv index."));
          break;
        }
        h.SetTextureUVs(d, f, c);
      }
      this.currentMaterialIndex !== null && (h.mat = this.currentMaterialIndex),
        this.currentMeshConverter.AddTriangle(h);
    }
  }
  GetRelativeIndex(e, t) {
    return e > 0 ? e - 1 : t + e;
  }
}
class Ri extends re {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "off";
  }
  GetUpDirection() {
    return V.Y;
  }
  ClearContent() {
    (this.mesh = null), (this.status = null), (this.colorToMaterial = null);
  }
  ResetContent() {
    (this.mesh = new $()),
      this.model.AddMeshToRootNode(this.mesh),
      (this.status = { vertexCount: 0, faceCount: 0, foundVertex: 0, foundFace: 0 }),
      (this.colorToMaterial = new Ke(this.model));
  }
  ImportContent(e, t) {
    const r = fe(e);
    Le(r, (i) => {
      this.WasError() || this.ProcessLine(i);
    }),
      t();
  }
  ProcessLine(e) {
    function t(n) {
      return n.indexOf(".") !== -1 ? te(parseFloat(n)) : parseInt(n, 10);
    }
    if (e[0] === "#") return;
    const r = Je(e, "#");
    if (r.length === 0 || r[0] === "OFF") return;
    if (this.status.vertexCount === 0 && this.status.faceCount === 0) {
      r.length > 1 &&
        ((this.status.vertexCount = parseInt(r[0], 10)),
        (this.status.faceCount = parseInt(r[1], 10)));
      return;
    }
    if (this.status.foundVertex < this.status.vertexCount) {
      r.length >= 3 &&
        (this.mesh.AddVertex(new v(parseFloat(r[0]), parseFloat(r[1]), parseFloat(r[2]))),
        (this.status.foundVertex += 1)),
        r.length >= 6 && this.mesh.AddVertexColor(new L(t(r[3]), t(r[4]), t(r[5])));
      return;
    }
    const i = this.mesh.VertexCount() === this.mesh.VertexColorCount();
    if (this.status.foundFace < this.status.faceCount) {
      if (r.length >= 4) {
        const n = parseInt(r[0], 10);
        if (r.length < n + 1) return;
        let l = null;
        if (!i && r.length >= n + 4) {
          const o = new L(t(r[n + 1]), t(r[n + 2]), t(r[n + 3]));
          l = this.colorToMaterial.GetMaterialIndex(o.r, o.g, o.b);
        }
        for (let o = 0; o < n - 2; o++) {
          const a = parseInt(r[1]),
            u = parseInt(r[o + 2]),
            h = parseInt(r[o + 3]),
            d = new q(a, u, h);
          i ? d.SetVertexColors(a, u, h) : d.SetMaterial(l), this.mesh.AddTriangle(d);
        }
        this.status.foundFace += 1;
      }
      return;
    }
  }
}
const Re = { Ok: 1, NoVertices: 2, NoFaces: 3, UnknownError: 4 };
class cs {
  constructor() {
    (this.format = null), (this.elements = []);
  }
  SetFormat(e) {
    this.format = e;
  }
  AddElement(e, t) {
    this.elements.push({ name: e, count: t, format: [] });
  }
  GetElements() {
    return this.elements;
  }
  AddSingleFormat(e, t) {
    this.elements[this.elements.length - 1].format.push({ name: t, isSingle: !0, elemType: e });
  }
  AddListFormat(e, t, r) {
    this.elements[this.elements.length - 1].format.push({
      name: r,
      isSingle: !1,
      countType: e,
      elemType: t,
    });
  }
  GetElement(e) {
    for (let t = 0; t < this.elements.length; t++) {
      const r = this.elements[t];
      if (r.name === e) return r;
    }
    return null;
  }
  Check() {
    const e = this.GetElement("vertex");
    if (e === null || e.length === 0 || e.format.length < 3) return Re.NoVertices;
    const t = this.GetElement("face");
    if (this.format === "ascii") {
      if (t === null || t.count === 0 || t.format.length < 0) return Re.NoFaces;
    } else if (this.format === "binary_little_endian" || this.format === "binary_big_endian") {
      const r = this.GetElement("tristrips"),
        i = t !== null && t.count > 0 && t.format.length > 0,
        n = r !== null && r.count > 0 && r.format.length > 0;
      if (!i && !n) return Re.NoFaces;
    } else return Re.UnknownError;
    return Re.Ok;
  }
}
class ms {
  constructor(e) {
    (this.model = e), (this.colorToMaterial = new Map());
  }
  GetMaterialIndexByColor(e) {
    const t = "Color " + H(e[0]) + H(e[1]) + H(e[2]) + H(e[3]);
    if (this.colorToMaterial.has(t)) return this.colorToMaterial.get(t);
    {
      const r = new Me();
      (r.name = t), (r.color = new L(e[0], e[1], e[2])), (r.opacity = e[3] / 255), ye(r);
      const i = this.model.AddMaterial(r);
      return this.colorToMaterial.set(t, i), i;
    }
  }
}
class Ni extends re {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "ply";
  }
  GetUpDirection() {
    return V.Y;
  }
  ClearContent() {
    this.mesh = null;
  }
  ResetContent() {
    (this.mesh = new $()), this.model.AddMeshToRootNode(this.mesh);
  }
  ImportContent(e, t) {
    const r = this.GetHeaderContent(e),
      i = this.ReadHeader(r),
      n = i.Check();
    if (n === Re.Ok)
      if (i.format === "ascii") {
        let l = fe(e);
        (l = l.substring(r.length)), this.ReadAsciiContent(i, l);
      } else
        (i.format === "binary_little_endian" || i.format === "binary_big_endian") &&
          this.ReadBinaryContent(i, e, r.length);
    else
      n === Re.NoVertices
        ? this.SetError(b("The model contains no vertices."))
        : n === Re.NoFaces
          ? this.SetError(b("The model contains no faces."))
          : this.SetError(b("Invalid header information."));
    t();
  }
  GetHeaderContent(e) {
    let t = "",
      r = new Uint8Array(e),
      i = 0;
    for (
      i = 0;
      i < e.byteLength && ((t += String.fromCharCode(r[i])), !t.endsWith("end_header"));
      i++
    );
    for (i += 1; i < e.byteLength; ) {
      const n = String.fromCharCode(r[i]);
      if (
        ((t += n),
        (i += 1),
        n ===
          `
`)
      )
        break;
    }
    return t;
  }
  ReadHeader(e) {
    const t = new cs();
    return (
      Le(e, (r) => {
        const i = Je(r, null);
        i.length === 0 ||
          i[0] === "comment" ||
          (i[0] !== "ply" &&
            (i[0] === "format" && i.length >= 2
              ? t.SetFormat(i[1])
              : i[0] === "element" && i.length >= 3
                ? t.AddElement(i[1], parseInt(i[2], 10))
                : i[0] === "property" &&
                  i.length >= 3 &&
                  (i[1] === "list" && i.length >= 5
                    ? t.AddListFormat(i[2], i[3], i[4])
                    : t.AddSingleFormat(i[1], i[2]))));
      }),
      t
    );
  }
  ReadAsciiContent(e, t) {
    let r = e.GetElement("vertex"),
      i = e.GetElement("face"),
      n = 0,
      l = 0;
    Le(t, (o) => {
      if (this.WasError()) return;
      const a = Je(o, null);
      if (!(a.length === 0 || a[0] === "comment")) {
        if (n < r.count) {
          a.length >= 3 &&
            (this.mesh.AddVertex(new v(parseFloat(a[0]), parseFloat(a[1]), parseFloat(a[2]))),
            (n += 1));
          return;
        }
        if (i !== null && l < i.count) {
          if (a.length >= 4) {
            const u = parseInt(a[0], 10);
            if (a.length < u + 1) return;
            for (let h = 0; h < u - 2; h++) {
              const d = parseInt(a[1]),
                f = parseInt(a[h + 2]),
                c = parseInt(a[h + 3]),
                m = new q(d, f, c);
              this.mesh.AddTriangle(m);
            }
            l += 1;
          }
          return;
        }
      }
    });
  }
  ReadBinaryContent(e, t, r) {
    function i(h, d) {
      function f(c, m) {
        return m === "char" || m === "int8"
          ? c.ReadCharacter8()
          : m === "uchar" || m === "uint8"
            ? c.ReadUnsignedCharacter8()
            : m === "short" || m === "int16"
              ? c.ReadInteger16()
              : m === "ushort" || m === "uint16"
                ? c.ReadUnsignedInteger16()
                : m === "int" || m === "int32"
                  ? c.ReadInteger32()
                  : m === "uint" || m === "uint32"
                    ? c.ReadUnsignedInteger32()
                    : m === "float" || m === "float32"
                      ? c.ReadFloat32()
                      : m === "double" || m === "double64"
                        ? c.ReadDouble64()
                        : null;
      }
      if (d.isSingle) return f(h, d.elemType);
      {
        const c = [],
          m = f(h, d.countType);
        for (let p = 0; p < m; p++) c.push(f(h, d.elemType));
        return c;
      }
    }
    function n(h, d, f) {
      for (let c = f; c < d.length; c++) i(h, d[c]);
    }
    function l(h, d, f) {
      let c = null,
        m = null,
        p = null,
        g = 255;
      for (let x = f; x < d.length; x++) {
        const C = d[x],
          T = i(h, C);
        C.name === "red"
          ? (c = T)
          : C.name === "green"
            ? (m = T)
            : C.name === "blue"
              ? (p = T)
              : C.name === "alpha" && (g = T);
      }
      return c !== null && m !== null && p !== null ? [c, m, p, g] : null;
    }
    let o = null;
    if (e.format === "binary_little_endian") o = new Ge(t, !0);
    else if (e.format === "binary_big_endian") o = new Ge(t, !1);
    else return;
    o.Skip(r);
    const a = new ms(this.model),
      u = e.GetElements();
    for (let h = 0; h < u.length; h++) {
      const d = u[h];
      if (d.name === "vertex")
        for (let f = 0; f < d.count; f++) {
          const c = i(o, d.format[0]),
            m = i(o, d.format[1]),
            p = i(o, d.format[2]),
            g = l(o, d.format, 3);
          g !== null && this.mesh.AddVertexColor(new L(g[0], g[1], g[2])),
            this.mesh.AddVertex(new v(c, m, p));
        }
      else if (d.name === "face")
        for (let f = 0; f < d.count; f++) {
          const c = i(o, d.format[0]),
            m = l(o, d.format, 1);
          for (let p = 0; p < c.length - 2; p++) {
            const g = c[0],
              x = c[p + 1],
              C = c[p + 2],
              T = new q(g, x, C);
            m !== null
              ? (T.mat = a.GetMaterialIndexByColor(m))
              : this.mesh.VertexColorCount() > 0 && T.SetVertexColors(g, x, C),
              this.mesh.AddTriangle(T);
          }
        }
      else if (d.name === "tristrips")
        for (let f = 0; f < d.count; f++) {
          const c = i(o, d.format[0]);
          n(o, d.format, 1);
          let m = !0;
          for (let p = 0; p < c.length - 2; p++) {
            let g = c[p],
              x = c[p + 1],
              C = c[p + 2];
            if (C === -1) {
              (p += 2), (m = !0);
              continue;
            }
            if (!m) {
              const M = x;
              (x = C), (C = M);
            }
            m = !m;
            const T = new q(g, x, C);
            this.mesh.AddTriangle(T);
          }
        }
      else n(o, d.format, 0);
    }
  }
}
class Fi extends re {
  constructor() {
    super(), (this.worker = null);
  }
  CanImportExtension(e) {
    return (
      e === "stp" || e === "step" || e === "igs" || e === "iges" || e === "brp" || e === "brep"
    );
  }
  GetUpDirection() {
    return V.Y;
  }
  ClearContent() {
    this.worker !== null && (this.worker.terminate(), (this.worker = null));
  }
  ResetContent() {
    this.worker = null;
  }
  ImportContent(e, t) {
    Jt()
      .then((r) => {
        (this.worker = r),
          this.worker.addEventListener("message", (o) => {
            this.ImportResultJson(o.data, t);
          }),
          this.worker.addEventListener("error", (o) => {
            this.SetError(b("Failed to load occt-import-js.")), t();
          });
        let i = null;
        if (this.extension === "stp" || this.extension === "step") i = "step";
        else if (this.extension === "igs" || this.extension === "iges") i = "iges";
        else if (this.extension === "brp" || this.extension === "brep") i = "brep";
        else {
          t();
          return;
        }
        (i === "step" || i === "iges") && this.model.SetUnit(Vt.Millimeter);
        const n = {
            linearUnit: "millimeter",
            linearDeflectionType: "bounding_box_ratio",
            linearDeflection: 0.001,
            angularDeflection: 0.5,
          },
          l = new Uint8Array(e);
        this.worker.postMessage({ format: i, buffer: l, params: n });
      })
      .catch(() => {
        this.SetError(b("Failed to load occt-import-js.")), t();
      });
  }
  ImportResultJson(e, t) {
    if (!e.success) {
      t();
      return;
    }
    const r = new Ke(this.model),
      i = this.model.GetRootNode();
    this.ImportNode(e, e.root, i, r), t();
  }
  ImportNode(e, t, r, i) {
    for (const n of t.meshes) {
      const l = e.meshes[n],
        o = this.ImportMesh(l, i),
        a = this.model.AddMesh(o);
      r.AddMeshIndex(a);
    }
    for (const n of t.children) {
      const l = new Ae();
      l.SetName(n.name), r.AddChildNode(l), this.ImportNode(e, n, l, i);
    }
  }
  ImportMesh(e, t) {
    let r = null;
    if (e.color) {
      const n = Pe(e.color[0], e.color[1], e.color[2]);
      r = t.GetMaterialIndex(n.r, n.g, n.b, null);
    }
    const i = Qe(e, r, null);
    e.name && i.SetName(e.name);
    for (const n of e.brep_faces) {
      if (n.color === null) continue;
      const l = Pe(n.color[0], n.color[1], n.color[2]),
        o = t.GetMaterialIndex(l.r, l.g, l.b, null);
      for (let a = n.first; a <= n.last; a++) i.GetTriangle(a).SetMaterial(o);
    }
    return i;
  }
}
class Pi extends re {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "stl";
  }
  GetUpDirection() {
    return V.Z;
  }
  ClearContent() {
    (this.mesh = null), (this.triangle = null);
  }
  ResetContent() {
    (this.mesh = new $()), this.model.AddMeshToRootNode(this.mesh), (this.triangle = null);
  }
  ImportContent(e, t) {
    if (this.IsBinaryStlFile(e)) this.ProcessBinary(e);
    else {
      const r = fe(e);
      Le(r, (i) => {
        this.WasError() || this.ProcessLine(i);
      });
    }
    t();
  }
  IsBinaryStlFile(e) {
    const t = e.byteLength;
    if (t < 84) return !1;
    const r = new Ge(e, !0);
    r.Skip(80);
    const i = r.ReadUnsignedInteger32();
    return t === i * 50 + 84;
  }
  ProcessLine(e) {
    if (e[0] === "#") return;
    const t = Je(e, "#");
    if (t.length === 0) return;
    const r = t[0];
    if (r === "solid") {
      if (t.length > 1) {
        const i = Ye(e, r.length, "#");
        this.mesh.SetName(i);
      }
      return;
    }
    if (r === "facet") {
      if (((this.triangle = new q(-1, -1, -1)), t.length >= 5 && t[1] === "normal")) {
        const i = new v(parseFloat(t[2]), parseFloat(t[3]), parseFloat(t[4]));
        if (Te(i.Length())) {
          const n = this.mesh.AddNormal(i);
          this.triangle.SetNormals(n, n, n);
        }
      }
      return;
    }
    if (r === "vertex" && this.triangle !== null) {
      if (t.length >= 4) {
        const i = this.mesh.AddVertex(new v(parseFloat(t[1]), parseFloat(t[2]), parseFloat(t[3])));
        this.triangle.v0 === -1
          ? (this.triangle.v0 = i)
          : this.triangle.v1 === -1
            ? (this.triangle.v1 = i)
            : this.triangle.v2 === -1 && (this.triangle.v2 = i);
      }
      return;
    }
    if (r === "endfacet" && this.triangle !== null) {
      this.triangle.v0 !== -1 &&
        this.triangle.v1 !== -1 &&
        this.triangle.v2 !== null &&
        this.mesh.AddTriangle(this.triangle),
        (this.triangle = null);
      return;
    }
  }
  ProcessBinary(e) {
    function t(l) {
      const o = new v();
      return (o.x = l.ReadFloat32()), (o.y = l.ReadFloat32()), (o.z = l.ReadFloat32()), o;
    }
    function r(l, o) {
      const a = t(o);
      return l.AddVertex(a);
    }
    const i = new Ge(e, !0);
    i.Skip(80);
    const n = i.ReadUnsignedInteger32();
    for (let l = 0; l < n; l++) {
      const o = t(i),
        a = r(this.mesh, i),
        u = r(this.mesh, i),
        h = r(this.mesh, i);
      i.Skip(2);
      const d = new q(a, u, h);
      if (Te(o.Length())) {
        const f = this.mesh.AddNormal(o);
        d.SetNormals(f, f, f);
      }
      this.mesh.AddTriangle(d);
    }
  }
}
class Vi extends re {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "bim";
  }
  GetUpDirection() {
    return V.Z;
  }
  ClearContent() {
    (this.meshIdToMesh = null), (this.colorToMaterial = null);
  }
  ResetContent() {
    (this.meshIdToMesh = new Map()), (this.colorToMaterial = new Ke(this.model));
  }
  ImportContent(e, t) {
    this.model.SetUnit(Vt.Meter);
    let r = fe(e),
      i = null;
    try {
      i = JSON.parse(r);
    } catch {
      this.SetError(b("Failed to parse bim file.")), t();
      return;
    }
    for (const n of i.meshes) this.meshIdToMesh.set(n.mesh_id, n);
    this.ImportProperties(i, this.model);
    for (const n of i.elements) {
      const l = this.ImportElement(n);
      l.SetName(n.type), this.ImportProperties(n, l);
    }
    t();
  }
  ImportElement(e) {
    let t = null;
    e.color &&
      (t = this.colorToMaterial.GetMaterialIndex(e.color.r, e.color.g, e.color.b, e.color.a));
    const r = this.model.GetRootNode(),
      i = this.meshIdToMesh.get(e.mesh_id),
      n = this.ImportMesh(i, (f) =>
        e.face_colors
          ? this.colorToMaterial.GetMaterialIndex(
              e.face_colors[f * 4 + 0],
              e.face_colors[f * 4 + 1],
              e.face_colors[f * 4 + 2],
              e.face_colors[f * 4 + 3]
            )
          : t
      ),
      l = this.model.AddMesh(n),
      o = new Ae();
    o.AddMeshIndex(l);
    let a = new v(0, 0, 0);
    e.vector && (a = new v(e.vector.x, e.vector.y, e.vector.z));
    let u = new pe(0, 0, 0, 1);
    e.rotation && (u = new pe(e.rotation.qx, e.rotation.qy, e.rotation.qz, e.rotation.qw));
    const h = new v(1, 1, 1),
      d = new j().ComposeTRS(a, u, h);
    return o.SetTransformation(new ie(d)), r.AddChildNode(o), n;
  }
  ImportMesh(e, t) {
    const r = new $();
    for (let i = 0; i < e.coordinates.length; i += 3)
      r.AddVertex(new v(e.coordinates[i + 0], e.coordinates[i + 1], e.coordinates[i + 2]));
    for (let i = 0; i < e.indices.length; i += 3) {
      const n = new q(e.indices[i + 0], e.indices[i + 1], e.indices[i + 2]);
      n.SetMaterial(t(i / 3)), r.AddTriangle(n);
    }
    return r;
  }
  ImportProperties(e, t) {
    function r(l, o, a) {
      if (a == null) return;
      const u = new z(U.Text, o, a);
      l.AddProperty(u);
    }
    if (!e.info || yr(e.info)) return;
    const i = e.info,
      n = new xe(b("Info"));
    r(n, b("Guid"), e.guid), r(n, b("Type"), e.type);
    for (const l in i) Object.hasOwn(i, l) && typeof i[l] == "string" && r(n, l, i[l]);
    t.AddPropertyGroup(n);
  }
}
class Ue extends re {
  constructor() {
    super(), (this.colorConverter = null);
  }
  CreateLoader(e) {
    return null;
  }
  GetMainObject(e) {
    return e;
  }
  IsMeshVisible(e) {
    return !0;
  }
  ClearContent() {
    (this.loader = null), (this.materialIdToIndex = null), (this.objectUrlToFileName = null);
  }
  ResetContent() {
    (this.loader = null),
      (this.materialIdToIndex = new Map()),
      (this.objectUrlToFileName = new Map());
  }
  ImportContent(e, t) {
    this.LoadModel(e, t);
  }
  LoadModel(e, t) {
    let r = !1,
      i = new I.LoadingManager(() => {
        r = !0;
      });
    const n = At(e);
    i.setURLModifier((o) => {
      if (o === n) return o;
      const a = oe(o);
      if (at(o).length > 0) {
        const h = this.callbacks.getFileBuffer(o);
        if (h !== null) {
          const d = At(h);
          return this.objectUrlToFileName.set(d, a), d;
        }
      }
      return o;
    });
    const l = this.CreateLoader(i);
    if (l === null) {
      t();
      return;
    }
    l.load(
      n,
      (o) => {
        Er(() => (r ? (this.OnThreeObjectsLoaded(o, t), !1) : !0));
      },
      () => {},
      (o) => {
        this.SetError(o), t();
      }
    );
  }
  OnThreeObjectsLoaded(e, t) {
    function r(o) {
      const a = new j().CreateIdentity();
      return (
        o.updateMatrix(),
        o.matrix !== void 0 && o.matrix !== null && a.Set(o.matrix.elements),
        new ie(a)
      );
    }
    function i(o, a, u, h) {
      const d = new Ae();
      u.name !== void 0 && d.SetName(u.name), d.SetTransformation(r(u)), h.AddChildNode(d);
      for (const f of u.children) i(o, a, f, d);
      if (u.isMesh && o.IsMeshVisible(u)) {
        const f = o.ConvertThreeMesh(u),
          c = a.AddMesh(f);
        d.AddMeshIndex(c);
      }
    }
    const n = this.GetMainObject(e),
      l = this.model.GetRootNode();
    l.SetTransformation(r(n));
    for (const o of n.children) i(this, this.model, o, l);
    t();
  }
  ConvertThreeMesh(e) {
    let t = null;
    if (Array.isArray(e.material)) {
      if (
        ((t = Qe(e.geometry, null, this.colorConverter)),
        e.geometry.attributes.color === void 0 || e.geometry.attributes.color === null)
      ) {
        const r = [];
        for (let i = 0; i < e.material.length; i++) {
          const n = e.material[i],
            l = this.FindOrCreateMaterial(n);
          r.push(l);
        }
        for (let i = 0; i < e.geometry.groups.length; i++) {
          let n = e.geometry.groups[i],
            l = null;
          n.count === 1 / 0 ? (l = t.TriangleCount()) : (l = n.start / 3 + n.count / 3);
          for (let o = n.start / 3; o < l; o++) t.GetTriangle(o).SetMaterial(r[n.materialIndex]);
        }
      }
    } else {
      const r = this.FindOrCreateMaterial(e.material);
      t = Qe(e.geometry, r, this.colorConverter);
    }
    return e.name !== void 0 && e.name !== null && t.SetName(e.name), t;
  }
  FindOrCreateMaterial(e) {
    if (this.materialIdToIndex.has(e.id)) return this.materialIdToIndex.get(e.id);
    let t = this.ConvertThreeMaterial(e),
      r = null;
    return t !== null && (r = this.model.AddMaterial(t)), this.materialIdToIndex.set(e.id, r), r;
  }
  ConvertThreeMaterial(e) {
    function t(i, n) {
      function l(o) {
        if (o.data !== void 0 && o.data !== null) {
          const a = new ImageData(o.width, o.height),
            u = o.width * o.height * 4;
          for (let h = 0; h < u; h++) a.data[h] = o.data[h];
          return I.ImageUtils.getDataURL(a);
        } else return I.ImageUtils.getDataURL(o);
      }
      if (i == null || i.image === void 0 || i.image === null) return null;
      try {
        const o = l(i.image),
          a = St(o);
        let u = new Xe(),
          h = null;
        return (
          n.has(i.image.src)
            ? (h = n.get(i.image.src))
            : i.name !== void 0 && i.name !== null
              ? (h = i.name + "." + ut(a.mimeType))
              : (h = "Embedded_" + i.id.toString() + "." + ut(a.mimeType)),
          (u.name = h),
          (u.mimeType = a.mimeType),
          (u.buffer = a.buffer),
          (u.rotation = i.rotation),
          (u.offset.x = i.offset.x),
          (u.offset.y = i.offset.y),
          (u.scale.x = i.repeat.x),
          (u.scale.y = i.repeat.y),
          u
        );
      } catch {
        return null;
      }
    }
    if (e.name === I.Loader.DEFAULT_MATERIAL_NAME) return null;
    const r = new Me();
    return (
      (r.name = e.name),
      (r.color = this.ConvertThreeColor(e.color)),
      (r.opacity = e.opacity),
      (r.transparent = e.transparent),
      (r.alphaTest = e.alphaTest),
      e.type === "MeshPhongMaterial" &&
        ((r.specular = this.ConvertThreeColor(e.specular)), (r.shininess = e.shininess / 100)),
      (r.diffuseMap = t(e.map, this.objectUrlToFileName)),
      (r.normalMap = t(e.normalMap, this.objectUrlToFileName)),
      (r.bumpMap = t(e.bumpMap, this.objectUrlToFileName)),
      r
    );
  }
  ConvertThreeColor(e) {
    return this.colorConverter !== null && (e = this.colorConverter.Convert(e)), lr(e);
  }
}
class Li extends Ue {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "fbx";
  }
  GetUpDirection() {
    return V.Y;
  }
  CreateLoader(e) {
    return e.addHandler(/\.tga$/i, new Cr(e)), new En(e);
  }
  GetMainObject(e) {
    return e;
  }
}
class Di extends Ue {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "dae";
  }
  GetUpDirection() {
    return V.Y;
  }
  CreateLoader(e) {
    return e.addHandler(/\.tga$/i, new Cr(e)), new Sn(e);
  }
  GetMainObject(e) {
    return e.scene;
  }
}
class Oi extends Ue {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "wrl";
  }
  GetUpDirection() {
    return V.Y;
  }
  CreateLoader(e) {
    return new An(e);
  }
  GetMainObject(e) {
    return e;
  }
  IsMeshVisible(e) {
    let t = !0;
    if (Array.isArray(e.material)) {
      for (let r = 0; r < e.material.length; r++)
        if (e.material[r].side === I.BackSide) {
          t = !1;
          break;
        }
    } else t = e.material.side !== I.BackSide;
    return t;
  }
}
class Bi extends Ue {
  constructor() {
    super(), (this.colorConverter = new Ti());
  }
  CanImportExtension(e) {
    return e === "3mf";
  }
  GetUpDirection() {
    return V.Z;
  }
  CreateLoader(e) {
    return new Gn(e);
  }
  GetMainObject(e) {
    return e;
  }
}
class Ui extends Ue {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "amf";
  }
  GetUpDirection() {
    return V.Z;
  }
  CreateLoader(e) {
    return new Rn(e);
  }
  GetMainObject(e) {
    return e;
  }
}
const ar = { Success: 0, NoDocumentXml: 1 };
class ps {
  constructor(e, t) {
    (this.name = e),
      (this.type = t),
      (this.shapeName = null),
      (this.isVisible = !1),
      (this.color = null),
      (this.fileName = null),
      (this.fileContent = null),
      (this.inLinkCount = 0),
      (this.properties = null);
  }
  IsConvertible() {
    return !(
      this.fileName === null ||
      this.fileContent === null ||
      !this.isVisible ||
      this.inLinkCount > 0
    );
  }
}
class gs {
  constructor() {
    (this.files = null),
      (this.properties = null),
      (this.objectNames = []),
      (this.objectData = new Map());
  }
  Init(e) {
    const t = new Uint8Array(e);
    return (
      (this.files = Tr.unzipSync(t)),
      this.LoadDocumentXml() ? (this.LoadGuiDocumentXml(), ar.Success) : ar.NoDocumentXml
    );
  }
  GetObjectListToConvert() {
    const e = [];
    for (const t of this.objectNames) {
      const r = this.objectData.get(t);
      r.IsConvertible() && e.push(r);
    }
    return e;
  }
  IsSupportedType(e) {
    return !(
      (!e.startsWith("Part::") && !e.startsWith("PartDesign::")) ||
      e.indexOf("Part2D") !== -1
    );
  }
  HasFile(e) {
    return e in this.files;
  }
  LoadDocumentXml() {
    const e = this.GetXMLContent("Document.xml");
    if (e === null) return !1;
    this.properties = new xe(b("Properties"));
    const t = e.getElementsByTagName("Document");
    for (const n of t)
      for (const l of n.childNodes)
        l.tagName === "Properties" && this.GetPropertiesFromElement(l, this.properties);
    const r = e.getElementsByTagName("Objects");
    for (const n of r) {
      const l = n.getElementsByTagName("Object");
      for (const o of l) {
        const a = o.getAttribute("name"),
          u = o.getAttribute("type");
        if (!this.IsSupportedType(u)) continue;
        const h = new ps(a, u);
        this.objectNames.push(a), this.objectData.set(a, h);
      }
    }
    const i = e.getElementsByTagName("ObjectData");
    for (const n of i) {
      const l = n.getElementsByTagName("Object");
      for (const o of l) {
        const a = o.getAttribute("name");
        if (!this.objectData.has(a)) continue;
        const u = this.objectData.get(a);
        u.properties = new xe(b("Properties"));
        for (const f of o.childNodes)
          f.tagName === "Properties" && this.GetPropertiesFromElement(f, u.properties);
        const h = o.getElementsByTagName("Property");
        for (const f of h) {
          const c = f.getAttribute("name");
          if (c === "Label") u.shapeName = this.GetFirstChildValue(f, "String", "value");
          else if (c === "Visibility") {
            const m = this.GetFirstChildValue(f, "Bool", "value");
            u.isVisible = m === "true";
          } else if (c === "Visible") {
            const m = this.GetFirstChildValue(f, "Bool", "value");
            u.isVisible = m === "true";
          } else if (c === "Shape") {
            const m = this.GetFirstChildValue(f, "Part", "file");
            if (!this.HasFile(m)) continue;
            const p = at(m);
            if (p !== "brp" && p !== "brep") continue;
            (u.fileName = m), (u.fileContent = this.files[m]);
          }
        }
        const d = o.getElementsByTagName("Link");
        for (const f of d) {
          const c = f.getAttribute("value");
          if (this.objectData.has(c)) {
            const m = this.objectData.get(c);
            m.inLinkCount += 1;
          }
        }
      }
    }
    return !0;
  }
  LoadGuiDocumentXml() {
    const e = this.GetXMLContent("GuiDocument.xml");
    if (e === null) return !1;
    const t = e.getElementsByTagName("ViewProvider");
    for (const r of t) {
      const i = r.getAttribute("name");
      if (!this.objectData.has(i)) continue;
      const n = this.objectData.get(i),
        l = r.getElementsByTagName("Property");
      for (const o of l) {
        const a = o.getAttribute("name");
        if (a === "Visibility") {
          const u = this.GetFirstChildValue(o, "Bool", "value");
          n.isVisible = u === "true";
        } else if (a === "ShapeColor") {
          const u = this.GetFirstChildValue(o, "PropertyColor", "value"),
            h = parseInt(u, 10);
          n.color = new $e((h >> 24) & 255, (h >> 16) & 255, (h >> 8) & 255, 255);
        }
      }
    }
    return !0;
  }
  GetPropertiesFromElement(e, t) {
    const r = e.getElementsByTagName("Property");
    for (const i of r) {
      let n = i.getAttribute("name"),
        l = i.getAttribute("type"),
        o = null;
      if (l === "App::PropertyBool") {
        const a = this.GetFirstChildValue(i, "String", "bool");
        a !== null && a.length > 0 && (o = new z(U.Boolean, n, a === "true"));
      } else if (l === "App::PropertyInteger") {
        const a = this.GetFirstChildValue(i, "Integer", "value");
        a !== null && a.length > 0 && (o = new z(U.Integer, n, parseInt(a)));
      } else if (l === "App::PropertyString") {
        const a = this.GetFirstChildValue(i, "String", "value");
        a !== null && a.length > 0 && (o = new z(U.Text, n, a));
      } else if (l === "App::PropertyUUID") {
        const a = this.GetFirstChildValue(i, "Uuid", "value");
        a !== null && a.length > 0 && (o = new z(U.Text, n, a));
      } else if (
        l === "App::PropertyFloat" ||
        l === "App::PropertyLength" ||
        l === "App::PropertyDistance" ||
        l === "App::PropertyArea" ||
        l === "App::PropertyVolume"
      ) {
        const a = this.GetFirstChildValue(i, "Float", "value");
        a !== null && a.length > 0 && (o = new z(U.Number, n, parseFloat(a)));
      }
      o !== null && t.AddProperty(o);
    }
  }
  GetXMLContent(e) {
    if (!this.HasFile(e)) return null;
    const t = new DOMParser(),
      r = fe(this.files[e]);
    return t.parseFromString(r, "text/xml");
  }
  GetFirstChildValue(e, t, r) {
    const i = e.getElementsByTagName(t);
    return i.length === 0 ? null : i[0].getAttribute(r);
  }
}
class zi extends re {
  constructor() {
    super(), (this.worker = null), (this.document = null);
  }
  CanImportExtension(e) {
    return e === "fcstd";
  }
  GetUpDirection() {
    return V.Z;
  }
  ClearContent() {
    this.worker !== null && (this.worker.terminate(), (this.worker = null)), (this.document = null);
  }
  ResetContent() {
    (this.worker = null), (this.document = new gs());
  }
  ImportContent(e, t) {
    if (this.document.Init(e) === ar.NoDocumentXml) {
      this.SetError(b("No Document.xml found.")), t();
      return;
    }
    this.document.properties !== null &&
      this.document.properties.PropertyCount() > 0 &&
      this.model.AddPropertyGroup(this.document.properties);
    const i = this.document.GetObjectListToConvert();
    if (i.length === 0) {
      this.SetError(b("No importable object found.")), t();
      return;
    }
    this.ConvertObjects(i, t);
  }
  ConvertObjects(e, t) {
    Jt()
      .then((r) => {
        (this.worker = r),
          this.worker.addEventListener("message", (a) => {
            l(a.data);
          }),
          this.worker.addEventListener("error", (a) => {
            l(null);
          });
        let i = 0,
          n = new Ke(this.model),
          l = (a) => {
            if (a !== null) {
              const u = e[i];
              this.OnFileConverted(u, a, n);
            }
            if (((i += 1), i === e.length)) t();
            else {
              const u = e[i];
              this.worker.postMessage({ format: "brep", buffer: u.fileContent });
            }
          },
          o = e[i];
        this.worker.postMessage({ format: "brep", buffer: o.fileContent });
      })
      .catch(() => {
        this.SetError(b("Failed to load occt-import-js.")), t();
      });
  }
  OnFileConverted(e, t, r) {
    if (!t.success || t.meshes.length === 0) return;
    const i = new Ae();
    e.shapeName !== null && i.SetName(e.shapeName);
    let n = 1;
    for (const o of t.meshes) {
      let a = null;
      e.color !== null && (a = r.GetMaterialIndex(e.color.r, e.color.g, e.color.b, e.color.a));
      const u = Qe(o, a, null);
      if (e.shapeName !== null) {
        const d = n.toString().padStart(3, "0");
        u.SetName(e.shapeName + " " + d);
      }
      e.properties !== null && e.properties.PropertyCount() > 0 && u.AddPropertyGroup(e.properties);
      const h = this.model.AddMesh(u);
      i.AddMeshIndex(h), (n += 1);
    }
    this.model.GetRootNode().AddChildNode(i);
  }
}
class ji {
  constructor() {
    (this.defaultLineColor = new L(100, 100, 100)), (this.defaultColor = new L(200, 200, 200));
  }
}
const Ne = { NoImportableFile: 1, FailedToLoadFile: 2, ImportFailed: 3, UnknownError: 4 };
class mt {
  constructor(e) {
    (this.code = e), (this.mainFile = null), (this.message = null);
  }
}
class _i {
  constructor() {
    (this.model = null),
      (this.mainFile = null),
      (this.upVector = null),
      (this.usedFiles = null),
      (this.missingFiles = null);
  }
}
class ki {
  constructor(e) {
    (this.getBufferCallback = e), (this.fileBuffers = new Map());
  }
  GetFileBuffer(e) {
    const t = oe(e);
    if (this.fileBuffers.has(t)) return this.fileBuffers.get(t);
    const r = this.getBufferCallback(t);
    return this.fileBuffers.set(t, r), r;
  }
}
class Wi {
  constructor() {
    (this.importers = [
      new Gi(),
      new Pi(),
      new Ri(),
      new Ni(),
      new Ei(),
      new Si(),
      new Vi(),
      new bi(),
      new Ai(),
      new Fi(),
      new zi(),
      new Li(),
      new Di(),
      new Oi(),
      new Bi(),
      new Ui(),
    ]),
      (this.fileList = new ir()),
      (this.model = null),
      (this.usedFiles = []),
      (this.missingFiles = []);
  }
  AddImporter(e) {
    this.importers.push(e);
  }
  ImportFiles(e, t, r) {
    r.onLoadStart(),
      this.LoadFiles(e, {
        onReady: () => {
          r.onImportStart(),
            Wt(() => {
              this.DecompressArchives(this.fileList, () => {
                this.ImportLoadedFiles(t, r);
              });
            });
        },
        onFileListProgress: r.onFileListProgress,
        onFileLoadProgress: r.onFileLoadProgress,
      });
  }
  LoadFiles(e, t) {
    const r = new ir();
    r.FillFromInputFiles(e);
    let i = !1;
    if (this.HasImportableFile(r)) i = !0;
    else {
      let n = !1;
      for (let l = 0; l < this.missingFiles.length; l++) {
        const o = this.missingFiles[l];
        r.ContainsFileByPath(o) && (n = !0);
      }
      n ? (this.fileList.ExtendFromFileList(r), (i = !1)) : (i = !0);
    }
    i && (this.fileList = r),
      this.fileList.GetContent({
        onReady: t.onReady,
        onFileListProgress: t.onFileListProgress,
        onFileLoadProgress: t.onFileLoadProgress,
      });
  }
  ImportLoadedFiles(e, t) {
    const r = this.GetImportableFiles(this.fileList);
    if (r.length === 0) {
      t.onImportError(new mt(Ne.NoImportableFile));
      return;
    }
    if (r.length === 1 || !t.onSelectMainFile) {
      const i = r[0];
      this.ImportLoadedMainFile(i, e, t);
    } else {
      const i = r.map((n) => n.file.name);
      t.onSelectMainFile(i, (n) => {
        if (n === null) {
          t.onImportError(new mt(Ne.NoImportableFile));
          return;
        }
        Wt(() => {
          const l = r[n];
          this.ImportLoadedMainFile(l, e, t);
        });
      });
    }
  }
  ImportLoadedMainFile(e, t, r) {
    if (e === null || e.file === null || e.file.content === null) {
      const l = new mt(Ne.FailedToLoadFile);
      e !== null && e.file !== null && (l.mainFile = e.file.name), r.onImportError(l);
      return;
    }
    (this.model = null),
      (this.usedFiles = []),
      (this.missingFiles = []),
      this.usedFiles.push(e.file.name);
    const i = e.importer,
      n = new ki((l) => {
        let o = null,
          a = this.fileList.FindFileByPath(l);
        return (
          a === null || a.content === null
            ? (this.missingFiles.push(l), (o = null))
            : (this.usedFiles.push(l), (o = a.content)),
          o
        );
      });
    i.Import(e.file.name, e.file.extension, e.file.content, {
      getDefaultLineMaterialColor: () => t.defaultLineColor,
      getDefaultMaterialColor: () => t.defaultColor,
      getFileBuffer: (l) => n.GetFileBuffer(l),
      onSuccess: () => {
        this.model = i.GetModel();
        const l = new _i();
        (l.mainFile = e.file.name),
          (l.model = this.model),
          (l.usedFiles = this.usedFiles),
          (l.missingFiles = this.missingFiles),
          (l.upVector = i.GetUpDirection()),
          r.onImportSuccess(l);
      },
      onError: () => {
        const l = new mt(Ne.ImportFailed);
        (l.mainFile = e.file.name), (l.message = i.GetErrorMessage()), r.onImportError(l);
      },
      onComplete: () => {
        i.Clear();
      },
    });
  }
  DecompressArchives(e, t) {
    const r = e.GetFiles(),
      i = [];
    for (const n of r) n.extension === "zip" && i.push(n);
    if (i.length === 0) {
      t();
      return;
    }
    for (let n = 0; n < i.length; n++) {
      const l = i[n],
        o = new Uint8Array(l.content),
        a = Tr.unzipSync(o);
      for (const u in a)
        if (Object.hasOwn(a, u)) {
          const h = new rr(u, we.Decompressed, null);
          h.SetContent(a[u].buffer), e.AddFile(h);
        }
    }
    t();
  }
  GetFileList() {
    return this.fileList;
  }
  HasImportableFile(e) {
    return this.GetImportableFiles(e).length > 0;
  }
  GetImportableFiles(e) {
    function t(n, l) {
      for (let o = 0; o < l.length; o++) {
        const a = l[o];
        if (a.CanImportExtension(n.extension)) return a;
      }
      return null;
    }
    const r = [],
      i = e.GetFiles();
    for (let n = 0; n < i.length; n++) {
      const l = i[n],
        o = t(l, this.importers);
      o !== null && r.push({ file: l, importer: o });
    }
    return r;
  }
}
class xs extends Ue {
  constructor() {
    super();
  }
  CanImportExtension(e) {
    return e === "svg";
  }
  GetUpDirection() {
    return V.Z;
  }
  CreateLoader(e) {
    return new Mr(e);
  }
  GetMainObject(e) {
    function t(l) {
      const o = l.userData.style;
      return !(o.fill === void 0 || o.fill === "none");
    }
    function r(l, o, a) {
      let u = null;
      for (const h of l)
        if (h.style === o && h.opacity === a) {
          u = h.material;
          break;
        }
      return (
        u === null &&
          ((u = new I.MeshPhongMaterial({
            color: new I.Color().setStyle(o),
            opacity: a,
            transparent: a < 1,
          })),
          l.push({ style: o, opacity: a, material: u })),
        u
      );
    }
    const i = [],
      n = new I.Object3D();
    n.rotation.x = Math.PI;
    for (const l of e.paths) {
      const o = Mr.createShapes(l);
      if (t(l)) {
        const a = l.userData.style,
          u = r(i, a.fill, a.opacity);
        for (const h of o) {
          const d = new I.ExtrudeGeometry(h, { depth: 10, bevelEnabled: !1 }),
            f = new I.Mesh(d, u);
          (f.name = l.userData.node.id), n.add(f);
        }
      }
    }
    return n;
  }
}
class Hi {
  constructor() {
    (this.name = null), (this.material = null);
  }
  SetName(e) {
    return (this.name = e), this;
  }
  SetMaterial(e) {
    return (this.material = e), this;
  }
}
class pt {
  constructor(e) {
    (this.params = e || new Hi()),
      (this.mesh = new $()),
      this.params.name !== null && this.mesh.SetName(this.params.name),
      (this.curve = null);
  }
  GetMesh() {
    return this.mesh;
  }
  AddVertex(e, t, r) {
    const i = new v(e, t, r);
    return this.mesh.AddVertex(i);
  }
  AddVertices(e) {
    const t = [];
    for (let r = 0; r < e.length; r++) {
      const i = e[r];
      t.push(this.AddVertex(i.x, i.y, i.z));
    }
    return t;
  }
  SetCurve(e) {
    this.curve = e;
  }
  ResetCurve() {
    this.curve = null;
  }
  AddTriangle(e, t, r) {
    const i = new q(e, t, r);
    return (
      this.params.material !== null && (i.mat = this.params.material),
      this.curve !== null && i.SetCurve(this.curve),
      this.mesh.AddTriangle(i)
    );
  }
  AddTriangleInverted(e, t, r) {
    this.AddTriangle(e, r, t);
  }
  AddConvexPolygon(e) {
    for (let t = 0; t < e.length - 2; t++) this.AddTriangle(e[0], e[t + 1], e[t + 2]);
  }
  AddConvexPolygonInverted(e) {
    for (let t = 0; t < e.length - 2; t++) this.AddTriangleInverted(e[0], e[t + 1], e[t + 2]);
  }
}
class ur {
  constructor(e) {
    this.generator = e;
  }
  GenerateSurfaceBetweenPolygons(e, t) {
    if (e.length !== t.length) return;
    const r = e.length;
    for (let i = 0; i < r; i++) {
      const n = i,
        l = i < r - 1 ? n + 1 : 0;
      this.generator.AddConvexPolygon([e[n], e[l], t[l], t[n]]);
    }
  }
  GenerateTriangleFan(e, t) {
    const r = e.length;
    for (let i = 0; i < r; i++) {
      const n = i,
        l = i < r - 1 ? n + 1 : 0;
      this.generator.AddTriangle(t, e[n], e[l]);
    }
  }
}
function qi(s, e) {
  return new D(s * Math.cos(e), s * Math.sin(e));
}
function Cs(s, e, t, r) {
  if (!Te(e) || !Te(t) || !Te(r)) return null;
  const i = new pt(s);
  return (
    i.AddVertex(0, 0, 0),
    i.AddVertex(e, 0, 0),
    i.AddVertex(e, t, 0),
    i.AddVertex(0, t, 0),
    i.AddVertex(0, 0, r),
    i.AddVertex(e, 0, r),
    i.AddVertex(e, t, r),
    i.AddVertex(0, t, r),
    i.AddConvexPolygon([0, 3, 2, 1]),
    i.AddConvexPolygon([0, 1, 5, 4]),
    i.AddConvexPolygon([1, 2, 6, 5]),
    i.AddConvexPolygon([2, 3, 7, 6]),
    i.AddConvexPolygon([3, 0, 4, 7]),
    i.AddConvexPolygon([4, 5, 6, 7]),
    i.GetMesh()
  );
}
function Xi(s, e, t, r, i, n) {
  if (it(e) || it(t) || !Te(r) || i < 3) return null;
  const l = rt(e),
    o = rt(t);
  if (l && o) return null;
  const a = new pt(s),
    u = new ur(a);
  const h = (2 * Math.PI) / i,
    d = n ? 1 : null;
  const f = [];
  if (l) f.push(a.AddVertex(0, 0, r));
  else
    for (let m = 0; m < i; m++) {
      const p = qi(e, m * h);
      f.push(a.AddVertex(p.x, p.y, r));
    }
  const c = [];
  if (o) c.push(a.AddVertex(0, 0, 0));
  else
    for (let m = 0; m < i; m++) {
      const p = qi(t, m * h);
      c.push(a.AddVertex(p.x, p.y, 0));
    }
  return (
    l
      ? (a.SetCurve(d),
        u.GenerateTriangleFan(c, f[0]),
        a.ResetCurve(),
        a.AddConvexPolygonInverted(c))
      : o
        ? (a.SetCurve(d),
          u.GenerateTriangleFan(f.slice().reverse(), c[0]),
          a.ResetCurve(),
          a.AddConvexPolygon(f))
        : (a.SetCurve(d),
          u.GenerateSurfaceBetweenPolygons(c, f),
          a.ResetCurve(),
          a.AddConvexPolygonInverted(c),
          a.AddConvexPolygon(f)),
    a.GetMesh()
  );
}
function Ts(s, e, t, r, i) {
  return Xi(s, e, e, t, r, i);
}
function Ms(s, e, t, r) {
  function i(c, m, p) {
    return new v(c * Math.sin(m) * Math.cos(p), c * Math.sin(m) * Math.sin(p), c * Math.cos(m));
  }
  if (!Te(e) || t < 3) return null;
  const n = new pt(s),
    l = new ur(n);
  n.SetCurve(r ? 1 : null);
  const o = [],
    a = t + 1;
  const u = Math.PI / t,
    h = (2 * Math.PI) / t;
  for (let c = 1; c < a - 1; c++) {
    const m = [],
      p = c * u;
    for (let g = 0; g < t; g++) {
      const x = g * h,
        C = i(e, p, -x);
      m.push(n.AddVertex(C.x, C.y, C.z));
    }
    c > 1 && l.GenerateSurfaceBetweenPolygons(o[o.length - 1], m), o.push(m);
  }
  const d = n.AddVertex(0, 0, e),
    f = n.AddVertex(0, 0, -e);
  return (
    l.GenerateTriangleFan(o[0].slice().reverse(), d),
    l.GenerateTriangleFan(o[o.length - 1], f),
    n.ResetCurve(),
    n.GetMesh()
  );
}
function ys(s, e, t) {
  function r(n, l, o, a, u) {
    const h = new v(o, a, u);
    h.MultiplyScalar(l / h.Length()), n.AddVertex(h.x, h.y, h.z);
  }
  if (!Te(t)) return null;
  const i = new pt(s);
  if (e === "tetrahedron")
    r(i, t, 1, 1, 1),
      r(i, t, -1, -1, 1),
      r(i, t, -1, 1, -1),
      r(i, t, 1, -1, -1),
      i.AddTriangle(0, 1, 3),
      i.AddTriangle(0, 2, 1),
      i.AddTriangle(0, 3, 2),
      i.AddTriangle(1, 2, 3);
  else if (e === "hexahedron")
    r(i, t, 1, 1, 1),
      r(i, t, 1, 1, -1),
      r(i, t, 1, -1, 1),
      r(i, t, 1, -1, -1),
      r(i, t, -1, 1, 1),
      r(i, t, -1, 1, -1),
      r(i, t, -1, -1, 1),
      r(i, t, -1, -1, -1),
      i.AddConvexPolygon([0, 1, 5, 4]),
      i.AddConvexPolygon([0, 2, 3, 1]),
      i.AddConvexPolygon([0, 4, 6, 2]),
      i.AddConvexPolygon([1, 3, 7, 5]),
      i.AddConvexPolygon([2, 6, 7, 3]),
      i.AddConvexPolygon([4, 5, 7, 6]);
  else if (e === "octahedron")
    r(i, t, 1, 0, 0),
      r(i, t, -1, 0, 0),
      r(i, t, 0, 1, 0),
      r(i, t, 0, -1, 0),
      r(i, t, 0, 0, 1),
      r(i, t, 0, 0, -1),
      i.AddTriangle(0, 2, 4),
      i.AddTriangle(0, 3, 5),
      i.AddTriangle(0, 4, 3),
      i.AddTriangle(0, 5, 2),
      i.AddTriangle(1, 2, 5),
      i.AddTriangle(1, 3, 4),
      i.AddTriangle(1, 4, 2),
      i.AddTriangle(1, 5, 3);
  else if (e === "dodecahedron") {
    const n = (1 + Math.sqrt(5)) / 2,
      l = 1 / n;
    r(i, t, 1, 1, 1),
      r(i, t, 1, 1, -1),
      r(i, t, 1, -1, 1),
      r(i, t, -1, 1, 1),
      r(i, t, 1, -1, -1),
      r(i, t, -1, 1, -1),
      r(i, t, -1, -1, 1),
      r(i, t, -1, -1, -1),
      r(i, t, 0, +l, +n),
      r(i, t, 0, +l, -n),
      r(i, t, 0, -l, +n),
      r(i, t, 0, -l, -n),
      r(i, t, +l, +n, 0),
      r(i, t, +l, -n, 0),
      r(i, t, -l, +n, 0),
      r(i, t, -l, -n, 0),
      r(i, t, +n, 0, +l),
      r(i, t, -n, 0, +l),
      r(i, t, +n, 0, -l),
      r(i, t, -n, 0, -l),
      i.AddConvexPolygon([0, 8, 10, 2, 16]),
      i.AddConvexPolygon([0, 16, 18, 1, 12]),
      i.AddConvexPolygon([0, 12, 14, 3, 8]),
      i.AddConvexPolygon([1, 9, 5, 14, 12]),
      i.AddConvexPolygon([1, 18, 4, 11, 9]),
      i.AddConvexPolygon([2, 10, 6, 15, 13]),
      i.AddConvexPolygon([2, 13, 4, 18, 16]),
      i.AddConvexPolygon([3, 14, 5, 19, 17]),
      i.AddConvexPolygon([3, 17, 6, 10, 8]),
      i.AddConvexPolygon([4, 13, 15, 7, 11]),
      i.AddConvexPolygon([5, 9, 11, 7, 19]),
      i.AddConvexPolygon([6, 17, 19, 7, 15]);
  } else if (e === "icosahedron") {
    const n = (1 + Math.sqrt(5)) / 2;
    r(i, t, 0, 1, +n),
      r(i, t, 0, 1, -n),
      r(i, t, 0, -1, +n),
      r(i, t, 0, -1, -n),
      r(i, t, 1, +n, 0),
      r(i, t, 1, -n, 0),
      r(i, t, -1, +n, 0),
      r(i, t, -1, -n, 0),
      r(i, t, +n, 0, 1),
      r(i, t, +n, 0, -1),
      r(i, t, -n, 0, 1),
      r(i, t, -n, 0, -1),
      i.AddTriangle(0, 2, 8),
      i.AddTriangle(0, 4, 6),
      i.AddTriangle(0, 6, 10),
      i.AddTriangle(0, 8, 4),
      i.AddTriangle(0, 10, 2),
      i.AddTriangle(1, 3, 11),
      i.AddTriangle(1, 4, 9),
      i.AddTriangle(1, 6, 4),
      i.AddTriangle(1, 9, 3),
      i.AddTriangle(1, 11, 6),
      i.AddTriangle(2, 5, 8),
      i.AddTriangle(2, 7, 5),
      i.AddTriangle(2, 10, 7),
      i.AddTriangle(3, 5, 7),
      i.AddTriangle(3, 7, 11),
      i.AddTriangle(3, 9, 5),
      i.AddTriangle(4, 8, 9),
      i.AddTriangle(5, 9, 8),
      i.AddTriangle(6, 11, 10),
      i.AddTriangle(7, 10, 11);
  }
  return i.GetMesh();
}
function Yi(s, e, t) {
  const r = me(s, e),
    i = me(e, t),
    n = me(s, t),
    l = (r + i + n) / 2,
    o = l * (l - r) * (l - i) * (l - n);
  return o < 0 ? 0 : Math.sqrt(o);
}
function Ji(s, e, t) {
  return Kt(s, De(e, t)) / 6;
}
function Ki(s) {
  if (s instanceof Lt) {
    let e = 0;
    return (
      s.EnumerateMeshInstances((t) => {
        e += Ki(t);
      }),
      e
    );
  } else {
    let e = 0;
    return (
      s.EnumerateTriangleVertices((t, r, i) => {
        e += Ji(t, r, i);
      }),
      e
    );
  }
}
function Is(s) {
  let e = 0;
  return (
    s.EnumerateTriangleVertices((t, r, i) => {
      e += Yi(t, r, i);
    }),
    e
  );
}
const gt = { FixedUpVector: 1, FreeOrbit: 2 },
  ue = { Perspective: 1, Orthographic: 2 };
class ke {
  constructor(e, t, r, i) {
    (this.eye = e), (this.center = t), (this.up = r), (this.fov = i);
  }
  Clone() {
    return new ke(this.eye.Clone(), this.center.Clone(), this.up.Clone(), this.fov);
  }
}
function Zi(s, e) {
  return be(s.eye, e.eye) && be(s.center, e.center) && be(s.up, e.up) && O(s.fov, e.fov);
}
const vs = 10,
  Qi = { MeshOnly: 1, MeshAndLine: 2 };
function $i(s, e) {
  function t(r, i) {
    for (const n of r)
      (n.polygonOffset = i), (n.polygonOffsetUnit = 1), (n.polygonOffsetFactor = 1);
  }
  t(s.material, e), s.userData.threeMaterials && t(s.userData.threeMaterials, e);
}
class Ot {
  constructor(e) {
    (this.scene = e), (this.rootObject = null);
  }
  IsEmpty() {
    return this.rootObject === null;
  }
  SetRootObject(e) {
    this.rootObject !== null && this.Clear(),
      (this.rootObject = e),
      this.scene.add(this.rootObject);
  }
  GetRootObject() {
    return this.rootObject;
  }
  AddObject(e) {
    if (this.rootObject === null) {
      const t = new I.Object3D();
      this.SetRootObject(t);
    }
    this.rootObject.add(e);
  }
  Traverse(e) {
    this.rootObject !== null &&
      this.rootObject.traverse((t) => {
        e(t);
      });
  }
  UpdateWorldMatrix() {
    this.rootObject !== null && this.rootObject.updateWorldMatrix(!0, !0);
  }
  Clear() {
    Ii(this.rootObject), this.scene.remove(this.rootObject), (this.rootObject = null);
  }
}
class xt {
  constructor(e, t, r) {
    (this.showEdges = e), (this.edgeColor = t), (this.edgeThreshold = r);
  }
  Clone() {
    return new xt(this.showEdges, this.edgeColor.Clone(), this.edgeThreshold);
  }
}
class en {
  constructor(e) {
    (this.scene = e),
      (this.mainModel = new Ot(this.scene)),
      (this.edgeModel = new Ot(this.scene)),
      (this.edgeSettings = new xt(!1, new L(0, 0, 0), 1)),
      (this.hasLines = !1),
      (this.hasPolygonOffset = !1);
  }
  SetMainObject(e) {
    this.mainModel.SetRootObject(e),
      (this.hasLines = !1),
      (this.hasPolygonOffset = !1),
      this.EnumerateLines((t) => {
        this.hasLines = !0;
      }),
      this.edgeSettings.showEdges && this.GenerateEdgeModel(),
      this.UpdatePolygonOffset();
  }
  UpdateWorldMatrix() {
    this.mainModel.UpdateWorldMatrix(), this.edgeModel.UpdateWorldMatrix();
  }
  SetEdgeSettings(e) {
    let t = !1;
    if (
      (e.showEdges &&
        (!this.edgeSettings.showEdges || this.edgeSettings.edgeThreshold !== e.edgeThreshold) &&
        (t = !0),
      (this.edgeSettings = e),
      !this.mainModel.IsEmpty())
    )
      if (this.edgeSettings.showEdges)
        if (t) this.ClearEdgeModel(), this.GenerateEdgeModel();
        else {
          const r = K(this.edgeSettings.edgeColor);
          this.EnumerateEdges((i) => {
            i.material.color = r;
          });
        }
      else this.ClearEdgeModel();
  }
  GenerateEdgeModel() {
    const e = K(this.edgeSettings.edgeColor);
    this.UpdateWorldMatrix(),
      this.EnumerateMeshes((t) => {
        const r = new I.EdgesGeometry(t.geometry, this.edgeSettings.edgeThreshold),
          i = new I.LineSegments(r, new I.LineBasicMaterial({ color: e }));
        i.applyMatrix4(t.matrixWorld),
          (i.userData = t.userData),
          (i.visible = t.visible),
          this.edgeModel.AddObject(i);
      }),
      this.UpdatePolygonOffset();
  }
  GetBoundingBox(e) {
    let t = !1,
      r = new I.Box3();
    return (
      this.EnumerateMeshesAndLines((i) => {
        e(i.userData) && (r.union(new I.Box3().setFromObject(i)), (t = !0));
      }),
      t ? r : null
    );
  }
  GetBoundingSphere(e) {
    const t = this.GetBoundingBox(e);
    if (t === null) return null;
    const r = new I.Sphere();
    return t.getBoundingSphere(r), r;
  }
  Clear() {
    this.mainModel.Clear(), this.ClearEdgeModel();
  }
  ClearEdgeModel() {
    this.edgeModel.IsEmpty() || (this.UpdatePolygonOffset(), this.edgeModel.Clear());
  }
  EnumerateMeshes(e) {
    this.mainModel.Traverse((t) => {
      t.isMesh && e(t);
    });
  }
  EnumerateLines(e) {
    this.mainModel.Traverse((t) => {
      t.isLineSegments && e(t);
    });
  }
  EnumerateMeshesAndLines(e) {
    this.mainModel.Traverse((t) => {
      (t.isMesh || t.isLineSegments) && e(t);
    });
  }
  EnumerateEdges(e) {
    this.edgeModel.Traverse((t) => {
      t.isLineSegments && e(t);
    });
  }
  HasLinesOrEdges() {
    return this.hasLines || this.edgeSettings.showEdges;
  }
  UpdatePolygonOffset() {
    const e = this.HasLinesOrEdges();
    e !== this.hasPolygonOffset &&
      (this.EnumerateMeshes((t) => {
        $i(t, e);
      }),
      (this.hasPolygonOffset = e));
  }
  GetMeshIntersectionUnderMouse(e, t, r, i, n) {
    if (this.mainModel.IsEmpty() || t.x < 0 || t.x > i || t.y < 0 || t.y > n) return null;
    const l = new I.Vector2();
    (l.x = (t.x / i) * 2 - 1), (l.y = -(t.y / n) * 2 + 1);
    const o = new I.Raycaster();
    o.setFromCamera(l, r), (o.params.Line.threshold = 10);
    const a = o.intersectObject(this.mainModel.GetRootObject(), !0);
    for (let u = 0; u < a.length; u++) {
      const h = a[u];
      if (h.object.visible) {
        if (h.object.isMesh) return h;
        if (h.object.isLineSegments) {
          if (e === Qi.MeshOnly || vi(r, i, n, h.object, t) > vs) continue;
          return h;
        }
      }
    }
    return null;
  }
}
const B = {
  IntegerToString(s) {
    return s.toString();
  },
  StringToInteger(s) {
    return parseInt(s, 10);
  },
  NumberToString(s) {
    return s.toFixed(5);
  },
  StringToNumber(s) {
    return parseFloat(s);
  },
  ModelUrlsToString: (s) => (s === null ? null : s.join(",")),
  StringToModelUrls: (s) => (s === null || s.length === 0 ? null : s.split(",")),
  CameraToString: function (s) {
    return s === null
      ? null
      : [
          this.NumberToString(s.eye.x),
          this.NumberToString(s.eye.y),
          this.NumberToString(s.eye.z),
          this.NumberToString(s.center.x),
          this.NumberToString(s.center.y),
          this.NumberToString(s.center.z),
          this.NumberToString(s.up.x),
          this.NumberToString(s.up.y),
          this.NumberToString(s.up.z),
          this.NumberToString(s.fov),
        ].join(",");
  },
  ProjectionModeToString: (s) =>
    s === ue.Perspective ? "perspective" : s === ue.Orthographic ? "orthographic" : null,
  StringToCamera: function (s) {
    if (s === null || s.length === 0) return null;
    const e = s.split(",");
    if (e.length !== 9 && e.length !== 10) return null;
    let t = 45;
    return (
      e.length >= 10 && (t = this.StringToNumber(e[9])),
      new ke(
        new v(this.StringToNumber(e[0]), this.StringToNumber(e[1]), this.StringToNumber(e[2])),
        new v(this.StringToNumber(e[3]), this.StringToNumber(e[4]), this.StringToNumber(e[5])),
        new v(this.StringToNumber(e[6]), this.StringToNumber(e[7]), this.StringToNumber(e[8])),
        t
      )
    );
  },
  StringToProjectionMode: (s) =>
    s === "perspective" ? ue.Perspective : s === "orthographic" ? ue.Orthographic : null,
  RGBColorToString: function (s) {
    return s === null
      ? null
      : [this.IntegerToString(s.r), this.IntegerToString(s.g), this.IntegerToString(s.b)].join(",");
  },
  RGBAColorToString: function (s) {
    return s === null
      ? null
      : [
          this.IntegerToString(s.r),
          this.IntegerToString(s.g),
          this.IntegerToString(s.b),
          this.IntegerToString(s.a),
        ].join(",");
  },
  StringToRGBColor: function (s) {
    if (s === null || s.length === 0) return null;
    const e = s.split(",");
    return e.length !== 3
      ? null
      : new L(this.StringToInteger(e[0]), this.StringToInteger(e[1]), this.StringToInteger(e[2]));
  },
  StringToRGBAColor: function (s) {
    if (s === null || s.length === 0) return null;
    const e = s.split(",");
    if (e.length !== 3 && e.length !== 4) return null;
    const t = new $e(
      this.StringToInteger(e[0]),
      this.StringToInteger(e[1]),
      this.StringToInteger(e[2]),
      255
    );
    return e.length === 4 && (t.a = this.StringToInteger(e[3])), t;
  },
  EnvironmentSettingsToString(s) {
    return s === null
      ? null
      : [s.environmentMapName, s.backgroundIsEnvMap ? "on" : "off"].join(",");
  },
  StringToEnvironmentSettings: (s) => {
    if (s === null || s.length === 0) return null;
    const e = s.split(",");
    return e.length !== 2 ? null : { environmentMapName: e[0], backgroundIsEnvMap: e[1] === "on" };
  },
  EdgeSettingsToString: function (s) {
    return s === null
      ? null
      : [
          s.showEdges ? "on" : "off",
          this.RGBColorToString(s.edgeColor),
          this.IntegerToString(s.edgeThreshold),
        ].join(",");
  },
  StringToEdgeSettings: function (s) {
    if (s === null || s.length === 0) return null;
    const e = s.split(",");
    return e.length !== 5
      ? null
      : new xt(
          e[0] === "on",
          new L(this.StringToInteger(e[1]), this.StringToInteger(e[2]), this.StringToInteger(e[3])),
          this.StringToInteger(e[4])
        );
  },
};
class tn {
  constructor(e) {
    (this.separator = e), (this.paramList = "");
  }
  AddModelUrls(e) {
    return this.AddUrlPart("model", B.ModelUrlsToString(e)), this;
  }
  AddCamera(e) {
    return this.AddUrlPart("camera", B.CameraToString(e)), this;
  }
  AddProjectionMode(e) {
    return this.AddUrlPart("projectionmode", B.ProjectionModeToString(e)), this;
  }
  AddEnvironmentSettings(e) {
    return this.AddUrlPart("envsettings", B.EnvironmentSettingsToString(e)), this;
  }
  AddBackgroundColor(e) {
    return this.AddUrlPart("backgroundcolor", B.RGBAColorToString(e)), this;
  }
  AddDefaultColor(e) {
    return this.AddUrlPart("defaultcolor", B.RGBColorToString(e)), this;
  }
  AddDefaultLineColor(e) {
    return this.AddUrlPart("defaultlinecolor", B.RGBColorToString(e)), this;
  }
  AddEdgeSettings(e) {
    return this.AddUrlPart("edgesettings", B.EdgeSettingsToString(e)), this;
  }
  AddUrlPart(e, t) {
    e === null ||
      t === null ||
      (this.paramList.length > 0 && (this.paramList += this.separator),
      (this.paramList += e + "=" + t));
  }
  GetParameterList() {
    return this.paramList;
  }
}
class rn {
  constructor(e, t) {
    (this.separator = t), (this.paramList = e);
  }
  GetModelUrls() {
    if (this.paramList.indexOf("=") === -1) return this.paramList.split(",");
    const e = this.GetKeywordParams("model");
    return B.StringToModelUrls(e);
  }
  GetCamera() {
    const e = this.GetKeywordParams("camera");
    return B.StringToCamera(e);
  }
  GetProjectionMode() {
    let e = this.GetKeywordParams("cameramode");
    return e === null && (e = this.GetKeywordParams("projectionmode")), B.StringToProjectionMode(e);
  }
  GetEnvironmentSettings() {
    const e = this.GetKeywordParams("envsettings");
    return B.StringToEnvironmentSettings(e);
  }
  GetBackgroundColor() {
    const e = this.GetKeywordParams("backgroundcolor");
    return B.StringToRGBAColor(e);
  }
  GetDefaultColor() {
    const e = this.GetKeywordParams("defaultcolor");
    return B.StringToRGBColor(e);
  }
  GetDefaultLineColor() {
    const e = this.GetKeywordParams("defaultlinecolor");
    return B.StringToRGBColor(e);
  }
  GetEdgeSettings() {
    const e = this.GetKeywordParams("edgesettings");
    return B.StringToEdgeSettings(e);
  }
  GetKeywordParams(e) {
    if (this.paramList === null || this.paramList.length === 0) return null;
    const t = e + "=",
      r = this.paramList.split(this.separator);
    for (let i = 0; i < r.length; i++) {
      const n = r[i];
      if (n.startsWith(t)) return n.substring(t.length);
    }
    return null;
  }
}
function nn() {
  return new tn("$");
}
function ws(s) {
  return new rn(s, "$");
}
function bs(s) {
  const e = nn();
  return e.AddModelUrls(s), e.GetParameterList();
}
const ze = { Line: 1, Face: 2 };
class sn {
  constructor() {
    this.forceMediumpForMaterials = !1;
  }
}
class ln {
  constructor() {
    (this.defaultMaterials = []), (this.objectUrls = []);
  }
}
class on {
  constructor(e) {
    (this.callbacks = e),
      (this.texturesNeeded = 0),
      (this.texturesLoaded = 0),
      (this.threeObject = null);
  }
  OnTextureNeeded() {
    this.texturesNeeded += 1;
  }
  OnTextureLoaded() {
    (this.texturesLoaded += 1), this.callbacks.onTextureLoaded(), this.Finish();
  }
  OnModelLoaded(e) {
    (this.threeObject = e), this.Finish();
  }
  Finish() {
    this.threeObject !== null &&
      this.texturesNeeded === this.texturesLoaded &&
      this.callbacks.onModelLoaded(this.threeObject);
  }
}
class an {
  constructor(e, t) {
    (this.model = e), (this.threeNodeItems = []), this.AddNode(e.GetRootNode(), t);
  }
  AddNode(e, t) {
    const r = e.GetTransformation().GetMatrix(),
      i = new I.Matrix4().fromArray(r.Get());
    t.applyMatrix4(i);
    for (const n of e.GetChildNodes()) {
      const l = new I.Object3D();
      t.add(l), this.AddNode(n, l);
    }
    for (const n of e.GetMeshIndices()) {
      const l = new Ze(e.GetId(), n),
        o = this.model.GetMesh(n);
      this.threeNodeItems.push({ meshInstance: new Ft(l, e, o), threeNode: t });
    }
  }
  GetNodeItems() {
    return this.threeNodeItems;
  }
}
class un {
  constructor(e, t, r, i) {
    (this.model = e),
      (this.stateHandler = t),
      (this.conversionParams = r),
      (this.conversionOutput = i),
      (this.shadingType = Ci(e)),
      (this.modelToThreeLineMaterial = new Map()),
      (this.modelToThreeMaterial = new Map());
  }
  GetThreeMaterial(e, t) {
    if (t === ze.Face) {
      if (!this.modelToThreeMaterial.has(e)) {
        const r = this.CreateThreeFaceMaterial(e);
        this.modelToThreeMaterial.set(e, r);
      }
      return this.modelToThreeMaterial.get(e);
    } else if (t === ze.Line) {
      if (!this.modelToThreeLineMaterial.has(e)) {
        const r = this.CreateThreeLineMaterial(e);
        this.modelToThreeLineMaterial.set(e, r);
      }
      return this.modelToThreeLineMaterial.get(e);
    } else return null;
  }
  CreateThreeFaceMaterial(e) {
    const t = this.model.GetMaterial(e),
      r = K(t.color);
    t.vertexColors && r.setRGB(1, 1, 1);
    const i = {
      color: r,
      vertexColors: t.vertexColors,
      opacity: t.opacity,
      transparent: t.transparent,
      alphaTest: t.alphaTest,
      side: I.DoubleSide,
    };
    this.conversionParams.forceMediumpForMaterials && (i.precision = "mediump");
    let n = null;
    if (this.shadingType === ge.Phong) {
      if (((n = new I.MeshPhongMaterial(i)), t.type === de.Phong)) {
        const o = K(t.specular);
        O(t.shininess, 0) && o.setRGB(0, 0, 0),
          (n.specular = o),
          (n.shininess = t.shininess * 100),
          this.LoadFaceTexture(n, t.specularMap, (a) => {
            n.specularMap = a;
          });
      }
    } else
      this.shadingType === ge.Physical &&
        ((n = new I.MeshStandardMaterial(i)),
        t.type === de.Physical &&
          ((n.metalness = t.metalness),
          (n.roughness = t.roughness),
          this.LoadFaceTexture(n, t.metalnessMap, (o) => {
            (n.metalness = 1), (n.roughness = 1), (n.metalnessMap = o), (n.roughnessMap = o);
          })));
    const l = K(t.emissive);
    return (
      (n.emissive = l),
      this.LoadFaceTexture(n, t.diffuseMap, (o) => {
        t.multiplyDiffuseMap || n.color.setRGB(1, 1, 1), (n.map = o);
      }),
      this.LoadFaceTexture(n, t.bumpMap, (o) => {
        n.bumpMap = o;
      }),
      this.LoadFaceTexture(n, t.normalMap, (o) => {
        n.normalMap = o;
      }),
      this.LoadFaceTexture(n, t.emissiveMap, (o) => {
        n.emissiveMap = o;
      }),
      t.source !== X.Model &&
        ((n.userData.source = t.source), this.conversionOutput.defaultMaterials.push(n)),
      n
    );
  }
  CreateThreeLineMaterial(e) {
    const t = this.model.GetMaterial(e),
      i = { color: K(t.color), opacity: t.opacity };
    this.conversionParams.forceMediumpForMaterials && (i.precision = "mediump");
    const n = new I.LineBasicMaterial(i);
    return (
      t.source !== X.Model &&
        ((n.userData.source = t.source), this.conversionOutput.defaultMaterials.push(n)),
      n
    );
  }
  LoadFaceTexture(e, t, r) {
    function i(o, a) {
      (a.wrapS = I.RepeatWrapping),
        (a.wrapT = I.RepeatWrapping),
        (a.rotation = o.rotation),
        (a.offset.x = o.offset.x),
        (a.offset.y = o.offset.y),
        (a.repeat.x = o.scale.x),
        (a.repeat.y = o.scale.y);
    }
    if (t === null || !t.IsValid()) return;
    const n = new I.TextureLoader();
    this.stateHandler.OnTextureNeeded();
    let l = null;
    t.mimeType !== null ? (l = Ur(t.buffer, t.mimeType)) : (l = At(t.buffer)),
      this.conversionOutput.objectUrls.push(l),
      n.load(
        l,
        (o) => {
          i(t, o), (e.needsUpdate = !0), r(o), this.stateHandler.OnTextureLoaded();
        },
        null,
        (o) => {
          this.stateHandler.OnTextureLoaded();
        }
      );
  }
}
class hr {
  constructor(e, t, r) {
    (this.threeGeometry = e),
      (this.geometryType = t),
      (this.materialHandler = r),
      (this.itemVertexCount = null),
      t === ze.Face ? (this.itemVertexCount = 3) : t === ze.Line && (this.itemVertexCount = 2),
      (this.meshThreeMaterials = []),
      (this.meshOriginalMaterials = []),
      (this.groupStart = null),
      (this.previousMaterialIndex = null);
  }
  ProcessItem(e, t) {
    if (this.previousMaterialIndex !== t) {
      this.groupStart !== null && this.AddGroup(this.groupStart, e - 1), (this.groupStart = e);
      const r = this.materialHandler.GetThreeMaterial(t, this.geometryType);
      this.meshThreeMaterials.push(r),
        this.meshOriginalMaterials.push(t),
        (this.previousMaterialIndex = t);
    }
  }
  Finalize(e) {
    this.AddGroup(this.groupStart, e - 1);
  }
  AddGroup(e, t) {
    const r = this.meshThreeMaterials.length - 1;
    this.threeGeometry.addGroup(e * this.itemVertexCount, (t - e + 1) * this.itemVertexCount, r);
  }
}
function hn(s, e, t, r) {
  function i(d, f) {
    const c = d.mesh,
      m = c.TriangleCount();
    if (m === 0) return null;
    const p = [];
    for (let P = 0; P < m; P++) p.push(P);
    p.sort((P, G) => {
      const R = c.GetTriangle(P),
        N = c.GetTriangle(G);
      return R.mat - N.mat;
    });
    let g = new I.BufferGeometry(),
      x = new hr(g, ze.Face, f),
      C = [],
      T = [],
      M = [],
      y = [],
      w = c.VertexColorCount() > 0,
      E = c.TextureUVCount() > 0,
      S = 0;
    for (const P of p) {
      const G = c.GetTriangle(P),
        R = c.GetVertex(G.v0),
        N = c.GetVertex(G.v1),
        W = c.GetVertex(G.v2);
      if ((C.push(R.x, R.y, R.z, N.x, N.y, N.z, W.x, W.y, W.z), G.HasVertexColors())) {
        const ee = K(c.GetVertexColor(G.c0)),
          Fe = K(c.GetVertexColor(G.c1)),
          Ce = K(c.GetVertexColor(G.c2));
        T.push(ee.r, ee.g, ee.b, Fe.r, Fe.g, Fe.b, Ce.r, Ce.g, Ce.b);
      } else w && T.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
      const ne = c.GetNormal(G.n0),
        se = c.GetNormal(G.n1),
        he = c.GetNormal(G.n2);
      if ((M.push(ne.x, ne.y, ne.z, se.x, se.y, se.z, he.x, he.y, he.z), G.HasTextureUVs())) {
        const ee = c.GetTextureUV(G.u0),
          Fe = c.GetTextureUV(G.u1),
          Ce = c.GetTextureUV(G.u2);
        y.push(ee.x, ee.y, Fe.x, Fe.y, Ce.x, Ce.y);
      } else E && y.push(0, 0, 0, 0, 0, 0);
      x.ProcessItem(S, G.mat), (S += 1);
    }
    x.Finalize(S),
      g.setAttribute("position", new I.Float32BufferAttribute(C, 3)),
      T.length !== 0 && g.setAttribute("color", new I.Float32BufferAttribute(T, 3)),
      g.setAttribute("normal", new I.Float32BufferAttribute(M, 3)),
      y.length !== 0 && g.setAttribute("uv", new I.Float32BufferAttribute(y, 2));
    const F = new I.Mesh(g, x.meshThreeMaterials);
    return (
      (F.name = c.GetName()),
      (F.userData = {
        originalMeshInstance: d,
        originalMaterials: x.meshOriginalMaterials,
        threeMaterials: null,
      }),
      F
    );
  }
  function n(d, f) {
    const c = d.mesh,
      m = c.LineCount();
    if (m === 0) return null;
    const p = [];
    for (let y = 0; y < m; y++) p.push(y);
    p.sort((y, w) => {
      const E = c.GetLine(y),
        S = c.GetLine(w);
      return E.mat - S.mat;
    });
    let g = new I.BufferGeometry(),
      x = new hr(g, ze.Line, f),
      C = [],
      T = 0;
    for (let y = 0; y < p.length; y++) {
      const w = c.GetLine(p[y]),
        E = w.GetVertices();
      for (let S = 0; S < E.length; S++) {
        const F = E[S],
          P = c.GetVertex(F);
        C.push(P.x, P.y, P.z), S > 0 && S < E.length - 1 && C.push(P.x, P.y, P.z);
      }
      x.ProcessItem(T, w.mat), (T += w.SegmentCount());
    }
    x.Finalize(T), g.setAttribute("position", new I.Float32BufferAttribute(C, 3));
    const M = new I.LineSegments(g, x.meshThreeMaterials);
    return (
      (M.userData = {
        originalMeshInstance: d,
        originalMaterials: x.meshOriginalMaterials,
        threeMaterials: null,
      }),
      M
    );
  }
  function l(d, f, c) {
    if (Gt(f.mesh)) return;
    const m = i(f, c);
    m !== null && d.add(m);
    const p = n(f, c);
    p !== null && d.add(p);
  }
  function o(d, f, c, m) {
    const g = new an(f, d).GetNodeItems();
    br(g.length, 100, {
      runTask: (x, C, T) => {
        for (let M = x; M <= C; M++) {
          const y = g[M];
          l(y.threeNode, y.meshInstance, c);
        }
        T();
      },
      onReady: () => {
        m.OnModelLoaded(d);
      },
    });
  }
  const a = new on(r),
    u = new un(s, a, e, t),
    h = new I.Object3D();
  o(h, s, u, a);
}
class dn {
  constructor() {
    (this.importer = new Wi()),
      (this.inProgress = !1),
      (this.defaultMaterials = null),
      (this.objectUrls = null),
      (this.hasHighpDriverIssue = xi());
  }
  InProgress() {
    return this.inProgress;
  }
  LoadModel(e, t, r) {
    this.inProgress ||
      ((this.inProgress = !0),
      this.RevokeObjectUrls(),
      this.importer.ImportFiles(e, t, {
        onLoadStart: () => {
          r.onLoadStart();
        },
        onFileListProgress: (i, n) => {
          r.onFileListProgress(i, n);
        },
        onFileLoadProgress: (i, n) => {
          r.onFileLoadProgress(i, n);
        },
        onImportStart: () => {
          r.onImportStart();
        },
        onSelectMainFile: (i, n) => {
          r.onSelectMainFile ? r.onSelectMainFile(i, n) : n(0);
        },
        onImportSuccess: (i) => {
          r.onVisualizationStart();
          const n = new sn();
          n.forceMediumpForMaterials = this.hasHighpDriverIssue;
          const l = new ln();
          hn(i.model, n, l, {
            onTextureLoaded: () => {
              r.onTextureLoaded();
            },
            onModelLoaded: (o) => {
              if (
                ((this.defaultMaterials = l.defaultMaterials),
                (this.objectUrls = l.objectUrls),
                i.upVector === V.X)
              ) {
                const a = new I.Quaternion().setFromAxisAngle(new I.Vector3(0, 0, 1), Math.PI / 2);
                o.quaternion.multiply(a);
              } else if (i.upVector === V.Z) {
                const a = new I.Quaternion().setFromAxisAngle(new I.Vector3(1, 0, 0), -Math.PI / 2);
                o.quaternion.multiply(a);
              }
              r.onModelFinished(i, o), (this.inProgress = !1);
            },
          });
        },
        onImportError: (i) => {
          r.onLoadError(i), (this.inProgress = !1);
        },
      }));
  }
  GetImporter() {
    return this.importer;
  }
  GetDefaultMaterials() {
    return this.defaultMaterials;
  }
  ReplaceDefaultMaterialsColor(e, t) {
    if (this.defaultMaterials !== null)
      for (const r of this.defaultMaterials)
        r.vertexColors ||
          (r.userData.source === X.DefaultFace
            ? (r.color = K(e))
            : r.userData.source === X.DefaultLine && (r.color = K(t)));
  }
  RevokeObjectUrls() {
    if (this.objectUrls !== null) {
      for (const e of this.objectUrls) zr(e);
      this.objectUrls = null;
    }
  }
  Destroy() {
    this.RevokeObjectUrls(), (this.importer = null);
  }
}
function k(s) {
  return Math.round(parseFloat(s));
}
function dr(s) {
  const e = k(s.paddingLeft) + k(s.paddingRight),
    t = k(s.borderLeftWidth) + k(s.borderRightWidth),
    r = k(s.marginLeft) + k(s.marginRight);
  return e + t + r;
}
function fr(s) {
  const e = k(s.paddingTop) + k(s.paddingBottom),
    t = k(s.borderTopWidth) + k(s.borderBottomWidth),
    r = k(s.marginTop) + k(s.marginBottom);
  return e + t + r;
}
function fn(s, e, t) {
  const r = getComputedStyle(s),
    i = e - dr(r),
    n = t - fr(r);
  return { width: i, height: n };
}
function je(s, e, t) {
  if (s.getBoundingClientRect) {
    const r = s.getBoundingClientRect();
    (e -= r.left), (t -= r.top);
  }
  return (
    window.pageXOffset &&
      window.pageYOffset &&
      ((e += window.pageXOffset), (t += window.pageYOffset)),
    new D(e, t)
  );
}
function cr(s, e, t) {
  const r = document.createElement(s);
  return e && (r.className = e), t && (r.innerHTML = t), r;
}
function cn(s, e, t, r) {
  const i = cr(e, t, r);
  return s.appendChild(i), i;
}
function Es(s, e, t) {
  return cn(s, "div", e, t);
}
function Ss(s) {
  for (; s.firstChild; ) s.removeChild(s.firstChild);
}
function As(s, e) {
  e.parentNode.insertBefore(s, e);
}
function Gs(s, e) {
  e.parentNode.insertBefore(s, e.nextSibling);
}
function Rs(s, e) {
  e ? (s.style.display = "block") : (s.style.display = "none");
}
function Ns(s) {
  return s.offsetParent !== null;
}
function mn(s, e) {
  s.style.width = e.toString() + "px";
}
function pn(s, e) {
  s.style.height = e.toString() + "px";
}
function Fs(s) {
  const e = getComputedStyle(s);
  return s.offsetWidth + k(e.marginLeft) + k(e.marginRight);
}
function Ps(s) {
  const e = getComputedStyle(s);
  return s.offsetHeight + k(e.marginTop) + k(e.marginBottom);
}
function Vs(s, e) {
  const t = getComputedStyle(s);
  mn(s, e - dr(t));
}
function Ls(s, e) {
  const t = getComputedStyle(s);
  pn(s, e - fr(t));
}
function Ds(s, e) {
  return cr("div", s, e);
}
class gn {
  constructor() {
    (this.prev = new D(0, 0)),
      (this.curr = new D(0, 0)),
      (this.diff = new D(0, 0)),
      (this.buttons = []);
  }
  Down(e, t) {
    this.buttons.push(t.which),
      (this.curr = this.GetPositionFromEvent(e, t)),
      (this.prev = this.curr.Clone());
  }
  Move(e, t) {
    (this.curr = this.GetPositionFromEvent(e, t)),
      (this.diff = nt(this.curr, this.prev)),
      (this.prev = this.curr.Clone());
  }
  Up(e, t) {
    const r = this.buttons.indexOf(t.which);
    r !== -1 && this.buttons.splice(r, 1), (this.curr = this.GetPositionFromEvent(e, t));
  }
  Leave(e, t) {
    (this.buttons = []), (this.curr = this.GetPositionFromEvent(e, t));
  }
  IsButtonDown() {
    return this.buttons.length > 0;
  }
  GetButton() {
    const e = this.buttons.length;
    return e === 0 ? 0 : this.buttons[e - 1];
  }
  GetPosition() {
    return this.curr;
  }
  GetMoveDiff() {
    return this.diff;
  }
  GetPositionFromEvent(e, t) {
    return je(e, t.clientX, t.clientY);
  }
}
class xn {
  constructor() {
    (this.prevPos = new D(0, 0)),
      (this.currPos = new D(0, 0)),
      (this.diffPos = new D(0, 0)),
      (this.prevDist = 0),
      (this.currDist = 0),
      (this.diffDist = 0),
      (this.fingers = 0);
  }
  Start(e, t) {
    t.touches.length !== 0 &&
      ((this.fingers = t.touches.length),
      (this.currPos = this.GetPositionFromEvent(e, t)),
      (this.prevPos = this.currPos.Clone()),
      (this.currDist = this.GetTouchDistanceFromEvent(e, t)),
      (this.prevDist = this.currDist));
  }
  Move(e, t) {
    t.touches.length !== 0 &&
      ((this.currPos = this.GetPositionFromEvent(e, t)),
      (this.diffPos = nt(this.currPos, this.prevPos)),
      (this.prevPos = this.currPos.Clone()),
      (this.currDist = this.GetTouchDistanceFromEvent(e, t)),
      (this.diffDist = this.currDist - this.prevDist),
      (this.prevDist = this.currDist));
  }
  End(e, t) {
    t.touches.length !== 0 &&
      ((this.fingers = 0),
      (this.currPos = this.GetPositionFromEvent(e, t)),
      (this.currDist = this.GetTouchDistanceFromEvent(e, t)));
  }
  IsFingerDown() {
    return this.fingers !== 0;
  }
  GetFingerCount() {
    return this.fingers;
  }
  GetPosition() {
    return this.currPos;
  }
  GetMoveDiff() {
    return this.diffPos;
  }
  GetDistanceDiff() {
    return this.diffDist;
  }
  GetPositionFromEvent(e, t) {
    let r = null;
    if (t.touches.length !== 0) {
      const i = t.touches[0];
      r = je(e, i.pageX, i.pageY);
    }
    return r;
  }
  GetTouchDistanceFromEvent(e, t) {
    if (t.touches.length !== 2) return 0;
    const r = t.touches[0],
      i = t.touches[1];
    return vt(je(e, r.pageX, r.pageY), je(e, i.pageX, i.pageY));
  }
}
class Cn {
  constructor() {
    (this.isClick = !1), (this.startPosition = null);
  }
  Start(e) {
    (this.isClick = !0), (this.startPosition = e);
  }
  Move(e) {
    this.isClick &&
      (this.startPosition !== null
        ? vt(this.startPosition, e) > 3 && this.Cancel()
        : this.Cancel());
  }
  End() {
    this.startPosition = null;
  }
  Cancel() {
    (this.isClick = !1), (this.startPosition = null);
  }
  IsClick() {
    return this.isClick;
  }
}
const Q = { None: 0, Orbit: 1, Pan: 2, Zoom: 3 };
class Tn {
  constructor(e, t, r) {
    (this.canvas = e),
      (this.camera = t),
      (this.callbacks = r),
      (this.navigationMode = gt.FixedUpVector),
      (this.mouse = new gn()),
      (this.touch = new xn()),
      (this.clickDetector = new Cn()),
      (this.onMouseClick = null),
      (this.onMouseMove = null),
      (this.onContext = null),
      this.canvas.addEventListener &&
        (this.canvas.addEventListener("mousedown", this.OnMouseDown.bind(this)),
        this.canvas.addEventListener("wheel", this.OnMouseWheel.bind(this)),
        this.canvas.addEventListener("touchstart", this.OnTouchStart.bind(this)),
        this.canvas.addEventListener("touchmove", this.OnTouchMove.bind(this)),
        this.canvas.addEventListener("touchcancel", this.OnTouchEnd.bind(this)),
        this.canvas.addEventListener("touchend", this.OnTouchEnd.bind(this)),
        this.canvas.addEventListener("contextmenu", this.OnContextMenu.bind(this))),
      document.addEventListener &&
        (document.addEventListener("mousemove", this.OnMouseMove.bind(this)),
        document.addEventListener("mouseup", this.OnMouseUp.bind(this)),
        document.addEventListener("mouseleave", this.OnMouseLeave.bind(this)));
  }
  SetMouseClickHandler(e) {
    this.onMouseClick = e;
  }
  SetMouseMoveHandler(e) {
    this.onMouseMove = e;
  }
  SetContextMenuHandler(e) {
    this.onContext = e;
  }
  GetNavigationMode() {
    return this.navigationMode;
  }
  SetNavigationMode(e) {
    this.navigationMode = e;
  }
  GetCamera() {
    return this.camera;
  }
  SetCamera(e) {
    this.camera = e;
  }
  MoveCamera(e, t) {
    function r(i, n, l, o) {
      (i.camera.eye = n.eye[o]),
        (i.camera.center = n.center[o]),
        (i.camera.up = n.up[o]),
        i.Update(),
        o < l - 1 &&
          requestAnimationFrame(() => {
            r(i, n, l, o + 1);
          });
    }
    if (e !== null) {
      if (t === 0 || Zi(this.camera, e)) this.camera = e;
      else {
        const i = li,
          n = {
            eye: Pt(this.camera.eye, e.eye, t, i),
            center: Pt(this.camera.center, e.center, t, i),
            up: Pt(this.camera.up, e.up, t, i),
          };
        requestAnimationFrame(() => {
          r(this, n, t, 0);
        });
      }
      this.Update();
    }
  }
  GetFitToSphereCamera(e, t) {
    if (rt(t)) return null;
    const r = this.camera.Clone(),
      i = ae(r.center, e);
    (r.eye = ae(r.eye, i)), (r.center = e.Clone());
    let n = ae(r.eye, r.center).Normalize(),
      l = this.camera.fov / 2;
    this.canvas.width < this.canvas.height && (l = (l * this.canvas.width) / this.canvas.height);
    const o = t / Math.sin(l * He);
    return (r.eye = r.center.Clone().Offset(n, o)), r;
  }
  OnMouseDown(e) {
    e.preventDefault(),
      this.mouse.Down(this.canvas, e),
      this.clickDetector.Start(this.mouse.GetPosition());
  }
  OnMouseMove(e) {
    if (
      (this.mouse.Move(this.canvas, e),
      this.clickDetector.Move(this.mouse.GetPosition()),
      this.onMouseMove)
    ) {
      const n = je(this.canvas, e.clientX, e.clientY);
      this.onMouseMove(n);
    }
    if (!this.mouse.IsButtonDown()) return;
    let t = this.mouse.GetMoveDiff(),
      r = this.mouse.GetButton(),
      i = Q.None;
    if (
      (r === 1
        ? e.ctrlKey
          ? (i = Q.Zoom)
          : e.shiftKey
            ? (i = Q.Pan)
            : (i = Q.Orbit)
        : (r === 2 || r === 3) && (i = Q.Pan),
      i === Q.Orbit)
    ) {
      const n = 0.5;
      this.Orbit(t.x * n, t.y * n);
    } else if (i === Q.Pan) {
      const l = 0.001 * me(this.camera.eye, this.camera.center);
      this.Pan(t.x * l, t.y * l);
    } else i === Q.Zoom && this.Zoom(-t.y * 0.005);
    this.Update();
  }
  OnMouseUp(e) {
    if ((this.mouse.Up(this.canvas, e), this.clickDetector.End(), this.clickDetector.IsClick())) {
      const t = this.mouse.GetPosition();
      this.Click(e.which, t);
    }
  }
  OnMouseLeave(e) {
    this.mouse.Leave(this.canvas, e), this.clickDetector.Cancel();
  }
  OnTouchStart(e) {
    e.preventDefault(),
      this.touch.Start(this.canvas, e),
      this.clickDetector.Start(this.touch.GetPosition());
  }
  OnTouchMove(e) {
    if (
      (e.preventDefault(),
      this.touch.Move(this.canvas, e),
      this.clickDetector.Move(this.touch.GetPosition()),
      !this.touch.IsFingerDown())
    )
      return;
    let t = this.touch.GetMoveDiff(),
      r = this.touch.GetDistanceDiff(),
      i = this.touch.GetFingerCount(),
      n = Q.None;
    if ((i === 1 ? (n = Q.Orbit) : i === 2 && (n = Q.Pan), n === Q.Orbit)) {
      const l = 0.5;
      this.Orbit(t.x * l, t.y * l);
    } else if (n === Q.Pan) {
      this.Zoom(r * 0.005);
      const o = 0.001 * me(this.camera.eye, this.camera.center);
      this.Pan(t.x * o, t.y * o);
    }
    this.Update();
  }
  OnTouchEnd(e) {
    if (
      (e.preventDefault(),
      this.touch.End(this.canvas, e),
      this.clickDetector.End(),
      this.clickDetector.IsClick())
    ) {
      const t = this.touch.GetPosition();
      this.touch.GetFingerCount() === 1 && this.Click(1, t);
    }
  }
  OnMouseWheel(e) {
    const t = e || window.event;
    t.preventDefault();
    let r = -t.deltaY / 40,
      i = 0.1;
    r < 0 && (i = i * -1), this.Zoom(i), this.Update();
  }
  OnContextMenu(e) {
    e.preventDefault(),
      this.clickDetector.IsClick() &&
        (this.Context(e.clientX, e.clientY), this.clickDetector.Cancel());
  }
  Orbit(e, t) {
    const r = e * He,
      i = t * He,
      n = ae(this.camera.center, this.camera.eye).Normalize(),
      l = De(n, this.camera.up).Normalize();
    if (this.navigationMode === gt.FixedUpVector) {
      const a = Dr(n, this.camera.up) + i;
      Sr(a, 0) && Ht(a, Math.PI) && this.camera.eye.Rotate(l, -i, this.camera.center),
        this.camera.eye.Rotate(this.camera.up, -r, this.camera.center);
    } else if (this.navigationMode === gt.FreeOrbit) {
      const o = De(l, n).Normalize();
      this.camera.eye.Rotate(l, -i, this.camera.center),
        this.camera.eye.Rotate(o, -r, this.camera.center),
        (this.camera.up = o);
    }
  }
  Pan(e, t) {
    const r = ae(this.camera.center, this.camera.eye).Normalize(),
      i = De(r, this.camera.up).Normalize(),
      n = De(i, r).Normalize();
    this.camera.eye.Offset(i, -e),
      this.camera.center.Offset(i, -e),
      this.camera.eye.Offset(n, t),
      this.camera.center.Offset(n, t);
  }
  Zoom(e) {
    const t = ae(this.camera.center, this.camera.eye),
      i = t.Length() * e;
    this.camera.eye.Offset(t, i);
  }
  Update() {
    this.callbacks.onUpdate();
  }
  Click(e, t) {
    this.onMouseClick && this.onMouseClick(e, t);
  }
  Context(e, t) {
    if (this.onContext) {
      const r = { x: e, y: t },
        i = je(this.canvas, e, t);
      this.onContext(r, i);
    }
  }
}
class Ct {
  constructor(e, t) {
    (this.textureNames = e), (this.backgroundIsEnvMap = t);
  }
  Clone() {
    let e = null;
    if (this.textureNames !== null) {
      e = [];
      for (const t of this.textureNames) e.push(t);
    }
    return new Ct(e, this.backgroundIsEnvMap);
  }
}
class Mn {
  constructor(e) {
    (this.scene = e),
      (this.type = ge.Phong),
      (this.projectionMode = ue.Perspective),
      (this.ambientLight = new I.AmbientLight(8947848, 1 * Math.PI)),
      (this.directionalLight = new I.DirectionalLight(8947848, 1 * Math.PI)),
      (this.environmentSettings = new Ct(null, !1)),
      (this.environment = null),
      this.scene.add(this.ambientLight),
      this.scene.add(this.directionalLight);
  }
  SetShadingType(e) {
    (this.type = e), this.UpdateShading();
  }
  SetProjectionMode(e) {
    (this.projectionMode = e), this.UpdateShading();
  }
  UpdateShading() {
    this.type === ge.Phong
      ? (this.ambientLight.color.set(8947848),
        this.directionalLight.color.set(8947848),
        (this.scene.environment = null))
      : this.type === ge.Physical &&
        (this.ambientLight.color.set(0),
        this.directionalLight.color.set(5592405),
        (this.scene.environment = this.environment)),
      this.environmentSettings.backgroundIsEnvMap && this.projectionMode === ue.Perspective
        ? (this.scene.background = this.environment)
        : (this.scene.background = null);
  }
  SetEnvironmentMapSettings(e, t) {
    const r = new I.CubeTextureLoader();
    (this.environment = r.load(e.textureNames, (i) => {
      (i.colorSpace = I.LinearSRGBColorSpace), t();
    })),
      (this.environmentSettings = e);
  }
  UpdateByCamera(e) {
    const t = ae(e.eye, e.center);
    this.directionalLight.position.set(t.x, t.y, t.z);
  }
}
function mr(s) {
  const e = 45;
  return s === V.X
    ? new ke(new v(2, -3, 1.5), new v(0, 0, 0), new v(1, 0, 0), e)
    : s === V.Y
      ? new ke(new v(-1.5, 2, 3), new v(0, 0, 0), new v(0, 1, 0), e)
      : s === V.Z
        ? new ke(new v(-1.5, -3, 2), new v(0, 0, 0), new v(0, 0, 1), e)
        : null;
}
function pr(s, e) {
  if (!e(s)) return !1;
  for (const t of s.children) if (!pr(t, e)) return !1;
  return !0;
}
function yn(s) {
  let e = null;
  return (
    pr(s, (t) => {
      if (t.isMesh)
        for (const r of t.material)
          return (
            r.type === "MeshPhongMaterial"
              ? (e = ge.Phong)
              : r.type === "MeshStandardMaterial" && (e = ge.Physical),
            !1
          );
      return !0;
    }),
    e
  );
}
class In {
  constructor() {
    (this.eyeCenterDistance = 0), (this.forceUpdate = !0);
  }
  ForceUpdate() {
    this.forceUpdate = !0;
  }
  ValidatePerspective() {
    return this.forceUpdate ? ((this.forceUpdate = !1), !1) : !0;
  }
  ValidateOrthographic(e) {
    return this.forceUpdate || !O(this.eyeCenterDistance, e)
      ? ((this.eyeCenterDistance = e), (this.forceUpdate = !1), !1)
      : !0;
  }
}
class vn {
  constructor() {
    (this.direction = V.Y), (this.isFixed = !0), (this.isFlipped = !1);
  }
  SetDirection(e, t) {
    (this.direction = e), (this.isFlipped = !1);
    const r = mr(this.direction),
      i = ae(r.eye, r.center),
      n = me(t.center, t.eye),
      l = t.center.Clone().Offset(i, n),
      o = t.Clone();
    return (
      this.direction === V.X
        ? ((o.up = new v(1, 0, 0)), (o.eye = l))
        : this.direction === V.Y
          ? ((o.up = new v(0, 1, 0)), (o.eye = l))
          : this.direction === V.Z && ((o.up = new v(0, 0, 1)), (o.eye = l)),
      o
    );
  }
  SetFixed(e, t) {
    return (this.isFixed = e), this.isFixed ? this.SetDirection(this.direction, t) : null;
  }
  Flip(e) {
    this.isFlipped = !this.isFlipped;
    const t = e.Clone();
    return t.up.MultiplyScalar(-1), t;
  }
}
class wn {
  constructor() {
    (I.ColorManagement.enabled = !1),
      (this.canvas = null),
      (this.renderer = null),
      (this.scene = null),
      (this.mainModel = null),
      (this.extraModel = null),
      (this.camera = null),
      (this.projectionMode = null),
      (this.cameraValidator = null),
      (this.shadingModel = null),
      (this.navigation = null),
      (this.upVector = null),
      (this.settings = { animationSteps: 40 });
  }
  Init(e) {
    (this.canvas = e), (this.canvas.id = "viewer");
    const t = { canvas: this.canvas, antialias: !0 };
    (this.renderer = new I.WebGLRenderer({ ...t, alpha: !0 })),
      (this.renderer.outputColorSpace = I.LinearSRGBColorSpace),
      window.devicePixelRatio && this.renderer.setPixelRatio(window.devicePixelRatio),
      this.renderer.setClearColor("#ffffff", 1),
      this.renderer.setSize(this.canvas.width, this.canvas.height),
      (this.scene = new I.Scene()),
      (this.mainModel = new en(this.scene)),
      (this.extraModel = new Ot(this.scene)),
      this.InitNavigation(),
      this.InitShading(),
      this.Render();
  }
  SetMouseClickHandler(e) {
    this.navigation.SetMouseClickHandler(e);
  }
  SetMouseMoveHandler(e) {
    this.navigation.SetMouseMoveHandler(e);
  }
  SetContextMenuHandler(e) {
    this.navigation.SetContextMenuHandler(e);
  }
  SetModelColor(e) {
    const t = K(e);
    this.mainModel.EnumerateMeshes((r) => {
      const i = Array.isArray(r.material) ? r.material : [r.material];
      for (const n of i) n.color = t;
    }),
      this.Render();
  }
  SetEdgeSettings(e) {
    const t = e.Clone();
    this.mainModel.SetEdgeSettings(t), this.Render();
  }
  SetEnvironmentMapSettings(e) {
    const t = e.Clone();
    this.shadingModel.SetEnvironmentMapSettings(t, () => {
      this.Render();
    }),
      this.shadingModel.UpdateShading(),
      this.Render();
  }
  SetBackgroundColor(e) {
    const t = new I.Color(st(e.r), st(e.g), st(e.b)),
      r = st(e.a);
    this.renderer.setClearColor(t, r), this.Render();
  }
  GetCanvas() {
    return this.canvas;
  }
  GetCamera() {
    return this.navigation.GetCamera();
  }
  GetProjectionMode() {
    return this.projectionMode;
  }
  SetCamera(e) {
    this.navigation.SetCamera(e), this.cameraValidator.ForceUpdate(), this.Render();
  }
  SetProjectionMode(e) {
    this.projectionMode !== e &&
      (this.scene.remove(this.camera),
      e === ue.Perspective
        ? (this.camera = new I.PerspectiveCamera(45, 1, 0.1, 1e3))
        : e === ue.Orthographic && (this.camera = new I.OrthographicCamera(-1, 1, 1, -1, 0.1, 1e3)),
      this.scene.add(this.camera),
      (this.projectionMode = e),
      this.shadingModel.SetProjectionMode(e),
      this.cameraValidator.ForceUpdate(),
      this.AdjustClippingPlanes(),
      this.Render());
  }
  Resize(e, t) {
    const r = fn(this.canvas, e, t);
    this.ResizeRenderer(r.width, r.height);
  }
  ResizeRenderer(e, t) {
    window.devicePixelRatio && this.renderer.setPixelRatio(window.devicePixelRatio),
      this.renderer.setSize(e, t),
      this.cameraValidator.ForceUpdate(),
      this.Render();
  }
  FitSphereToWindow(e, t) {
    if (e === null) return;
    const r = new v(e.center.x, e.center.y, e.center.z),
      i = e.radius,
      n = this.navigation.GetFitToSphereCamera(r, i);
    this.navigation.MoveCamera(n, t ? this.settings.animationSteps : 0);
  }
  AdjustClippingPlanes() {
    const e = this.GetBoundingSphere((t) => !0);
    this.AdjustClippingPlanesToSphere(e);
  }
  AdjustClippingPlanesToSphere(e) {
    e !== null &&
      (e.radius < 10
        ? ((this.camera.near = 0.01), (this.camera.far = 100))
        : e.radius < 100
          ? ((this.camera.near = 0.1), (this.camera.far = 1e3))
          : e.radius < 1e3
            ? ((this.camera.near = 10), (this.camera.far = 1e4))
            : ((this.camera.near = 100), (this.camera.far = 1e6)),
      this.cameraValidator.ForceUpdate(),
      this.Render());
  }
  GetNavigationMode() {
    return this.navigation.GetNavigationMode();
  }
  SetNavigationMode(e) {
    const t = this.navigation.GetCamera(),
      r = this.upVector.SetFixed(e === gt.FixedUpVector, t);
    this.navigation.SetNavigationMode(e),
      r !== null && this.navigation.MoveCamera(r, this.settings.animationSteps),
      this.Render();
  }
  SetUpVector(e, t) {
    const r = this.navigation.GetCamera(),
      i = this.upVector.SetDirection(e, r),
      n = t ? this.settings.animationSteps : 0;
    this.navigation.MoveCamera(i, n), this.Render();
  }
  FlipUpVector() {
    const e = this.navigation.GetCamera(),
      t = this.upVector.Flip(e);
    this.navigation.MoveCamera(t, 0), this.Render();
  }
  Render() {
    const e = this.navigation.GetCamera();
    if (
      (this.camera.position.set(e.eye.x, e.eye.y, e.eye.z),
      this.camera.up.set(e.up.x, e.up.y, e.up.z),
      this.camera.lookAt(new I.Vector3(e.center.x, e.center.y, e.center.z)),
      this.projectionMode === ue.Perspective)
    )
      this.cameraValidator.ValidatePerspective() ||
        ((this.camera.aspect = this.canvas.width / this.canvas.height),
        (this.camera.fov = e.fov),
        this.camera.updateProjectionMatrix());
    else if (this.projectionMode === ue.Orthographic) {
      const t = me(e.eye, e.center);
      if (!this.cameraValidator.ValidateOrthographic(t)) {
        const r = this.canvas.width / this.canvas.height,
          n = me(e.eye, e.center) * Math.tan(0.5 * e.fov * He);
        (this.camera.left = -n * r),
          (this.camera.right = n * r),
          (this.camera.top = n),
          (this.camera.bottom = -n),
          this.camera.updateProjectionMatrix();
      }
    }
    this.shadingModel.UpdateByCamera(e), this.renderer.render(this.scene, this.camera);
  }
  SetMainObject(e) {
    const t = yn(e);
    this.mainModel.SetMainObject(e), this.shadingModel.SetShadingType(t), this.Render();
  }
  AddExtraObject(e) {
    this.extraModel.AddObject(e), this.Render();
  }
  Clear() {
    this.mainModel.Clear(), this.extraModel.Clear(), this.Render();
  }
  ClearExtra() {
    this.extraModel.Clear(), this.Render();
  }
  SetMeshesVisibility(e) {
    this.mainModel.EnumerateMeshesAndLines((t) => {
      const r = e(t.userData);
      t.visible !== r && (t.visible = r);
    }),
      this.mainModel.EnumerateEdges((t) => {
        const r = e(t.userData);
        t.visible !== r && (t.visible = r);
      }),
      this.Render();
  }
  SetMeshesHighlight(e, t) {
    const r = this.mainModel.HasLinesOrEdges();
    this.mainModel.EnumerateMeshesAndLines((i) => {
      t(i.userData)
        ? i.userData.threeMaterials === null &&
          ((i.userData.threeMaterials = i.material),
          (i.material = yi(i.userData.threeMaterials, e, r)))
        : i.userData.threeMaterials !== null &&
          ((i.material = i.userData.threeMaterials), (i.userData.threeMaterials = null));
    }),
      this.Render();
  }
  GetMeshUserDataUnderMouse(e, t) {
    const r = this.GetMeshIntersectionUnderMouse(e, t);
    return r === null ? null : r.object.userData;
  }
  GetMeshIntersectionUnderMouse(e, t) {
    const r = this.GetCanvasSize(),
      i = this.mainModel.GetMeshIntersectionUnderMouse(e, t, this.camera, r.width, r.height);
    return i === null ? null : i;
  }
  GetBoundingBox(e) {
    return this.mainModel.GetBoundingBox(e);
  }
  GetBoundingSphere(e) {
    return this.mainModel.GetBoundingSphere(e);
  }
  EnumerateMeshesAndLinesUserData(e) {
    this.mainModel.EnumerateMeshesAndLines((t) => {
      e(t.userData);
    });
  }
  InitNavigation() {
    const e = mr(V.Y);
    (this.camera = new I.PerspectiveCamera(45, 1, 0.1, 1e3)),
      (this.projectionMode = ue.Perspective),
      (this.cameraValidator = new In()),
      this.scene.add(this.camera);
    const t = this.renderer.domElement;
    (this.navigation = new Tn(t, e, {
      onUpdate: () => {
        this.Render();
      },
    })),
      (this.upVector = new vn());
  }
  InitShading() {
    this.shadingModel = new Mn(this.scene);
  }
  GetShadingType() {
    return this.shadingModel.type;
  }
  GetImageSize() {
    const e = new I.Vector2();
    return this.renderer.getSize(e), { width: parseInt(e.x, 10), height: parseInt(e.y, 10) };
  }
  GetCanvasSize() {
    let e = this.canvas.width,
      t = this.canvas.height;
    return (
      window.devicePixelRatio && ((e /= window.devicePixelRatio), (t /= window.devicePixelRatio)),
      { width: e, height: t }
    );
  }
  GetImageAsDataUrl(e, t, r) {
    let i = this.GetImageSize(),
      n = e,
      l = t;
    window.devicePixelRatio && ((n /= window.devicePixelRatio), (l /= window.devicePixelRatio));
    const o = this.renderer.getClearAlpha();
    r && this.renderer.setClearAlpha(0), this.ResizeRenderer(n, l), this.Render();
    const a = this.renderer.domElement.toDataURL();
    return this.ResizeRenderer(i.width, i.height), this.renderer.setClearAlpha(o), a;
  }
  Destroy() {
    this.Clear(), this.renderer.dispose();
  }
}
class gr {
  constructor(e, t) {
    (this.parentElement = e),
      (this.parameters = {}),
      Tt(t) && (this.parameters = t),
      (this.canvas = document.createElement("canvas")),
      this.parentElement.appendChild(this.canvas),
      (this.viewer = new wn()),
      this.viewer.Init(this.canvas);
    const r = this.parentElement.clientWidth,
      i = this.parentElement.clientHeight;
    this.viewer.Resize(r, i),
      this.parameters.projectionMode &&
        this.viewer.SetProjectionMode(this.parameters.projectionMode),
      this.parameters.backgroundColor &&
        this.viewer.SetBackgroundColor(this.parameters.backgroundColor),
      this.parameters.edgeSettings && this.viewer.SetEdgeSettings(this.parameters.edgeSettings),
      this.parameters.environmentSettings &&
        this.viewer.SetEnvironmentMapSettings(this.parameters.environmentSettings),
      (this.model = null),
      (this.modelLoader = new dn()),
      (this.progressDiv = null),
      window.addEventListener("resize", () => {
        this.Resize();
      });
  }
  SetModelColor(e) {
    this.viewer.SetModelColor(e);
  }
  LoadModelFromUrlList(e) {
    Vr(e);
    const t = oi(e);
    this.LoadModelFromInputFiles(t);
  }
  LoadModelFromFileList(e) {
    const t = ai(e);
    this.LoadModelFromInputFiles(t);
  }
  LoadModelFromInputFiles(e) {
    if (e === null || e.length === 0) return;
    this.viewer.Clear();
    const t = new ji();
    this.parameters.defaultColor && (t.defaultColor = this.parameters.defaultColor),
      this.parameters.defaultLineColor && (t.defaultLineColor = this.parameters.defaultLineColor),
      (this.model = null),
      this.progressDiv !== null &&
        (this.parentElement.removeChild(this.progressDiv), (this.progressDiv = null)),
      this.modelLoader.LoadModel(e, t, {
        onLoadStart: () => {
          (this.canvas.style.display = "none"),
            (this.progressDiv = document.createElement("div")),
            (this.progressDiv.innerHTML = b("Loading model...")),
            this.parentElement.appendChild(this.progressDiv);
        },
        onFileListProgress: (r, i) => {},
        onFileLoadProgress: (r, i) => {},
        onImportStart: () => {
          this.progressDiv.innerHTML = b("Importing model...");
        },
        onVisualizationStart: () => {
          this.progressDiv.innerHTML = b("Visualizing model...");
        },
        onModelFinished: (r, i) => {
          this.parentElement.removeChild(this.progressDiv),
            (this.progressDiv = null),
            (this.canvas.style.display = "inherit"),
            this.viewer.SetMainObject(i);
          const n = this.viewer.GetBoundingSphere((l) => !0);
          this.viewer.AdjustClippingPlanesToSphere(n),
            this.parameters.camera
              ? this.viewer.SetCamera(this.parameters.camera)
              : (this.viewer.SetUpVector(V.Y, !1), this.viewer.FitSphereToWindow(n, !1)),
            (this.model = r.model),
            this.parameters.onModelLoaded && this.parameters.onModelLoaded();
        },
        onTextureLoaded: () => {
          this.viewer.Render();
        },
        onLoadError: (r) => {
          let i = b("Unknown error.");
          r.code === Ne.NoImportableFile
            ? (i = b("No importable file found."))
            : r.code === Ne.FailedToLoadFile
              ? (i = b("Failed to load file for import."))
              : r.code === Ne.ImportFailed && (i = b("Failed to import model.")),
            r.message !== null && (i += " (" + r.message + ")"),
            (this.progressDiv.innerHTML = i),
            this.parameters.onModelLoadFailed && this.parameters.onModelLoadFailed();
        },
      });
  }
  GetViewer() {
    return this.viewer;
  }
  GetModel() {
    return this.model;
  }
  Resize() {
    const e = this.parentElement.clientWidth,
      t = this.parentElement.clientHeight;
    this.viewer.Resize(e, t);
  }
  Destroy() {
    this.modelLoader.Destroy(), this.viewer.Destroy(), (this.model = null);
  }
}
function bn(s, e, t) {
  const r = new gr(s, t);
  return r.LoadModelFromUrlList(e), r;
}
function Os(s, e, t) {
  const r = new gr(s, t);
  return r.LoadModelFromFileList(e), r;
}
function Bs(s) {
  function e(i) {
    let n = null,
      l = i.getAttribute("camera");
    l && (n = B.StringToCamera(l));
    let o = null,
      a = i.getAttribute("projectionmode");
    a && (o = B.StringToProjectionMode(a));
    let u = null,
      h = i.getAttribute("backgroundcolor");
    h && (u = B.StringToRGBAColor(h));
    let d = null,
      f = i.getAttribute("defaultcolor");
    f && (d = B.StringToRGBColor(f));
    let c = null,
      m = i.getAttribute("defaultlinecolor");
    m && (c = B.StringToRGBColor(m));
    let p = null,
      g = i.getAttribute("edgesettings");
    g && (p = B.StringToEdgeSettings(g));
    let x = null,
      C = i.getAttribute("environmentmap");
    if (C) {
      const y = C.split(",");
      if (y.length === 6) {
        let w = !1,
          E = i.getAttribute("environmentmapbg");
        E && E === "true" && (w = !0), (x = new Ct(y, w));
      }
    }
    let T = null,
      M = i.getAttribute("model");
    return (
      M && (T = B.StringToModelUrls(M)),
      bn(i, T, {
        camera: n,
        projectionMode: o,
        backgroundColor: u,
        defaultLineColor: c,
        defaultColor: d,
        edgeSettings: p,
        environmentSettings: x,
      })
    );
  }
  const t = [],
    r = document.getElementsByClassName("online_3d_viewer");
  for (let i = 0; i < r.length; i++) {
    const n = r[i],
      l = e(n);
    t.push(l);
  }
  return t;
}
export {
  _e as Coord4D,
  _i as ImportResult,
  _n as ArrayToRGBColor,
  _r as PropertyToString,
  _t as FLoc,
  $ as Mesh,
  $e as RGBAColor,
  $i as SetThreeMeshPolygonOffset,
  $n as BezierTweenFunction,
  $r as ExporterOff,
  $t as ArrayToQuaternion,
  Ae as Node,
  Ai as ImporterIfc,
  Ar as RGBColorToHexString,
  As as InsertDomElementBefore,
  At as CreateObjectUrl,
  ae as SubCoord3D,
  ai as InputFilesFromFileObjects,
  an as ThreeNodeTree,
  at as GetFileExtension,
  B as ParameterConverter,
  Bi as ImporterThree3mf,
  Bn as AddCoord2D,
  Br as MeshBuffer,
  Bs as Init3DViewerElements,
  Bt as Segment2D,
  b as Loc,
  be as CoordIsEqual3D,
  bi as Importer3dm,
  bn as Init3DViewerFromUrlList,
  br as RunTasksBatch,
  bs as CreateModelUrlParameters,
  Ci as GetShadingType,
  Cn as ClickDetector,
  Cs as GenerateCuboid,
  Ct as EnvironmentSettings,
  ci as Topology,
  cn as AddDomElement,
  cr as CreateDomElement,
  D as Coord2D,
  De as CrossVector3D,
  Di as ImporterThreeDae,
  Dn as RadDeg,
  Dr as VectorAngle3D,
  Ds as CreateDiv,
  de as MaterialType,
  di as TopologyTriangleEdge,
  dn as ThreeModelLoader,
  dr as GetDomElementExternalWidth,
  dt as TransformMesh,
  Ee as ArrayToCoord3D,
  Ei as Importer3ds,
  Er as WaitWhile,
  Es as AddDiv,
  Et as VectorLength3D,
  ei as ExporterPly,
  en as ViewerMainModel,
  er as Box3D,
  es as LinearTweenFunction,
  et as Line,
  Fi as ImporterOcct,
  Fn as EventNotifier,
  Fr as RequestUrl,
  Fs as GetDomElementOuterWidth,
  Ft as MeshInstance,
  fe as ArrayBufferToUtf8String,
  fi as TopologyTriangle,
  fn as GetDomElementInnerDimensions,
  fr as GetDomElementExternalHeight,
  Ge as BinaryReader,
  Gi as ImporterObj,
  Gr as MaterialBase,
  Gs as InsertDomElementAfter,
  Gt as IsEmptyMesh,
  ge as ShadingType,
  gi as IsTwoManifold,
  gn as MouseInteraction,
  gr as EmbeddedViewer,
  gt as NavigationMode,
  H as IntegerToHexString,
  He as DegRad,
  Hi as GeneratorParams,
  Hn as IsUrl,
  Hr as MatrixIsEqual,
  Ht as IsLower,
  hi as TopologyEdge,
  hn as ConvertModelToThreeObject,
  hr as ThreeMeshMaterialHandler,
  ht as BinaryWriter,
  Ie as CoordIsEqual2D,
  Ii as DisposeThreeObjects,
  In as CameraValidator,
  Ir as FormatString,
  Is as CalculateSurfaceArea,
  It as IsGreaterOrEqual,
  ie as Transformation,
  ii as ProjectPointToSegment2D,
  ir as ImporterFileList,
  is as ReplaceDefaultMaterialsColor,
  it as IsNegative,
  J as ExportedFile,
  Je as ParametersFromLine,
  Ji as GetTetrahedronSignedVolume,
  Jn as QuaternionIsEqual,
  Jr as ExporterGltf,
  Jt as CreateOcctWorker,
  j as Matrix,
  je as GetDomElementClientCoordinates,
  ji as ImportSettings,
  jn as HexStringToRGBAColor,
  jr as Exporter3dm,
  jt as CopyObjectAttributes,
  K as ConvertColorToThreeColor,
  Ke as ColorToMaterialConverter,
  Ki as CalculateVolume,
  Kn as QuaternionFromXYZ,
  Kr as ExporterSettings,
  Kt as DotVector3D,
  k as GetIntegerFromStyle,
  ke as Camera,
  ki as ImporterFileAccessor,
  kn as TextureIsEqual,
  kr as ExporterBim,
  kt as TaskRunner,
  L as RGBColor,
  Le as ReadLines,
  Li as ImporterThreeFbx,
  Ln as BigEps,
  Lr as AddCoord3D,
  Ls as SetDomElementOuterHeight,
  Lt as Model,
  li as ParabolicTweenFunction,
  ln as ModelToThreeConversionOutput,
  lr as ConvertThreeColorToColor,
  ls as CheckModel,
  lt as LinearToSRGB,
  Me as PhongMaterial,
  Mi as CreateHighlightMaterial,
  Mn as ShadingModel,
  Ms as GenerateSphere,
  me as CoordDistance3D,
  mi as GetBoundingBox,
  mn as SetDomElementWidth,
  mr as GetDefaultCamera,
  mt as ImportError,
  Ne as ImportErrorCode,
  Ni as ImporterPly,
  Nn as ValueOrDefault,
  Nr as IsPowerOfTwo,
  Ns as IsDomElementVisible,
  Nt as ModelObject3D,
  ni as SegmentPointDistance2D,
  nn as CreateUrlBuilder,
  nr as IsModelEmpty,
  ns as ThreeLinearToSRGBColorConverter,
  nt as SubCoord2D,
  O as IsEqual,
  Oe as TextWriter,
  Oi as ImporterThreeWrl,
  On as IsEqualEps,
  Or as MeshPrimitiveBuffer,
  Os as Init3DViewerFromFileList,
  Ot as ViewerModel,
  oe as GetFileName,
  oi as InputFilesFromUrls,
  on as ThreeConversionStateHandler,
  ot as LoadExternalLibrary,
  Pe as RGBColorFromFloatComponents,
  Pi as ImporterStl,
  Pn as SetLocalizedStrings,
  Pr as ReadFile,
  Ps as GetDomElementOuterHeight,
  Pt as TweenCoord3D,
  pe as Quaternion,
  pi as GetTopology,
  pn as SetDomElementHeight,
  pr as TraverseThreeObject,
  pt as Generator,
  Q as NavigationType,
  Qe as ConvertThreeGeometryToMesh,
  Qi as IntersectionMode,
  Qn as Exporter,
  Qr as ExporterObj,
  Qt as Utf8StringToArrayBuffer,
  q as Triangle,
  qe as RGBColorIsEqual,
  qn as ArrayBufferToAsciiString,
  qr as FlipMeshTrianglesOrientation,
  qt as DotVector2D,
  Ri as ImporterOff,
  Rs as ShowDomElement,
  Rt as CalculateTriangleNormal,
  re as ImporterBase,
  ri as BoundingBoxCalculator3D,
  rn as ParameterListParser,
  rr as ImporterFile,
  rs as GetDefaultMaterials,
  rt as IsZero,
  Se as ExporterBase,
  Si as ImporterGltf,
  Sr as IsGreater,
  Ss as ClearDomElement,
  St as Base64DataURIToArrayBuffer,
  si as Octree,
  sn as ModelToThreeConversionParams,
  sr as ThreeColorConverter,
  st as ColorComponentToFloat,
  Te as IsPositive,
  Ti as ThreeSRGBToLinearColorConverter,
  Tn as Navigation,
  Ts as GenerateCylinder,
  Tt as IsDefined,
  te as ColorComponentFromFloat,
  ti as ExporterStl,
  tn as ParameterListBuilder,
  tr as InputFile,
  U as PropertyType,
  Ue as ImporterThreeBase,
  Ui as ImporterThreeAmf,
  Un as RGBAColorToHexString,
  Ur as CreateObjectUrlWithMimeType,
  Ut as OctreeNode,
  ue as ProjectionMode,
  ui as TopologyVertex,
  un as ThreeMaterialHandler,
  ur as GeneratorHelper,
  ut as GetFileExtensionFromMimeType,
  V as Direction,
  Ve as TextureMapIsEqual,
  Vi as ImporterBim,
  Vn as SetLanguageCode,
  Vr as TransformFileHostUrls,
  Vs as SetDomElementOuterWidth,
  Vt as Unit,
  v as Coord3D,
  ve as SRGBToLinear,
  vi as GetLineSegmentsProjectedDistance,
  vn as UpVector,
  vr as EscapeHtmlChars,
  vt as CoordDistance2D,
  We as Eps,
  Wi as Importer,
  Wn as NextPowerOfTwo,
  Wr as QuaternionFromAxisAngle,
  Wt as RunTaskAsync,
  we as FileSource,
  wi as FinalizeModel,
  wn as Viewer,
  wr as RunTasks,
  ws as CreateUrlParser,
  wt as LoadExternalLibraryFromUrl,
  X as MaterialSource,
  Xe as TextureMap,
  Xi as GenerateCone,
  Xn as AsciiStringToArrayBuffer,
  Xr as Object3D,
  Xt as FaceMaterial,
  xe as PropertyGroup,
  xi as HasHighpDriverIssue,
  xn as TouchInteraction,
  xs as ImporterThreeSvg,
  xt as EdgeSettings,
  Y as FileFormat,
  Ye as NameFromLine,
  Yi as GetTriangleArea,
  Yt as PhysicalMaterial,
  ye as UpdateMaterialTransparency,
  yi as CreateHighlightMaterials,
  yn as GetShadingTypeOfObject,
  yr as IsObjectEmpty,
  ys as GeneratePlatonicSolid,
  yt as IsLowerOrEqual,
  Ze as MeshInstanceId,
  Zi as CameraIsEqual3D,
  Zn as TransformationIsEqual,
  Zr as ExporterModel,
  Zt as ConvertMeshToMeshBuffer,
  z as Property,
  ze as MaterialGeometryType,
  zi as ImporterFcstd,
  zn as HexStringToRGBColor,
  zr as RevokeObjectUrl,
};
//# sourceMappingURL=/sm/8863caf82f79a75ef2ab423883e2ec0109c75ef740799302de375cb3ed885a7c.map
