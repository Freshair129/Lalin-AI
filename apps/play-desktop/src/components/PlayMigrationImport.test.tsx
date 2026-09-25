import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { MigrationPreview } from "../playMigration";
import { PlayMigrationImport } from "./PlayMigrationImport";
import { parseMigrationEnvelope, previewPlayMigration } from "../playMigration";
import { importPlayMigration } from "../playMigrationImport";

vi.mock("../playMigration", () => ({
  PLAY_MIGRATION_MAX_BYTES: 16 * 1024 * 1024,
  parseMigrationEnvelope: vi.fn(),
  previewPlayMigration: vi.fn(),
}));
vi.mock("../playMigrationImport", () => ({ importPlayMigration: vi.fn() }));

const preview: MigrationPreview = {
  exportId: "00000000-0000-4000-8000-000000000011",
  plan: {
    items: [],
    currentEntryId: null,
    repeatMode: "off",
    shuffle: false,
  },
  eq: {
    enabled: true,
    preamp: 0,
    bands: [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      .map((frequency) => ({ frequency, gain: 0 })),
    currentPreset: "Flat",
    customPresets: [],
  },
  unresolved: [{
    entryId: "00000000-0000-4000-8000-000000000012",
    displayLabel: "Studio upload",
    reason: "No local path was exported",
  }],
  alreadyImported: false,
};

async function chooseMigrationFile() {
  const file = new File(["{}"], "migration.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => "{}" });
  fireEvent.change(screen.getByTestId("play-migration-file"), {
    target: { files: [file] },
  });
  await screen.findByRole("region", { name: "ตัวอย่าง migration" });
}

beforeEach(() => {
  vi.mocked(parseMigrationEnvelope).mockReturnValue({} as never);
  vi.mocked(previewPlayMigration).mockResolvedValue(preview);
  vi.mocked(importPlayMigration).mockResolvedValue({ cleanupPending: false });
});

afterEach(() => cleanup());

describe("Play migration confirmation", () => {
  it("cancel closes preview without invoking the import transaction", async () => {
    render(<PlayMigrationImport onImported={vi.fn()} />);
    await chooseMigrationFile();

    fireEvent.click(screen.getByRole("button", { name: "ยกเลิก" }));

    expect(importPlayMigration).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "ตัวอย่าง migration" })).toBeNull();
  });

  it("keeps unresolved items visible in the completed import report", async () => {
    const onImported = vi.fn();
    render(<PlayMigrationImport onImported={onImported} />);
    await chooseMigrationFile();

    fireEvent.click(screen.getByRole("button", { name: "นำเข้าและแทนที่คิว/EQ" }));

    await waitFor(() => expect(importPlayMigration).toHaveBeenCalledWith("{}", preview, false));
    expect(onImported).toHaveBeenCalledOnce();
    expect((await screen.findByRole("status")).textContent).toContain("1 รายการยังแก้ไขไม่ได้");
    expect(screen.getByText("รายงานรายการที่แก้ไขไม่ได้ (1)")).not.toBeNull();
  });
});
