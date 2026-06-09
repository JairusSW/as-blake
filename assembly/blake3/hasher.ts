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

const CHUNK_CV: usize = memory.data(32);
const BLOCK_BUF: usize = memory.data(64);
const CV_STACK: usize = memory.data(MAX_DEPTH * 32);
const PARENT_BUF: usize = memory.data(64);
const MERGE_TMP: usize = memory.data(32);
const CTX_KEY: usize = memory.data(32);

export class Hasher {
  private chunkCVBuf: ArrayBuffer = new ArrayBuffer(32);
  private blockBuf: ArrayBuffer = new ArrayBuffer(64);
  private cvStackBuf: ArrayBuffer = new ArrayBuffer(MAX_DEPTH * 32);
  private parentBuf: ArrayBuffer = new ArrayBuffer(64);
  private mergeTmpBuf: ArrayBuffer = new ArrayBuffer(32);
  private ctxKeyBuf: ArrayBuffer = new ArrayBuffer(32);
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


  @inline private _chunkCV(): usize {
    return changetype<usize>(this.chunkCVBuf);
  }


  @inline private _blockBuf(): usize {
    return changetype<usize>(this.blockBuf);
  }


  @inline private _cvStack(): usize {
    return changetype<usize>(this.cvStackBuf);
  }


  @inline private _parentBuf(): usize {
    return changetype<usize>(this.parentBuf);
  }


  @inline private _mergeTmp(): usize {
    return changetype<usize>(this.mergeTmpBuf);
  }


  @inline private _ctxKey(): usize {
    return changetype<usize>(this.ctxKeyBuf);
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
    this._resetChunk();
  }

  private _resetChunk(): void {
    const chunkCV = this._chunkCV();
    store<u32>(chunkCV, this.key0, 0);
    store<u32>(chunkCV, this.key1, 4);
    store<u32>(chunkCV, this.key2, 8);
    store<u32>(chunkCV, this.key3, 12);
    store<u32>(chunkCV, this.key4, 16);
    store<u32>(chunkCV, this.key5, 20);
    store<u32>(chunkCV, this.key6, 24);
    store<u32>(chunkCV, this.key7, 28);
    this.blocksCompressed = 0;
  }

  static create(): Hasher {
    return new Hasher();
  }

  static createKeyed(keyPtr: usize): Hasher {
    const h = new Hasher();
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

  static createDeriveKey(contextPtr: usize, contextLen: usize): Hasher {
    const ctxHasher = new Hasher();
    ctxHasher._initKey(
      IV0,
      IV1,
      IV2,
      IV3,
      IV4,
      IV5,
      IV6,
      IV7,
      FLAG_DERIVE_KEY_CONTEXT,
    );
    ctxHasher._update(contextPtr, contextLen);
    // @ts-ignore
    ctxHasher._finalizeRoot(ctxHasher._ctxKey());
    const h = new Hasher();
    const ctxKey = ctxHasher._ctxKey();
    h._initKey(
      load<u32>(ctxKey, 0),
      load<u32>(ctxKey, 4),
      load<u32>(ctxKey, 8),
      load<u32>(ctxKey, 12),
      load<u32>(ctxKey, 16),
      load<u32>(ctxKey, 20),
      load<u32>(ctxKey, 24),
      load<u32>(ctxKey, 28),
      FLAG_DERIVE_KEY_MATERIAL,
    );
    return h;
  }

  update(ptr: usize, len: usize): void {
    this._update(ptr, len);
  }

  private _update(ptr: usize, len: usize): void {
    let remaining = len;
    while (remaining > 0) {
      const spaceInBuf = <usize>(BLOCK_LEN - this.bufLen);
      if (remaining <= spaceInBuf) {
        memory.copy(this._blockBuf() + <usize>this.bufLen, ptr, remaining);
        this.bufLen += <i32>remaining;
        return;
      }
      if (this.bufLen > 0) {
        memory.copy(this._blockBuf() + <usize>this.bufLen, ptr, spaceInBuf);
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
          memory.copy(this._blockBuf(), ptr, remaining);
          this.bufLen = <i32>remaining;
          return;
        }
      }
    }
  }

  private _compressBlock(isLast: bool): void {
    const f = this._blockFlags(isLast);
    const chunkCV = this._chunkCV();
    compressCV(
      chunkCV,
      this._blockBuf(),
      this.chunkCounter,
      BLOCK_LEN,
      f,
      chunkCV,
    );
    this.blocksCompressed++;
    this.bufLen = 0;
    if (this.blocksCompressed == 16) {
      this._finalizeChunk();
    }
  }

  private _compressBlockDirect(srcPtr: usize, isLast: bool): void {
    const f = this._blockFlags(isLast);
    const chunkCV = this._chunkCV();
    compressCV(chunkCV, srcPtr, this.chunkCounter, BLOCK_LEN, f, chunkCV);
    this.blocksCompressed++;
    if (this.blocksCompressed == 16) {
      this._finalizeChunk();
    }
  }


  @inline private _blockFlags(isLast: bool): u32 {
    return (
      (this.blocksCompressed == 0 ? FLAG_CHUNK_START : 0) |
      (isLast ? FLAG_CHUNK_END : 0) |
      this.flags
    );
  }

  private _finalizeChunk(): void {
    const dst = this._cvStack() + <usize>this.cvStackLen * 32;
    memory.copy(dst, this._chunkCV(), 32);
    this.cvStackLen++;
    this.chunkCounter++;
    this._mergeSubtrees(this.chunkCounter);
    this._resetChunk();
  }

  private _mergeSubtrees(n: u64): void {
    while ((n & 1) == 0 && this.cvStackLen >= 2) {
      // left and right are adjacent on the stack, so `left` already points at
      // the contiguous left‖right 64-byte parent block.
      const left = this._cvStack() + <usize>(this.cvStackLen - 2) * 32;
      this.cvStackLen -= 2;
      const out = this._cvStack() + <usize>this.cvStackLen * 32;
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
        this._blockBuf() + <usize>uBufLen,
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
        this._chunkCV(),
        this._blockBuf(),
        this.chunkCounter,
        lastBlockLen,
        finalFlags,
        outPtr,
      );
      return;
    }

    compressCV(
      this._chunkCV(),
      this._blockBuf(),
      this.chunkCounter,
      lastBlockLen,
      finalFlags,
      this._chunkCV(),
    );

    let rightCV = this._chunkCV();
    let stackLen = this.cvStackLen;

    while (stackLen > 0) {
      const leftCV = this._cvStack() + <usize>(stackLen - 1) * 32;
      memory.copy(this._parentBuf(), leftCV, 32);
      memory.copy(this._parentBuf() + 32, rightCV, 32);
      stackLen--;

      const mergeFlags =
        FLAG_PARENT | this.flags | (stackLen == 0 ? FLAG_ROOT : 0);
      const dst: usize = stackLen == 0 ? outPtr : this._mergeTmp();
      compressCV(IV_PTR, this._parentBuf(), 0, BLOCK_LEN, mergeFlags, dst);
      if (stackLen > 0) {
        rightCV = this._mergeTmp();
      }
    }
  }

  reset(): void {
    this.cvStackLen = 0;
    this.chunkCounter = 0;
    this.bufLen = 0;
    memory.fill(this._blockBuf(), 0, BLOCK_LEN);
    this._resetChunk();
  }
}

let gKey0: u32 = IV0;
let gKey1: u32 = IV1;
let gKey2: u32 = IV2;
let gKey3: u32 = IV3;
let gKey4: u32 = IV4;
let gKey5: u32 = IV5;
let gKey6: u32 = IV6;
let gKey7: u32 = IV7;
let gCvStackLen: i32 = 0;
let gChunkCounter: u64 = 0;
let gBlocksCompressed: i32 = 0;
let gBufLen: i32 = 0;
let gFlags: u32 = 0;


@inline function gResetChunk(): void {
  store<u32>(CHUNK_CV, gKey0, 0);
  store<u32>(CHUNK_CV, gKey1, 4);
  store<u32>(CHUNK_CV, gKey2, 8);
  store<u32>(CHUNK_CV, gKey3, 12);
  store<u32>(CHUNK_CV, gKey4, 16);
  store<u32>(CHUNK_CV, gKey5, 20);
  store<u32>(CHUNK_CV, gKey6, 24);
  store<u32>(CHUNK_CV, gKey7, 28);
  gBlocksCompressed = 0;
}

function gInitKey(
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
  gKey0 = k0;
  gKey1 = k1;
  gKey2 = k2;
  gKey3 = k3;
  gKey4 = k4;
  gKey5 = k5;
  gKey6 = k6;
  gKey7 = k7;
  gCvStackLen = 0;
  gChunkCounter = 0;
  gBufLen = 0;
  gFlags = f;
  memory.fill(BLOCK_BUF, 0, BLOCK_LEN);
  gResetChunk();
}


@inline function gBlockFlags(isLast: bool): u32 {
  return (
    (gBlocksCompressed == 0 ? FLAG_CHUNK_START : 0) |
    (isLast ? FLAG_CHUNK_END : 0) |
    gFlags
  );
}

function gMergeSubtrees(n: u64): void {
  while ((n & 1) == 0 && gCvStackLen >= 2) {
    const left = CV_STACK + <usize>(gCvStackLen - 2) * 32;
    gCvStackLen -= 2;
    const out = CV_STACK + <usize>gCvStackLen * 32;
    compressCV(IV_PTR, left, 0, BLOCK_LEN, FLAG_PARENT | gFlags, out);
    gCvStackLen++;
    n >>= 1;
  }
}

function gFinalizeChunk(): void {
  const dst = CV_STACK + <usize>gCvStackLen * 32;
  memory.copy(dst, CHUNK_CV, 32);
  gCvStackLen++;
  gChunkCounter++;
  gMergeSubtrees(gChunkCounter);
  gResetChunk();
}

function gCompressBlock(isLast: bool): void {
  compressCV(
    CHUNK_CV,
    BLOCK_BUF,
    gChunkCounter,
    BLOCK_LEN,
    gBlockFlags(isLast),
    CHUNK_CV,
  );
  gBlocksCompressed++;
  gBufLen = 0;
  if (gBlocksCompressed == 16) gFinalizeChunk();
}

function gCompressBlockDirect(srcPtr: usize, isLast: bool): void {
  compressCV(
    CHUNK_CV,
    srcPtr,
    gChunkCounter,
    BLOCK_LEN,
    gBlockFlags(isLast),
    CHUNK_CV,
  );
  gBlocksCompressed++;
  if (gBlocksCompressed == 16) gFinalizeChunk();
}

function gUpdate(ptr: usize, len: usize): void {
  let remaining = len;
  while (remaining > 0) {
    const spaceInBuf = <usize>(BLOCK_LEN - gBufLen);
    if (remaining <= spaceInBuf) {
      memory.copy(BLOCK_BUF + <usize>gBufLen, ptr, remaining);
      gBufLen += <i32>remaining;
      return;
    }
    if (gBufLen > 0) {
      memory.copy(BLOCK_BUF + <usize>gBufLen, ptr, spaceInBuf);
      ptr += spaceInBuf;
      remaining -= spaceInBuf;
      gBufLen = BLOCK_LEN;
      gCompressBlock(gBlocksCompressed == 15);
    } else {
      if (remaining > BLOCK_LEN) {
        gCompressBlockDirect(ptr, gBlocksCompressed == 15);
        ptr += BLOCK_LEN;
        remaining -= BLOCK_LEN;
      } else {
        memory.copy(BLOCK_BUF, ptr, remaining);
        gBufLen = <i32>remaining;
        return;
      }
    }
  }
}

function gFinalizeRoot(outPtr: usize): void {
  const uBufLen: u32 = <u32>gBufLen;
  if (uBufLen < BLOCK_LEN) {
    memory.fill(BLOCK_BUF + <usize>uBufLen, 0, <usize>(BLOCK_LEN - uBufLen));
  }

  let finalFlags: u32 =
    FLAG_CHUNK_END | (gBlocksCompressed == 0 ? FLAG_CHUNK_START : 0) | gFlags;

  if (gCvStackLen == 0) {
    finalFlags |= FLAG_ROOT;
    compressCV(CHUNK_CV, BLOCK_BUF, gChunkCounter, uBufLen, finalFlags, outPtr);
    return;
  }

  compressCV(CHUNK_CV, BLOCK_BUF, gChunkCounter, uBufLen, finalFlags, CHUNK_CV);
  let rightCV = CHUNK_CV;
  let stackLen = gCvStackLen;
  while (stackLen > 0) {
    const leftCV = CV_STACK + <usize>(stackLen - 1) * 32;
    memory.copy(PARENT_BUF, leftCV, 32);
    memory.copy(PARENT_BUF + 32, rightCV, 32);
    stackLen--;
    const mergeFlags = FLAG_PARENT | gFlags | (stackLen == 0 ? FLAG_ROOT : 0);
    const dst: usize = stackLen == 0 ? outPtr : MERGE_TMP;
    compressCV(IV_PTR, PARENT_BUF, 0, BLOCK_LEN, mergeFlags, dst);
    if (stackLen > 0) rightCV = MERGE_TMP;
  }
}

export function hashScratch(inPtr: usize, inLen: usize, outPtr: usize): void {
  gInitKey(IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7, 0);
  gUpdate(inPtr, inLen);
  gFinalizeRoot(outPtr);
}

export function hashKeyedScratch(
  keyPtr: usize,
  inPtr: usize,
  inLen: usize,
  outPtr: usize,
): void {
  gInitKey(
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
  gUpdate(inPtr, inLen);
  gFinalizeRoot(outPtr);
}

export function deriveKeyScratch(
  contextPtr: usize,
  contextLen: usize,
  materialPtr: usize,
  materialLen: usize,
  outPtr: usize,
): void {
  gInitKey(IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7, FLAG_DERIVE_KEY_CONTEXT);
  gUpdate(contextPtr, contextLen);
  gFinalizeRoot(CTX_KEY);
  gInitKey(
    load<u32>(CTX_KEY, 0),
    load<u32>(CTX_KEY, 4),
    load<u32>(CTX_KEY, 8),
    load<u32>(CTX_KEY, 12),
    load<u32>(CTX_KEY, 16),
    load<u32>(CTX_KEY, 20),
    load<u32>(CTX_KEY, 24),
    load<u32>(CTX_KEY, 28),
    FLAG_DERIVE_KEY_MATERIAL,
  );
  gUpdate(materialPtr, materialLen);
  gFinalizeRoot(outPtr);
}
