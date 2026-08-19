import { describe, it, expect } from "vitest";
import { assetId, addAsset, resolveAssetUrl } from "./assets";
import type { Project } from "./clipModel";

describe("assetId", () => {
  it("is deterministic for the same kind+name", () => {
    expect(assetId("upload", "song.mp3")).toBe(assetId("upload", "song.mp3"));
  });
  it("differs by kind", () => {
    expect(assetId("upload", "x.wav")).not.toBe(assetId("output", "x.wav"));
  });
  it("differs by name", () => {
    expect(assetId("upload", "a.wav")).not.toBe(assetId("upload", "b.wav"));
  });
  it("is safe for a filename (no slashes, dots or spaces)", () => {
    expect(assetId("upload", "ปล่อย (let them).mp3")).toMatch(/^a_[0-9a-z]+$/);
  });
});

describe("addAsset", () => {
  it("adds a new asset and returns its id", () => {
    const { assets, id } = addAsset({}, "upload", "song.mp3");
    expect(assets[id]).toEqual({ id, kind: "upload", name: "song.mp3" });
  });
  it("is idempotent for the same file", () => {
    const first = addAsset({}, "upload", "song.mp3");
    const second = addAsset(first.assets, "upload", "song.mp3");
    expect(second.id).toBe(first.id);
    expect(Object.keys(second.assets)).toHaveLength(1);
  });
});

describe("resolveAssetUrl", () => {
  const project = {
    assets: {
      a_1: { id: "a_1", kind: "upload", name: "song.mp3" },
      a_2: { id: "a_2", kind: "output", name: "remix_x.wav" },
    },
  } as unknown as Project;

  it("resolves an upload to the input endpoint", () => {
    expect(resolveAssetUrl(project, "a_1")).toContain("/files/input/song.mp3");
  });
  it("resolves an output to the download endpoint", () => {
    expect(resolveAssetUrl(project, "a_2")).toContain("/files/download/remix_x.wav");
  });
  it("returns null for a missing or null id", () => {
    expect(resolveAssetUrl(project, null)).toBeNull();
    expect(resolveAssetUrl(project, "a_nope")).toBeNull();
  });
  it("percent-encodes names with spaces and non-ASCII characters", () => {
    const p = { assets: { a_3: { id: "a_3", kind: "upload", name: "ปล่อย (let them).mp3" } } } as unknown as Project;
    expect(resolveAssetUrl(p, "a_3")).toContain(encodeURIComponent("ปล่อย (let them).mp3"));
  });
});
