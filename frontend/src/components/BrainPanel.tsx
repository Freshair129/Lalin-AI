// @req FR-05 — UI ตั้งค่าสมอง (สลับ local/cloud)
import { useEffect, useState } from "react";
import { brain, type BrainConfig } from "../api";

// แผงตั้งค่าสมอง — สลับ Ollama(local) ↔ Cloud(Claude/OpenAI/OpenRouter)
export function BrainPanel({ onChange }: { onChange?: (c: BrainConfig) => void }) {
  const [cfg, setCfg] = useState<BrainConfig | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [provider, setProvider] = useState("ollama");
  const [ollamaModel, setOllamaModel] = useState("llama3.1");
  const [cloudProvider, setCloudProvider] = useState("anthropic");
  const [cloudModel, setCloudModel] = useState("claude-opus-4-8");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const r = await brain.getConfig();
    setCfg(r.config);
    setHealth(r.health);
    setProvider(r.config.provider);
    if (r.config.provider === "ollama" && r.config.model) setOllamaModel(r.config.model);
    if (r.config.provider === "cloud") {
      if (r.config.cloud_provider) setCloudProvider(r.config.cloud_provider);
      if (r.config.model) setCloudModel(r.config.model);
    }
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> =
        provider === "ollama"
          ? { provider, ollama_model: ollamaModel }
          : { provider, cloud_provider: cloudProvider, cloud_model: cloudModel, ...(apiKey ? { cloud_api_key: apiKey } : {}) };
      const r = await brain.setConfig(body);
      setCfg(r.config);
      setHealth(r.health);
      onChange?.(r.config);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel">
      <h2>🧠 สมอง (Brain)</h2>
      <p className="hint">เลือกว่าจะใช้สมองตัวไหนสำหรับงานแปล/เขียนสคริปต์ในการพากย์เสียง</p>

      <div className="toggle">
        <button className={provider === "ollama" ? "on" : ""} onClick={() => setProvider("ollama")}>
          💻 Ollama (Local)
        </button>
        <button className={provider === "cloud" ? "on" : ""} onClick={() => setProvider("cloud")}>
          ☁️ Cloud
        </button>
      </div>

      {provider === "ollama" ? (
        <label className="field">
          <span>โมเดล Ollama</span>
          <input value={ollamaModel} onChange={(e) => setOllamaModel(e.target.value)} placeholder="llama3.1" />
        </label>
      ) : (
        <>
          <label className="field">
            <span>ผู้ให้บริการ</span>
            <select value={cloudProvider} onChange={(e) => setCloudProvider(e.target.value)}>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
              <option value="openrouter">OpenRouter</option>
            </select>
          </label>
          <label className="field">
            <span>โมเดล</span>
            <input value={cloudModel} onChange={(e) => setCloudModel(e.target.value)} placeholder="claude-opus-4-8" />
          </label>
          <label className="field">
            <span>API Key</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={cfg?.has_api_key ? "•••• (ตั้งไว้แล้ว)" : "sk-…"} />
          </label>
        </>
      )}

      <button className="primary" onClick={save} disabled={saving}>
        {saving ? "กำลังบันทึก…" : "บันทึก & สลับสมอง"}
      </button>

      {health && (
        <div className={`status ${health.ok ? "ok" : "bad"}`}>
          {health.ok ? "🟢 พร้อมใช้งาน" : "🔴 ไม่พร้อม"} — {health.provider}
          {health.error && <div className="err">{health.error}</div>}
          {health.installed_models && (
            <div className="hint">โมเดลที่ติดตั้ง: {health.installed_models.join(", ") || "—"}</div>
          )}
        </div>
      )}
    </div>
  );
}
