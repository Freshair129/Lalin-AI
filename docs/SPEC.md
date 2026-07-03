# Technical Specification (SPEC)

**ระบบ:** G-Music — AI Audio Studio
**เวอร์ชัน:** 0.1.0
**วันที่:** 2026-06-27

---

## 1. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Desktop Shell** | Tauri | 2.x |
| **Frontend** | React + TypeScript | 18.3 / 5.7 |
| **Bundler** | Vite | 6.x |
| **Backend** | FastAPI (Python) | 0.115.x |
| **Runtime** | Python | 3.11 (mandatory) |
| **ML Framework** | PyTorch + CUDA | 2.5.1+cu121 |
| **ASR** | faster-whisper | large-v3 |
| **TTS (primary)** | F5-TTS | VIZINTZOR/F5-TTS-THAI |
| **TTS (fallback)** | Coqui XTTS v2 | xtts_v2 |
| **Mastering** | Matchering + pyloudnorm | 2.0 / 0.1 |
| **Audio utils** | pydub, librosa, soundfile | — |
| **FFmpeg** | imageio-ffmpeg (bundled) | — |
| **Installer** | NSIS (via Tauri) | — |
| **Updater** | tauri-plugin-updater | 2.x |

---

## 2. Backend Architecture

### 2.1 Module Structure

```
backend/app/
├── main.py              # FastAPI app + CORS + router mount
├── config.py            # pydantic-settings (env-based config)
├── schemas.py           # Pydantic request/response models
├── brain/
│   ├── base.py          # LLMProvider ABC + ChatResult
│   ├── factory.py       # Brain singleton factory + hot-swap
│   ├── ollama_provider.py  # Ollama HTTP provider
│   └── cloud_provider.py   # Anthropic/OpenAI/OpenRouter provider
├── pipelines/
│   ├── asr.py           # faster-whisper ASR pipeline
│   ├── tts.py           # F5-TTS + XTTS synthesis
│   ├── dubbing.py       # Full dubbing orchestration
│   ├── mastering.py     # Matchering + loudness normalization
│   └── music.py         # Remix: Demucs/autotune/FX/mix/master
├── routers/
│   ├── health.py        # GET /health
│   ├── brain.py         # Brain config + chat + translate
│   ├── voices.py        # Voice CRUD
│   ├── files.py         # Upload/download
│   ├── tts.py           # POST /tts (spawn job)
│   ├── dubbing.py       # POST /dubbing (spawn job)
│   ├── mastering.py     # POST /mastering (spawn job)
│   ├── music.py         # POST /music/remix (spawn job)
│   └── jobs.py          # Job list + status + WebSocket
├── jobs/
│   └── manager.py       # Job lifecycle + WS broadcast
├── services/
│   └── voices.py        # Voice library I/O
└── utils/
    ├── audio.py         # fit_duration, overlay_on_timeline
    ├── ffmpeg.py        # Bundled ffmpeg setup
    └── ids.py           # short_id generator
```

### 2.2 Application Startup

```python
# main.py — startup sequence
1. Import FastAPI, routers, config
2. Create app with metadata (title, version)
3. Add CORS middleware (allow all origins for Tauri)
4. Mount routers: health, brain, voices, files, tts, dubbing, mastering, jobs
5. @app.on_event("startup"): configure_ffmpeg()
   → detect imageio-ffmpeg binary
   → add to PATH
   → set pydub.AudioSegment.converter
```

### 2.3 Configuration System

```python
# config.py
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    
    # Server
    host: str = "127.0.0.1"
    port: int = 8756
    data_dir: Path = Path("./data")
    
    # Brain
    brain_provider: Literal["ollama", "cloud"] = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.1"
    cloud_provider: Literal["anthropic", "openai", "openrouter"] = "anthropic"
    cloud_api_key: str = ""
    cloud_model: str = "claude-opus-4-8"
    cloud_base_url: str | None = None
    
    # ASR
    asr_model: str = "large-v3"
    asr_device: str = "cuda"
    asr_compute_type: str = "float16"
    
    # TTS
    tts_engine: str = "f5"
    tts_device: str = "cuda"
    f5_model_repo: str = "VIZINTZOR/F5-TTS-THAI"
    
    @property
    def uploads_dir(self) -> Path: return self.data_dir / "uploads"
    @property
    def outputs_dir(self) -> Path: return self.data_dir / "outputs"
    @property
    def voices_dir(self) -> Path: return self.data_dir / "voices"

# Singleton with directory auto-creation
@lru_cache
def get_settings() -> Settings: ...
```

### 2.4 Brain Factory (Hot-Swap Pattern)

```python
# brain/factory.py

_override = BrainConfig()    # user overrides (survives across requests)
_current: LLMProvider | None = None  # cached provider instance

def get_brain() -> LLMProvider:
    """Lazy init: create provider on first call, reuse afterward."""
    global _current
    if _current is None:
        _current = _build_provider(_override)
    return _current

def reconfigure(cfg: BrainConfig) -> LLMProvider:
    """Hot-swap: update config + rebuild provider instantly."""
    global _current, _override
    _override = merge(cfg, _override)
    _current = _build_provider(_override)
    return _current
```

### 2.5 LLM Provider Interface

```python
# brain/base.py

@dataclass
class ChatResult:
    text: str
    model: str
    provider: str
    usage: dict  # {prompt_tokens, completion_tokens}

class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, messages, temperature=0.7, max_tokens=2048) -> ChatResult: ...
    
    @abstractmethod
    async def stream(self, messages, temperature=0.7, max_tokens=2048) -> AsyncIterator[str]: ...
    
    @abstractmethod
    async def health(self) -> dict: ...
    
    async def translate(self, text, target_lang, source_lang=None) -> str:
        """Default translate: calls chat with translation system prompt."""
        system = f"Translate to {target_lang}. Return ONLY the translation."
        result = await self.chat([
            {"role": "system", "content": system},
            {"role": "user", "content": text}
        ], temperature=0.3)
        return result.text.strip()
```

### 2.6 Ollama Provider Details

```python
# brain/ollama_provider.py

class OllamaProvider(LLMProvider):
    TIMEOUT = 600  # seconds (cold-load can take >4 min)
    
    async def chat(self, messages, ...):
        resp = await httpx.post(f"{base_url}/api/chat", json={
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens}
        }, timeout=self.TIMEOUT)
        text = resp.json()["message"]["content"]
        return ChatResult(text=self._strip_thinking(text), ...)
    
    def _strip_thinking(self, text):
        """Remove <think>...</think> from reasoning models."""
        return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    
    async def health(self):
        resp = await httpx.get(f"{base_url}/api/tags")
        models = [m["name"] for m in resp.json().get("models", [])]
        return {"ok": True, "models": models}
```

### 2.7 Cloud Provider Details

```python
# brain/cloud_provider.py

class CloudProvider(LLMProvider):
    def __init__(self, provider, api_key, model, base_url=None):
        self.provider = provider  # "anthropic" | "openai" | "openrouter"
        # Lazy import SDK only when needed
    
    async def chat(self, messages, ...):
        if self.provider == "anthropic":
            # Split system message from conversation
            # Use AsyncAnthropic SDK
            resp = await client.messages.create(
                model=model, system=system_text,
                messages=conversation, max_tokens=max_tokens
            )
            text = "".join(b.text for b in resp.content if b.type == "text")
        else:
            # OpenAI / OpenRouter path
            client = AsyncOpenAI(api_key=key, base_url=base_url)
            resp = await client.chat.completions.create(
                model=model, messages=messages, temperature=temperature
            )
            text = resp.choices[0].message.content
```

---

## 3. ML Pipeline Specifications

### 3.1 ASR Pipeline (`pipelines/asr.py`)

```
Input:  audio file path (any format ffmpeg supports)
Output: Transcript { language, duration, segments: [Segment(start, end, text)] }

Model:     faster-whisper large-v3
Device:    CUDA (configurable)
Compute:   float16 (GPU) / int8 (CPU)
Features:  VAD enabled, no word-level timestamps
Language:  auto-detect or user-specified
```

**Lazy loading pattern:**
```python
_model = None  # global cache

def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel(settings.asr_model, device=settings.asr_device, ...)
    return _model
```

### 3.2 TTS Pipeline (`pipelines/tts.py`)

**F5-TTS Engine:**
```
Model:    VIZINTZOR/F5-TTS-THAI (F5TTS_Base architecture)
Vocoder:  Vocos (built-in)
Weights:  model_1000000.pt + vocab.txt (via cached_path from HuggingFace)
Sample:   24kHz
Device:   CUDA

Input:    text, ref_audio_path, ref_text, language, speed
Output:   WAV file

Process:
1. Load model (lazy, cached globally)
2. Load reference audio → tensor
3. If ref_text empty → ASR auto-detect
4. infer(ref_audio, ref_text, gen_text, speed=speed)
5. Save waveform to output path
```

**XTTS v2 Engine (fallback):**
```
Model:    tts_models/multilingual/multi-dataset/xtts_v2
Library:  Coqui TTS
Languages: en,es,fr,de,it,pt,pl,tr,ru,nl,cs,ar,zh-cn,ja,hu,ko,hi
NOTE:     Thai input → auto-fallback to F5-TTS

Input:    text, speaker_wav, language, speed
Output:   WAV file via tts_to_file()
```

**Engine selection logic:**
```python
def synthesize(text, out_path, ref_audio, language="th", engine=None):
    if language == "th" or engine == "f5":
        return _synth_f5(text, out_path, ref_audio, language)
    elif engine == "xtts":
        return _synth_xtts(text, out_path, ref_audio, language)
    else:
        return _synth_f5(...)  # default
```

### 3.3 Dubbing Pipeline (`pipelines/dubbing.py`)

```
Input:
  - source_audio: path to uploaded audio/video
  - voice_id: reference voice from library
  - target_lang: target language string
  - translate: bool (translate or keep original text)
  - source_lang: optional override

Output: dict {output, segments_count, detected_language, duration, translated}

Pipeline stages with progress mapping:
  0.00–0.05  ASR (transcribe source)
  0.10–0.88  Per-segment loop:
               - translate (if enabled) via brain.translate()
               - TTS synthesize with voice clone
  0.88–0.92  fit_duration per segment (time-stretch)
  0.92–0.95  overlay_on_timeline (mix all segments)
  0.95–1.00  Cleanup + finalize
```

**Segment processing detail:**
```python
for i, seg in enumerate(transcript.segments):
    progress_base = 0.10 + (i / total) * 0.78
    
    # Translate
    if translate:
        translated = await brain.translate(seg.text, target_lang, source_lang)
    else:
        translated = seg.text
    
    # TTS with voice cloning
    raw_path = tmp / f"seg_{i:04d}_raw.wav"
    await synthesize(translated, raw_path, ref_audio, ref_text, language)
    
    # Fit duration to original segment length
    fitted_path = tmp / f"seg_{i:04d}.wav"
    target_duration = seg.end - seg.start
    fit_duration(raw_path, target_duration, fitted_path)
    
    clips.append((seg.start, fitted_path))

# Mix all clips onto timeline
overlay_on_timeline(clips, total_duration_ms, output_path)
```

### 3.4 Mastering Pipeline (`pipelines/mastering.py`)

**Reference Mode (Matchering):**
```python
import matchering as mg

mg.process(
    target=source_path,
    reference=reference_path,
    results=[mg.pcm24(output_path)]
)
```

**Auto Mode (Loudness Normalization):**
```python
import pyloudnorm as pyln
import soundfile as sf

data, rate = sf.read(source_path)
meter = pyln.Meter(rate)
current_lufs = meter.integrated_loudness(data)
normalized = pyln.normalize.loudness(data, current_lufs, target_lufs)

# Peak limiting: scale down if sample peak > -1 dBFS
peak = np.max(np.abs(normalized))
ceiling = 10 ** (-1.0 / 20)  # -1 dBFS
if peak > ceiling:
    normalized *= ceiling / peak

sf.write(output_path, normalized, rate)
```

### 3.5 Music Remix Pipeline (`pipelines/music.py`)

**Suno finishing studio** — วางเสียงร้องบน beat อื่น + autotune + FX + master

```
Input:  source_audio (เพลง/เดโม่มีร้อง), beat_audio  (mp3/mp4/wav)
Output: dict { output, bpm{beat,vocal,stretch}, key, offset_ms, lufs, autotune, fx }

ขั้นตอน (run_remix, รายงาน progress ทุก stage):
  0.05  _to_wav        — แตกเสียงจาก mp3/mp4 → wav 44.1k (ffmpeg)
  0.15  separate_stems — Demucs htdemucs (two-stems=vocals) + empty_cache()
  0.55  detect_bpm/key — librosa (beat_track + chroma Krumhansl)
        time-stretch   — librosa ปรับ vocal ให้ BPM ตรง (กัน detect ครึ่ง/เท่า)
  0.65  autotune       — psola.vocode snap เข้าสเกลของ beat (ถ้า do_autotune)
  0.80  vocal_fx       — pedalboard: gate→HPF→comp→shelf→delay→reverb (ถ้า do_fx)
  0.90  mix + master   — phase-sync (auto) หรือ offset_ms (manual) + LUFS + peak limit
```

**ฟังก์ชันหลัก:**
```python
separate_stems(audio, out_dir, device)   # Demucs → {vocals, instrumental}
detect_bpm(path) / detect_key(path)       # librosa
autotune(vocal_stereo, key_idx, mode)     # psola
vocal_fx(vocal_stereo, reverb, delay, ...) # pedalboard
auto_phase_offset(beat, source, bpm)      # onset cross-correlation → samples
run_remix(*, source_audio, beat_audio, offset_ms=None, do_autotune=True,
          do_fx=True, reverb=0.16, delay=0.12, target_lufs=-14.0, progress=None)
```

**deps (lazy import, optional):** `demucs` (MIT), `psola` (MIT→parselmouth GPL), `pedalboard` (GPLv3)
→ GPL → ขายเชิงพาณิชย์ใช้แบบ BYOM (ดู [ROADMAP_MUSIC.md](ROADMAP_MUSIC.md))

**VRAM (3060):** Demucs ~3-7GB (หนักสุด), psola/pedalboard = CPU. เรียก `torch.cuda.empty_cache()` หลังแยก stem. ระวัง Ollama แย่ง VRAM

---

## 4. Job System

### 4.1 Architecture

```python
# jobs/manager.py

@dataclass
class Job:
    id: str           # short_id() → 12-char hex
    kind: str         # "tts" | "dubbing" | "mastering"
    status: str       # "queued" | "running" | "done" | "error"
    progress: float   # 0.0–1.0 (rounded to 3 decimals)
    message: str      # human-readable status text
    result: dict | None
    error: str | None

class JobManager:
    _jobs: dict[str, Job]
    _subs: dict[str, set[asyncio.Queue]]
    
    def create(kind) -> Job
    def spawn(kind, task_fn) -> Job     # create + asyncio.create_task
    async def _run(job, task_fn)        # set running, call task, set done/error
    def subscribe(job_id) -> Queue      # for WebSocket
    def unsubscribe(job_id, queue)
    def _broadcast(job)                 # push to all subscribers
```

### 4.2 WebSocket Flow

```
Client                          Server
  │                                │
  ├──── WS Connect ──────────────►│
  │     /jobs/ws/{job_id}          │
  │                                │
  │◄─── Current state ────────────┤  (immediate)
  │     {status, progress, ...}    │
  │                                │
  │◄─── Progress update ──────────┤  (on each report())
  │     {progress: 0.3, msg: ...}  │
  │                                │
  │◄─── Progress update ──────────┤
  │     {progress: 0.7, msg: ...}  │
  │                                │
  │◄─── Done ─────────────────────┤
  │     {status: "done", result: { │
  │       output: "tts_abc.wav"    │
  │     }}                         │
  │                                │
  ├──── Connection closed ────────►│
```

---

## 5. Frontend Architecture

### 5.1 Component Tree

```
App
├── Sidebar
│   ├── Logo
│   ├── Navigation (5 tabs)
│   ├── UpdateChecker
│   └── Connection status
└── Content (tab-based)
    ├── VoicesPanel
    │   ├── Upload form (name, ref_text, language, file)
    │   └── Voice list (items with delete)
    ├── TTSPanel
    │   ├── Text input (textarea)
    │   ├── Voice selector (dropdown)
    │   ├── Language + Speed controls
    │   └── JobProgress (bar + player + download)
    ├── DubbingPanel
    │   ├── Source audio upload
    │   ├── Voice selector
    │   ├── Language + Translate toggle
    │   └── JobProgress
    ├── MasteringPanel
    │   ├── Source audio upload
    │   ├── Reference audio upload (optional)
    │   ├── LUFS + Format selectors
    │   └── JobProgress
    └── BrainPanel
        ├── Toggle: Ollama ↔ Cloud
        ├── Ollama config (model name)
        ├── Cloud config (provider, model, API key)
        └── Health status display
```

### 5.2 API Client (`api.ts`)

```typescript
const API_BASE = "http://127.0.0.1:8756";
const WS_BASE  = "ws://127.0.0.1:8756";

// All endpoints return parsed JSON via fetch()
export const brain = {
  getConfig: () => get("/brain/config"),
  setConfig: (body) => post("/brain/config", body),
  translate: (text, target_lang) => post("/brain/translate", { text, target_lang }),
};

export const voices = {
  list: () => get("/voices").then(r => r.voices),
  upload: (form: FormData) => postForm("/voices", form),
  remove: (id) => del(`/voices/${id}`),
};

export const files = {
  upload: (file: File) => { /* FormData POST /files/upload */ },
  downloadUrl: (name) => `${API_BASE}/files/download/${name}`,
};

export const tts = { synth: (body) => post("/tts", body) };
export const dubbing = { run: (body) => post("/dubbing", body) };
export const mastering = { run: (body) => post("/mastering", body) };

export const jobs = {
  get: (id) => get(`/jobs/${id}`),
  watch: (id, onUpdate) => {
    const ws = new WebSocket(`${WS_BASE}/jobs/ws/${id}`);
    ws.onmessage = (e) => onUpdate(JSON.parse(e.data));
    return () => ws.close();
  },
};
```

### 5.3 Job Hook (`useJob.ts`)

```typescript
function useJob() {
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  
  const start = async (spawn: () => Promise<{job_id: string}>) => {
    setBusy(true);
    setJob(null);
    const { job_id } = await spawn();
    const unsub = jobs.watch(job_id, (update) => {
      setJob(update);
      if (update.status === "done" || update.status === "error") {
        setBusy(false);
        unsub();
      }
    });
  };
  
  return { job, busy, start };
}
```

### 5.4 Update System

```
Tauri Plugin Stack:
  tauri-plugin-updater   → check + download + install
  tauri-plugin-dialog    → confirmation dialogs
  tauri-plugin-process   → relaunch after update

Update Flow:
  1. App starts → 3s delay → check()
  2. If update available → show overlay dialog
  3. User clicks "ติดตั้งเลย" → downloadAndInstall()
  4. Progress bar shows download %
  5. Install completes → show "รีสตาร์ท" button
  6. User clicks → relaunch()

Signing:
  Algorithm: minisign (Ed25519)
  Key pair:  keys/g-music.key (private, gitignored)
             keys/g-music.key.pub (public)
  Config:    pubkey embedded in tauri.conf.json
  
Update Endpoint:
  https://github.com/{owner}/{repo}/releases/latest/download/latest.json
  
  latest.json format:
  {
    "version": "0.2.0",
    "notes": "Release notes here",
    "pub_date": "2026-07-01T00:00:00Z",
    "platforms": {
      "windows-x86_64": {
        "url": "https://github.com/.../G-Music_0.2.0_x64-setup.exe",
        "signature": "..."
      }
    }
  }
```

---

## 6. Build & Distribution

### 6.1 NSIS Installer

```
Output:     G-Music_<version>_x64-setup.exe (~3.5 MB)
Languages:  Thai, English
Signing:    minisign signature (.exe.sig)

Build command:
  TAURI_SIGNING_PRIVATE_KEY=<key> npx tauri build

Artifacts:
  frontend/src-tauri/target/release/bundle/nsis/
  ├── G-Music_0.1.0_x64-setup.exe       # installer
  └── G-Music_0.1.0_x64-setup.exe.sig   # signature
```

### 6.2 CI/CD (GitHub Actions)

```yaml
Trigger:  push tag "v*"
Runner:   windows-latest
Steps:
  1. Checkout
  2. Setup Node 20 + Rust stable
  3. Rust cache (src-tauri workspace)
  4. npm ci
  5. tauri-apps/tauri-action@v0
     - Signs with TAURI_SIGNING_PRIVATE_KEY secret
     - Creates draft GitHub Release
     - Uploads .exe + .sig + latest.json
```

### 6.3 Release Process

```
Manual:
  1. Update version in tauri.conf.json + package.json + Cargo.toml
  2. Run scripts/build_installer.ps1
  3. Upload .exe + .sig to GitHub Release
  4. Create latest.json with signature

Automated:
  1. Update version in configs
  2. git tag v<version> && git push origin v<version>
  3. GitHub Actions builds + creates draft release
  4. Review draft → publish
```

---

## 7. Audio Processing Utilities

### 7.1 Duration Fitting (`utils/audio.py`)

```python
def fit_duration(wav_path, target_sec, out_path):
    """Time-stretch audio to exactly target_sec without changing pitch."""
    # Uses librosa.effects.time_stretch
    # stretch_factor = original_duration / target_sec
    # Resamples if needed
    # Falls back to no-op if librosa unavailable
```

### 7.2 Timeline Overlay (`utils/audio.py`)

```python
def overlay_on_timeline(clips, total_ms, out_path):
    """
    clips: [(start_sec, wav_path), ...]
    Creates silent AudioSegment of total_ms length
    Overlays each clip at its start position
    Uses pydub (requires ffmpeg)
    """
```

### 7.3 FFmpeg Setup (`utils/ffmpeg.py`)

```python
def configure_ffmpeg():
    """Called once at startup."""
    from imageio_ffmpeg import get_ffmpeg_exe
    exe = get_ffmpeg_exe()
    os.environ["PATH"] = os.path.dirname(exe) + os.pathsep + os.environ["PATH"]
    AudioSegment.converter = exe
    AudioSegment.ffmpeg = exe
```

---

## 8. Security Considerations

| Area | Measure |
|------|---------|
| **API keys** | Stored in env/.env, masked in UI (•••), never logged |
| **File access** | Path traversal protection in `/files/download/` |
| **Update integrity** | minisign Ed25519 signature verification |
| **Private key** | `keys/` directory in .gitignore |
| **CORS** | Open for dev (restrict in production if backend exposed) |
| **Local-only** | Backend binds to 127.0.0.1 by default |
| **No auth** | Single-user desktop app, no authentication layer |

---

## 9. Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Windows 10 64-bit | Windows 11 64-bit |
| **CPU** | 4 cores | 8+ cores |
| **RAM** | 8 GB | 16 GB |
| **GPU** | — (CPU mode) | NVIDIA GPU, VRAM ≥ 6GB |
| **CUDA** | — | 12.1 |
| **Disk** | 5 GB (app + models) | 20 GB (all models + data) |
| **Network** | — (Ollama only) | Required for Cloud LLM + updates |

---

## 10. Dependency Graph

```
Backend Core:
  fastapi → uvicorn → pydantic → pydantic-settings
  httpx (Ollama HTTP client)
  websockets (job progress)
  python-multipart (file upload)
  aiofiles (async file I/O)

LLM SDKs:
  anthropic (Claude)
  openai (OpenAI + OpenRouter)

ML Stack:
  torch + torchaudio (CUDA 12.1)
  ├── faster-whisper (ASR)
  ├── f5-tts (TTS/cloning, depends on torch)
  ├── TTS (Coqui XTTS v2, depends on torch)
  └── cached_path (model download)

Audio Processing:
  soundfile + numpy
  pydub → imageio-ffmpeg (bundled)
  librosa (time-stretch)
  matchering (mastering)
  pyloudnorm (loudness)

Frontend:
  react + react-dom
  @tauri-apps/api
  @tauri-apps/plugin-shell
  @tauri-apps/plugin-updater
  @tauri-apps/plugin-dialog
  @tauri-apps/plugin-process

Tauri (Rust):
  tauri 2.x
  tauri-plugin-shell
  tauri-plugin-updater
  tauri-plugin-dialog
  tauri-plugin-process
  serde + serde_json
```
