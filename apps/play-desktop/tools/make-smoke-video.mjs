// Developer fixture only. No FFmpeg runtime dependency is added to the player.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ffmpeg = process.argv[2];
if (!ffmpeg)
  throw new Error(
    "Usage: node tools/make-smoke-video.mjs <existing-ffmpeg-exe>",
  );
const directory = resolve(".smoke/video");
mkdirSync(directory, { recursive: true });
const input = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-n",
  "-f",
  "lavfi",
  "-i",
  "testsrc2=size=640x360:rate=24,drawbox=x=0:y=0:w=80:h=80:color=white:t=fill:enable='lt(mod(t,1),0.12)'",
  "-f",
  "lavfi",
  "-i",
  "aevalsrc=0.1*sin(2*PI*880*t)*lt(mod(t\\,1)\\,0.12):s=48000",
  "-t",
  "60",
];
for (const [name, options] of [
  [
    "ภาพทดสอบ mp4.mp4",
    [
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
    ],
  ],
  [
    "ภาพทดสอบ webm.webm",
    [
      "-c:v",
      "libvpx-vp9",
      "-deadline",
      "realtime",
      "-cpu-used",
      "6",
      "-c:a",
      "libopus",
    ],
  ],
  [
    "ภาพไม่มีเสียง.mp4",
    [
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
    ],
  ],
]) {
  const result = spawnSync(
    ffmpeg,
    [...input, ...options, resolve(directory, name)],
    { stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error(
      `Fixture generation failed: ${name} (${result.error ?? result.status})`,
    );
  console.log(name);
}
