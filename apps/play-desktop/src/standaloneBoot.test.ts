/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

// Conservative static guard over the entire Play frontend, including lazy boot imports.
const source = import.meta.glob(["./**/*.ts", "./**/*.tsx", "!./**/*.test.ts", "!./**/*.test.tsx"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
describe("standalone frontend network guard", () => {
  it("does not hard-code the Studio API endpoint in Play source", () => {
    const offenders = Object.entries(source).filter(([, text]) =>
      /(?:127\.0\.0\.1|localhost):8756|https?:\/\/[^\s'"`]*studio[^\s'"`]*/i.test(text),
    ).map(([path]) => path);
    expect(Object.keys(source).length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
