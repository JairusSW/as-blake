import {
  IV0, IV1, IV2, IV3, IV4, IV5, IV6, IV7,
  BLOCK_LEN,
} from "./constants";

@inline function r16(x: u32): u32 { return rotr<u32>(x, 16); }
@inline function r12(x: u32): u32 { return rotr<u32>(x, 12); }
@inline function r8(x: u32):  u32 { return rotr<u32>(x,  8); }
@inline function r7(x: u32):  u32 { return rotr<u32>(x,  7); }

export function compress(
  cvPtr:    usize,
  blockPtr: usize,
  counter:  u64,
  blockLen: u32,
  flags:    u32,
  outPtr:   usize,
): void {
  let v0:  u32 = load<u32>(cvPtr,  0);
  let v1:  u32 = load<u32>(cvPtr,  4);
  let v2:  u32 = load<u32>(cvPtr,  8);
  let v3:  u32 = load<u32>(cvPtr, 12);
  let v4:  u32 = load<u32>(cvPtr, 16);
  let v5:  u32 = load<u32>(cvPtr, 20);
  let v6:  u32 = load<u32>(cvPtr, 24);
  let v7:  u32 = load<u32>(cvPtr, 28);
  let v8:  u32 = IV0;
  let v9:  u32 = IV1;
  let v10: u32 = IV2;
  let v11: u32 = IV3;
  let v12: u32 = u32(counter);
  let v13: u32 = u32(counter >> 32);
  let v14: u32 = blockLen;
  let v15: u32 = flags;

  // 16 message words, two per u64 load (SWAR).
  const m01 = load<u64>(blockPtr,  0); let m0  = u32(m01);        let m1  = u32(m01 >> 32);
  const m23 = load<u64>(blockPtr,  8); let m2  = u32(m23);        let m3  = u32(m23 >> 32);
  const m45 = load<u64>(blockPtr, 16); let m4  = u32(m45);        let m5  = u32(m45 >> 32);
  const m67 = load<u64>(blockPtr, 24); let m6  = u32(m67);        let m7  = u32(m67 >> 32);
  const m89 = load<u64>(blockPtr, 32); let m8  = u32(m89);        let m9  = u32(m89 >> 32);
  const mab = load<u64>(blockPtr, 40); let m10 = u32(mab);        let m11 = u32(mab >> 32);
  const mcd = load<u64>(blockPtr, 48); let m12 = u32(mcd);        let m13 = u32(mcd >> 32);
  const mef = load<u64>(blockPtr, 56); let m14 = u32(mef);        let m15 = u32(mef >> 32);

  // Round 0
  v0+=v4+m0;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m1;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m2;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m3;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m4;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m5;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m6;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m7;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m8;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m9;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m10; v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m11; v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m12; v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m13; v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m14; v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m15; v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // Round 1
  v0+=v4+m2;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m6;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m3;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m10; v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m7;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m0;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m4;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m13; v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m1;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m11; v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m12; v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m5;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m9;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m14; v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m15; v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m8;  v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // Round 2
  v0+=v4+m3;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m4;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m10; v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m12; v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m13; v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m2;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m7;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m14; v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m6;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m5;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m9;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m0;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m11; v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m15; v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m8;  v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m1;  v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // Round 3
  v0+=v4+m10; v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m7;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m12; v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m9;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m14; v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m3;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m13; v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m15; v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m4;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m0;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m11; v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m2;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m5;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m8;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m1;  v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m6;  v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // Round 4
  v0+=v4+m12; v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m13; v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m9;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m11; v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m15; v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m10; v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m14; v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m8;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m7;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m2;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m5;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m3;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m0;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m1;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m6;  v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m4;  v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // Round 5
  v0+=v4+m9;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m14; v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m11; v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m5;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m8;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m12; v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m15; v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m1;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m13; v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m3;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m0;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m10; v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m2;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m6;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m4;  v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m7;  v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // Round 6
  v0+=v4+m11; v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m15; v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m5;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m0;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m1;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m9;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m8;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m6;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m14; v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m10; v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m2;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m12; v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m3;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m4;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m7;  v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m13; v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // out[0..7] = CV (state[i] ^ state[i+8]); out[8..15] = state[i+8] ^ cv[i] for the XOF.
  store<u32>(outPtr, v0  ^ v8,                    0);
  store<u32>(outPtr, v1  ^ v9,                    4);
  store<u32>(outPtr, v2  ^ v10,                   8);
  store<u32>(outPtr, v3  ^ v11,                  12);
  store<u32>(outPtr, v4  ^ v12,                  16);
  store<u32>(outPtr, v5  ^ v13,                  20);
  store<u32>(outPtr, v6  ^ v14,                  24);
  store<u32>(outPtr, v7  ^ v15,                  28);
  store<u32>(outPtr, v8  ^ load<u32>(cvPtr,  0), 32);
  store<u32>(outPtr, v9  ^ load<u32>(cvPtr,  4), 36);
  store<u32>(outPtr, v10 ^ load<u32>(cvPtr,  8), 40);
  store<u32>(outPtr, v11 ^ load<u32>(cvPtr, 12), 44);
  store<u32>(outPtr, v12 ^ load<u32>(cvPtr, 16), 48);
  store<u32>(outPtr, v13 ^ load<u32>(cvPtr, 20), 52);
  store<u32>(outPtr, v14 ^ load<u32>(cvPtr, 24), 56);
  store<u32>(outPtr, v15 ^ load<u32>(cvPtr, 28), 60);
}

export function compressCV(
  cvPtr:    usize,
  blockPtr: usize,
  counter:  u64,
  blockLen: u32,
  flags:    u32,
  outCVPtr: usize,
): void {
  let v0:  u32 = load<u32>(cvPtr,  0);
  let v1:  u32 = load<u32>(cvPtr,  4);
  let v2:  u32 = load<u32>(cvPtr,  8);
  let v3:  u32 = load<u32>(cvPtr, 12);
  let v4:  u32 = load<u32>(cvPtr, 16);
  let v5:  u32 = load<u32>(cvPtr, 20);
  let v6:  u32 = load<u32>(cvPtr, 24);
  let v7:  u32 = load<u32>(cvPtr, 28);
  let v8:  u32 = IV0;
  let v9:  u32 = IV1;
  let v10: u32 = IV2;
  let v11: u32 = IV3;
  let v12: u32 = u32(counter);
  let v13: u32 = u32(counter >> 32);
  let v14: u32 = blockLen;
  let v15: u32 = flags;

  // 16 message words, two per u64 load (SWAR).
  const m01 = load<u64>(blockPtr,  0); let m0  = u32(m01);  let m1  = u32(m01 >> 32);
  const m23 = load<u64>(blockPtr,  8); let m2  = u32(m23);  let m3  = u32(m23 >> 32);
  const m45 = load<u64>(blockPtr, 16); let m4  = u32(m45);  let m5  = u32(m45 >> 32);
  const m67 = load<u64>(blockPtr, 24); let m6  = u32(m67);  let m7  = u32(m67 >> 32);
  const m89 = load<u64>(blockPtr, 32); let m8  = u32(m89);  let m9  = u32(m89 >> 32);
  const mab = load<u64>(blockPtr, 40); let m10 = u32(mab);  let m11 = u32(mab >> 32);
  const mcd = load<u64>(blockPtr, 48); let m12 = u32(mcd);  let m13 = u32(mcd >> 32);
  const mef = load<u64>(blockPtr, 56); let m14 = u32(mef);  let m15 = u32(mef >> 32);

  // Round 0
  v0+=v4+m0;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m1;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m2;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m3;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m4;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m5;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m6;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m7;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m8;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m9;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m10; v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m11; v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m12; v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m13; v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3 += v4 + m14; v14 = r16(v14 ^ v3); v9 += v14; v4 = r12(v4 ^ v9); v3 += v4 + m15; v14 = r8(v14 ^ v3); v9 += v14; v4 = r7(v4 ^ v9);

  // Round 1
  v0+=v4+m2;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m6;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m3;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m10; v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m7;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m0;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m4;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m13; v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m1;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m11; v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m12; v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m5;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m9;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m14; v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3 += v4 + m15; v14 = r16(v14 ^ v3); v9 += v14; v4 = r12(v4 ^ v9); v3 += v4 + m8; v14 = r8(v14 ^ v3); v9 += v14; v4 = r7(v4 ^ v9);

  // Round 2
  v0+=v4+m3;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m4;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m10; v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m12; v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m13; v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m2;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m7;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m14; v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m6;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m5;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m9;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m0;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m11; v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m15; v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3 += v4 + m8; v14 = r16(v14 ^ v3); v9 += v14; v4 = r12(v4 ^ v9); v3 += v4 + m1; v14 = r8(v14 ^ v3); v9 += v14; v4 = r7(v4 ^ v9);

  // Round 3
  v0+=v4+m10; v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m7;  v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m12; v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m9;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m14; v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m3;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m13; v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m15; v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m4;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m0;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m11; v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m2;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m5;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m8;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3 += v4 + m1; v14 = r16(v14 ^ v3); v9 += v14; v4 = r12(v4 ^ v9); v3 += v4 + m6; v14 = r8(v14 ^ v3); v9 += v14; v4 = r7(v4 ^ v9);

  // Round 4
  v0+=v4+m12; v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m13; v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m9;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m11; v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m15; v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m10; v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m14; v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m8;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m7;  v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m2;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m5;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m3;  v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m0;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m1;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3 += v4 + m6; v14 = r16(v14 ^ v3); v9 += v14; v4 = r12(v4 ^ v9); v3 += v4 + m4; v14 = r8(v14 ^ v3); v9 += v14; v4 = r7(v4 ^ v9);

  // Round 5
  v0+=v4+m9;  v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m14; v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m11; v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m5;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m8;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m12; v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m15; v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m1;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m13; v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m3;  v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m0;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m10; v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m2;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m6;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3 += v4 + m4; v14 = r16(v14 ^ v3); v9 += v14; v4 = r12(v4 ^ v9); v3 += v4 + m7; v14 = r8(v14 ^ v3); v9 += v14; v4 = r7(v4 ^ v9);

  // Round 6
  v0+=v4+m11; v12=r16(v12^v0); v8+=v12;  v4=r12(v4^v8);  v0+=v4+m15; v12=r8(v12^v0); v8+=v12;  v4=r7(v4^v8);
  v1+=v5+m5;  v13=r16(v13^v1); v9+=v13;  v5=r12(v5^v9);  v1+=v5+m0;  v13=r8(v13^v1); v9+=v13;  v5=r7(v5^v9);
  v2+=v6+m1;  v14=r16(v14^v2); v10+=v14; v6=r12(v6^v10); v2+=v6+m9;  v14=r8(v14^v2); v10+=v14; v6=r7(v6^v10);
  v3+=v7+m8;  v15=r16(v15^v3); v11+=v15; v7=r12(v7^v11); v3+=v7+m6;  v15=r8(v15^v3); v11+=v15; v7=r7(v7^v11);
  v0+=v5+m14; v15=r16(v15^v0); v10+=v15; v5=r12(v5^v10); v0+=v5+m10; v15=r8(v15^v0); v10+=v15; v5=r7(v5^v10);
  v1+=v6+m2;  v12=r16(v12^v1); v11+=v12; v6=r12(v6^v11); v1+=v6+m12; v12=r8(v12^v1); v11+=v12; v6=r7(v6^v11);
  v2+=v7+m3;  v13=r16(v13^v2); v8+=v13;  v7=r12(v7^v8);  v2+=v7+m4;  v13=r8(v13^v2); v8+=v13;  v7=r7(v7^v8);
  v3+=v4+m7;  v14=r16(v14^v3); v9+=v14;  v4=r12(v4^v9);  v3+=v4+m13; v14=r8(v14^v3); v9+=v14;  v4=r7(v4^v9);

  // CV = state[i] ^ state[i+8].
  store<u32>(outCVPtr, v0 ^ v8,   0);
  store<u32>(outCVPtr, v1 ^ v9,   4);
  store<u32>(outCVPtr, v2 ^ v10,  8);
  store<u32>(outCVPtr, v3 ^ v11, 12);
  store<u32>(outCVPtr, v4 ^ v12, 16);
  store<u32>(outCVPtr, v5 ^ v13, 20);
  store<u32>(outCVPtr, v6 ^ v14, 24);
  store<u32>(outCVPtr, v7 ^ v15, 28);
}

// @ts-ignore
@lazy export const IV_PTR: usize = memory.data<u32>([
  0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
  0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
]);
