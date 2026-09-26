import ReactDOM from "react-dom/client";
import { recoverPlayMigrationBeforeStore } from "./playMigration";
import "./styles.css";

async function startPlay() {
  const root = document.getElementById("root")!;
  try {
    await recoverPlayMigrationBeforeStore();
    const [{ App }, { initMediaSessionAdapter }] = await Promise.all([
      import("./App"),
      import("./playback/mediaSessionAdapter"),
    ]);
    // Migration recovery runs before App imports the playback store.
    const cleanup = initMediaSessionAdapter();
    window.addEventListener("pagehide", cleanup, { once: true });
    ReactDOM.createRoot(root).render(<App />);
  } catch (error) {
    root.setAttribute("role", "alert");
    root.textContent =
      `Lalin Play could not recover its queue/EQ migration state. The recovery journal was retained. Fix the storage issue and restart Play. ${String(error)}`;
  }
}

void startPlay();
