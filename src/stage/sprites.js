// 平面贴片：书法字、朱笔圈、印章。
// 字是"写"出来的：沿书写方向显影（横排从左到右，竖排从上到下，圈沿圆周），边缘参差像笔锋。
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
  uniform float uReveal;
  uniform int uDir;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float a = texture2D(uMap, vUv).a * uOpacity;
    float pos;
    if (uDir == 0) pos = vUv.x;
    else if (uDir == 1) pos = 1.0 - vUv.y;
    else {
      // 沿圆周，从左上方起笔顺时针
      vec2 p = vUv - 0.5;
      pos = fract((atan(-p.y, p.x) + 3.1416 * 0.6) / 6.2832 + 1.0);
    }
    float jag = (hash(vec2(floor((uDir == 1 ? vUv.x : vUv.y) * 30.0), 7.0)) - 0.5) * 0.03;
    float edge = uReveal * 1.08 - 0.04 + jag;
    a *= smoothstep(edge + 0.02, edge - 0.02, pos);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * a, a);
  }
`

export function spriteMaterial(texture, color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
      uReveal: { value: 1 },
      uDir: { value: 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
  })
}

export class Sprite {
  constructor(texture, aspect, height, color, opts = {}) {
    this.material = spriteMaterial(texture, color)
    this.material.uniforms.uDir.value = opts.dir ?? 0
    this.object = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material)
    this.baseHeight = height
    this.aspect = aspect
    this.object.renderOrder = opts.order ?? 20
    this.setScale(1)
  }

  // 横排或竖排文字。竖排时逐字从上往下排。
  static text(text, height, color, opts = {}) {
    if (opts.vertical) {
      const g = glyph([...text].join('\n'), opts)
      return new Sprite(g.texture, g.aspect, height * g.lines, color, { ...opts, dir: 1 })
    }
    const g = glyph(text, opts)
    return new Sprite(g.texture, g.aspect, height, color, opts)
  }

  static seal(text, height, color = 0xb8321f, opts = {}) {
    return new Sprite(seal(text, opts), 1, height, color, opts)
  }

  static image(texture, height, color, opts = {}) {
    return new Sprite(texture, 1, height, color, opts)
  }

  setScale(s) {
    this.object.scale.set(this.baseHeight * this.aspect * s, this.baseHeight * s, 1)
  }

  get width() {
    return this.baseHeight * this.aspect
  }

  set opacity(v) {
    this.material.uniforms.uOpacity.value = v
  }

  // 书写进度 0→1
  set reveal(v) {
    this.material.uniforms.uReveal.value = v
  }

  set color(c) {
    this.material.uniforms.uColor.value.set(c)
  }

  dispose() {
    this.material.uniforms.uMap.value.dispose()
    this.material.dispose()
    this.object.geometry.dispose()
  }
}
