/**
 * QR code encoder (ISO/IEC 18004), written from the public standard: byte
 * mode only (UTF-8, which every current scanner reads), versions 1 to 40,
 * error correction L/M/Q/H, Reed-Solomon over GF(256), all eight masks with
 * the standard penalty rules. Pure and deterministic.
 */

export const QR_EC_LEVELS = ["L", "M", "Q", "H"] as const;
export type QrEcLevel = (typeof QR_EC_LEVELS)[number];

/** Format-info bits of each level (L=01, M=00, Q=11, H=10). */
const EC_FORMAT_BITS: Record<QrEcLevel, number> = { L: 1, M: 0, Q: 3, H: 2 };

// Per version (index 0 unused) and level: EC codewords per block and number of blocks.
// prettier-ignore
const EC_CODEWORDS_PER_BLOCK: Record<QrEcLevel, readonly number[]> = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};
// prettier-ignore
const NUM_EC_BLOCKS: Record<QrEcLevel, readonly number[]> = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export const QR_MIN_VERSION = 1;
export const QR_MAX_VERSION = 40;

/** A finished symbol: `size` × `size` modules, `true` = dark. */
export interface QrMatrix {
  readonly version: number;
  readonly size: number;
  readonly ecLevel: QrEcLevel;
  readonly mask: number;
  readonly modules: readonly (readonly boolean[])[];
  /** Function patterns (finders, timing, alignment, format/version info). */
  readonly isFunction: readonly (readonly boolean[])[];
}

/** Raw data modules of a version (all modules minus function patterns). */
export function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

/** Data codewords (without EC) a version and level holds. */
export function dataCodewords(version: number, ecl: QrEcLevel): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    (EC_CODEWORDS_PER_BLOCK[ecl][version] as number) * (NUM_EC_BLOCKS[ecl][version] as number)
  );
}

/** Bits the character count field takes in byte mode. */
function countBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

/** Largest UTF-8 payload in bytes for a version and level (byte mode). */
export function qrCapacityBytes(version: number, ecl: QrEcLevel): number {
  return Math.floor((dataCodewords(version, ecl) * 8 - 4 - countBits(version)) / 8);
}

// ---- Reed-Solomon over GF(2^8) with the polynomial 0x11d ----

function gfMultiply(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMultiply(result[j] as number, root);
      if (j + 1 < result.length) result[j] = (result[j] as number) ^ (result[j + 1] as number);
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data: readonly number[], divisor: readonly number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => {
      result[i] = (result[i] as number) ^ gfMultiply(coef, factor);
    });
  }
  return result;
}

/** Splits data into blocks, adds EC codewords and interleaves them. */
function addEcAndInterleave(data: readonly number[], version: number, ecl: QrEcLevel): number[] {
  const numBlocks = NUM_EC_BLOCKS[ecl][version] as number;
  const blockEcLen = EC_CODEWORDS_PER_BLOCK[ecl][version] as number;
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const blocks: number[][] = [];
  const divisor = rsDivisor(blockEcLen);
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const len = shortBlockLen - blockEcLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, divisor);
    // Short blocks get a placeholder so all blocks interleave by index.
    if (i < numShortBlocks) dat.push(0);
    blocks.push([...dat, ...ecc]);
  }

  const result: number[] = [];
  const blockLen = (blocks[0] as number[]).length;
  for (let i = 0; i < blockLen; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEcLen || j >= numShortBlocks) result.push(block[i] as number);
    });
  }
  return result;
}

// ---- Matrix construction ----

class Builder {
  readonly size: number;
  readonly modules: boolean[][];
  readonly isFunction: boolean[][];
  readonly version: number;

  constructor(version: number) {
    this.version = version;
    this.size = version * 4 + 17;
    this.modules = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
    this.isFunction = Array.from({ length: this.size }, () =>
      new Array<boolean>(this.size).fill(false),
    );
  }

  set(x: number, y: number, dark: boolean) {
    (this.modules[y] as boolean[])[x] = dark;
    (this.isFunction[y] as boolean[])[x] = true;
  }

  get(x: number, y: number): boolean {
    return (this.modules[y] as boolean[])[x] as boolean;
  }

  drawFunctionPatterns() {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.drawFinder(3, 3);
    this.drawFinder(this.size - 4, 3);
    this.drawFinder(3, this.size - 4);

    const positions = alignmentPositions(this.version);
    const n = positions.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        // Skip the three corners that hold finder patterns.
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        this.drawAlignment(positions[i] as number, positions[j] as number);
      }
    }
    // Reserve the format areas (real bits follow after masking).
    this.drawFormatBits("L", 0);
    this.drawVersion();
  }

  drawFinder(x: number, y: number) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < this.size && yy >= 0 && yy < this.size) {
          this.set(xx, yy, dist !== 2 && dist !== 4);
        }
      }
    }
  }

  drawAlignment(x: number, y: number) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.set(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  drawFormatBits(ecl: QrEcLevel, mask: number) {
    const data = (EC_FORMAT_BITS[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((bits >>> i) & 1) !== 0;

    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));

    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(i));
    this.set(8, this.size - 8, true); // Always dark.
  }

  drawVersion() {
    if (this.version < 7) return;
    let rem = this.version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (this.version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) !== 0;
      const a = this.size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      this.set(a, b, dark);
      this.set(b, a, dark);
    }
  }

  drawCodewords(data: readonly number[]) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vert : vert;
          if (!(this.isFunction[y] as boolean[])[x] && i < data.length * 8) {
            (this.modules[y] as boolean[])[x] =
              (((data[i >>> 3] as number) >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if ((this.isFunction[y] as boolean[])[x]) continue;
        if (maskBit(mask, x, y)) (this.modules[y] as boolean[])[x] = !this.get(x, y);
      }
    }
  }

  penalty(): number {
    const size = this.size;
    let result = 0;
    // Rule 1 and 3 along rows and columns.
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let runColor = false;
        let run = 0;
        const line: boolean[] = [];
        for (let b = 0; b < size; b++) {
          const dark = pass === 0 ? this.get(b, a) : this.get(a, b);
          line.push(dark);
          if (dark === runColor) {
            run++;
            if (run === 5) result += 3;
            else if (run > 5) result++;
          } else {
            runColor = dark;
            run = 1;
          }
        }
        result += finderLikeCount(line) * 40;
      }
    }
    // Rule 2: 2×2 blocks of one colour.
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = this.get(x, y);
        if (c === this.get(x + 1, y) && c === this.get(x, y + 1) && c === this.get(x + 1, y + 1)) {
          result += 3;
        }
      }
    }
    // Rule 4: balance of dark and light.
    let dark = 0;
    for (const row of this.modules) for (const m of row) if (m) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += Math.max(0, k) * 10;
    return result;
  }
}

/** 1:1:3:1:1 patterns with four light modules on one side, as in the penalty rule 3. */
function finderLikeCount(line: readonly boolean[]): number {
  const n = line.length;
  const at = (i: number) => (i < 0 || i >= n ? false : (line[i] as boolean));
  let count = 0;
  const core = [true, false, true, true, true, false, true];
  for (let i = 0; i + 7 <= n; i++) {
    if (!core.every((c, k) => at(i + k) === c)) continue;
    const before = [1, 2, 3, 4].every((k) => !at(i - k));
    const after = [7, 8, 9, 10].every((k) => !at(i + k));
    if (before) count++;
    if (after) count++;
  }
  return count;
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

/** Centre coordinates of the alignment patterns of a version. */
export function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

/** UTF-8 bytes of a string (the engine has no DOM or Node typings for TextEncoder). */
export function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const char of text) {
    let c = char.codePointAt(0) as number;
    // Lone surrogates become U+FFFD, as TextEncoder does.
    if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export type QrEncodeResult = { ok: true; matrix: QrMatrix } | { ok: false; error: "tooLong" };

/**
 * Encodes UTF-8 text in the smallest version that fits, from `minVersion`
 * on. `mask` picks a mask (0 to 7) or `null` for the best by penalty.
 */
export function encodeQr(
  text: string,
  ecl: QrEcLevel,
  options: { minVersion?: number; mask?: number | null } = {},
): QrEncodeResult {
  const bytes = utf8Bytes(text);
  const minVersion = Math.min(Math.max(options.minVersion ?? 1, QR_MIN_VERSION), QR_MAX_VERSION);
  let version = minVersion;
  while (version <= QR_MAX_VERSION && bytes.length > qrCapacityBytes(version, ecl)) version++;
  if (version > QR_MAX_VERSION) return { ok: false, error: "tooLong" };

  // Bit stream: mode (byte = 0100), count, data, terminator, padding.
  const bits: number[] = [];
  const push = (value: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4);
  push(bytes.length, countBits(version));
  for (const b of bytes) push(b, 8);
  const capacityBits = dataCodewords(version, ecl) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) push(pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let k = 0; k < 8; k++) byte = (byte << 1) | (bits[i + k] as number);
    data.push(byte);
  }

  const codewords = addEcAndInterleave(data, version, ecl);
  const builder = new Builder(version);
  builder.drawFunctionPatterns();
  builder.drawCodewords(codewords);

  let mask = options.mask ?? null;
  if (mask === null) {
    let best = Infinity;
    for (let m = 0; m < 8; m++) {
      builder.applyMask(m);
      builder.drawFormatBits(ecl, m);
      const p = builder.penalty();
      if (p < best) {
        best = p;
        mask = m;
      }
      builder.applyMask(m); // XOR again undoes it.
    }
  }
  const chosen = Math.min(Math.max(mask ?? 0, 0), 7);
  builder.applyMask(chosen);
  builder.drawFormatBits(ecl, chosen);

  return {
    ok: true,
    matrix: {
      version,
      size: builder.size,
      ecLevel: ecl,
      mask: chosen,
      modules: builder.modules,
      isFunction: builder.isFunction,
    },
  };
}
