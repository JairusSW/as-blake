import {
  IV0,
  IV1,
  IV2,
  IV3,
  IV4,
  IV5,
  IV6,
  IV7,
  BLOCK_LEN,
  CHUNK_LEN,
  MAX_DEPTH,
  FLAG_CHUNK_START,
  FLAG_CHUNK_END,
  FLAG_PARENT,
  FLAG_ROOT,
  FLAG_KEYED_HASH,
  FLAG_DERIVE_KEY_CONTEXT,
  FLAG_DERIVE_KEY_MATERIAL,
} from "./constants";
import { compressCV, IV_PTR } from "./compress";
import { compress4Chunks, compress2Chunks } from "./compress_simd";

const CHUNK_CV_V: usize = memory.data(32);
const BLOCK_BUF_V: usize = memory.data(64);
const CV_STACK_V: usize = memory.data(MAX_DEPTH * 32);
const PARENT_BUF_V: usize = memory.data(64);
const MERGE_TMP_V: usize = memory.data(32);
const CTX_KEY_V: usize = memory.data(32);
const KEY_BUF_V: usize = memory.data(32);
const SIMD_OUT_V: usize = memory.data(4 * 32);

export class HasherSimd {
  private key0: u32 = 0;
  private key1: u32 = 0;
  private key2: u32 = 0;
  private key3: u32 = 0;
  private key4: u32 = 0;
  private key5: u32 = 0;
  private key6: u32 = 0;
  private key7: u32 = 0;
  private cvStackLen: i32 = 0;
  private chunkCounter: u64 = 0;
  private blocksCompressed: i32 = 0;
  private bufLen: i32 = 0;
  private flags: u32 = 0;

  constructor() {
    this._initKey(IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7, 0);
  }

  private _initKey(
    k0: u32,
    k1: u32,
    k2: u32,
    k3: u32,
    k4: u32,
    k5: u32,
    k6: u32,
    k7: u32,
    f: u32,
  ): void {
    this.key0 = k0;
    this.key1 = k1;
    this.key2 = k2;
    this.key3 = k3;
    this.key4 = k4;
    this.key5 = k5;
    this.key6 = k6;
    this.key7 = k7;
    this.flags = f;
    store<u32>(KEY_BUF_V, k0, 0);
    store<u32>(KEY_BUF_V, k1, 4);
    store<u32>(KEY_BUF_V, k2, 8);
    store<u32>(KEY_BUF_V, k3, 12);
    store<u32>(KEY_BUF_V, k4, 16);
    store<u32>(KEY_BUF_V, k5, 20);
    store<u32>(KEY_BUF_V, k6, 24);
    store<u32>(KEY_BUF_V, k7, 28);
    this._resetChunk();
  }

  static createKeyed(keyPtr: usize): HasherSimd {
    const h = new HasherSimd();
    h._initKey(
      load<u32>(keyPtr, 0),
      load<u32>(keyPtr, 4),
      load<u32>(keyPtr, 8),
      load<u32>(keyPtr, 12),
      load<u32>(keyPtr, 16),
      load<u32>(keyPtr, 20),
      load<u32>(keyPtr, 24),
      load<u32>(keyPtr, 28),
      FLAG_KEYED_HASH,
    );
    return h;
  }

  private _resetChunk(): void {
    store<u32>(CHUNK_CV_V, this.key0, 0);
    store<u32>(CHUNK_CV_V, this.key1, 4);
    store<u32>(CHUNK_CV_V, this.key2, 8);
    store<u32>(CHUNK_CV_V, this.key3, 12);
    store<u32>(CHUNK_CV_V, this.key4, 16);
    store<u32>(CHUNK_CV_V, this.key5, 20);
    store<u32>(CHUNK_CV_V, this.key6, 24);
    store<u32>(CHUNK_CV_V, this.key7, 28);
    this.blocksCompressed = 0;
  }

  update(ptr: usize, len: usize): void {
    this._update(ptr, len);
  }

  private _update(ptr: usize, len: usize): void {
    let remaining = len;

    if (this.bufLen > 0 && remaining > 0) {
      const spaceInBuf = <usize>(BLOCK_LEN - this.bufLen);
      if (remaining <= spaceInBuf) {
        memory.copy(BLOCK_BUF_V + <usize>this.bufLen, ptr, remaining);
        this.bufLen += <i32>remaining;
        return;
      }
      memory.copy(BLOCK_BUF_V + <usize>this.bufLen, ptr, spaceInBuf);
      ptr += spaceInBuf;
      remaining -= spaceInBuf;
      this.bufLen = BLOCK_LEN;
      this._compressBlock(this.blocksCompressed == 15);
    }

    // `>` not `>=`: keep at least one block back so finalize() can tag the
    // final chunk with ROOT.
    while (this.blocksCompressed == 0 && remaining > 4 * CHUNK_LEN) {
      compress4Chunks(
        ptr,
        KEY_BUF_V,
        this.chunkCounter,
        this.flags,
        SIMD_OUT_V,
      );
      for (let k: i32 = 0; k < 4; k++) {
        const src = SIMD_OUT_V + <usize>k * 32;
        const dst = CV_STACK_V + <usize>this.cvStackLen * 32;
        memory.copy(dst, src, 32);
        this.cvStackLen++;
        this.chunkCounter++;
        this._mergeSubtrees(this.chunkCounter);
      }
      ptr += 4 * CHUNK_LEN;
      remaining -= 4 * CHUNK_LEN;
    }

    // Degree-2 tail: 2 chunks at a time once fewer than 4 remain. Same `>` rule.
    while (this.blocksCompressed == 0 && remaining > 2 * CHUNK_LEN) {
      compress2Chunks(
        ptr,
        KEY_BUF_V,
        this.chunkCounter,
        this.flags,
        SIMD_OUT_V,
      );
      for (let k: i32 = 0; k < 2; k++) {
        const src = SIMD_OUT_V + <usize>k * 32;
        const dst = CV_STACK_V + <usize>this.cvStackLen * 32;
        memory.copy(dst, src, 32);
        this.cvStackLen++;
        this.chunkCounter++;
        this._mergeSubtrees(this.chunkCounter);
      }
      ptr += 2 * CHUNK_LEN;
      remaining -= 2 * CHUNK_LEN;
    }

    while (remaining > 0) {
      const spaceInBuf = <usize>(BLOCK_LEN - this.bufLen);
      if (remaining <= spaceInBuf) {
        memory.copy(BLOCK_BUF_V + <usize>this.bufLen, ptr, remaining);
        this.bufLen += <i32>remaining;
        return;
      }
      if (this.bufLen > 0) {
        memory.copy(BLOCK_BUF_V + <usize>this.bufLen, ptr, spaceInBuf);
        ptr += spaceInBuf;
        remaining -= spaceInBuf;
        this.bufLen = BLOCK_LEN;
        this._compressBlock(this.blocksCompressed == 15);
      } else {
        if (remaining > BLOCK_LEN) {
          this._compressBlockDirect(ptr, this.blocksCompressed == 15);
          ptr += BLOCK_LEN;
          remaining -= BLOCK_LEN;
        } else {
          memory.copy(BLOCK_BUF_V, ptr, remaining);
          this.bufLen = <i32>remaining;
          return;
        }
      }
    }
  }

  private _compressBlock(isLast: bool): void {
    const f = this._blockFlags(isLast);
    compressCV(
      CHUNK_CV_V,
      BLOCK_BUF_V,
      this.chunkCounter,
      BLOCK_LEN,
      f,
      CHUNK_CV_V,
    );
    this.blocksCompressed++;
    this.bufLen = 0;
    if (this.blocksCompressed == 16) this._finalizeChunk();
  }

  private _compressBlockDirect(srcPtr: usize, isLast: bool): void {
    const f = this._blockFlags(isLast);
    compressCV(CHUNK_CV_V, srcPtr, this.chunkCounter, BLOCK_LEN, f, CHUNK_CV_V);
    this.blocksCompressed++;
    if (this.blocksCompressed == 16) this._finalizeChunk();
  }


  @inline private _blockFlags(isLast: bool): u32 {
    return (
      (this.blocksCompressed == 0 ? FLAG_CHUNK_START : 0) |
      (isLast ? FLAG_CHUNK_END : 0) |
      this.flags
    );
  }

  private _finalizeChunk(): void {
    const dst = CV_STACK_V + <usize>this.cvStackLen * 32;
    memory.copy(dst, CHUNK_CV_V, 32);
    this.cvStackLen++;
    this.chunkCounter++;
    this._mergeSubtrees(this.chunkCounter);
    this._resetChunk();
  }

  private _mergeSubtrees(n: u64): void {
    while ((n & 1) == 0 && this.cvStackLen >= 2) {
      const left = CV_STACK_V + <usize>(this.cvStackLen - 2) * 32;
      this.cvStackLen -= 2;
      const out = CV_STACK_V + <usize>this.cvStackLen * 32;
      compressCV(IV_PTR, left, 0, BLOCK_LEN, FLAG_PARENT | this.flags, out);
      this.cvStackLen++;
      n >>= 1;
    }
  }

  finalize(outPtr: usize): void {
    this._finalizeRoot(outPtr);
  }

  private _finalizeRoot(outPtr: usize): void {
    const uBufLen: u32 = <u32>this.bufLen;
    if (uBufLen < BLOCK_LEN) {
      memory.fill(
        BLOCK_BUF_V + <usize>uBufLen,
        0,
        <usize>(BLOCK_LEN - uBufLen),
      );
    }
    const lastBlockLen: u32 = uBufLen;
    let finalFlags: u32 =
      FLAG_CHUNK_END |
      (this.blocksCompressed == 0 ? FLAG_CHUNK_START : 0) |
      this.flags;

    if (this.cvStackLen == 0) {
      finalFlags |= FLAG_ROOT;
      compressCV(
        CHUNK_CV_V,
        BLOCK_BUF_V,
        this.chunkCounter,
        lastBlockLen,
        finalFlags,
        outPtr,
      );
      return;
    }
    compressCV(
      CHUNK_CV_V,
      BLOCK_BUF_V,
      this.chunkCounter,
      lastBlockLen,
      finalFlags,
      CHUNK_CV_V,
    );

    let rightCV = CHUNK_CV_V;
    let stackLen = this.cvStackLen;
    while (stackLen > 0) {
      const leftCV = CV_STACK_V + <usize>(stackLen - 1) * 32;
      memory.copy(PARENT_BUF_V, leftCV, 32);
      memory.copy(PARENT_BUF_V + 32, rightCV, 32);
      stackLen--;
      const mergeFlags =
        FLAG_PARENT | this.flags | (stackLen == 0 ? FLAG_ROOT : 0);
      const dst: usize = stackLen == 0 ? outPtr : MERGE_TMP_V;
      compressCV(IV_PTR, PARENT_BUF_V, 0, BLOCK_LEN, mergeFlags, dst);
      if (stackLen > 0) rightCV = MERGE_TMP_V;
    }
  }

  reset(): void {
    this.cvStackLen = 0;
    this.chunkCounter = 0;
    this.bufLen = 0;
    memory.fill(BLOCK_BUF_V, 0, BLOCK_LEN);
    this._resetChunk();
  }
}

let vKey0: u32 = IV0;
let vKey1: u32 = IV1;
let vKey2: u32 = IV2;
let vKey3: u32 = IV3;
let vKey4: u32 = IV4;
let vKey5: u32 = IV5;
let vKey6: u32 = IV6;
let vKey7: u32 = IV7;
let vCvStackLen: i32 = 0;
let vChunkCounter: u64 = 0;
let vBlocksCompressed: i32 = 0;
let vBufLen: i32 = 0;
let vFlags: u32 = 0;


@inline function vResetChunk(): void {
  store<u32>(CHUNK_CV_V, vKey0, 0);
  store<u32>(CHUNK_CV_V, vKey1, 4);
  store<u32>(CHUNK_CV_V, vKey2, 8);
  store<u32>(CHUNK_CV_V, vKey3, 12);
  store<u32>(CHUNK_CV_V, vKey4, 16);
  store<u32>(CHUNK_CV_V, vKey5, 20);
  store<u32>(CHUNK_CV_V, vKey6, 24);
  store<u32>(CHUNK_CV_V, vKey7, 28);
  vBlocksCompressed = 0;
}

function vInit(): void {
  vKey0 = IV0;
  vKey1 = IV1;
  vKey2 = IV2;
  vKey3 = IV3;
  vKey4 = IV4;
  vKey5 = IV5;
  vKey6 = IV6;
  vKey7 = IV7;
  vCvStackLen = 0;
  vChunkCounter = 0;
  vBufLen = 0;
  vFlags = 0;
  store<u32>(KEY_BUF_V, IV0, 0);
  store<u32>(KEY_BUF_V, IV1, 4);
  store<u32>(KEY_BUF_V, IV2, 8);
  store<u32>(KEY_BUF_V, IV3, 12);
  store<u32>(KEY_BUF_V, IV4, 16);
  store<u32>(KEY_BUF_V, IV5, 20);
  store<u32>(KEY_BUF_V, IV6, 24);
  store<u32>(KEY_BUF_V, IV7, 28);
  memory.fill(BLOCK_BUF_V, 0, BLOCK_LEN);
  vResetChunk();
}


@inline function vBlockFlags(isLast: bool): u32 {
  return (
    (vBlocksCompressed == 0 ? FLAG_CHUNK_START : 0) |
    (isLast ? FLAG_CHUNK_END : 0) |
    vFlags
  );
}

function vMergeSubtrees(n: u64): void {
  while ((n & 1) == 0 && vCvStackLen >= 2) {
    const left = CV_STACK_V + <usize>(vCvStackLen - 2) * 32;
    vCvStackLen -= 2;
    const out = CV_STACK_V + <usize>vCvStackLen * 32;
    compressCV(IV_PTR, left, 0, BLOCK_LEN, FLAG_PARENT | vFlags, out);
    vCvStackLen++;
    n >>= 1;
  }
}

function vFinalizeChunk(): void {
  const dst = CV_STACK_V + <usize>vCvStackLen * 32;
  memory.copy(dst, CHUNK_CV_V, 32);
  vCvStackLen++;
  vChunkCounter++;
  vMergeSubtrees(vChunkCounter);
  vResetChunk();
}

function vCompressBlock(isLast: bool): void {
  compressCV(
    CHUNK_CV_V,
    BLOCK_BUF_V,
    vChunkCounter,
    BLOCK_LEN,
    vBlockFlags(isLast),
    CHUNK_CV_V,
  );
  vBlocksCompressed++;
  vBufLen = 0;
  if (vBlocksCompressed == 16) vFinalizeChunk();
}

function vCompressBlockDirect(srcPtr: usize, isLast: bool): void {
  compressCV(
    CHUNK_CV_V,
    srcPtr,
    vChunkCounter,
    BLOCK_LEN,
    vBlockFlags(isLast),
    CHUNK_CV_V,
  );
  vBlocksCompressed++;
  if (vBlocksCompressed == 16) vFinalizeChunk();
}

function vUpdate(ptr: usize, len: usize): void {
  let remaining = len;

  if (vBufLen > 0 && remaining > 0) {
    const spaceInBuf = <usize>(BLOCK_LEN - vBufLen);
    if (remaining <= spaceInBuf) {
      memory.copy(BLOCK_BUF_V + <usize>vBufLen, ptr, remaining);
      vBufLen += <i32>remaining;
      return;
    }
    memory.copy(BLOCK_BUF_V + <usize>vBufLen, ptr, spaceInBuf);
    ptr += spaceInBuf;
    remaining -= spaceInBuf;
    vBufLen = BLOCK_LEN;
    vCompressBlock(vBlocksCompressed == 15);
  }

  // `>` not `>=`: keep at least one block back so finalize() can tag the
  // final chunk with ROOT.
  while (vBlocksCompressed == 0 && remaining > 4 * CHUNK_LEN) {
    compress4Chunks(ptr, KEY_BUF_V, vChunkCounter, vFlags, SIMD_OUT_V);
    for (let k: i32 = 0; k < 4; k++) {
      const src = SIMD_OUT_V + <usize>k * 32;
      const dst = CV_STACK_V + <usize>vCvStackLen * 32;
      memory.copy(dst, src, 32);
      vCvStackLen++;
      vChunkCounter++;
      vMergeSubtrees(vChunkCounter);
    }
    ptr += 4 * CHUNK_LEN;
    remaining -= 4 * CHUNK_LEN;
  }

  // Degree-2 tail: 2 chunks at a time once fewer than 4 remain. Same `>` rule.
  while (vBlocksCompressed == 0 && remaining > 2 * CHUNK_LEN) {
    compress2Chunks(ptr, KEY_BUF_V, vChunkCounter, vFlags, SIMD_OUT_V);
    for (let k: i32 = 0; k < 2; k++) {
      const src = SIMD_OUT_V + <usize>k * 32;
      const dst = CV_STACK_V + <usize>vCvStackLen * 32;
      memory.copy(dst, src, 32);
      vCvStackLen++;
      vChunkCounter++;
      vMergeSubtrees(vChunkCounter);
    }
    ptr += 2 * CHUNK_LEN;
    remaining -= 2 * CHUNK_LEN;
  }

  while (remaining > 0) {
    const spaceInBuf = <usize>(BLOCK_LEN - vBufLen);
    if (remaining <= spaceInBuf) {
      memory.copy(BLOCK_BUF_V + <usize>vBufLen, ptr, remaining);
      vBufLen += <i32>remaining;
      return;
    }
    if (vBufLen > 0) {
      memory.copy(BLOCK_BUF_V + <usize>vBufLen, ptr, spaceInBuf);
      ptr += spaceInBuf;
      remaining -= spaceInBuf;
      vBufLen = BLOCK_LEN;
      vCompressBlock(vBlocksCompressed == 15);
    } else {
      if (remaining > BLOCK_LEN) {
        vCompressBlockDirect(ptr, vBlocksCompressed == 15);
        ptr += BLOCK_LEN;
        remaining -= BLOCK_LEN;
      } else {
        memory.copy(BLOCK_BUF_V, ptr, remaining);
        vBufLen = <i32>remaining;
        return;
      }
    }
  }
}

function vFinalizeRoot(outPtr: usize): void {
  const uBufLen: u32 = <u32>vBufLen;
  if (uBufLen < BLOCK_LEN) {
    memory.fill(BLOCK_BUF_V + <usize>uBufLen, 0, <usize>(BLOCK_LEN - uBufLen));
  }
  let finalFlags: u32 =
    FLAG_CHUNK_END | (vBlocksCompressed == 0 ? FLAG_CHUNK_START : 0) | vFlags;

  if (vCvStackLen == 0) {
    finalFlags |= FLAG_ROOT;
    compressCV(
      CHUNK_CV_V,
      BLOCK_BUF_V,
      vChunkCounter,
      uBufLen,
      finalFlags,
      outPtr,
    );
    return;
  }
  compressCV(
    CHUNK_CV_V,
    BLOCK_BUF_V,
    vChunkCounter,
    uBufLen,
    finalFlags,
    CHUNK_CV_V,
  );

  let rightCV = CHUNK_CV_V;
  let stackLen = vCvStackLen;
  while (stackLen > 0) {
    const leftCV = CV_STACK_V + <usize>(stackLen - 1) * 32;
    memory.copy(PARENT_BUF_V, leftCV, 32);
    memory.copy(PARENT_BUF_V + 32, rightCV, 32);
    stackLen--;
    const mergeFlags = FLAG_PARENT | vFlags | (stackLen == 0 ? FLAG_ROOT : 0);
    const dst: usize = stackLen == 0 ? outPtr : MERGE_TMP_V;
    compressCV(IV_PTR, PARENT_BUF_V, 0, BLOCK_LEN, mergeFlags, dst);
    if (stackLen > 0) rightCV = MERGE_TMP_V;
  }
}

export function hashSimdScratch(
  inPtr: usize,
  inLen: usize,
  outPtr: usize,
): void {
  vInit();
  vUpdate(inPtr, inLen);
  vFinalizeRoot(outPtr);
}
