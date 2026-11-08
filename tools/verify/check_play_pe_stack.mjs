import { readFileSync } from "node:fs";

const minimumStackReserve = 8n * 1024n * 1024n;
const executablePath = process.argv[2];

if (!executablePath) {
  console.error("Usage: node check_play_pe_stack.mjs <lalin-play.exe>");
  process.exitCode = 2;
} else {
  try {
    const image = readFileSync(executablePath);
    if (image.length < 0x40 || image.toString("ascii", 0, 2) !== "MZ") {
      throw new Error("missing DOS MZ header");
    }

    const peOffset = image.readUInt32LE(0x3c);
    if (peOffset + 24 > image.length || image.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0") {
      throw new Error("missing PE signature or COFF header");
    }

    const coffOffset = peOffset + 4;
    const optionalHeaderSize = image.readUInt16LE(coffOffset + 16);
    const optionalHeaderOffset = coffOffset + 20;
    if (optionalHeaderSize < 80 || optionalHeaderOffset + optionalHeaderSize > image.length) {
      throw new Error("truncated PE optional header");
    }

    const optionalHeaderMagic = image.readUInt16LE(optionalHeaderOffset);
    let stackReserve;
    if (optionalHeaderMagic === 0x10b) {
      stackReserve = BigInt(image.readUInt32LE(optionalHeaderOffset + 72));
    } else if (optionalHeaderMagic === 0x20b) {
      stackReserve = image.readBigUInt64LE(optionalHeaderOffset + 72);
    } else {
      throw new Error(`unsupported optional header magic 0x${optionalHeaderMagic.toString(16)}`);
    }

    if (stackReserve < minimumStackReserve) {
      throw new Error(
        `SizeOfStackReserve is ${stackReserve} bytes; expected at least ${minimumStackReserve}`,
      );
    }

    console.log(`PE SizeOfStackReserve=${stackReserve} bytes (minimum ${minimumStackReserve})`);
  } catch (error) {
    console.error(`Play PE stack check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
