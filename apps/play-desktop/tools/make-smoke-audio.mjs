import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// สร้างเฉพาะ fixture ใหม่; ไม่เขียนทับไฟล์เพลงของผู้ใช้
const directory = resolve(".smoke");
mkdirSync(directory, { recursive: true });
const file = join(directory, "ทดสอบเพลง local.wav");
const rate = 44100;
const samples = rate * 120;
const bytes = Buffer.alloc(44 + samples * 2);
bytes.write("RIFF", 0);
bytes.writeUInt32LE(bytes.length - 8, 4);
bytes.write("WAVEfmt ", 8);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(rate, 24);
bytes.writeUInt32LE(rate * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write("data", 36);
bytes.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const fade = Math.min(1, i / rate, (samples - i) / rate);
  bytes.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 220 * i / rate) * 3276 * fade), 44 + i * 2);
}
writeFileSync(file, bytes, { flag: "wx" });
console.log(file);
