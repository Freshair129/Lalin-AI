use crate::library;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
        Arc, Mutex,
    },
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const PROTOCOL: &str = "lalin-play";
const PROTOCOL_VERSION: u32 = 1;
const MAX_FRAME_BYTES: usize = 1024 * 1024;
const MAX_HISTORY: usize = 1024;
const ACK_TIMEOUT: Duration = Duration::from_secs(10);
const COMMAND_EVENT: &str = "play-handoff-command";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HandoffSnapshot {
    pub now_playing: NowPlayingState,
    pub queue: Vec<QueueItemState>,
    pub current_index: i32,
    pub volume: f64,
    pub muted: bool,
    pub eq: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NowPlayingState {
    pub identity: Option<String>,
    pub title: Option<String>,
    pub state: String,
    pub position: f64,
    pub duration: f64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueueItemState {
    pub identity: String,
    pub title: String,
}

impl Default for HandoffSnapshot {
    fn default() -> Self {
        Self {
            now_playing: NowPlayingState {
                identity: None,
                title: None,
                state: "idle".into(),
                position: 0.0,
                duration: 0.0,
                error: None,
            },
            queue: Vec::new(),
            current_index: -1,
            volume: 1.0,
            muted: false,
            eq: Value::Null,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
enum Action {
    Play,
    PlayNext,
    AddToQueue,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HandoffFile {
    path: String,
    title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", deny_unknown_fields)]
enum ClientMessage {
    #[serde(rename = "HELLO")]
    Hello {
        protocol: String,
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
    },
    #[serde(rename = "COMMAND")]
    Command {
        protocol: String,
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "ownerSession")]
        owner_session: String,
        action: Action,
        file: Option<HandoffFile>,
    },
    #[serde(rename = "QUERY_REQUEST")]
    QueryRequest {
        protocol: String,
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "ownerSession")]
        owner_session: String,
    },
    #[serde(rename = "GET_STATE")]
    GetState {
        protocol: String,
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(rename = "ownerSession")]
        owner_session: Option<String>,
    },
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Ack {
    #[serde(rename = "type")]
    frame_type: &'static str,
    request_id: String,
    owner_session: String,
    result: String,
    revision: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct StateFrame {
    #[serde(rename = "type")]
    frame_type: &'static str,
    owner_session: String,
    revision: u64,
    snapshot: HandoffSnapshot,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadyFrame<'a> {
    #[serde(rename = "type")]
    frame_type: &'static str,
    protocol: &'static str,
    protocol_version: u32,
    owner_session: &'a str,
    capabilities: [&'static str; 3],
    revision: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryResult {
    #[serde(rename = "type")]
    frame_type: &'static str,
    request_id: String,
    owner_session: String,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    ack: Option<Ack>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorFrame<'a> {
    #[serde(rename = "type")]
    frame_type: &'static str,
    code: &'a str,
    message: &'a str,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HandoffEvent {
    request_id: String,
    owner_session: String,
    action: Action,
    file: HandoffFile,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HandoffCompletion {
    pub result: String,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

struct PendingCommand {
    fingerprint: String,
    response: SyncSender<Ack>,
}

#[derive(Clone)]
struct RecordedOutcome {
    request_id: String,
    fingerprint: String,
    ack: Ack,
}

#[derive(Default)]
struct OwnerState {
    ready: bool,
    owner_session: String,
    revision: u64,
    snapshot: HandoffSnapshot,
    pending: HashMap<String, PendingCommand>,
    history: VecDeque<RecordedOutcome>,
}

#[derive(Clone, Default)]
pub struct HandoffService {
    core: Arc<Mutex<OwnerState>>,
    server_started: Arc<AtomicBool>,
}

impl HandoffService {
    fn set_snapshot(&self, snapshot: HandoffSnapshot) -> Result<(), String> {
        validate_snapshot(&snapshot)?;
        let mut core = self.core.lock().map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
        if core.snapshot != snapshot {
            core.revision = core.revision.saturating_add(1);
            core.snapshot = snapshot;
        }
        Ok(())
    }

    fn complete(
        &self,
        request_id: &str,
        completion: HandoffCompletion,
        snapshot: HandoffSnapshot,
    ) -> Result<(), String> {
        validate_snapshot(&snapshot)?;
        if completion.result != "applied" && completion.result != "rejected" {
            return Err("ผล ACK ไม่ถูกต้อง".into());
        }
        let mut core = self.core.lock().map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
        let pending = core
            .pending
            .remove(request_id)
            .ok_or("ไม่พบคำสั่ง handoff ที่รอ ACK")?;
        core.revision = core.revision.saturating_add(1);
        core.snapshot = snapshot;
        let ack = Ack {
            frame_type: "ACK",
            request_id: request_id.to_string(),
            owner_session: core.owner_session.clone(),
            result: completion.result,
            revision: core.revision,
            error_code: completion.error_code,
            message: completion.message,
        };
        remember(&mut core, request_id, pending.fingerprint, ack.clone());
        let _ = pending.response.send(ack);
        Ok(())
    }
}

fn validate_snapshot(snapshot: &HandoffSnapshot) -> Result<(), String> {
    if snapshot.queue.len() > 10_000
        || snapshot.current_index < -1
        || snapshot.current_index as usize >= snapshot.queue.len() && snapshot.current_index >= 0
        || !snapshot.volume.is_finite()
        || !snapshot.now_playing.position.is_finite()
        || !snapshot.now_playing.duration.is_finite()
    {
        return Err("STATE ของ Lalin Play ไม่ถูกต้อง".into());
    }
    let bytes = serde_json::to_vec(snapshot).map_err(|_| "STATE ของ Lalin Play ไม่ถูกต้อง")?;
    if bytes.len() + 512 > MAX_FRAME_BYTES {
        return Err("snapshot_too_large".into());
    }
    Ok(())
}

fn remember(core: &mut OwnerState, request_id: &str, fingerprint: String, ack: Ack) {
    core.history.push_back(RecordedOutcome {
        request_id: request_id.to_string(),
        fingerprint,
        ack,
    });
    while core.history.len() > MAX_HISTORY {
        core.history.pop_front();
    }
}

enum ReplayDisposition {
    Repeat(Ack),
    Conflict,
    Pending,
    New,
}

fn replay_disposition(core: &OwnerState, request_id: &str, fingerprint: &str) -> ReplayDisposition {
    if let Some(record) = core
        .history
        .iter()
        .find(|entry| entry.request_id == request_id)
    {
        return if record.fingerprint == fingerprint {
            ReplayDisposition::Repeat(record.ack.clone())
        } else {
            ReplayDisposition::Conflict
        };
    }
    if let Some(pending) = core.pending.get(request_id) {
        return if pending.fingerprint == fingerprint {
            ReplayDisposition::Pending
        } else {
            ReplayDisposition::Conflict
        };
    }
    ReplayDisposition::New
}

fn query_ack(core: &OwnerState, request_id: &str, owner_session: &str) -> Option<Ack> {
    if owner_session != core.owner_session {
        return None;
    }
    core.history
        .iter()
        .find(|entry| entry.request_id == request_id)
        .map(|entry| entry.ack.clone())
}

fn is_uuid(value: &str) -> bool {
    value.len() == 36
        && value.chars().enumerate().all(|(index, ch)| match index {
            8 | 13 | 18 | 23 => ch == '-',
            _ => ch.is_ascii_hexdigit(),
        })
}

fn fingerprint(action: &Action, file: &HandoffFile) -> String {
    format!(
        "{:?}\0{}\0{}",
        action,
        file.path,
        file.title.as_deref().unwrap_or("")
    )
}

fn state_frame(core: &OwnerState) -> StateFrame {
    StateFrame {
        frame_type: "STATE",
        owner_session: core.owner_session.clone(),
        revision: core.revision,
        snapshot: core.snapshot.clone(),
    }
}

fn ack_rejected(owner: &str, request_id: &str, revision: u64, code: &str, message: &str) -> Ack {
    Ack {
        frame_type: "ACK",
        request_id: request_id.to_string(),
        owner_session: owner.to_string(),
        result: "rejected".into(),
        revision,
        error_code: Some(code.into()),
        message: Some(message.into()),
    }
}

fn validate_request(
    protocol: &str,
    version: u32,
    request_id: &str,
    owner_session: &str,
    expected_owner: &str,
) -> Result<(), (&'static str, &'static str)> {
    if protocol != PROTOCOL || version != PROTOCOL_VERSION {
        return Err((
            "protocol_mismatch",
            "Studio และ Lalin Play ใช้ protocol คนละเวอร์ชัน",
        ));
    }
    if !is_uuid(request_id) {
        return Err(("invalid_request_id", "รหัสคำสั่งไม่ถูกต้อง"));
    }
    if owner_session != expected_owner {
        return Err((
            "owner_session_changed",
            "Lalin Play เริ่ม session ใหม่ กรุณาสั่งอีกครั้งจาก Studio",
        ));
    }
    Ok(())
}

fn handle_command(
    app: &AppHandle,
    service: &HandoffService,
    request_id: String,
    owner_session: String,
    action: Action,
    mut file: HandoffFile,
) -> Result<(Ack, StateFrame), String> {
    if !is_uuid(&request_id) {
        return Err("invalid_request_id".into());
    }
    if file
        .title
        .as_ref()
        .is_some_and(|title| title.trim().is_empty() || title.chars().count() > 512)
    {
        return Err("invalid_title".into());
    }
    let canonical = validate_media_file(&file.path)?;
    file.path = canonical.to_string_lossy().into_owned();
    if file.title.is_none() {
        file.title = canonical
            .file_stem()
            .map(|value| value.to_string_lossy().into_owned());
    }
    app.asset_protocol_scope()
        .allow_file(&canonical)
        .map_err(|_| "ไม่สามารถอนุญาตไฟล์นี้ใน Lalin Play ได้")?;

    let request_fingerprint = fingerprint(&action, &file);
    let (response_tx, response_rx) = mpsc::sync_channel(1);
    {
        let mut core = service
            .core
            .lock()
            .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
        if !core.ready || core.owner_session != owner_session {
            return Err("owner_session_changed".into());
        }
        match replay_disposition(&core, &request_id, &request_fingerprint) {
            ReplayDisposition::Repeat(ack) => return Ok((ack, state_frame(&core))),
            ReplayDisposition::Conflict => {
                let ack = ack_rejected(
                    &core.owner_session,
                    &request_id,
                    core.revision,
                    "request_conflict",
                    "รหัสคำสั่งนี้ถูกใช้กับไฟล์หรือ action อื่นแล้ว",
                );
                return Ok((ack, state_frame(&core)));
            }
            ReplayDisposition::Pending => {
                return Err("delivery_unknown".into());
            }
            ReplayDisposition::New => {}
        }
        if !core.pending.is_empty() {
            let ack = ack_rejected(
                &core.owner_session,
                &request_id,
                core.revision,
                "busy",
                "กำลังตรวจสอบคำสั่งก่อนหน้า กรุณาตรวจสถานะใน Lalin Play",
            );
            return Ok((ack, state_frame(&core)));
        }
        if core.pending.len() >= 128 {
            let ack = ack_rejected(
                &core.owner_session,
                &request_id,
                core.revision,
                "busy",
                "Lalin Play มีคำสั่งรอตรวจสอบมากเกินไป",
            );
            return Ok((ack, state_frame(&core)));
        }
        core.pending.insert(
            request_id.clone(),
            PendingCommand {
                fingerprint: request_fingerprint,
                response: response_tx,
            },
        );
    }

    let event = HandoffEvent {
        request_id: request_id.clone(),
        owner_session: owner_session.clone(),
        action,
        file,
    };
    if app.emit_to("main", COMMAND_EVENT, event).is_err() {
        let mut core = service
            .core
            .lock()
            .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
        core.pending.remove(&request_id);
        return Err("play_window_unavailable".into());
    }

    match response_rx.recv_timeout(ACK_TIMEOUT) {
        Ok(ack) => {
            let core = service
                .core
                .lock()
                .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
            Ok((ack, state_frame(&core)))
        }
        Err(_) => Err("delivery_unknown".into()),
    }
}

fn process_message(
    app: &AppHandle,
    service: &HandoffService,
    message: ClientMessage,
) -> Result<Vec<Value>, String> {
    match message {
        ClientMessage::Hello {
            protocol,
            protocol_version,
        } => {
            if protocol != PROTOCOL || protocol_version != PROTOCOL_VERSION {
                return Err("protocol_mismatch".into());
            }
            let core = service
                .core
                .lock()
                .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
            if !core.ready {
                return Err("owner_not_ready".into());
            }
            let ready = ReadyFrame {
                frame_type: "READY",
                protocol: PROTOCOL,
                protocol_version: PROTOCOL_VERSION,
                owner_session: &core.owner_session,
                capabilities: ["play", "play-next", "add-to-queue"],
                revision: core.revision,
            };
            Ok(vec![to_value(&ready)?, to_value(&state_frame(&core))?])
        }
        ClientMessage::Command {
            protocol,
            protocol_version,
            request_id,
            owner_session,
            action,
            file,
        } => {
            let expected_owner = service
                .core
                .lock()
                .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?
                .owner_session
                .clone();
            validate_request(
                &protocol,
                protocol_version,
                &request_id,
                &owner_session,
                &expected_owner,
            )
            .map_err(|(code, _)| code.to_string())?;
            let file = file.ok_or("invalid_command")?;
            let (ack, state) =
                handle_command(app, service, request_id, owner_session, action, file)?;
            Ok(vec![to_value(&ack)?, to_value(&state)?])
        }
        ClientMessage::QueryRequest {
            protocol,
            protocol_version,
            request_id,
            owner_session,
        } => {
            if protocol != PROTOCOL || protocol_version != PROTOCOL_VERSION || !is_uuid(&request_id)
            {
                return Err("protocol_mismatch".into());
            }
            let core = service
                .core
                .lock()
                .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
            if owner_session != core.owner_session {
                let result = QueryResult {
                    frame_type: "QUERY_RESULT",
                    request_id,
                    owner_session: core.owner_session.clone(),
                    status: "owner_changed",
                    ack: None,
                };
                return Ok(vec![to_value(&result)?, to_value(&state_frame(&core))?]);
            }
            let ack = query_ack(&core, &request_id, &owner_session);
            let status = if ack.is_some() { "found" } else { "unknown" };
            let result = QueryResult {
                frame_type: "QUERY_RESULT",
                request_id,
                owner_session,
                status,
                ack,
            };
            Ok(vec![to_value(&result)?, to_value(&state_frame(&core))?])
        }
        ClientMessage::GetState {
            protocol,
            protocol_version,
            owner_session,
        } => {
            if protocol != PROTOCOL || protocol_version != PROTOCOL_VERSION {
                return Err("protocol_mismatch".into());
            }
            let core = service
                .core
                .lock()
                .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
            if !core.ready
                || owner_session
                    .as_ref()
                    .is_some_and(|value| value != &core.owner_session)
            {
                return Err("owner_session_changed".into());
            }
            Ok(vec![to_value(&state_frame(&core))?])
        }
    }
}

fn to_value<T: Serialize>(value: &T) -> Result<Value, String> {
    let value = serde_json::to_value(value).map_err(|_| "protocol_serialization_failed")?;
    let size = serde_json::to_vec(&value)
        .map_err(|_| "protocol_serialization_failed")?
        .len();
    if size > MAX_FRAME_BYTES {
        return Err("snapshot_too_large".into());
    }
    Ok(value)
}

#[tauri::command(rename_all = "camelCase")]
pub fn register_handoff_owner(
    window: WebviewWindow,
    app: AppHandle,
    service: tauri::State<'_, HandoffService>,
    owner_session: String,
    snapshot: HandoffSnapshot,
) -> Result<(), String> {
    crate::g3_test_trace(&app, "handoff_registration_invoked");
    require_main_window(&window)?;
    if !is_uuid(&owner_session) {
        return Err("owner session ไม่ถูกต้อง".into());
    }
    validate_snapshot(&snapshot)?;
    crate::g3_test_trace(&app, "handoff_snapshot_validated");
    {
        let mut core = service
            .core
            .lock()
            .map_err(|_| "สถานะ Lalin Play ใช้งานไม่ได้")?;
        if core.owner_session != owner_session {
            core.pending.clear();
            core.history.clear();
            core.revision = 0;
        }
        core.owner_session = owner_session;
        core.snapshot = snapshot;
        core.ready = true;
    }
    if !service.server_started.swap(true, Ordering::SeqCst) {
        #[cfg(windows)]
        {
            let start = (|| {
                let name = windows_pipe::pipe_name()?;
                let first = windows_pipe::create_server_pipe(&name, true)?;
                Ok::<_, String>((name, first))
            })();
            let (name, first) = match start {
                Ok(value) => value,
                Err(error) => {
                    service.server_started.store(false, Ordering::SeqCst);
                    if let Ok(mut core) = service.core.lock() {
                        core.ready = false;
                    }
                    return Err(error);
                }
            };
            crate::g3_test_trace(&app, "handoff_pipe_created");
            let service_state = service.inner().clone();
            let server_app = app.clone();
            if let Err(error) = std::thread::Builder::new()
                .name("lalin-play-handoff".into())
                .spawn(move || windows_pipe::serve(server_app, service_state, name, first))
            {
                service.server_started.store(false, Ordering::SeqCst);
                if let Ok(mut core) = service.core.lock() {
                    core.ready = false;
                }
                return Err(format!("เริ่ม handoff pipe ไม่ได้: {error}"));
            }
        }
        #[cfg(not(windows))]
        {
            service.server_started.store(false, Ordering::SeqCst);
            return Err("Native Studio handoff รองรับเฉพาะ Windows".into());
        }
    }
    crate::g3_test_trace(&app, "handoff_receiver_ready");
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn publish_handoff_state(
    window: WebviewWindow,
    service: tauri::State<'_, HandoffService>,
    snapshot: HandoffSnapshot,
) -> Result<(), String> {
    require_main_window(&window)?;
    service.set_snapshot(snapshot)
}

#[tauri::command(rename_all = "camelCase")]
pub fn complete_handoff_command(
    window: WebviewWindow,
    service: tauri::State<'_, HandoffService>,
    request_id: String,
    completion: HandoffCompletion,
    snapshot: HandoffSnapshot,
) -> Result<(), String> {
    require_main_window(&window)?;
    service.complete(&request_id, completion, snapshot)
}

fn require_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("คำสั่ง handoff ใช้ได้จากหน้าต่างหลักของ Lalin Play เท่านั้น".into());
    }
    Ok(())
}

#[tauri::command(rename_all = "camelCase")]
pub fn grant_handoff_media(
    window: WebviewWindow,
    app: AppHandle,
    path: String,
) -> Result<library::Track, String> {
    require_main_window(&window)?;
    let canonical = validate_media_file(&path)?;
    let mut imported = library::import_selected(&app, vec![canonical])?;
    imported
        .pop()
        .ok_or_else(|| "ไม่สามารถเพิ่มไฟล์ที่ส่งมาจาก Studio ได้".into())
}

fn validate_media_file(path: &str) -> Result<std::path::PathBuf, String> {
    use std::{fs, path::Path};
    let candidate = Path::new(path);
    if path.is_empty()
        || path.len() > 4096
        || path.contains('\0')
        || (path.starts_with("\\\\") && local_windows_drive_root(path).is_none())
        || path.starts_with("//")
    {
        return Err("invalid_file_path".into());
    }
    if !candidate.is_absolute() {
        return Err("invalid_file_path".into());
    }
    let canonical = fs::canonicalize(candidate).map_err(|_| "ไม่พบไฟล์ที่ Studio ส่งมา")?;
    if !is_local_canonical_path(&canonical) {
        return Err("ไฟล์ที่ Studio ส่งมาต้องอยู่บน local drive".into());
    }
    if !canonical.is_file() {
        return Err("ไฟล์ที่ส่งมาไม่ใช่ไฟล์ปกติ".into());
    }
    let ext = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !library::MEDIA_EXTENSIONS.contains(&ext.as_str()) {
        return Err("ชนิดไฟล์นี้ Lalin Play ยังไม่รองรับ".into());
    }
    Ok(canonical)
}

#[cfg(test)]
fn is_local_windows_canonical(value: &str) -> bool {
    local_windows_drive_root(value).is_some()
}

fn local_windows_drive_root(value: &str) -> Option<String> {
    let normalized = value.replace('/', "\\");
    let path = normalized.strip_prefix("\\\\?\\").unwrap_or(&normalized);
    let bytes = path.as_bytes();
    (bytes.len() >= 3 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':' && bytes[2] == b'\\')
        .then(|| path[..3].to_string())
}

// Win32 GetDriveTypeW return values; only local media drive kinds are accepted.
#[cfg(test)]
const DRIVE_UNKNOWN: u32 = 0;
#[cfg(test)]
const DRIVE_NO_ROOT_DIR: u32 = 1;
#[cfg(any(windows, test))]
const DRIVE_REMOVABLE: u32 = 2;
#[cfg(any(windows, test))]
const DRIVE_FIXED: u32 = 3;
#[cfg(any(windows, test))]
const DRIVE_REMOTE: u32 = 4;
#[cfg(any(windows, test))]
const DRIVE_CDROM: u32 = 5;
#[cfg(any(windows, test))]
const DRIVE_RAMDISK: u32 = 6;

#[cfg(any(windows, test))]
fn is_local_windows_drive_type(drive_type: u32) -> bool {
    drive_type != DRIVE_REMOTE
        && matches!(
            drive_type,
            DRIVE_REMOVABLE | DRIVE_FIXED | DRIVE_CDROM | DRIVE_RAMDISK
        )
}

#[cfg(windows)]
fn is_local_canonical_path(path: &std::path::Path) -> bool {
    let Some(root) = local_windows_drive_root(&path.to_string_lossy()) else {
        return false;
    };
    windows_pipe::is_local_drive(&root)
}

#[cfg(not(windows))]
fn is_local_canonical_path(path: &std::path::Path) -> bool {
    path.is_absolute()
}

#[cfg(windows)]
mod windows_pipe {
    use super::*;
    use std::{
        fs::File,
        io::{Read, Write},
        os::windows::io::{FromRawHandle, RawHandle},
        ptr::null_mut,
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{
            CloseHandle, GetLastError, LocalFree, ERROR_PIPE_CONNECTED, HANDLE,
            INVALID_HANDLE_VALUE,
        },
        Security::Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
            SDDL_REVISION_1,
        },
        Security::{
            GetTokenInformation, RevertToSelf, TokenLogonSid, SECURITY_ATTRIBUTES, TOKEN_GROUPS,
            TOKEN_QUERY,
        },
        Storage::FileSystem::{
            FlushFileBuffers, GetDriveTypeW, FILE_FLAG_FIRST_PIPE_INSTANCE, PIPE_ACCESS_DUPLEX,
        },
        System::{
            Pipes::{
                ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe,
                GetNamedPipeClientSessionId, GetNamedPipeServerSessionId,
                ImpersonateNamedPipeClient, PeekNamedPipe, PIPE_READMODE_BYTE,
                PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT,
            },
            RemoteDesktop::ProcessIdToSessionId,
            Threading::{
                GetCurrentProcess, GetCurrentProcessId, GetCurrentThread, OpenProcessToken,
                OpenThreadToken,
            },
            IO::OVERLAPPED,
        },
    };

    const PIPE_CAP: usize = MAX_FRAME_BYTES;
    const PIPE_NAME_PREFIX: &str = r"\\.\pipe\ai.lalin.play.handoff.v1";
    const TOKEN_ACCESS: u32 = TOKEN_QUERY;

    pub fn is_local_drive(root: &str) -> bool {
        let wide = root.encode_utf16().chain([0]).collect::<Vec<_>>();
        is_local_windows_drive_type(unsafe { GetDriveTypeW(wide.as_ptr()) })
    }

    pub fn pipe_name() -> Result<Vec<u16>, String> {
        let sid = current_logon_sid()?;
        let hash = stable_hash(sid.as_bytes());
        Ok(format!("{PIPE_NAME_PREFIX}.{hash:016x}")
            .encode_utf16()
            .chain([0])
            .collect())
    }

    fn stable_hash(value: &[u8]) -> u64 {
        value.iter().fold(0xcbf29ce484222325u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        })
    }

    fn current_logon_sid() -> Result<String, String> {
        let mut token: HANDLE = null_mut();
        unsafe {
            if OpenProcessToken(GetCurrentProcess(), TOKEN_ACCESS, &mut token) == 0 {
                return Err("ไม่สามารถอ่าน logon session ของ Lalin Play ได้".into());
            }
        }
        let result = logon_sid_from_token(token);
        unsafe {
            CloseHandle(token);
        }
        result
    }

    fn logon_sid_from_token(token: HANDLE) -> Result<String, String> {
        let mut needed = 0u32;
        unsafe {
            GetTokenInformation(token, TokenLogonSid, null_mut(), 0, &mut needed);
        }
        if needed == 0 || needed > 64 * 1024 {
            return Err("logon SID ของ Windows ใช้งานไม่ได้".into());
        }
        let mut buffer = vec![0u8; needed as usize];
        unsafe {
            if GetTokenInformation(
                token,
                TokenLogonSid,
                buffer.as_mut_ptr().cast(),
                needed,
                &mut needed,
            ) == 0
            {
                return Err("ไม่สามารถอ่าน logon SID ของ Windows ได้".into());
            }
            let groups = &*(buffer.as_ptr().cast::<TOKEN_GROUPS>());
            let entries =
                std::slice::from_raw_parts(groups.Groups.as_ptr(), groups.GroupCount as usize);
            let sid = entries
                .iter()
                .find(|entry| entry.Attributes & 0xc000_0000 == 0xc000_0000)
                .ok_or("ไม่พบ logon SID ของ Windows")?;
            let mut text = null_mut();
            if ConvertSidToStringSidW(sid.Sid, &mut text) == 0 {
                return Err("ไม่สามารถแปลง logon SID ของ Windows ได้".into());
            }
            let mut len = 0;
            while *text.add(len) != 0 {
                len += 1;
            }
            let value = String::from_utf16_lossy(std::slice::from_raw_parts(text, len));
            LocalFree(text.cast());
            Ok(value)
        }
    }

    fn sddl_for_logon_sid(sid: &str) -> String {
        format!("D:P(A;;GA;;;{sid})")
    }

    fn server_pipe_mode() -> u32 {
        PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS
    }

    fn security_attributes() -> Result<*mut std::ffi::c_void, String> {
        let sddl: Vec<u16> = sddl_for_logon_sid(&current_logon_sid()?)
            .encode_utf16()
            .chain([0])
            .collect();
        let mut descriptor = null_mut();
        unsafe {
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                SDDL_REVISION_1,
                &mut descriptor,
                null_mut(),
            ) == 0
            {
                return Err("ไม่สามารถสร้าง ACL สำหรับ logon session ปัจจุบันได้".into());
            }
        }
        Ok(descriptor)
    }

    pub fn create_server_pipe(name: &[u16], first: bool) -> Result<File, String> {
        let descriptor = security_attributes()?;
        let attributes = SECURITY_ATTRIBUTES {
            nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        let flags = PIPE_ACCESS_DUPLEX
            | if first {
                FILE_FLAG_FIRST_PIPE_INSTANCE
            } else {
                0
            };
        let handle = unsafe {
            CreateNamedPipeW(
                name.as_ptr(),
                flags,
                server_pipe_mode(),
                1,
                PIPE_CAP as u32,
                PIPE_CAP as u32,
                0,
                &attributes,
            )
        };
        unsafe {
            LocalFree(descriptor.cast());
        }
        if handle == INVALID_HANDLE_VALUE || handle.is_null() {
            return Err("Lalin Play handoff pipe ถูกใช้โดย endpoint อื่นหรือสร้าง ACL ไม่สำเร็จ".into());
        }
        Ok(unsafe { File::from_raw_handle(handle as RawHandle) })
    }

    pub fn serve(app: AppHandle, service: HandoffService, name: Vec<u16>, mut pipe: File) {
        loop {
            let raw = pipe.as_raw_handle();
            let connect = unsafe { ConnectNamedPipe(raw.cast(), null_mut::<OVERLAPPED>()) };
            if connect == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
                unsafe {
                    DisconnectNamedPipe(raw.cast());
                }
                drop(pipe);
                pipe = match create_server_pipe(&name, false) {
                    Ok(pipe) => pipe,
                    Err(_) => return,
                };
                continue;
            }
            let first_frame = match read_initial_authorized_frame(&mut pipe) {
                Ok(frame) => frame,
                Err(_) => {
                    unsafe {
                        DisconnectNamedPipe(raw.cast());
                    }
                    continue;
                }
            };
            let _ = serve_connection(&app, &service, &mut pipe, first_frame);
        }
    }

    fn read_initial_authorized_frame(pipe: &mut File) -> Result<Vec<u8>, String> {
        let first = read_frame(pipe, Duration::from_secs(3))?;
        if !same_logon_client(pipe.as_raw_handle().cast()) {
            return Err("unauthorized_client".into());
        }
        Ok(first)
    }

    fn same_logon_client(pipe: HANDLE) -> bool {
        let mut client_session = 0u32;
        let mut server_session = 0u32;
        let mut current_session = 0u32;
        let session_ok = unsafe {
            GetNamedPipeClientSessionId(pipe, &mut client_session) != 0
                && GetNamedPipeServerSessionId(pipe, &mut server_session) != 0
                && ProcessIdToSessionId(GetCurrentProcessId(), &mut current_session) != 0
                && client_session == server_session
                && server_session == current_session
        };
        if !session_ok || unsafe { ImpersonateNamedPipeClient(pipe) } == 0 {
            return false;
        }
        let mut token: HANDLE = null_mut();
        let opened =
            unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_ACCESS, 1, &mut token) } != 0;
        let _ = unsafe { RevertToSelf() };
        if !opened {
            return false;
        }
        let client_sid = logon_sid_from_token(token);
        unsafe {
            CloseHandle(token);
        }
        client_sid.ok().as_deref() == current_logon_sid().ok().as_deref()
    }

    fn serve_connection(
        app: &AppHandle,
        service: &HandoffService,
        pipe: &mut File,
        first: Vec<u8>,
    ) -> Result<(), String> {
        let raw = pipe.as_raw_handle();
        let result = (|| -> Result<(), String> {
            let message: ClientMessage = match serde_json::from_slice(&first) {
                Ok(message) => message,
                Err(_) => {
                    return Err("malformed_frame".into());
                }
            };
            let responses = process_message(app, service, message)?;
            for response in responses {
                write_value(pipe, &response)?;
            }

            // A connection performs one request after HELLO. Reusing this pipe
            // instance keeps a warm owner continuously discoverable.
            let command = read_frame(pipe, ACK_TIMEOUT).ok();
            if let Some(command) = command {
                let message: ClientMessage = match serde_json::from_slice(&command) {
                    Ok(message) => message,
                    Err(_) => {
                        return write_error(pipe, "malformed_frame", "คำสั่ง handoff มีรูปแบบไม่ถูกต้อง");
                    }
                };
                match process_message(app, service, message) {
                    Ok(responses) => {
                        for response in responses {
                            write_value(pipe, &response)?;
                        }
                    }
                    Err(code) => write_error(pipe, &code, "ไม่สามารถยืนยันคำสั่ง handoff ได้")?,
                }
            }
            Ok(())
        })();
        let _ = unsafe { FlushFileBuffers(raw.cast()) };
        unsafe {
            DisconnectNamedPipe(raw.cast());
        }
        result
    }

    fn write_error(pipe: &mut File, code: &str, message: &str) -> Result<(), String> {
        write_value(
            pipe,
            &to_value(&ErrorFrame {
                frame_type: "ERROR",
                code,
                message,
            })?,
        )
    }

    fn write_value(pipe: &mut File, value: &Value) -> Result<(), String> {
        let payload = serde_json::to_vec(value).map_err(|_| "protocol_serialization_failed")?;
        if payload.is_empty() || payload.len() > MAX_FRAME_BYTES {
            return Err("frame_too_large".into());
        }
        pipe.write_all(&(payload.len() as u32).to_le_bytes())
            .map_err(|_| "pipe_write_failed")?;
        pipe.write_all(&payload).map_err(|_| "pipe_write_failed")?;
        pipe.flush().map_err(|_| "pipe_write_failed".into())
    }

    fn read_frame(pipe: &mut File, timeout: Duration) -> Result<Vec<u8>, String> {
        let deadline = Instant::now() + timeout;
        let header = read_exact_available(pipe, 4, deadline)?;
        let length = u32::from_le_bytes(header.try_into().map_err(|_| "malformed_frame")?) as usize;
        if length == 0 || length > MAX_FRAME_BYTES {
            return Err("frame_too_large".into());
        }
        read_exact_available(pipe, length, deadline)
    }

    fn read_exact_available(
        pipe: &mut File,
        len: usize,
        deadline: Instant,
    ) -> Result<Vec<u8>, String> {
        let mut output = vec![0u8; len];
        let raw = pipe.as_raw_handle();
        let mut offset = 0usize;
        while offset < len {
            let mut available = 0u32;
            if unsafe {
                PeekNamedPipe(
                    raw.cast(),
                    null_mut(),
                    0,
                    null_mut(),
                    &mut available,
                    null_mut(),
                )
            } == 0
            {
                return Err("pipe_disconnected".into());
            }
            if available > 0 {
                let take = (len - offset).min(available as usize);
                pipe.read_exact(&mut output[offset..offset + take])
                    .map_err(|_| "pipe_disconnected")?;
                offset += take;
                continue;
            }
            if Instant::now() >= deadline {
                return Err("delivery_unknown".into());
            }
            std::thread::sleep(Duration::from_millis(5));
        }
        Ok(output)
    }

    use std::os::windows::io::AsRawHandle;

    #[cfg(test)]
    mod tests {
        use super::*;
        use std::ptr::null;
        use std::time::{SystemTime, UNIX_EPOCH};
        use windows_sys::Win32::{
            Foundation::{
                ERROR_ACCESS_DENIED, ERROR_FILE_NOT_FOUND, ERROR_PIPE_BUSY, GENERIC_READ,
                GENERIC_WRITE,
            },
            Security::{
                CreateRestrictedToken, DuplicateTokenEx, ImpersonateLoggedOnUser,
                SecurityImpersonation, TokenImpersonation, DISABLE_MAX_PRIVILEGE,
                SID_AND_ATTRIBUTES, TOKEN_DUPLICATE, TOKEN_IMPERSONATE,
            },
            Storage::FileSystem::{CreateFileW, FILE_ATTRIBUTE_NORMAL, OPEN_EXISTING},
            System::Pipes::WaitNamedPipeW,
        };

        #[test]
        fn pipe_acl_and_same_logon_first_frame_are_enforced() {
            let sid = current_logon_sid().unwrap();
            assert_eq!(sddl_for_logon_sid(&sid), format!("D:P(A;;GA;;;{sid})"));
            assert_ne!(server_pipe_mode() & PIPE_REJECT_REMOTE_CLIENTS, 0);

            let nonce = format!(
                "{}.{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let name = format!("{PIPE_NAME_PREFIX}.test.{nonce}")
                .encode_utf16()
                .chain([0])
                .collect::<Vec<_>>();
            let pipe =
                create_server_pipe(&name, true).expect("same-session ACL should create the pipe");

            let (ready_tx, ready_rx) = mpsc::sync_channel(1);
            let server = std::thread::spawn(move || {
                let raw = pipe.as_raw_handle();
                ready_tx.send(()).unwrap();
                let connected = unsafe { ConnectNamedPipe(raw.cast(), null_mut::<OVERLAPPED>()) };
                assert!(connected != 0 || unsafe { GetLastError() } == ERROR_PIPE_CONNECTED);
                let mut pipe = pipe;
                let frame = read_initial_authorized_frame(&mut pipe)
                    .expect("read the HELLO frame before impersonating its same-logon client");
                serde_json::from_slice::<Value>(&frame).unwrap()
            });
            ready_rx
                .recv_timeout(Duration::from_secs(1))
                .expect("server thread should begin listening");

            assert_restricted_logon_client_is_denied(&name);

            let mut client = connect_test_client(&name);
            let hello = serde_json::json!({
                "type": "HELLO",
                "protocol": "lalin-play",
                "protocolVersion": 1
            });
            write_value(&mut client, &hello).unwrap();
            assert_eq!(server.join().unwrap(), hello);
        }

        #[test]
        #[ignore = "requires SMB Server and loopback named-pipe access"]
        fn remote_named_pipe_client_is_denied_with_local_positive_control() {
            assert_ne!(
                server_pipe_mode() & PIPE_REJECT_REMOTE_CLIENTS,
                0,
                "the target pipe must enable remote-client rejection"
            );
            let nonce = format!(
                "{}.{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let control_name = format!("{PIPE_NAME_PREFIX}.remote-control.{nonce}")
                .encode_utf16()
                .chain([0])
                .collect::<Vec<_>>();
            let control_pipe = create_test_pipe_with_dacl(
                &control_name,
                "D:P(A;;GA;;;AU)",
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            );
            let remote_control = remote_pipe_path(&control_name);
            let remote_control_client = open_pipe_client(&remote_control).unwrap_or_else(|error| {
                panic!("loopback SMB named-pipe positive control failed: {error}")
            });
            let control_raw = control_pipe.as_raw_handle();
            let connected =
                unsafe { ConnectNamedPipe(control_raw.cast(), null_mut::<OVERLAPPED>()) };
            assert!(
                connected != 0 || unsafe { GetLastError() } == ERROR_PIPE_CONNECTED,
                "loopback SMB control client should connect to a pipe without remote rejection"
            );
            unsafe {
                CloseHandle(remote_control_client);
            }
            drop(control_pipe);

            let target_name = format!("{PIPE_NAME_PREFIX}.remote-target.{nonce}")
                .encode_utf16()
                .chain([0])
                .collect::<Vec<_>>();
            let remote_target = remote_pipe_path(&target_name);
            // Keep the DACL identical to the control so this probe isolates the server mode flag.
            let target_pipe =
                create_test_pipe_with_dacl(&target_name, "D:P(A;;GA;;;AU)", server_pipe_mode());
            let remote_result = open_pipe_client(&remote_target);
            assert_eq!(
                remote_result.err(),
                Some(ERROR_ACCESS_DENIED),
                "a client using the UNC/SMB path must be denied by the protected handoff pipe"
            );
            drop(target_pipe);

            let local_pipe =
                create_test_pipe_with_dacl(&target_name, "D:P(A;;GA;;;AU)", server_pipe_mode());
            let local_client = connect_test_client(&target_name);
            drop(local_client);
            drop(local_pipe);
        }

        #[test]
        #[ignore = "requires a second Windows host running the repository PowerShell probe"]
        fn remote_named_pipe_client_from_another_host_is_denied() {
            assert_ne!(
                server_pipe_mode() & PIPE_REJECT_REMOTE_CLIENTS,
                0,
                "the target pipe must enable remote-client rejection"
            );
            let nonce = format!(
                "{}.{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let test_pipe_name = |role: &str| {
                format!("{PIPE_NAME_PREFIX}.remote-host-{nonce}.{role}")
                    .encode_utf16()
                    .chain([0])
                    .collect::<Vec<_>>()
            };
            let dacl = "D:P(A;;GA;;;AU)";
            let mode = PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT;
            let control_pipe = create_test_pipe_with_dacl(&test_pipe_name("control"), dacl, mode);
            let target_name = test_pipe_name("target");
            let target_pipe = create_test_pipe_with_dacl(&target_name, dacl, server_pipe_mode());
            let result_pipe = create_test_pipe_with_dacl(&test_pipe_name("result"), dacl, mode);

            let host = std::env::var("COMPUTERNAME")
                .expect("Windows should provide the named-pipe server host name");
            println!("REMOTE_PIPE_PROBE_READY host={host} nonce={nonce}");
            println!(
                "On another Windows host run tools/verify/lalin-play-remote-pipe-client.ps1 with the host and nonce above."
            );

            let (result_tx, result_rx) = std::sync::mpsc::sync_channel(1);
            let server = std::thread::spawn(move || {
                let mut control_pipe = control_pipe;
                let control_raw = control_pipe.as_raw_handle();
                let connected =
                    unsafe { ConnectNamedPipe(control_raw.cast(), null_mut::<OVERLAPPED>()) };
                if connected == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
                    let _ = result_tx.send(Err("remote positive-control pipe did not connect"));
                    return;
                }
                let mut marker = [0u8; 1];
                if control_pipe.read_exact(&mut marker).is_err() || marker != [b'C'] {
                    let _ = result_tx.send(Err("remote positive-control marker is invalid"));
                    return;
                }

                let mut result_pipe = result_pipe;
                let result_raw = result_pipe.as_raw_handle();
                let connected =
                    unsafe { ConnectNamedPipe(result_raw.cast(), null_mut::<OVERLAPPED>()) };
                if connected == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
                    let _ = result_tx.send(Err("remote result pipe did not connect"));
                    return;
                }
                let mut payload = [0u8; 64];
                if result_pipe.read_exact(&mut payload).is_err() {
                    let _ = result_tx.send(Err("remote result payload was incomplete"));
                    return;
                }
                let result = String::from_utf8_lossy(&payload)
                    .trim_matches('\0')
                    .to_string();
                let _ = result_tx.send(Ok(result));
            });

            let result = result_rx
                .recv_timeout(Duration::from_secs(180))
                .expect("run the remote PowerShell client before the 180-second test deadline")
                .expect("remote positive-control and result pipes should connect");
            assert_eq!(result, "control=0;target=5");
            server.join().unwrap();

            let local_client = connect_test_client(&target_name);
            let target_raw = target_pipe.as_raw_handle();
            let connected =
                unsafe { ConnectNamedPipe(target_raw.cast(), null_mut::<OVERLAPPED>()) };
            assert!(
                connected != 0 || unsafe { GetLastError() } == ERROR_PIPE_CONNECTED,
                "a local client should still open the pipe protected from remote clients"
            );
            drop(local_client);
            drop(target_pipe);
        }

        #[test]
        #[ignore = "requires a second Windows logon session running the repository PowerShell probe"]
        fn different_logon_session_is_denied_by_the_pipe_acl() {
            let server_sid = current_logon_sid().expect("owner logon SID should be available");
            let nonce = format!(
                "{}.{}",
                std::process::id(),
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            );
            let test_pipe_name = |role: &str| {
                format!("{PIPE_NAME_PREFIX}.cross-session-{nonce}.{role}")
                    .encode_utf16()
                    .chain([0])
                    .collect::<Vec<_>>()
            };
            let mode = PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT;
            let control_pipe =
                create_test_pipe_with_dacl(&test_pipe_name("control"), "D:P(A;;GA;;;AU)", mode);
            let target_name = test_pipe_name("target");
            let target_pipe = create_test_pipe_with_dacl(
                &target_name,
                &sddl_for_logon_sid(&server_sid),
                server_pipe_mode(),
            );
            let result_pipe =
                create_test_pipe_with_dacl(&test_pipe_name("result"), "D:P(A;;GA;;;AU)", mode);

            let host = std::env::var("COMPUTERNAME")
                .expect("Windows should provide the named-pipe server host name");
            let account = format!(
                "{}\\{}",
                std::env::var("USERDOMAIN").unwrap_or_else(|_| ".".into()),
                std::env::var("USERNAME").expect("Windows should provide the current user name")
            );
            let probe_account = format!("{host}\\LalinPipeProbe0930");
            let script = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("..")
                .join("..")
                .join("tools")
                .join("verify")
                .join("lalin-play-cross-session-pipe-client.ps1")
                .canonicalize()
                .expect("cross-session client probe script should exist");
            let script_path = script.display().to_string();
            let script_path = script_path.strip_prefix(r"\\?\").unwrap_or(&script_path);
            println!(
                "CROSS_SESSION_PROBE_READY host={host} owner_user={account} probe_user={probe_account} nonce={nonce}"
            );
            println!(
                "Run in a separate logon session: runas /user:{probe_account} \"powershell.exe -NoProfile -ExecutionPolicy Bypass -File {} -Nonce {nonce}\"",
                script_path
            );

            let (result_tx, result_rx) = std::sync::mpsc::sync_channel(1);
            let server_sid_for_thread = server_sid.clone();
            let server = std::thread::spawn(move || {
                let result = (|| -> Result<String, &'static str> {
                    let mut control_pipe = control_pipe;
                    let control_raw = control_pipe.as_raw_handle();
                    let connected =
                        unsafe { ConnectNamedPipe(control_raw.cast(), null_mut::<OVERLAPPED>()) };
                    if connected == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
                        return Err("cross-session positive-control pipe did not connect");
                    }
                    let mut marker = [0u8; 1];
                    if control_pipe.read_exact(&mut marker).is_err() || marker != [b'C'] {
                        return Err("cross-session positive-control marker is invalid");
                    }

                    let mut client_session = 0u32;
                    let mut server_session = 0u32;
                    if unsafe {
                        GetNamedPipeClientSessionId(control_raw.cast(), &mut client_session)
                    } == 0
                        || unsafe {
                            GetNamedPipeServerSessionId(control_raw.cast(), &mut server_session)
                        } == 0
                        || client_session != server_session
                    {
                        return Err("probe must use a different logon in the same Windows session");
                    }
                    let client_sid = client_logon_sid(control_raw)
                        .map_err(|_| "could not read the probe client's logon SID")?;
                    if client_sid == server_sid_for_thread {
                        return Err(
                            "probe reused the owner logon SID instead of a new logon session",
                        );
                    }

                    let mut result_pipe = result_pipe;
                    let result_raw = result_pipe.as_raw_handle();
                    let connected =
                        unsafe { ConnectNamedPipe(result_raw.cast(), null_mut::<OVERLAPPED>()) };
                    if connected == 0 && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
                        return Err("cross-session result pipe did not connect");
                    }
                    let mut payload = [0u8; 64];
                    if result_pipe.read_exact(&mut payload).is_err() {
                        return Err("cross-session result payload was incomplete");
                    }
                    Ok(String::from_utf8_lossy(&payload)
                        .trim_matches('\0')
                        .to_string())
                })();
                let _ = result_tx.send(result);
            });

            let result = result_rx
                .recv_timeout(Duration::from_secs(180))
                .expect("run the cross-session PowerShell client before the 180-second deadline")
                .expect("cross-session positive-control and result pipes should connect");
            assert_eq!(result, "control=0;target=5");
            server.join().unwrap();

            let local_client = connect_test_client(&target_name);
            let target_raw = target_pipe.as_raw_handle();
            let connected =
                unsafe { ConnectNamedPipe(target_raw.cast(), null_mut::<OVERLAPPED>()) };
            assert!(
                connected != 0 || unsafe { GetLastError() } == ERROR_PIPE_CONNECTED,
                "the owner's logon session should still open the protected target pipe"
            );
            drop(local_client);
            drop(target_pipe);
        }

        fn client_logon_sid(pipe: HANDLE) -> Result<String, String> {
            if unsafe { ImpersonateNamedPipeClient(pipe) } == 0 {
                return Err("unable to impersonate the connected pipe client".into());
            }
            let mut token: HANDLE = null_mut();
            let opened =
                unsafe { OpenThreadToken(GetCurrentThread(), TOKEN_ACCESS, 1, &mut token) } != 0;
            let reverted = unsafe { RevertToSelf() } != 0;
            if !reverted {
                return Err("unable to revert from the connected pipe client".into());
            }
            if !opened {
                return Err("unable to inspect the connected pipe client token".into());
            }
            let sid = logon_sid_from_token(token);
            unsafe {
                CloseHandle(token);
            }
            sid
        }

        fn create_test_pipe_with_dacl(name: &[u16], sddl: &str, mode: u32) -> File {
            let sddl = sddl.encode_utf16().chain([0]).collect::<Vec<_>>();
            let mut descriptor = null_mut();
            assert_ne!(
                unsafe {
                    ConvertStringSecurityDescriptorToSecurityDescriptorW(
                        sddl.as_ptr(),
                        SDDL_REVISION_1,
                        &mut descriptor,
                        null_mut(),
                    )
                },
                0,
                "test pipe DACL should be valid"
            );
            let attributes = SECURITY_ATTRIBUTES {
                nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
                lpSecurityDescriptor: descriptor,
                bInheritHandle: 0,
            };
            let handle = unsafe {
                CreateNamedPipeW(
                    name.as_ptr(),
                    PIPE_ACCESS_DUPLEX | FILE_FLAG_FIRST_PIPE_INSTANCE,
                    mode,
                    1,
                    PIPE_CAP as u32,
                    PIPE_CAP as u32,
                    0,
                    &attributes,
                )
            };
            unsafe {
                LocalFree(descriptor.cast());
            }
            assert!(
                handle != INVALID_HANDLE_VALUE && !handle.is_null(),
                "loopback SMB control pipe should be created"
            );
            unsafe { File::from_raw_handle(handle as RawHandle) }
        }

        fn remote_pipe_path(name: &[u16]) -> Vec<u16> {
            let length = name
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(name.len());
            let local_name = String::from_utf16(&name[..length])
                .expect("local test pipe name should be valid UTF-16");
            let suffix = local_name
                .strip_prefix(r"\\.\pipe\")
                .expect("test pipe should use the local named-pipe namespace");
            format!(r"\\localhost\pipe\{suffix}")
                .encode_utf16()
                .chain([0])
                .collect()
        }

        fn open_pipe_client(name: &[u16]) -> Result<HANDLE, u32> {
            let handle = unsafe {
                CreateFileW(
                    name.as_ptr(),
                    GENERIC_READ | GENERIC_WRITE,
                    0,
                    null(),
                    OPEN_EXISTING,
                    FILE_ATTRIBUTE_NORMAL,
                    null_mut(),
                )
            };
            if handle == INVALID_HANDLE_VALUE || handle.is_null() {
                Err(unsafe { GetLastError() })
            } else {
                Ok(handle)
            }
        }

        fn assert_restricted_logon_client_is_denied(name: &[u16]) {
            let token = restricted_token_without_logon_sid();
            assert_ne!(unsafe { ImpersonateLoggedOnUser(token) }, 0);

            let deadline = Instant::now() + Duration::from_secs(3);
            let acl_result = loop {
                let handle = unsafe {
                    CreateFileW(
                        name.as_ptr(),
                        GENERIC_READ | GENERIC_WRITE,
                        0,
                        null(),
                        OPEN_EXISTING,
                        FILE_ATTRIBUTE_NORMAL,
                        null_mut(),
                    )
                };
                if handle != INVALID_HANDLE_VALUE && !handle.is_null() {
                    unsafe {
                        CloseHandle(handle);
                    }
                    break Err("restricted client unexpectedly opened the pipe".to_owned());
                }

                let error = unsafe { GetLastError() };
                if error == ERROR_ACCESS_DENIED {
                    break Ok(());
                }
                if error != ERROR_PIPE_BUSY && error != ERROR_FILE_NOT_FOUND {
                    break Err(format!(
                        "unexpected restricted named-pipe client error: {error}"
                    ));
                }
                if Instant::now() >= deadline {
                    break Err("timed out waiting for restricted client ACL decision".into());
                }
                std::thread::sleep(Duration::from_millis(5));
            };

            let reverted = unsafe { RevertToSelf() } != 0;
            unsafe {
                CloseHandle(token);
            }
            assert!(reverted, "test thread impersonation must be reverted");
            assert!(
                acl_result.is_ok(),
                "a client without the pipe logon SID must be denied: {}",
                acl_result.unwrap_err()
            );
        }

        fn restricted_token_without_logon_sid() -> HANDLE {
            let mut source = null_mut();
            assert_ne!(
                unsafe {
                    OpenProcessToken(
                        GetCurrentProcess(),
                        TOKEN_DUPLICATE | TOKEN_QUERY,
                        &mut source,
                    )
                },
                0
            );

            let mut needed = 0u32;
            unsafe {
                GetTokenInformation(source, TokenLogonSid, null_mut(), 0, &mut needed);
            }
            assert!(needed > 0, "current logon SID must be available");
            let mut groups_buffer = vec![0u8; needed as usize];
            assert_ne!(
                unsafe {
                    GetTokenInformation(
                        source,
                        TokenLogonSid,
                        groups_buffer.as_mut_ptr().cast(),
                        needed,
                        &mut needed,
                    )
                },
                0
            );
            let groups = unsafe { &*(groups_buffer.as_ptr().cast::<TOKEN_GROUPS>()) };
            let entries = unsafe {
                std::slice::from_raw_parts(groups.Groups.as_ptr(), groups.GroupCount as usize)
            };
            let logon_sid = entries
                .iter()
                .find(|entry| entry.Attributes & 0xc000_0000 == 0xc000_0000)
                .expect("current token must contain its logon SID");
            let sid_to_disable = SID_AND_ATTRIBUTES {
                Sid: logon_sid.Sid,
                Attributes: 0,
            };

            let mut restricted = null_mut();
            assert_ne!(
                unsafe {
                    CreateRestrictedToken(
                        source,
                        DISABLE_MAX_PRIVILEGE,
                        1,
                        &sid_to_disable,
                        0,
                        null(),
                        0,
                        null(),
                        &mut restricted,
                    )
                },
                0
            );
            let mut impersonation = null_mut();
            let duplicated = unsafe {
                DuplicateTokenEx(
                    restricted,
                    TOKEN_QUERY | TOKEN_IMPERSONATE,
                    null(),
                    SecurityImpersonation,
                    TokenImpersonation,
                    &mut impersonation,
                )
            } != 0;
            unsafe {
                CloseHandle(restricted);
                CloseHandle(source);
            }
            assert!(duplicated, "restricted client token must be impersonable");
            impersonation
        }

        fn connect_test_client(name: &[u16]) -> File {
            let deadline = Instant::now() + Duration::from_secs(3);
            loop {
                let handle = unsafe {
                    CreateFileW(
                        name.as_ptr(),
                        GENERIC_READ | GENERIC_WRITE,
                        0,
                        null(),
                        OPEN_EXISTING,
                        FILE_ATTRIBUTE_NORMAL,
                        null_mut(),
                    )
                };
                if handle != INVALID_HANDLE_VALUE && !handle.is_null() {
                    return unsafe { File::from_raw_handle(handle as RawHandle) };
                }
                let error = unsafe { GetLastError() };
                assert!(
                    error == ERROR_PIPE_BUSY || error == ERROR_FILE_NOT_FOUND,
                    "unexpected named-pipe client error: {error}"
                );
                assert!(
                    Instant::now() < deadline,
                    "timed out connecting to test pipe"
                );
                unsafe {
                    WaitNamedPipeW(name.as_ptr(), 100);
                }
                std::thread::sleep(Duration::from_millis(5));
            }
        }
    }
}

#[cfg(not(windows))]
mod windows_pipe {
    use super::*;
    pub fn pipe_name() -> Result<Vec<u16>, String> {
        Err("Windows named pipes are unavailable".into())
    }
    pub fn create_server_pipe(_: &[u16], _: bool) -> Result<std::fs::File, String> {
        Err("Windows named pipes are unavailable".into())
    }
    pub fn serve(_: AppHandle, _: HandoffService, _: Vec<u16>, _: std::fs::File) {}
}

#[cfg(test)]
mod tests {
    use super::*;

    fn file() -> HandoffFile {
        HandoffFile {
            path: r"C:\media\song.wav".into(),
            title: Some("เพลง.wav".into()),
        }
    }

    #[test]
    fn contract_limits_frames_and_bounds_owner_history() {
        assert_eq!(PROTOCOL, "lalin-play");
        assert_eq!(PROTOCOL_VERSION, 1);
        assert!(MAX_FRAME_BYTES == 1024 * 1024);
        let mut core = OwnerState::default();
        for index in 0..MAX_HISTORY + 5 {
            let request_id = format!("00000000-0000-4000-8000-{index:012x}");
            let ack = ack_rejected("owner", &request_id, index as u64, "test", "test");
            remember(&mut core, &request_id, "fingerprint".into(), ack);
        }
        assert_eq!(core.history.len(), MAX_HISTORY);
        assert_eq!(core.history.front().unwrap().ack.revision, 5);
    }

    #[test]
    fn command_identity_rejects_replay_conflict_and_owner_change() {
        let mut core = OwnerState::default();
        core.owner_session = "session-a".into();
        let request_id = "00000000-0000-4000-8000-000000000001";
        let action = Action::AddToQueue;
        let original = fingerprint(&action, &file());
        remember(
            &mut core,
            request_id,
            original.clone(),
            ack_rejected("session-a", request_id, 4, "ok", "ok"),
        );
        let repeated = replay_disposition(&core, request_id, &original);
        let ReplayDisposition::Repeat(repeated_ack) = repeated else {
            panic!("duplicate should replay the cached ACK");
        };
        assert_eq!(repeated_ack, core.history.front().unwrap().ack);
        assert!(matches!(
            replay_disposition(&core, request_id, &fingerprint(&Action::Play, &file())),
            ReplayDisposition::Conflict
        ));
        assert_eq!(
            query_ack(&core, request_id, "session-a"),
            Some(repeated_ack)
        );
        assert_eq!(query_ack(&core, request_id, "session-b"), None);
        assert_eq!(
            validate_request(
                PROTOCOL,
                PROTOCOL_VERSION,
                request_id,
                "session-a",
                "session-a"
            ),
            Ok(())
        );
        assert_eq!(
            validate_request(
                PROTOCOL,
                PROTOCOL_VERSION,
                request_id,
                "session-a",
                "session-b"
            )
            .unwrap_err()
            .0,
            "owner_session_changed"
        );
    }

    #[test]
    fn snapshot_size_is_checked_without_truncating_queue_state() {
        let mut snapshot = HandoffSnapshot::default();
        snapshot.queue.push(QueueItemState {
            identity: "a".into(),
            title: "เพลง".repeat(300_000),
        });
        assert_eq!(
            validate_snapshot(&snapshot).unwrap_err(),
            "snapshot_too_large"
        );
        assert_eq!(snapshot.queue.len(), 1);
    }

    #[test]
    fn protocol_rejects_invalid_ids_and_versions() {
        assert!(!is_uuid("abc"));
        assert!(validate_request(
            PROTOCOL,
            9,
            "00000000-0000-4000-8000-000000000001",
            "s",
            "s"
        )
        .is_err());
    }

    #[test]
    fn receiver_validates_local_regular_media_files_before_granting_them() {
        let folder = tempfile::tempdir().unwrap();
        let path = folder.path().join("เพลง space.wav");
        std::fs::write(&path, b"RIFFfixture").unwrap();
        let canonical = validate_media_file(path.to_str().unwrap()).unwrap();
        assert_eq!(canonical, std::fs::canonicalize(path).unwrap());
        assert_eq!(
            validate_media_file(canonical.to_str().unwrap()).unwrap(),
            canonical
        );
        assert!(validate_media_file("https://example.test/audio.wav").is_err());
        assert!(validate_media_file("\\\\server\\share\\audio.wav").is_err());
        assert!(validate_media_file("\\\\?\\UNC\\server\\share\\audio.wav").is_err());
        assert!(
            validate_media_file("\\\\?\\GLOBALROOT\\Device\\HarddiskVolume1\\audio.wav").is_err()
        );
        assert!(validate_media_file("\\\\.\\PhysicalDrive0").is_err());
        assert!(validate_media_file(folder.path().to_str().unwrap()).is_err());
    }

    #[test]
    fn canonical_windows_media_paths_reject_network_and_device_roots() {
        assert!(is_local_windows_canonical(r"C:\media\song.wav"));
        assert!(is_local_windows_canonical(r"\\?\C:\media\song.wav"));
        assert!(!is_local_windows_canonical(r"\\server\share\song.wav"));
        assert!(!is_local_windows_canonical(
            r"\\?\UNC\server\share\song.wav"
        ));
        assert!(!is_local_windows_canonical(r"\\.\PhysicalDrive0"));
        assert!(!is_local_windows_canonical(
            r"\\?\GLOBALROOT\Device\HarddiskVolume1\song.wav"
        ));
    }

    #[test]
    fn canonical_drive_type_classifier_rejects_remote_and_unknown_drives() {
        assert_eq!(
            local_windows_drive_root(r"\\?\Z:\media\song.wav").as_deref(),
            Some("Z:\\")
        );
        assert!(is_local_windows_drive_type(DRIVE_FIXED));
        assert!(is_local_windows_drive_type(DRIVE_REMOVABLE));
        assert!(!is_local_windows_drive_type(DRIVE_REMOTE));
        assert!(!is_local_windows_drive_type(DRIVE_UNKNOWN));
        assert!(!is_local_windows_drive_type(DRIVE_NO_ROOT_DIR));
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires an isolated SMB mapped-drive media fixture"]
    fn mapped_network_drive_media_is_rejected_at_runtime() {
        let local = std::path::PathBuf::from(
            std::env::var_os("LALIN_PLAY_TEST_LOCAL_MEDIA")
                .expect("local positive-control fixture is required"),
        );
        let mapped = std::path::PathBuf::from(
            std::env::var_os("LALIN_PLAY_TEST_MAPPED_MEDIA")
                .expect("mapped-drive fixture is required"),
        );
        assert!(validate_media_file(local.to_str().expect("local path should be Unicode")).is_ok());
        assert_eq!(
            validate_media_file(mapped.to_str().expect("mapped path should be Unicode"))
                .unwrap_err(),
            "ไฟล์ที่ Studio ส่งมาต้องอยู่บน local drive"
        );
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "requires a local reparse fixture resolving to SMB mapped-drive media"]
    fn reparse_path_to_mapped_network_media_is_rejected_at_runtime() {
        let local = std::path::PathBuf::from(
            std::env::var_os("LALIN_PLAY_TEST_LOCAL_MEDIA")
                .expect("local positive-control fixture is required"),
        );
        let reparse = std::path::PathBuf::from(
            std::env::var_os("LALIN_PLAY_TEST_REPARSE_MEDIA")
                .expect("reparse-point fixture is required"),
        );
        assert!(validate_media_file(local.to_str().expect("local path should be Unicode")).is_ok());
        assert_eq!(
            validate_media_file(reparse.to_str().expect("reparse path should be Unicode"))
                .unwrap_err(),
            "ไฟล์ที่ Studio ส่งมาต้องอยู่บน local drive"
        );
    }
}
