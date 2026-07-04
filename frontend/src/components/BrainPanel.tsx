import { useEffect, useState } from "react";
import { brain, type BrainConfig } from "../api";

// แผงตั้งค่าสมอง — สลับ Ollama(local) ↔ Cloud(Claude/OpenAI/OpenRouter)
export function BrainPanel({ onChange }: { onChange?: (c: BrainConfig) => void }) {
  const [cfg, setCfg] = useState<BrainConfig | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [provider, setProvider] = useState("ollama");
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
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
    if (r.config.provider === "ollama") {
      if (r.config.base_url) setOllamaBaseUrl(r.config.base_url);
      if (r.config.model) setOllamaModel(r.config.model);
    }
    if (r.config.provider === "cloud") {
      if (r.config.cloud_provider) setCloudProvider(r.config.cloud_provider);
      if (r.config.model) setCloudModel(r.config.model);
    }
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const installedModels = Array.isArray(health?.installed_models)
    ? [...new Set((health.installed_models as string[]).filter(Boolean))]
    : [];
  const modelOptions = installedModels.includes(ollamaModel)
    ? installedModels
    : [...installedModels, ollamaModel].filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> =
        provider === "ollama"
          ? { provider, ollama_base_url: ollamaBaseUrl.trim(), ollama_model: ollamaModel.trim() }
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
        <>
          <label className="field">
            <span>Local URL</span>
            <input
              value={ollamaBaseUrl}
              onChange={(e) => setOllamaBaseUrl(e.target.value)}
              placeholder="http://localhost:11434"
            />
          </label>
          <label className="field">
            <span>โมเดล Ollama</span>
            <select
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              disabled={installedModels.length === 0}
            >
              {modelOptions.length === 0 ? (
                <option value={ollamaModel || "llama3.1"}>{ollamaModel || "llama3.1"}</option>
              ) : (
                modelOptions.map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))
              )}
            </select>
          </label>
          <label className="field">
            <span>ชื่อโมเดลแบบกำหนดเอง</span>
            <input
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="เช่น llama3.1 หรือ hf.co/... "
            />
          </label>
        </>
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
          {provider === "ollama" && (
            <div className="hint" style={{ marginTop: 10 }}>
              URL ปัจจุบัน: <code>{ollamaBaseUrl}</code>
            </div>
          )}
          {installedModels.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="hint" style={{ marginBottom: 6 }}>โมเดลที่ติดตั้ง</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  maxHeight: 160,
                  overflowY: "auto",
                }}
              >
                {installedModels.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className="seg-add"
                    onClick={() => setOllamaModel(model)}
                    title={model}
                    style={{
                      fontSize: 11,
                      padding: "4px 8px",
                      opacity: provider === "ollama" && ollamaModel === model ? 1 : 0.82,
                    }}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
