// 书法字、朱印等平面贴片，统一用一种可发光、可"砸下来"的材质。
import * as THREE from 'three'
import { glyph, seal } from './textures.js'

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const frag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uGlow;
  uniform float uDissolve;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main() {
    float a = texture2D(uMap, vUv).a * uOpacity;
    // 墨化消散：噪声阈值，边缘烧出金边
    float n = noise(vUv * 9.0) * 0.7 + noise(vUv * 31.0) * 0.3;
    float keep = smoothstep(uDissolve, uDissolve + 0.06, n);
    float rim = (1.0 - keep) * smoothstep(uDissolve - 0.08, uDissolve, n);
    a *= max(keep, rim);
    if (a < 0.01) discard;
    vec3 col = uColor * uGlow + vec3(1.0, 0.7, 0.3) * rim * 4.0;
    gl_FragColor = vec4(col * a, a);
  }
`

export function spriteMaterial(texture, color, { blending = 'normal', glow = 1 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uGlow: { value: glow },
      uDissolve: { value: 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: blending === 'add' ? THREE.AdditiveBlending : THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
}

export class Sprite {
  constructor(texture, aspect, height, color, opts = {}) {
    this.material = spriteMaterial(texture, color, opts)
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.baseHeight = height
    this.aspect = aspect
    this.object.renderOrder = opts.order ?? 20
    this.setScale(1)
  }

  static text(text, height, color, opts = {}) {
    const g = glyph(text, opts)
    return new Sprite(g.texture, g.aspect, height, color, opts)
  }

  static seal(text, height, color = 0xc8321f, opts = {}) {
    return new Sprite(seal(text, opts), 1, height, color, opts)
  }

  setScale(s) {
    this.object.scale.set(this.baseHeight * this.aspect * s, this.baseHeight * s, 1)
  }

  set opacity(v) {
    this.material.uniforms.uOpacity.value = v
  }

  set glow(v) {
    this.material.uniforms.uGlow.value = v
  }

  set dissolve(v) {
    this.material.uniforms.uDissolve.value = v
  }

  set color(c) {
    this.material.uniforms.uColor.value.set(c)
  }

  // 从大到小"砸"下来：p 0→1
  stamp(p, from = 3.2) {
    const e = p < 1 ? 1 - Math.pow(1 - p, 4) : 1
    this.setScale(from + (1 - from) * e)
    this.opacity = Math.min(1, p * 3)
  }

  dispose() {
    this.material.uniforms.uMap.value.dispose()
    this.material.dispose()
    this.object.geometry.dispose()
  }
}
