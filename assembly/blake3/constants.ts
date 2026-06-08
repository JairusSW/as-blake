export const IV0: u32 = 0x6A09E667;
export const IV1: u32 = 0xBB67AE85;
export const IV2: u32 = 0x3C6EF372;
export const IV3: u32 = 0xA54FF53A;
export const IV4: u32 = 0x510E527F;
export const IV5: u32 = 0x9B05688C;
export const IV6: u32 = 0x1F83D9AB;
export const IV7: u32 = 0x5BE0CD19;

export const BLOCK_LEN: u32 = 64;
export const CHUNK_LEN: u32 = 1024;
export const OUT_LEN:   u32 = 32;
export const MAX_DEPTH: u32 = 54;

export const FLAG_CHUNK_START:         u32 = 1 << 0;
export const FLAG_CHUNK_END:           u32 = 1 << 1;
export const FLAG_PARENT:              u32 = 1 << 2;
export const FLAG_ROOT:                u32 = 1 << 3;
export const FLAG_KEYED_HASH:          u32 = 1 << 4;
export const FLAG_DERIVE_KEY_CONTEXT:  u32 = 1 << 5;
export const FLAG_DERIVE_KEY_MATERIAL: u32 = 1 << 6;

// @ts-ignore: storage class
@lazy export const MSG_SCHEDULE: StaticArray<u8> = [
   0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13, 14, 15,
   2,  6,  3, 10,  7,  0,  4, 13,  1, 11, 12,  5,  9, 14, 15,  8,
   3,  4, 10, 12, 13,  2,  7, 14,  6,  5,  9,  0, 11, 15,  8,  1,
  10,  7, 12,  9, 14,  3, 13, 15,  4,  0, 11,  2,  5,  8,  1,  6,
  12, 13,  9, 11, 15, 10, 14,  8,  7,  2,  5,  3,  0,  1,  6,  4,
   9, 14, 11,  5,  8, 12, 15,  1, 13,  3,  0, 10,  2,  6,  4,  7,
  11, 15,  5,  0,  1,  9,  8,  6, 14, 10,  2, 12,  3,  4,  7, 13,
];
