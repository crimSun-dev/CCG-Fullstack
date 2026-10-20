import { describe, expect, it } from "vitest";
import { AVATAR_MAX_BYTES, avatarPath, checkAvatar, sniffAvatar } from "@/lib/avatar";

const bytes = (...head: number[]) => new Uint8Array([...head, ...new Array(32).fill(0)]);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50);

describe("profile picture checks", () => {
  it("knows JPEG, PNG and WebP by their bytes", () => {
    expect(sniffAvatar(JPEG)).toBe("image/jpeg");
    expect(sniffAvatar(PNG)).toBe("image/png");
    expect(sniffAvatar(WEBP)).toBe("image/webp");
  });

  it("refuses anything else, whatever it claims to be", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    const gif = new TextEncoder().encode("GIF89a.....");
    const riffWave = bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45);
    for (const b of [svg, html, gif, riffWave]) expect(checkAvatar(b)).toEqual({ ok: false, error: "avatar_type" });
  });

  it("refuses an empty file and one over the cap", () => {
    expect(checkAvatar(new Uint8Array())).toEqual({ ok: false, error: "avatar_size" });
    const big = new Uint8Array(AVATAR_MAX_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(checkAvatar(big)).toEqual({ ok: false, error: "avatar_size" });
    expect(checkAvatar(big.subarray(0, AVATAR_MAX_BYTES))).toEqual({ ok: true, type: "image/jpeg" });
  });

  it("gives every new picture a new URL", () => {
    const id = "8d3e1c9a-0000-4000-8000-000000000001";
    expect(avatarPath(id, new Date(1000))).toBe(`/avatars/${id}?v=1000`);
    expect(avatarPath(id, new Date(2000))).not.toBe(avatarPath(id, new Date(1000)));
  });
});
