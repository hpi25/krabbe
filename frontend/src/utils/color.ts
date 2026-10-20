/**
 * Minimal colour maths for palette highlights, matching the behaviour of chroma.ts
 * https://github.com/NaridaL/chroma.ts (MIT License)
 */

/** Red, green and blue in 0-255 (unclamped), alpha in 0-1 */
export type Color = [number, number, number, number]

// CIELAB constants (D65 white point)
const LAB_Kn = 18
const LAB_Xn = 0.95047
const LAB_Yn = 1
const LAB_Zn = 1.08883
const LAB_delta = 0.206896552 // 6 / 29
const LAB_3DeltaPow2 = 0.12841855 // 3 * delta ** 2
const LAB_deltaPow3 = 0.008856452 // delta ** 3

const toLinear = (c255: number) => {
  const c = c255 / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
const fromLinear = (c: number) => c <= 0.0031308
  ? 255 * (12.92 * c)
  : 255 * ((1 + 0.055) * c ** (1 / 2.4) - 0.055)

const rgbToXyz = ([r, g, b]: Color) => {
  const [rl, gl, bl] = [toLinear(r), toLinear(g), toLinear(b)]
  return [
    0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl,
    0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl,
    0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl,
  ]
}

const rgbToLab = (color: Color) => {
  const f = (t: number) => t > LAB_deltaPow3 ? Math.cbrt(t) : t / LAB_3DeltaPow2 + 4 / 29
  const [x, y, z] = rgbToXyz(color)
  return [
    116 * f(y / LAB_Yn) - 16,
    500 * (f(x / LAB_Xn) - f(y / LAB_Yn)),
    200 * (f(y / LAB_Yn) - f(z / LAB_Zn)),
  ]
}

const labToRgb = (l: number, a: number, b: number, alpha: number): Color => {
  const fInv = (t: number) => t > LAB_delta ? t ** 3 : LAB_3DeltaPow2 * (t - 4 / 29)
  const x = LAB_Xn * fInv((l + 16) / 116 + a / 500)
  const y = LAB_Yn * fInv((l + 16) / 116)
  const z = LAB_Zn * fInv((l + 16) / 116 - b / 200)
  return [
    fromLinear(3.2404542 * x - 1.5371385 * y - 0.4985314 * z),
    fromLinear(-0.969266 * x + 1.8760108 * y + 0.041556 * z),
    fromLinear(0.0556434 * x - 0.2040259 * y + 1.0572252 * z),
    alpha,
  ]
}

/** Relative luminance (the Y channel of XYZ) */
export const luminance = (color: Color) => rgbToXyz(color)[1]

/** Darken a colour in CIELAB space, use a negative amount to brighten */
export const darken = (color: Color, amount = 1): Color => {
  const [l, a, b] = rgbToLab(color)
  return labToRgb(l - LAB_Kn * amount, a, b, color[3])
}

const clamp = (x: number, min: number, max: number) => Math.min(Math.max(x, min), max)
const toHexByte = (x: number) => x.toString(16).padStart(2, '0')

/** Format as #rrggbbaa */
export const toHexRGBA = ([r, g, b, a]: Color) =>
  '#' + [r, g, b].map(c => toHexByte(clamp(Math.round(c), 0, 255))).join('') + toHexByte(Math.round(clamp(a, 0, 1) * 255))
