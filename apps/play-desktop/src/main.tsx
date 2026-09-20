import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initMediaSessionAdapter } from "./playback/mediaSessionAdapter";
import "./styles.css";

// เจ้าของเสียงอยู่นอก layout; Full/Compact ไม่สร้าง audio element ใหม่
const cleanup = initMediaSessionAdapter();
window.addEventListener("pagehide", cleanup, { once: true });
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
