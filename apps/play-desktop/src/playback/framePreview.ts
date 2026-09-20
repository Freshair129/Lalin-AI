export type PreviewFrame = {
  time: number;
  image: string | null;
  failed: boolean;
};

// ตัวถอดเฟรมที่ไม่เล่นเสียง/ภาพต่อเนื่อง และไม่รู้จัก playback store หรือ EQ
export class FramePreview {
  private readonly media = document.createElement("video");
  private readonly canvas = document.createElement("canvas");
  private readonly cache = new Map<number, string>();
  private requested: number | null = null;
  private decoding: number | null = null;
  private disposed = false;
  private failed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    source: string,
    private readonly publish: (frame: PreviewFrame) => void,
  ) {
    this.media.muted = true;
    this.media.defaultMuted = true;
    this.media.playsInline = true;
    this.media.preload = "auto";
    this.media.crossOrigin = "anonymous";
    this.media.addEventListener("loadeddata", this.ready);
    this.media.addEventListener("seeked", this.capture);
    this.media.addEventListener("error", this.fail);
    this.media.src = source;
  }

  request(time: number) {
    if (this.disposed || !Number.isFinite(time)) return;
    // tenth-second cache keys; UI labels the same requested timestamp
    this.requested = Math.max(0, Math.floor(time * 10) / 10);
    const cached = this.cache.get(this.requested);
    this.publish({
      time: this.requested,
      image: cached ?? null,
      failed: this.failed,
    });
    if (!cached && !this.failed) {
      this.armTimeout();
      this.pump();
    }
  }

  cancel() {
    this.requested = null;
  }

  private armTimeout() {
    if (!this.timer) this.timer = setTimeout(this.fail, 8000);
  }

  private ready = () => this.pump();

  private pump() {
    if (
      this.disposed ||
      this.failed ||
      this.decoding !== null ||
      this.requested === null ||
      this.media.readyState < 2
    )
      return;
    if (this.cache.has(this.requested)) return;
    const duration = this.media.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    this.decoding = this.requested;
    const target = Math.min(this.requested, Math.max(0, duration - 0.001));
    this.armTimeout();
    if (
      Math.abs(this.media.currentTime - target) < 0.001 &&
      !this.media.seeking
    )
      this.capture();
    else {
      try {
        this.media.currentTime = target;
      } catch {
        this.fail();
      }
    }
  }

  private capture = () => {
    if (
      this.disposed ||
      this.failed ||
      this.decoding === null ||
      this.media.seeking ||
      this.media.readyState < 2
    )
      return;
    const time = this.decoding;
    try {
      const { videoWidth: width, videoHeight: height } = this.media;
      if (!width || !height) throw new Error("ไม่มีเฟรม");
      const scale = Math.min(192 / width, 108 / height, 1);
      this.canvas.width = Math.max(1, Math.round(width * scale));
      this.canvas.height = Math.max(1, Math.round(height * scale));
      const context = this.canvas.getContext("2d");
      if (!context) throw new Error("อ่านภาพไม่ได้");
      context.drawImage(
        this.media,
        0,
        0,
        this.canvas.width,
        this.canvas.height,
      );
      const image = this.canvas.toDataURL("image/jpeg", 0.75);
      this.cache.set(time, image);
      if (this.cache.size > 24)
        this.cache.delete(this.cache.keys().next().value!);
      if (this.requested === time) this.publish({ time, image, failed: false });
      clearTimeout(this.timer);
      this.timer = undefined;
      this.decoding = null;
      this.pump();
    } catch {
      this.fail();
    }
  };

  private fail = () => {
    if (this.disposed) return;
    this.failed = true;
    this.decoding = null;
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.requested !== null)
      this.publish({ time: this.requested, image: null, failed: true });
  };

  dispose() {
    this.disposed = true;
    this.cancel();
    clearTimeout(this.timer);
    this.cache.clear();
    this.media.removeEventListener("loadeddata", this.ready);
    this.media.removeEventListener("seeked", this.capture);
    this.media.removeEventListener("error", this.fail);
    this.media.removeAttribute("src");
    this.media.load();
  }
}
