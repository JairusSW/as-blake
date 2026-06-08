import { describe, it, expect } from "as-test/assembly";
import { hash } from "../blake3/index";

const MAX_INPUT: i32 = 4097;
const INPUT_BUF: usize = memory.data(4097);
{
  for (let i = 0; i < MAX_INPUT; i++) {
    store<u8>(INPUT_BUF + <usize>i, <u8>(i % 251));
  }
}

const OUT: usize = memory.data(32);

function digestHex(): string {
  let s = "";
  for (let i = 0; i < 32; i++) {
    const b = load<u8>(OUT + <usize>i);
    const hi = b >> 4;
    const lo = b & 0xf;
    s += String.fromCharCode(hi < 10 ? 48 + hi : 87 + hi);
    s += String.fromCharCode(lo < 10 ? 48 + lo : 87 + lo);
  }
  return s;
}

function hashHex(len: i32): string {
  hash(INPUT_BUF, <usize>len, OUT);
  return digestHex();
}

describe("blake3 hash", () => {
  it("len=0", () =>
    expect(hashHex(0)).toBe(
      "af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262",
    ));
  it("len=1", () =>
    expect(hashHex(1)).toBe(
      "2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213",
    ));
  it("len=2", () =>
    expect(hashHex(2)).toBe(
      "7b7015bb92cf0b318037702a6cdd81dee41224f734684c2c122cd6359cb1ee63",
    ));
  it("len=63", () =>
    expect(hashHex(63)).toBe(
      "e9bc37a594daad83be9470df7f7b3798297c3d834ce80ba85d6e207627b7db7b",
    ));
  it("len=64", () =>
    expect(hashHex(64)).toBe(
      "4eed7141ea4a5cd4b788606bd23f46e212af9cacebacdc7d1f4c6dc7f2511b98",
    ));
  it("len=65", () =>
    expect(hashHex(65)).toBe(
      "de1e5fa0be70df6d2be8fffd0e99ceaa8eb6e8c93a63f2d8d1c30ecb6b263dee",
    ));
  it("len=127", () =>
    expect(hashHex(127)).toBe(
      "d81293fda863f008c09e92fc382a81f5a0b4a1251cba1634016a0f86a6bd640d",
    ));
  it("len=128", () =>
    expect(hashHex(128)).toBe(
      "f17e570564b26578c33bb7f44643f539624b05df1a76c81f30acd548c44b45ef",
    ));
  it("len=129", () =>
    expect(hashHex(129)).toBe(
      "683aaae9f3c5ba37eaaf072aed0f9e30bac0865137bae68b1fde4ca2aebdcb12",
    ));
  it("len=1023", () =>
    expect(hashHex(1023)).toBe(
      "10108970eeda3eb932baac1428c7a2163b0e924c9a9e25b35bba72b28f70bd11",
    ));
  it("len=1024", () =>
    expect(hashHex(1024)).toBe(
      "42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7",
    ));
  it("len=1025", () =>
    expect(hashHex(1025)).toBe(
      "d00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444",
    ));
  it("len=2048", () =>
    expect(hashHex(2048)).toBe(
      "e776b6028c7cd22a4d0ba182a8bf62205d2ef576467e838ed6f2529b85fba24a",
    ));
  it("len=2049", () =>
    expect(hashHex(2049)).toBe(
      "5f4d72f40d7a5f82b15ca2b2e44b1de3c2ef86c426c95c1af0b6879522563030",
    ));
  it("len=4096", () =>
    expect(hashHex(4096)).toBe(
      "015094013f57a5277b59d8475c0501042c0b642e531b0a1c8f58d2163229e969",
    ));
});
