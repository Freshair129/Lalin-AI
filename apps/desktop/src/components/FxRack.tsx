// @req FR-04b — แร็ค FX ของ remix (autotune/vocal FX/offset/LUFS)
import { Knob } from "./Knob";
import { Tilt } from "./Tilt";

export function FxRack({
  reverb,
  setReverb,
  delay,
  setDelay,
  autotune,
  setAutotune,
  autotuneStrength,
  setAutotuneStrength,
  keyOverride,
  setKeyOverride,
  fx,
  setFx,
  lufs,
  setLufs,
  offsetAuto,
  setOffsetAuto,
  phraseBars,
  setPhraseBars,
  offsetMs,
  setOffsetMs,
  mReverb,
  setMReverb,
  mEcho,
  setMEcho,
  mComp,
  setMComp,
}: {
  reverb: number;
  setReverb: (v: number) => void;
  delay: number;
  setDelay: (v: number) => void;
  autotune: boolean;
  setAutotune: (v: boolean) => void;
  autotuneStrength: number;
  setAutotuneStrength: (v: number) => void;
  keyOverride: string;
  setKeyOverride: (v: string) => void;
  fx: boolean;
  setFx: (v: boolean) => void;
  lufs: number;
  setLufs: (v: number) => void;
  offsetAuto: boolean;
  setOffsetAuto: (v: boolean) => void;
  phraseBars: number;
  setPhraseBars: (v: number) => void;
  offsetMs: number;
  setOffsetMs: (v: number) => void;
  mReverb: number;
  setMReverb: (v: number) => void;
  mEcho: number;
  setMEcho: (v: number) => void;
  mComp: boolean;
  setMComp: (v: boolean) => void;
}) {
  return (
    <div className="bento">
      <Tilt className="bento-tile glass wide" max={5}>
        <div className="bento-head">
          <span className="bento-dot" style={{ background: "#9b6cf0" }} />
          <b>Vocal FX</b>
          <span className="bento-sub">TUNE · REVERB · DELAY</span>
        </div>
        <div className="bento-knobs">
          <Knob value={autotuneStrength} min={0} max={1} onChange={setAutotuneStrength} label="Tune" color="#9b6cf0" disabled={!autotune} format={(v) => `${Math.round(v * 100)}`} />
          <Knob value={reverb} min={0} max={0.5} onChange={setReverb} label="Reverb" color="#9b6cf0" disabled={!fx} format={(v) => `${Math.round(v * 100)}`} />
          <Knob value={delay} min={0} max={0.4} onChange={setDelay} label="Delay" color="#9b6cf0" disabled={!fx} format={(v) => `${Math.round(v * 100)}`} />
          <div className="bento-toggles">
            <label className="remix-check"><input type="checkbox" checked={fx} onChange={(e) => setFx(e.target.checked)} />FX</label>
            <label className="remix-check"><input type="checkbox" checked={autotune} onChange={(e) => setAutotune(e.target.checked)} />Auto-tune</label>
            <select value={keyOverride} onChange={(e) => setKeyOverride(e.target.value)} style={{ width: 116 }}>
              <option value="auto">Auto key</option>
              <option value="C maj">C maj</option>
              <option value="C min">C min</option>
              <option value="D maj">D maj</option>
              <option value="D min">D min</option>
              <option value="E maj">E maj</option>
              <option value="E min">E min</option>
              <option value="F maj">F maj</option>
              <option value="F min">F min</option>
              <option value="G maj">G maj</option>
              <option value="G min">G min</option>
              <option value="A maj">A maj</option>
              <option value="A min">A min</option>
              <option value="B maj">B maj</option>
              <option value="B min">B min</option>
            </select>
          </div>
        </div>
      </Tilt>

      <Tilt className="bento-tile glass wide" max={5}>
        <div className="bento-head">
          <span className="bento-dot" style={{ background: "#3d9be0" }} />
          <b>Sync</b>
          <span className="bento-sub">OFFSET · ALIGN</span>
        </div>
        <div className="bento-knobs">
          <Knob
            value={offsetMs}
            min={-1000}
            max={1000}
            onChange={(v) => setOffsetMs(Math.round(v))}
            label="Offset ms"
            color="#3d9be0"
            disabled={offsetAuto}
            format={(v) => `${Math.round(v)}`}
          />
          <div className="bento-toggles">
            <label className="remix-check"><input type="checkbox" checked={offsetAuto} onChange={(e) => setOffsetAuto(e.target.checked)} />Auto-sync</label>
            <select value={phraseBars} onChange={(e) => setPhraseBars(Number(e.target.value))}>
              <option value={0}>Phrase 1</option>
              <option value={1}>Phrase 2</option>
              <option value={2}>Phrase 3</option>
              <option value={3}>Phrase 4</option>
            </select>
          </div>
        </div>
      </Tilt>

      <Tilt className="bento-tile glass wide" max={5}>
        <div className="bento-head">
          <span className="bento-dot" style={{ background: "#c7f046" }} />
          <b>Master Bus</b>
          <span className="bento-sub">REVERB · ECHO · COMP</span>
        </div>
        <div className="bento-knobs">
          <Knob value={mReverb} min={0} max={1} onChange={setMReverb} label="Reverb" color="#c7f046" format={(v) => `${Math.round(v * 100)}`} />
          <Knob value={mEcho} min={0} max={1} onChange={setMEcho} label="Echo" color="#c7f046" format={(v) => `${Math.round(v * 100)}`} />
          <div className="bento-toggles">
            <label className="remix-check"><input type="checkbox" checked={mComp} onChange={(e) => setMComp(e.target.checked)} />Compressor</label>
          </div>
        </div>
      </Tilt>

      <Tilt className="bento-tile glass" max={6}>
        <div className="bento-head">
          <span className="bento-dot" style={{ background: "#c7f046" }} />
          <b>Loudness</b>
          <span className="bento-sub">MASTER</span>
        </div>
        <select value={lufs} onChange={(e) => setLufs(Number(e.target.value))} style={{ width: "100%" }}>
          <option value={-14}>-14 LUFS · Spotify</option>
          <option value={-16}>-16 LUFS · Apple</option>
          <option value={-9}>-9 LUFS · Club</option>
        </select>
      </Tilt>
    </div>
  );
}
