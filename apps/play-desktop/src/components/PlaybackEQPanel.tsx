// @req FR-17.2 — 10-band EQ (31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz)
// @req FR-17.3 — Gain -12dB to +12dB per band & reset
// @req FR-17.4 — Preamp -12dB to +12dB
// @req FR-17.5 — EQ bypass toggle
// @req FR-17.6 — Standard presets
// @req FR-17.7 — Custom presets CRUD
// @req FR-17.10 — Real spectrum visualization
// @req FR-17.11 — Real-time EQ parameter updates
// @req FR-22.2 — Localized EQ controls, presets and accessibility labels

import { useEffect, useRef, useState } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { PlaybackAudioEngine } from "../playback/audioEngine";
import { DEFAULT_EQ_PRESETS, type PlaybackEQBand } from "../contracts";
import { useI18n } from "../i18n";

function formatFreq(hz: number): string {
  if (hz >= 1000) return `${hz / 1000} kHz`;
  return `${hz} Hz`;
}

function formatGain(db: number): string {
  const value = Number.isInteger(db) ? String(db) : db.toFixed(1);
  return `${db > 0 ? "+" : ""}${value}`;
}

function drawEQOverview(
  canvas: HTMLCanvasElement,
  bands: readonly PlaybackEQBand[],
  enabled: boolean,
) {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;

  const ratio = window.devicePixelRatio || 1;
  const pixelWidth = Math.round(bounds.width * ratio);
  const pixelHeight = Math.round(bounds.height * ratio);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = bounds.width;
  const height = bounds.height;
  const left = 40;
  const right = 12;
  const top = 12;
  const bottom = 25;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const zeroY = top + plotHeight / 2;
  const accent = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim() || "#cdf23f";
  const muted = "#98a493";
  const grid = "#2a3228";
  const xFor = (frequency: number) =>
    left + (Math.log(frequency / 20) / Math.log(20000 / 20)) * plotWidth;
  const yFor = (gain: number) => top + ((12 - gain) / 24) * plotHeight;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px "Segoe UI", sans-serif';
  ctx.lineWidth = 1;

  for (const gain of [12, 6, 0, -6, -12]) {
    const y = yFor(gain);
    ctx.beginPath();
    ctx.strokeStyle = gain === 0 ? "#53614a" : grid;
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${gain > 0 ? "+" : ""}${gain}`, left - 8, y);
  }

  const frequencyTicks = [
    { frequency: 31, label: "31" },
    { frequency: 125, label: "125" },
    { frequency: 500, label: "500" },
    { frequency: 2000, label: "2k" },
    { frequency: 8000, label: "8k" },
    { frequency: 16000, label: "16k" },
  ];
  frequencyTicks.forEach(({ frequency, label }, index) => {
    const x = xFor(frequency);
    ctx.beginPath();
    ctx.strokeStyle = grid;
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + plotHeight);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = index === 0 ? "left" : index === frequencyTicks.length - 1 ? "right" : "center";
    ctx.fillText(label, x, height - 4);
  });

  const points = bands.map((band) => ({
    x: xFor(band.frequency),
    y: yFor(band.gain),
  }));
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, zeroY);
  points.forEach((point) => ctx.lineTo(point.x, point.y));
  ctx.lineTo(points[points.length - 1].x, zeroY);
  ctx.closePath();
  ctx.fillStyle = enabled ? "rgba(205, 242, 63, 0.09)" : "rgba(152, 164, 147, 0.06)";
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = enabled ? accent : muted;
  ctx.globalAlpha = enabled ? 1 : 0.65;
  ctx.lineWidth = 2;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  points.forEach((point) => {
    ctx.beginPath();
    ctx.fillStyle = enabled ? accent : muted;
    ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

export function PlaybackEQPanel() {
  const { t } = useI18n();
  const {
    eq,
    setBandGain,
    setPreamp,
    toggleEQBypass,
    selectPreset,
    saveCustomPreset,
    deleteCustomPreset,
    resetEQ,
  } = usePlaybackStore();

  const [savingPreset, setSavingPreset] = useState(false);
  const [presetNameInput, setPresetNameInput] = useState("");
  const responseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = responseCanvasRef.current;
    if (!canvas) return;

    const render = () => drawEQOverview(canvas, eq.bands, eq.enabled);
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [eq.bands, eq.enabled]);

  useEffect(() => {
    let animId = 0;
    const canvas = spectrumCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const engine = PlaybackAudioEngine.getInstance();
    const dataArray = new Uint8Array(128);
    const render = () => {
      animId = requestAnimationFrame(render);
      engine.getByteFrequencyData(dataArray);

      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const ratio = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(bounds.width * ratio);
      const pixelHeight = Math.round(bounds.height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }

      const width = bounds.width;
      const height = bounds.height;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const gap = 2;
      const barWidth = Math.max(1, (width - gap * (dataArray.length - 1)) / dataArray.length);
      const gradient = ctx.createLinearGradient(0, height, 0, 0);
      gradient.addColorStop(0, "rgba(205, 242, 63, 0.22)");
      gradient.addColorStop(1, "rgba(205, 242, 63, 0.9)");
      ctx.fillStyle = gradient;

      dataArray.forEach((value, index) => {
        const barHeight = (value / 255) * height;
        if (barHeight > 0.5) {
          ctx.fillRect(index * (barWidth + gap), height - barHeight, barWidth, barHeight);
        }
      });
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleSavePreset = () => {
    const name = presetNameInput.trim();
    if (!name) return;
    saveCustomPreset(name);
    setPresetNameInput("");
    setSavingPreset(false);
  };

  const isCustomPreset = eq.currentPreset in eq.customPresets;
  const presetLabel = (preset: string) => {
    const labels: Record<string, Parameters<typeof t>[0]> = {
      Flat: "eq.preset.flat",
      "Bass Boost": "eq.preset.bassBoost",
      "Treble Boost": "eq.preset.trebleBoost",
      Vocal: "eq.preset.vocal",
      Rock: "eq.preset.rock",
      Pop: "eq.preset.pop",
      Classical: "eq.preset.classical",
    };
    return labels[preset] ? t(labels[preset]) : preset;
  };

  return (
    <div className="eq-panel">
      <div className="eq-header">
        <div className="eq-preset-row">
          <div className="eq-profile-control">
            <label className="eq-label" htmlFor="eq-preset">
              {t("eq.preset")}
            </label>
            <select
              id="eq-preset"
              className="eq-select"
              aria-label={t("eq.selectPreset")}
              value={eq.currentPreset}
              onChange={(event) => selectPreset(event.target.value)}
            >
              <optgroup label={t("eq.factoryPresets")}>
                {Object.keys(DEFAULT_EQ_PRESETS).map((preset) => (
                  <option key={preset} value={preset}>
                    {presetLabel(preset)}
                  </option>
                ))}
              </optgroup>
              {Object.keys(eq.customPresets).length > 0 && (
                <optgroup label={t("eq.customPresets")}>
                  {Object.keys(eq.customPresets).map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </optgroup>
              )}
              {eq.currentPreset === "Custom" && (
                <option value="Custom">{t("eq.customUnsaved")}</option>
              )}
            </select>
          </div>

          <div className="eq-actions">
            <button
              className={`eq-btn ${savingPreset ? "active" : ""}`}
              aria-expanded={savingPreset}
              aria-controls="eq-save-box"
              onClick={() => setSavingPreset(!savingPreset)}
              title={t("eq.savePresetTitle")}
            >
              {t("eq.savePreset")}
            </button>
            {isCustomPreset && (
              <button
                className="eq-btn danger"
                onClick={() => deleteCustomPreset(eq.currentPreset)}
                title={t("eq.deletePresetTitle")}
              >
                {t("eq.deletePreset")}
              </button>
            )}
            <button className="eq-btn" onClick={resetEQ} title={t("eq.resetTitle")}>
              {t("eq.reset")}
            </button>
          </div>
        </div>

        <button
          className={`eq-bypass-btn ${eq.enabled ? "" : "bypassed"}`}
          aria-pressed={eq.enabled}
          onClick={toggleEQBypass}
          title={eq.enabled ? t("eq.disable") : t("eq.enable")}
        >
          <span className="eq-status-dot" aria-hidden="true" />
          {eq.enabled ? t("eq.enabled") : t("eq.disabled")}
        </button>
      </div>

      {savingPreset && (
        <div className="eq-save-box" id="eq-save-box">
          <input
            className="eq-input"
            aria-label={t("eq.newPresetName")}
            placeholder={t("eq.newPresetName")}
            maxLength={48}
            value={presetNameInput}
            onChange={(event) => setPresetNameInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSavePreset()}
            autoFocus
          />
          <button className="eq-btn primary" disabled={!presetNameInput.trim()} onClick={handleSavePreset}>
            {t("eq.savePreset")}
          </button>
          <button className="eq-btn" onClick={() => setSavingPreset(false)}>
            {t("migration.cancel")}
          </button>
        </div>
      )}

      <section className="eq-visualizer-card" aria-labelledby="eq-overview-title">
        <div className="eq-section-heading">
          <div>
            <h2 id="eq-overview-title">{t("eq.overview")}</h2>
            <p>{t("eq.responseHelp")}</p>
          </div>
          <span className={`eq-state-label ${eq.enabled ? "active" : ""}`}>
            {eq.enabled ? t("eq.activeValues") : t("eq.savedValues")}
          </span>
        </div>
        <canvas
          ref={responseCanvasRef}
          className="eq-response-canvas"
          role="img"
          aria-label={t("eq.responseAria", { state: eq.enabled ? t("eq.responseActive") : t("eq.responseBypassed") })}
        />
        <div className="eq-spectrum-strip">
          <div className="eq-spectrum-heading">
            <span className="eq-spectrum-dot" aria-hidden="true" />
            <span>{t("eq.liveSpectrum")}</span>
            <small>{t("eq.liveLevel")}</small>
          </div>
          <canvas
            ref={spectrumCanvasRef}
            className="eq-spectrum-canvas"
            role="img"
            aria-label={t("eq.spectrumAria")}
          />
        </div>
      </section>

      <section className="eq-faders-container" aria-label={t("eq.bandsAria")}>
        <div className="eq-faders-heading">
          <div>
            <h2>{t("eq.bandsHeading")}</h2>
            <p>{t("eq.bandsHelp")}</p>
          </div>
          <span className="eq-range-note">{t("eq.range")}</span>
        </div>

        <div className="eq-faders-row">
          <div className="eq-fader-col preamp-col">
            <span className="eq-db-val">
              {formatGain(eq.preamp)} <small>dB</small>
            </span>
            <div className="eq-slider-track">
              <input
                aria-label={t("eq.preampAria")}
                aria-valuetext={`${formatGain(eq.preamp)} dB`}
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={eq.preamp}
                disabled={!eq.enabled}
                onChange={(event) => setPreamp(parseFloat(event.target.value))}
                className="eq-slider-vertical"
              />
            </div>
            <span className="eq-freq-label preamp-label">Preamp</span>
            <small className="eq-fader-hint">{t("eq.preampLevel")}</small>
          </div>

          <div className="eq-bands-scroller">
            <div className="eq-band-groups" aria-hidden="true">
              <span className="bass-group">{t("eq.bass")}</span>
              <span className="mid-group">{t("eq.mid")}</span>
              <span className="treble-group">{t("eq.treble")}</span>
            </div>
            <div className="eq-bands-grid">
              {eq.bands.map((band, index) => (
                <div key={band.frequency} className="eq-fader-col">
                  <span className="eq-db-val">
                    {formatGain(band.gain)} <small>dB</small>
                  </span>
                  <div className="eq-slider-track">
                    <input
                      aria-label={t("eq.adjustBand", { frequency: formatFreq(band.frequency) })}
                      aria-valuetext={`${formatGain(band.gain)} dB`}
                      type="range"
                      min={-12}
                      max={12}
                      step={0.5}
                      value={band.gain}
                      disabled={!eq.enabled}
                      onChange={(event) => setBandGain(index, parseFloat(event.target.value))}
                      className="eq-slider-vertical"
                    />
                  </div>
                  <span className="eq-freq-label">{formatFreq(band.frequency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
