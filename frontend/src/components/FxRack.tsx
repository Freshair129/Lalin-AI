import { Knob } from "./Knob";
import { Tilt } from "./Tilt";

export function FxRack({
  reverb,
  setReverb,
  delay,
  setDelay,
  autotune,
  setAutotune,
  fx,
  setFx,
  lufs,
  setLufs,
  offsetAuto,
  setOffsetAuto,
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
  fx: boolean;
  setFx: (v: boolean) => void;
  lufs: number;
  setLufs: (v: number) => void;
  offsetAuto: boolean;
  setOffsetAuto: (v: boolean) => void;
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
          <span className="bento-sub">REVERB · DELAY</span>
        </div>
        <div className="bento-knobs">
          <Knob value={reverb} min={0} max={0.5} onChange={setReverb} label="Reverb" color="#9b6cf0" disabled={!fx} format={(v) => `${Math.round(v * 100)}`} />
          <Knob value={delay} min={0} max={0.4} onChange={setDelay} label="Delay" color="#9b6cf0" disabled={!fx} format={(v) => `${Math.round(v * 100)}`} />
          <div className="bento-toggles">
            <label className="remix-check"><input type="checkbox" checked={fx} onChange={(e) => setFx(e.target.checked)} />FX</label>
            <label className="remix-check"><input type="checkbox" checked={autotune} onChange={(e) => setAutotune(e.target.checked)} />Auto-tune</label>
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
