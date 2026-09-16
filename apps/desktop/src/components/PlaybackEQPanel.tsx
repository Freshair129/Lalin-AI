// @req FR-17.2 — 10-band EQ (31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz)
// @req FR-17.3 — Gain -12dB to +12dB per band & reset
// @req FR-17.4 — Preamp -12dB to +12dB
// @req FR-17.5 — EQ bypass toggle
// @req FR-17.6 — Standard presets
// @req FR-17.7 — Custom presets CRUD
// @req FR-17.10 — Real spectrum visualization
// @req FR-17.11 — Real-time EQ parameter updates

import { useEffect, useRef, useState } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";
import { PlaybackAudioEngine } from "../playback/audioEngine";
import { DEFAULT_EQ_PRESETS } from "@lalin/contracts";

function formatFreq(hz: number): string {
  if (hz >= 1000) return `${hz / 1000}k`;
  return `${hz}`;
}

export function PlaybackEQPanel() {
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Real-time spectrum visualizer
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const engine = PlaybackAudioEngine.getInstance();
    const dataArray = new Uint8Array(64);

    const render = () => {
      animId = requestAnimationFrame(render);
      engine.getByteFrequencyData(dataArray);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / dataArray.length) * 1.5;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const val = dataArray[i] / 255;
        const barHeight = val * height;

        // Gradient lime to purple
        const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, "rgba(205, 242, 63, 0.2)");
        grad.addColorStop(1, "rgba(205, 242, 63, 0.85)");

        ctx.fillStyle = grad;
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleSavePreset = () => {
    if (!presetNameInput.trim()) return;
    saveCustomPreset(presetNameInput.trim());
    setPresetNameInput("");
    setSavingPreset(false);
  };

  const isCustomPreset = eq.currentPreset in eq.customPresets;

  return (
    <div className="eq-panel">
      {/* Top Controls: Preset selector, Bypass, Reset */}
      <div className="eq-header">
        <div className="eq-preset-row">
          <label className="eq-label">Preset:</label>
          <select
            className="eq-select"
            value={eq.currentPreset}
            onChange={(e) => selectPreset(e.target.value)}
          >
            <optgroup label="Standard Presets">
              {Object.keys(DEFAULT_EQ_PRESETS).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </optgroup>
            {Object.keys(eq.customPresets).length > 0 && (
              <optgroup label="Custom Presets">
                {Object.keys(eq.customPresets).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
            )}
            {eq.currentPreset === "Custom" && (
              <option value="Custom">Custom (Unsaved)</option>
            )}
          </select>

          <button
            className={`eq-btn ${savingPreset ? "active" : ""}`}
            onClick={() => setSavingPreset(!savingPreset)}
            title="Save custom preset"
          >
            Save Preset
          </button>

          {isCustomPreset && (
            <button
              className="eq-btn danger"
              onClick={() => deleteCustomPreset(eq.currentPreset)}
              title="Delete current preset"
            >
              Delete
            </button>
          )}

          <button className="eq-btn" onClick={resetEQ} title="Reset all to 0 dB">
            Reset
          </button>
        </div>

        <button
          className={`eq-bypass-btn ${eq.enabled ? "" : "bypassed"}`}
          onClick={toggleEQBypass}
          title={eq.enabled ? "Bypass EQ" : "Enable EQ"}
        >
          {eq.enabled ? "EQ ACTIVE" : "BYPASS"}
        </button>
      </div>

      {savingPreset && (
        <div className="eq-save-box">
          <input
            className="eq-input"
            placeholder="Preset name..."
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSavePreset()}
            autoFocus
          />
          <button className="eq-btn primary" onClick={handleSavePreset}>
            Save
          </button>
          <button className="eq-btn" onClick={() => setSavingPreset(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Spectrum Visualizer Canvas */}
      <div className="eq-spectrum-box">
        <canvas ref={canvasRef} width={420} height={48} className="eq-spectrum-canvas" />
      </div>

      {/* EQ Sliders Area */}
      <div className="eq-faders-container">
        {/* Preamp Fader */}
        <div className="eq-fader-col preamp-col">
          <span className="eq-db-val">{eq.preamp > 0 ? `+${eq.preamp}` : eq.preamp} dB</span>
          <div className="eq-slider-track">
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={eq.preamp}
              disabled={!eq.enabled}
              onChange={(e) => setPreamp(parseFloat(e.target.value))}
              className="eq-slider-vertical"
            />
          </div>
          <span className="eq-freq-label preamp-label">Preamp</span>
        </div>

        <div className="eq-sep" />

        {/* 10 Band Faders */}
        <div className="eq-bands-grid">
          {eq.bands.map((band, idx) => (
            <div key={band.frequency} className="eq-fader-col">
              <span className="eq-db-val">{band.gain > 0 ? `+${band.gain}` : band.gain}</span>
              <div className="eq-slider-track">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={band.gain}
                  disabled={!eq.enabled}
                  onChange={(e) => setBandGain(idx, parseFloat(e.target.value))}
                  className="eq-slider-vertical"
                />
              </div>
              <span className="eq-freq-label">{formatFreq(band.frequency)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
