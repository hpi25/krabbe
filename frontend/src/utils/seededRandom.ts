/**
 * Deterministic random number generator seeded by a string, producing the same
 * sequence as seedrandom's default ARC4 generator so existing tie-breaks stay stable.
 * https://github.com/davidbau/seedrandom (MIT License, Copyright 2019 David Bau)
 */

const WIDTH = 256 // each RC4 output is 0 <= x < 256
const CHUNKS = 6 // at least six RC4 outputs for each double
const START_DENOM = WIDTH ** CHUNKS
const SIGNIFICANCE = 2 ** 52 // there are 52 significant digits in a double
const OVERFLOW = SIGNIFICANCE * 2
const MASK = WIDTH - 1

/** Mix a string seed into a key of up to 256 bytes */
const mixKey = (seed: string): number[] => {
  const key: number[] = []
  let smear = 0
  for (let j = 0; j < seed.length; j++) {
    smear ^= (key[MASK & j] ?? 0) * 19
    key[MASK & j] = MASK & (smear + seed.charCodeAt(j))
  }
  return key
}

/** ARC4 keystream generator */
const arc4 = (key: number[]) => {
  if (key.length === 0) key = [0]
  const s = Array.from({ length: WIDTH }, (_, i) => i)
  for (let k = 0, j = 0; k < WIDTH; k++) {
    const t = s[k]
    j = MASK & (j + key[k % key.length] + t)
    s[k] = s[j]
    s[j] = t
  }

  let i = 0
  let j = 0

  /** Get the next `count` bytes of the keystream as a number */
  const next = (count: number) => {
    let r = 0
    while (count--) {
      i = MASK & (i + 1)
      const t = s[i]
      j = MASK & (j + t)
      s[i] = s[j]
      s[j] = t
      r = r * WIDTH + s[MASK & (s[i] + s[j])]
    }
    return r
  }

  // Discard an initial batch of the keystream to defend against known RC4 weaknesses
  next(WIDTH)
  return next
}

/** Create a generator of numbers in [0, 1) deterministically seeded by `seed` */
export const seededRandom = (seed: string) => {
  const next = arc4(mixKey(seed))
  return () => {
    let n = next(CHUNKS) // start with a numerator n < 2 ^ 48
    let d = START_DENOM // and denominator d = 2 ^ 48
    let x = 0 // and no 'extra last byte'
    while (n < SIGNIFICANCE) { // fill up all significant digits
      n = (n + x) * WIDTH
      d *= WIDTH
      x = next(1)
    }
    while (n >= OVERFLOW) { // avoid rounding up before adding the last byte
      n /= 2
      d /= 2
      x >>>= 1
    }
    return (n + x) / d
  }
}
