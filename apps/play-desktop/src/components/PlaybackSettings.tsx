import { useEffect } from "react";
import { usePlaybackStore } from "../playback/usePlaybackStore";

export function PlaybackSettings({ report }: { report: (error: unknown) => void }) {
  const devices = usePlaybackStore(state => state.availableOutputDevices);
  const output = usePlaybackStore(state => state.nowPlaying.activeOutputDeviceId);
  const rate = usePlaybackStore(state => state.nowPlaying.playbackRate);
  useEffect(() => { void usePlaybackStore.getState().refreshOutputDevices().catch(report); }, [report]);
  return <>
    <label>ความเร็วการเล่น <select value={rate} onChange={event => usePlaybackStore.getState().setPlaybackRate(Number(event.target.value))}>{[.5,.75,1,1.25,1.5,2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
    <label>อุปกรณ์เสียง <select value={output ?? ""} onChange={event => void usePlaybackStore.getState().setOutputDevice(event.target.value).then(ok => { if (!ok) report("เลือกอุปกรณ์นี้ไม่ได้ ใช้อุปกรณ์เริ่มต้นแทน"); }).catch(report)}>{devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.deviceId ? device.label : "อุปกรณ์เริ่มต้นของ Windows"}</option>)}</select></label>
    <button onClick={() => void usePlaybackStore.getState().refreshOutputDevices().catch(report)}>ตรวจอุปกรณ์เสียงอีกครั้ง</button>
  </>;
}
