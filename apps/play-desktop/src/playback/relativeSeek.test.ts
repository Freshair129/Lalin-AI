import { expect, it } from "vitest";
import { relativeSeekTarget } from "./relativeSeek";

function media(currentTime: number, duration = 60, ranges = [[0, duration]]) {
  return {
    currentTime,
    duration,
    seekable: {
      length: ranges.length,
      start: (i: number) => ranges[i][0],
      end: (i: number) => ranges[i][1],
    },
  } as HTMLMediaElement;
}
it("adds/subtracts ten seconds and clamps before the media endpoint", () => {
  expect(relativeSeekTarget(media(20), 10)).toBe(30);
  expect(relativeSeekTarget(media(20), -10)).toBe(10);
  expect(relativeSeekTarget(media(4), -10)).toBe(0);
  expect(relativeSeekTarget(media(58), 10)).toBeCloseTo(59.95);
  expect(relativeSeekTarget(media(0, 0.02), 10)).toBe(0);
});
it("rejects unknown/invalid times and unseekable media", () => {
  for (const duration of [0, NaN, Infinity, -1])
    expect(relativeSeekTarget(media(10, duration), 10)).toBeNull();
  expect(relativeSeekTarget(media(NaN), 10)).toBeNull();
  expect(relativeSeekTarget(media(10), Infinity)).toBeNull();
  expect(relativeSeekTarget(media(10, 60, []), 10)).toBeNull();
});
it("clamps into actual seekable ranges, including discontinuous media", () => {
  expect(
    relativeSeekTarget(
      media(10, 60, [
        [5, 20],
        [40, 60],
      ]),
      -10,
    ),
  ).toBe(5);
  expect(
    relativeSeekTarget(
      media(25, 60, [
        [0, 20],
        [40, 60],
      ]),
      10,
    ),
  ).toBe(40);
});
