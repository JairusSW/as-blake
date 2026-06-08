import {
  IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7,
  BLOCK_LEN, CHUNK_LEN,
  FLAG_CHUNK_START, FLAG_CHUNK_END,
} from "./constants";

// Wasm SIMD has no vector rotate. The byte-aligned rotates (16, 8) are a single
// shuffle; rot12/rot7 below take shr|shl|or.
@inline function rot16v(v: v128): v128 {
  return v128.shuffle<u8>(v, v, 2,3,0,1, 6,7,4,5, 10,11,8,9, 14,15,12,13);
}

@inline function rot8v(v: v128): v128 {
  return v128.shuffle<u8>(v, v, 1,2,3,0, 5,6,7,4, 9,10,11,8, 13,14,15,12);
}

@inline function rot12v(v: v128): v128 {
  return v128.or(i32x4.shr_u(v, 12), i32x4.shl(v, 20));
}

@inline function rot7v(v: v128): v128 {
  return v128.or(i32x4.shr_u(v, 7), i32x4.shl(v, 25));
}

export function compress4Chunks(
  chunkDataPtr: usize,
  keyPtr:       usize,
  baseCounter:  u64,
  modeFlags:    u32,
  outCvs:       usize,
): void {
  const k0 = load<u32>(keyPtr,  0), k1 = load<u32>(keyPtr,  4);
  const k2 = load<u32>(keyPtr,  8), k3 = load<u32>(keyPtr, 12);
  const k4 = load<u32>(keyPtr, 16), k5 = load<u32>(keyPtr, 20);
  const k6 = load<u32>(keyPtr, 24), k7 = load<u32>(keyPtr, 28);

  const c0 = chunkDataPtr;
  const c1 = chunkDataPtr + 1024;
  const c2 = chunkDataPtr + 2048;
  const c3 = chunkDataPtr + 3072;

  let r0 = i32x4.splat(k0);
  let r1 = i32x4.splat(k1);
  let r2 = i32x4.splat(k2);
  let r3 = i32x4.splat(k3);
  let r4 = i32x4.splat(k4);
  let r5 = i32x4.splat(k5);
  let r6 = i32x4.splat(k6);
  let r7 = i32x4.splat(k7);

  const r12c = i32x4(
    <i32>(baseCounter),
    <i32>(baseCounter + 1),
    <i32>(baseCounter + 2),
    <i32>(baseCounter + 3),
  );
  const r13c = i32x4(
    <i32>u32((baseCounter + 0) >> 32),
    <i32>u32((baseCounter + 1) >> 32),
    <i32>u32((baseCounter + 2) >> 32),
    <i32>u32((baseCounter + 3) >> 32),
  );
  const r14c = i32x4.splat(<i32>BLOCK_LEN);

  for (let b: i32 = 0; b < 16; b++) {
    const blkOff = <usize>b * 64;
    const flags = modeFlags
      | (b == 0  ? FLAG_CHUNK_START : 0)
      | (b == 15 ? FLAG_CHUNK_END   : 0);

    let r8  = i32x4.splat(<i32>IV0);
    let r9  = i32x4.splat(<i32>IV1);
    let r10 = i32x4.splat(<i32>IV2);
    let r11 = i32x4.splat(<i32>IV3);
    let r12 = r12c;
    let r13 = r13c;
    let r14 = r14c;
    let r15 = i32x4.splat(<i32>flags);

    const bp0 = c0 + blkOff, bp1 = c1 + blkOff, bp2 = c2 + blkOff, bp3 = c3 + blkOff;

    // 4×4 i32 transpose per 4-word group: AoS (one chunk's block) → SoA, so each
    // mN holds word N across all four chunks (one per lane).
    let ta = v128.load(bp0,  0); let tb = v128.load(bp1,  0);
    let tc = v128.load(bp2,  0); let td = v128.load(bp3,  0);
    let u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    let u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    let u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    let u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m0  = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m1  = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m2  = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m3  = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    ta = v128.load(bp0, 16); tb = v128.load(bp1, 16);
    tc = v128.load(bp2, 16); td = v128.load(bp3, 16);
    u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m4  = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m5  = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m6  = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m7  = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    ta = v128.load(bp0, 32); tb = v128.load(bp1, 32);
    tc = v128.load(bp2, 32); td = v128.load(bp3, 32);
    u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m8  = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m9  = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m10 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m11 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    ta = v128.load(bp0, 48); tb = v128.load(bp1, 48);
    tc = v128.load(bp2, 48); td = v128.load(bp3, 48);
    u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m12 = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m13 = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m14 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m15 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    // Round 0
    r0=i32x4.add(i32x4.add(r0,r4),m0);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m1);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m2);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m3);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m4);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m5);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m6);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m7);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m8);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m9);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m10); r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m11); r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m12); r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m13); r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m14); r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m15); r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 1
    r0=i32x4.add(i32x4.add(r0,r4),m2);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m6);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m3);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m10); r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m7);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m0);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m4);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m13); r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m1);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m11); r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m12); r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m5);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m9);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m14); r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m15); r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m8);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 2
    r0=i32x4.add(i32x4.add(r0,r4),m3);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m4);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m10); r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m12); r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m13); r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m2);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m7);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m14); r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m6);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m5);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m9);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m0);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m11); r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m15); r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m8);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m1);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 3
    r0=i32x4.add(i32x4.add(r0,r4),m10); r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m7);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m12); r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m9);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m14); r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m3);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m13); r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m15); r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m4);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m0);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m11); r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m2);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m5);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m8);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m1);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m6);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 4
    r0=i32x4.add(i32x4.add(r0,r4),m12); r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m13); r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m9);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m11); r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m15); r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m10); r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m14); r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m8);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m7);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m2);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m5);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m3);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m0);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m1);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m6);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m4);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 5
    r0=i32x4.add(i32x4.add(r0,r4),m9);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m14); r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m11); r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m5);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m8);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m12); r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m15); r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m1);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m13); r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m3);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m0);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m10); r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m2);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m6);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m4);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m7);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 6
    r0=i32x4.add(i32x4.add(r0,r4),m11); r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m15); r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m5);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m0);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m1);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m9);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m8);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m6);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m14); r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m10); r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m2);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m12); r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m3);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m4);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m7);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m13); r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    r0 = v128.xor(r0, r8);  r1 = v128.xor(r1, r9);
    r2 = v128.xor(r2, r10); r3 = v128.xor(r3, r11);
    r4 = v128.xor(r4, r12); r5 = v128.xor(r5, r13);
    r6 = v128.xor(r6, r14); r7 = v128.xor(r7, r15);
  }

  // Un-transpose r0..r7 (SoA) back into four contiguous per-chunk CVs.
  let u0 = v128.shuffle<i32>(r0, r1, 0,4,1,5);
  let u1 = v128.shuffle<i32>(r2, r3, 0,4,1,5);
  let u2 = v128.shuffle<i32>(r0, r1, 2,6,3,7);
  let u3 = v128.shuffle<i32>(r2, r3, 2,6,3,7);
  let chunk0_w03 = v128.shuffle<i32>(u0, u1, 0,1,4,5);
  let chunk1_w03 = v128.shuffle<i32>(u0, u1, 2,3,6,7);
  let chunk2_w03 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
  let chunk3_w03 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

  u0 = v128.shuffle<i32>(r4, r5, 0,4,1,5);
  u1 = v128.shuffle<i32>(r6, r7, 0,4,1,5);
  u2 = v128.shuffle<i32>(r4, r5, 2,6,3,7);
  u3 = v128.shuffle<i32>(r6, r7, 2,6,3,7);
  let chunk0_w47 = v128.shuffle<i32>(u0, u1, 0,1,4,5);
  let chunk1_w47 = v128.shuffle<i32>(u0, u1, 2,3,6,7);
  let chunk2_w47 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
  let chunk3_w47 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

  v128.store(outCvs,       chunk0_w03);
  v128.store(outCvs, chunk0_w47, 16);
  v128.store(outCvs, chunk1_w03, 32);
  v128.store(outCvs, chunk1_w47, 48);
  v128.store(outCvs, chunk2_w03, 64);
  v128.store(outCvs, chunk2_w47, 80);
  v128.store(outCvs, chunk3_w03, 96);
  v128.store(outCvs, chunk3_w47, 112);
}

// Degree-2: like compress4Chunks but for 2 chunks. The two spare v128 lanes
// recompute chunks 0/1 and are discarded; only 2 CVs are written. Lets the SIMD
// path engage at 2 chunks (~2 KiB) instead of 4.
export function compress2Chunks(
  chunkDataPtr: usize,
  keyPtr:       usize,
  baseCounter:  u64,
  modeFlags:    u32,
  outCvs:       usize,
): void {
  const k0 = load<u32>(keyPtr,  0), k1 = load<u32>(keyPtr,  4);
  const k2 = load<u32>(keyPtr,  8), k3 = load<u32>(keyPtr, 12);
  const k4 = load<u32>(keyPtr, 16), k5 = load<u32>(keyPtr, 20);
  const k6 = load<u32>(keyPtr, 24), k7 = load<u32>(keyPtr, 28);

  const c0 = chunkDataPtr;
  const c1 = chunkDataPtr + 1024;
  const c2 = chunkDataPtr;            // lane 2 duplicates chunk 0 (unused)
  const c3 = chunkDataPtr + 1024;     // lane 3 duplicates chunk 1 (unused)

  let r0 = i32x4.splat(k0);
  let r1 = i32x4.splat(k1);
  let r2 = i32x4.splat(k2);
  let r3 = i32x4.splat(k3);
  let r4 = i32x4.splat(k4);
  let r5 = i32x4.splat(k5);
  let r6 = i32x4.splat(k6);
  let r7 = i32x4.splat(k7);

  const r12c = i32x4(
    <i32>(baseCounter),
    <i32>(baseCounter + 1),
    <i32>(baseCounter + 2),
    <i32>(baseCounter + 3),
  );
  const r13c = i32x4(
    <i32>u32((baseCounter + 0) >> 32),
    <i32>u32((baseCounter + 1) >> 32),
    <i32>u32((baseCounter + 2) >> 32),
    <i32>u32((baseCounter + 3) >> 32),
  );
  const r14c = i32x4.splat(<i32>BLOCK_LEN);

  for (let b: i32 = 0; b < 16; b++) {
    const blkOff = <usize>b * 64;
    const flags = modeFlags
      | (b == 0  ? FLAG_CHUNK_START : 0)
      | (b == 15 ? FLAG_CHUNK_END   : 0);

    let r8  = i32x4.splat(<i32>IV0);
    let r9  = i32x4.splat(<i32>IV1);
    let r10 = i32x4.splat(<i32>IV2);
    let r11 = i32x4.splat(<i32>IV3);
    let r12 = r12c;
    let r13 = r13c;
    let r14 = r14c;
    let r15 = i32x4.splat(<i32>flags);

    const bp0 = c0 + blkOff, bp1 = c1 + blkOff, bp2 = c2 + blkOff, bp3 = c3 + blkOff;

    // 4×4 i32 transpose per 4-word group: AoS (one chunk's block) → SoA, so each
    // mN holds word N across all four chunks (one per lane).
    let ta = v128.load(bp0,  0); let tb = v128.load(bp1,  0);
    let tc = v128.load(bp2,  0); let td = v128.load(bp3,  0);
    let u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    let u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    let u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    let u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m0  = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m1  = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m2  = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m3  = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    ta = v128.load(bp0, 16); tb = v128.load(bp1, 16);
    tc = v128.load(bp2, 16); td = v128.load(bp3, 16);
    u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m4  = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m5  = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m6  = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m7  = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    ta = v128.load(bp0, 32); tb = v128.load(bp1, 32);
    tc = v128.load(bp2, 32); td = v128.load(bp3, 32);
    u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m8  = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m9  = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m10 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m11 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    ta = v128.load(bp0, 48); tb = v128.load(bp1, 48);
    tc = v128.load(bp2, 48); td = v128.load(bp3, 48);
    u0 = v128.shuffle<i32>(ta, tb, 0,4,1,5);
    u1 = v128.shuffle<i32>(tc, td, 0,4,1,5);
    u2 = v128.shuffle<i32>(ta, tb, 2,6,3,7);
    u3 = v128.shuffle<i32>(tc, td, 2,6,3,7);
    let m12 = v128.shuffle<i32>(u0, u1, 0,1,4,5);
    let m13 = v128.shuffle<i32>(u0, u1, 2,3,6,7);
    let m14 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
    let m15 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

    // Round 0
    r0=i32x4.add(i32x4.add(r0,r4),m0);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m1);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m2);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m3);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m4);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m5);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m6);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m7);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m8);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m9);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m10); r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m11); r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m12); r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m13); r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m14); r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m15); r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 1
    r0=i32x4.add(i32x4.add(r0,r4),m2);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m6);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m3);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m10); r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m7);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m0);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m4);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m13); r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m1);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m11); r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m12); r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m5);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m9);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m14); r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m15); r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m8);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 2
    r0=i32x4.add(i32x4.add(r0,r4),m3);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m4);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m10); r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m12); r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m13); r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m2);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m7);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m14); r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m6);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m5);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m9);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m0);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m11); r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m15); r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m8);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m1);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 3
    r0=i32x4.add(i32x4.add(r0,r4),m10); r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m7);  r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m12); r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m9);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m14); r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m3);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m13); r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m15); r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m4);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m0);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m11); r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m2);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m5);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m8);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m1);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m6);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 4
    r0=i32x4.add(i32x4.add(r0,r4),m12); r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m13); r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m9);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m11); r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m15); r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m10); r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m14); r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m8);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m7);  r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m2);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m5);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m3);  r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m0);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m1);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m6);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m4);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 5
    r0=i32x4.add(i32x4.add(r0,r4),m9);  r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m14); r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m11); r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m5);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m8);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m12); r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m15); r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m1);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m13); r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m3);  r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m0);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m10); r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m2);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m6);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m4);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m7);  r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    // Round 6
    r0=i32x4.add(i32x4.add(r0,r4),m11); r12=v128.xor(r12,r0);  r12=rot16v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot12v(r4);  r0=i32x4.add(i32x4.add(r0,r4),m15); r12=v128.xor(r12,r0);  r12=rot8v(r12);  r8=i32x4.add(r8,r12);  r4=v128.xor(r4,r8);  r4=rot7v(r4);
    r1=i32x4.add(i32x4.add(r1,r5),m5);  r13=v128.xor(r13,r1);  r13=rot16v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot12v(r5);  r1=i32x4.add(i32x4.add(r1,r5),m0);  r13=v128.xor(r13,r1);  r13=rot8v(r13);  r9=i32x4.add(r9,r13);  r5=v128.xor(r5,r9);  r5=rot7v(r5);
    r2=i32x4.add(i32x4.add(r2,r6),m1);  r14=v128.xor(r14,r2);  r14=rot16v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot12v(r6);  r2=i32x4.add(i32x4.add(r2,r6),m9);  r14=v128.xor(r14,r2);  r14=rot8v(r14);  r10=i32x4.add(r10,r14); r6=v128.xor(r6,r10); r6=rot7v(r6);
    r3=i32x4.add(i32x4.add(r3,r7),m8);  r15=v128.xor(r15,r3);  r15=rot16v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot12v(r7);  r3=i32x4.add(i32x4.add(r3,r7),m6);  r15=v128.xor(r15,r3);  r15=rot8v(r15);  r11=i32x4.add(r11,r15); r7=v128.xor(r7,r11); r7=rot7v(r7);
    r0=i32x4.add(i32x4.add(r0,r5),m14); r15=v128.xor(r15,r0);  r15=rot16v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot12v(r5);  r0=i32x4.add(i32x4.add(r0,r5),m10); r15=v128.xor(r15,r0);  r15=rot8v(r15);  r10=i32x4.add(r10,r15); r5=v128.xor(r5,r10); r5=rot7v(r5);
    r1=i32x4.add(i32x4.add(r1,r6),m2);  r12=v128.xor(r12,r1);  r12=rot16v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot12v(r6);  r1=i32x4.add(i32x4.add(r1,r6),m12); r12=v128.xor(r12,r1);  r12=rot8v(r12);  r11=i32x4.add(r11,r12); r6=v128.xor(r6,r11); r6=rot7v(r6);
    r2=i32x4.add(i32x4.add(r2,r7),m3);  r13=v128.xor(r13,r2);  r13=rot16v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot12v(r7);  r2=i32x4.add(i32x4.add(r2,r7),m4);  r13=v128.xor(r13,r2);  r13=rot8v(r13);  r8=i32x4.add(r8,r13);  r7=v128.xor(r7,r8);  r7=rot7v(r7);
    r3=i32x4.add(i32x4.add(r3,r4),m7);  r14=v128.xor(r14,r3);  r14=rot16v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot12v(r4);  r3=i32x4.add(i32x4.add(r3,r4),m13); r14=v128.xor(r14,r3);  r14=rot8v(r14);  r9=i32x4.add(r9,r14);  r4=v128.xor(r4,r9);  r4=rot7v(r4);

    r0 = v128.xor(r0, r8);  r1 = v128.xor(r1, r9);
    r2 = v128.xor(r2, r10); r3 = v128.xor(r3, r11);
    r4 = v128.xor(r4, r12); r5 = v128.xor(r5, r13);
    r6 = v128.xor(r6, r14); r7 = v128.xor(r7, r15);
  }

  // Un-transpose r0..r7 (SoA) back into four contiguous per-chunk CVs.
  let u0 = v128.shuffle<i32>(r0, r1, 0,4,1,5);
  let u1 = v128.shuffle<i32>(r2, r3, 0,4,1,5);
  let u2 = v128.shuffle<i32>(r0, r1, 2,6,3,7);
  let u3 = v128.shuffle<i32>(r2, r3, 2,6,3,7);
  let chunk0_w03 = v128.shuffle<i32>(u0, u1, 0,1,4,5);
  let chunk1_w03 = v128.shuffle<i32>(u0, u1, 2,3,6,7);
  let chunk2_w03 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
  let chunk3_w03 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

  u0 = v128.shuffle<i32>(r4, r5, 0,4,1,5);
  u1 = v128.shuffle<i32>(r6, r7, 0,4,1,5);
  u2 = v128.shuffle<i32>(r4, r5, 2,6,3,7);
  u3 = v128.shuffle<i32>(r6, r7, 2,6,3,7);
  let chunk0_w47 = v128.shuffle<i32>(u0, u1, 0,1,4,5);
  let chunk1_w47 = v128.shuffle<i32>(u0, u1, 2,3,6,7);
  let chunk2_w47 = v128.shuffle<i32>(u2, u3, 0,1,4,5);
  let chunk3_w47 = v128.shuffle<i32>(u2, u3, 2,3,6,7);

  v128.store(outCvs,       chunk0_w03);
  v128.store(outCvs, chunk0_w47, 16);
  v128.store(outCvs, chunk1_w03, 32);
  v128.store(outCvs, chunk1_w47, 48);
}
