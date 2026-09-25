use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::WebviewWindow;

const PROTOCOL: &str = "lalin-play";
const PROTOCOL_VERSION: u32 = 1;
const MAX_FRAME_BYTES: usize = 1024 * 1024;
const CONNECT_ATTEMPTS: usize = 100;
const ACK_TIMEOUT: Duration = Duration::from_secs(12);

#[derive(Clone, Default)]
pub struct StudioHandoffClient {
    serial: Arc<Mutex<()>>,
    uncertain: Arc<Mutex<Option<UncertainCommand>>>,
}

#[derive(Clone)]
struct UncertainCommand {
    request_id: String,
    owner_session: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HandoffFile {
    pub path: String,
    pub title: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaybackSnapshot {
    pub now_playing: NowPlayingSnapshot,
    pub queue: Vec<QueueItemSnapshot>,
    pub current_index: i32,
    pub volume: f64,
    pub muted: bool,
    pub eq: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NowPlayingSnapshot {
    pub identity: Option<String>,
    pub title: Option<String>,
    pub state: String,
    pub position: f64,
    pub duration: f64,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct QueueItemSnapshot {
    pub identity: String,
    pub title: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackReply {
    pub ack: PlaybackAck,
    pub state: PlaybackStateFrame,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackAck {
    #[serde(rename = "type")]
    pub frame_type: String,
    pub request_id: String,
    pub owner_session: String,
    pub result: String,
    pub revision: u64,
    pub error_code: Option<String>,
    pub message: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackStateFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
    pub owner_session: String,
    pub revision: u64,
    pub snapshot: PlaybackSnapshot,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadyFrame {
    #[serde(rename = "type")]
    frame_type: String,
    protocol: String,
    protocol_version: u32,
    owner_session: String,
    capabilities: Vec<String>,
    revision: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HelloFrame {
    #[serde(rename = "type")]
    frame_type: &'static str,
    protocol: &'static str,
    protocol_version: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandFrame<'a> {
    #[serde(rename = "type")]
    frame_type: &'static str,
    protocol: &'static str,
    protocol_version: u32,
    request_id: &'a str,
    owner_session: &'a str,
    action: &'a str,
    file: &'a HandoffFile,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QueryRequest<'a> {
    #[serde(rename = "type")]
    frame_type: &'static str,
    protocol: &'static str,
    protocol_version: u32,
    request_id: &'a str,
    owner_session: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GetStateFrame<'a> {
    #[serde(rename = "type")]
    frame_type: &'static str,
    protocol: &'static str,
    protocol_version: u32,
    owner_session: Option<&'a str>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QueryResult {
    #[serde(rename = "type")]
    frame_type: String,
    request_id: String,
    owner_session: String,
    status: String,
    ack: Option<PlaybackAck>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ErrorFrame {
    #[serde(rename = "type")]
    frame_type: String,
    code: String,
    message: String,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn handoff_playback(
    window: WebviewWindow,
    client: tauri::State<'_, StudioHandoffClient>,
    request_id: String,
    action: String,
    file: HandoffFile,
) -> Result<PlaybackReply, String> {
    require_main_window(&window)?;
    let client = client.inner().clone();
    tauri::async_runtime::spawn_blocking(move || send_playback(&client, request_id, action, file))
        .await
        .map_err(|error| format!("Native Lalin Play handoff หยุดทำงาน: {error}"))?
}

#[tauri::command]
pub async fn focus_play_window(window: WebviewWindow) -> Result<(), String> {
    require_main_window(&window)?;
    tauri::async_runtime::spawn_blocking(focus_play).await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_playback_state(
    window: WebviewWindow,
    client: tauri::State<'_, StudioHandoffClient>,
) -> Result<Option<PlaybackStateFrame>, String> {
    require_main_window(&window)?;
    let client = client.inner().clone();
    tauri::async_runtime::spawn_blocking(move || read_playback_state(&client))
        .await
        .map_err(|error| format!("อ่านสถานะ Lalin Play ไม่สำเร็จ: {error}"))?
}

#[tauri::command]
pub async fn reconcile_playback_handoff(
    window: WebviewWindow,
    client: tauri::State<'_, StudioHandoffClient>,
) -> Result<PlaybackReply, String> {
    require_main_window(&window)?;
    let client = client.inner().clone();
    tauri::async_runtime::spawn_blocking(move || reconcile_pending(&client))
        .await
        .map_err(|error| format!("ตรวจคำสั่ง Lalin Play ไม่สำเร็จ: {error}"))?
}

fn require_main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("คำสั่ง Studio-to-Play ใช้ได้จากหน้าต่างหลักของ Studio เท่านั้น".into()) }
}

fn is_uuid(value: &str) -> bool {
    value.len() == 36 && value.chars().enumerate().all(|(index, ch)| match index {
        8 | 13 | 18 | 23 => ch == '-',
        _ => ch.is_ascii_hexdigit(),
    })
}

fn validate_media_file(raw: &str, title: &Option<String>) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.len() > 4096 || raw.contains('\0') || raw.starts_with("\\\\") || raw.starts_with("//") || raw.starts_with("\\\\.\\") || raw.starts_with("\\\\?\\") {
        return Err("ไฟล์ handoff ต้องเป็น local file path ที่เลือกจาก Studio".into());
    }
    if !Path::new(raw).is_absolute() {
        return Err("ไฟล์ handoff ต้องเป็น local file path ที่เลือกจาก Studio".into());
    }
    if title.as_ref().is_some_and(|value| value.trim().is_empty() || value.chars().count() > 512) {
        return Err("ชื่อไฟล์สำหรับ Lalin Play ว่างหรือยาวเกิน 512 ตัวอักษร".into());
    }
    let path = std::fs::canonicalize(raw).map_err(|_| "ไม่พบไฟล์ที่เลือก หรือไฟล์ถูกย้ายแล้ว".to_string())?;
    if !path.is_file() { return Err("รายการที่เลือกไม่ใช่ไฟล์ปกติ".into()); }
    let ext = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    if !["mp3", "wav", "flac", "ogg", "opus", "m4a", "aac", "aif", "aiff", "wma", "mp4", "webm"].contains(&ext.as_str()) {
        return Err("ไฟล์ชนิดนี้ยังไม่รองรับใน Lalin Play".into());
    }
    Ok(path)
}

fn send_playback(client: &StudioHandoffClient, request_id: String, action: String, file: HandoffFile) -> Result<PlaybackReply, String> {
    if !is_uuid(&request_id) { return Err("รหัส handoff ไม่ถูกต้อง".into()); }
    if !["play", "play-next", "add-to-queue"].contains(&action.as_str()) { return Err("คำสั่ง playback นี้ไม่รองรับ".into()); }
    let canonical = validate_media_file(&file.path, &file.title)?;
    let file = HandoffFile { path: canonical.to_string_lossy().into_owned(), title: file.title };
    let _serial = client.serial.lock().map_err(|_| "Studio handoff queue ใช้งานไม่ได้")?;
    if client.uncertain.lock().map_err(|_| "Studio handoff state ใช้งานไม่ได้")?.is_some() {
        return Err("delivery_unknown: ตรวจผลคำสั่งก่อนหน้าก่อนส่งคำสั่งใหม่".into());
    }
    let expected_executable = resolve_play_executable()?;
    let name = windows_pipe::pipe_name()?;
    let (mut pipe, _cold_launch) = connect_with_launch(
        || windows_pipe::open_client(&name, &expected_executable),
        || spawn_play(&expected_executable),
        || std::thread::sleep(Duration::from_millis(100)),
        CONNECT_ATTEMPTS,
    )?;
    let (owner_session, _initial_state) = handshake(&mut pipe)?;
    let command = CommandFrame {
        frame_type: "COMMAND",
        protocol: PROTOCOL,
        protocol_version: PROTOCOL_VERSION,
        request_id: &request_id,
        owner_session: &owner_session,
        action: &action,
        file: &file,
    };
    let written = write_frame(&mut pipe, &command);
    let result = written.and_then(|_| receive_ack_and_state(&mut pipe, &request_id, &owner_session));
    match result {
        Ok(reply) => Ok(reply),
        Err(error) if error.starts_with("delivery_unknown") || error == "pipe_disconnected" || error == "pipe_read_timeout" => {
            match reconcile_request(&name, &expected_executable, &request_id, &owner_session) {
                Ok(reply) => Ok(reply),
                Err(_) => {
                    *client.uncertain.lock().map_err(|_| "Studio handoff state ใช้งานไม่ได้")? = Some(UncertainCommand {
                        request_id,
                        owner_session,
                    });
                    Err("delivery_unknown: ตรวจ ACK เดิมไม่สำเร็จ กรุณาตรวจสถานะก่อนส่งคำสั่งใหม่".into())
                }
            }
        }
        Err(error) => Err(error),
    }
}

fn read_playback_state(client: &StudioHandoffClient) -> Result<Option<PlaybackStateFrame>, String> {
    let _serial = client.serial.lock().map_err(|_| "Studio handoff queue ใช้งานไม่ได้")?;
    let executable = match resolve_play_executable() {
        Ok(path) => path,
        Err(_) => return Ok(None),
    };
    let name = windows_pipe::pipe_name()?;
    let Some(mut pipe) = windows_pipe::open_client(&name, &executable)? else { return Ok(None); };
    let (owner_session, _) = handshake(&mut pipe)?;
    write_frame(&mut pipe, &GetStateFrame {
        frame_type: "GET_STATE", protocol: PROTOCOL,
        protocol_version: PROTOCOL_VERSION, owner_session: Some(&owner_session),
    })?;
    read_state(&mut pipe).map(Some)
}

fn reconcile_pending(client: &StudioHandoffClient) -> Result<PlaybackReply, String> {
    let _serial = client.serial.lock().map_err(|_| "Studio handoff queue ใช้งานไม่ได้")?;
    let uncertain = client
        .uncertain
        .lock()
        .map_err(|_| "Studio handoff state ใช้งานไม่ได้")?
        .clone()
        .ok_or_else(|| "ไม่มีคำสั่ง handoff ที่รอ reconciliation".to_string())?;
    let executable = resolve_play_executable()?;
    let name = windows_pipe::pipe_name()?;
    let reply = reconcile_request(&name, &executable, &uncertain.request_id, &uncertain.owner_session)?;
    *client.uncertain.lock().map_err(|_| "Studio handoff state ใช้งานไม่ได้")? = None;
    Ok(reply)
}

fn focus_play() -> Result<(), String> {
    let executable = resolve_play_executable()?;
    spawn_play(&executable)
}

fn spawn_play(executable: &Path) -> Result<(), String> {
    Command::new(executable)
        .stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|_| "ไม่สามารถเปิด Lalin Play ได้ กรุณาติดตั้งหรือกำหนด LALIN_PLAY_EXECUTABLE".into())
}

fn connect_with_launch<T, C, L, W>(
    mut connect: C,
    launch: L,
    mut wait: W,
    attempts: usize,
) -> Result<(T, bool), String>
where
    C: FnMut() -> Result<Option<T>, String>,
    L: FnOnce() -> Result<(), String>,
    W: FnMut(),
{
    if let Some(pipe) = connect()? { return Ok((pipe, false)); }
    launch()?;
    for _ in 0..attempts {
        wait();
        if let Some(pipe) = connect()? { return Ok((pipe, true)); }
    }
    Err("Lalin Play เริ่มไม่ทันกำหนด กรุณาเปิดแอปแล้วตรวจสถานะอีกครั้ง".into())
}

fn handshake(pipe: &mut std::fs::File) -> Result<(String, PlaybackStateFrame), String> {
    write_frame(pipe, &HelloFrame { frame_type: "HELLO", protocol: PROTOCOL, protocol_version: PROTOCOL_VERSION })?;
    let ready_value = read_value(pipe, ACK_TIMEOUT)?;
    if ready_value.get("type").and_then(Value::as_str) == Some("ERROR") { return Err(server_error(ready_value)?); }
    let ready: ReadyFrame = serde_json::from_value(ready_value).map_err(|_| "Lalin Play ส่ง READY ที่ไม่ถูกต้อง".to_string())?;
    if ready.frame_type != "READY" || ready.protocol != PROTOCOL || ready.protocol_version != PROTOCOL_VERSION || !is_uuid(&ready.owner_session) {
        return Err("Lalin Play ใช้ protocol ที่ Studio ไม่รองรับ".into());
    }
    if !["play", "play-next", "add-to-queue"].iter().all(|action| ready.capabilities.iter().any(|capability| capability == action)) {
        return Err("Lalin Play ไม่รองรับชุดคำสั่ง handoff นี้".into());
    }
    let state = read_state(pipe)?;
    if state.owner_session != ready.owner_session || state.revision < ready.revision {
        return Err("Lalin Play เปลี่ยน owner ระหว่างเชื่อมต่อ; กรุณาตรวจสถานะแล้วสั่งใหม่".into());
    }
    Ok((ready.owner_session, state))
}

fn receive_ack_and_state(pipe: &mut std::fs::File, request_id: &str, owner_session: &str) -> Result<PlaybackReply, String> {
    let value = read_value(pipe, ACK_TIMEOUT)
        .map_err(|_| "delivery_unknown: ACK ของ Lalin Play ยังยืนยันไม่ได้".to_string())?;
    if value.get("type").and_then(Value::as_str) == Some("ERROR") { return Err(server_error(value)?); }
    let ack: PlaybackAck = serde_json::from_value(value).map_err(|_| "delivery_unknown: ACK ของ Lalin Play ไม่ถูกต้อง".to_string())?;
    if ack.frame_type != "ACK" || ack.request_id != request_id || ack.owner_session != owner_session {
        return Err("delivery_unknown: ACK ของ Lalin Play ไม่ตรงกับคำสั่งนี้".into());
    }
    let state = read_state(pipe).map_err(|_| "delivery_unknown: STATE หลัง ACK ของ Lalin Play ยังยืนยันไม่ได้".to_string())?;
    if state.owner_session != owner_session || state.revision < ack.revision {
        return Err("delivery_unknown: STATE ของ Lalin Play ไม่ตรงกับ ACK".into());
    }
    Ok(PlaybackReply { ack, state })
}

fn reconcile_request(name: &[u16], executable: &Path, request_id: &str, owner_session: &str) -> Result<PlaybackReply, String> {
    let mut pipe = windows_pipe::open_client(name, executable)?
        .ok_or_else(|| "delivery_unknown: ไม่สามารถเชื่อมต่อกลับเพื่อยืนยันคำสั่งได้".to_string())?;
    let (current_owner, _) = handshake(&mut pipe)
        .map_err(|_| "delivery_unknown: ไม่สามารถยืนยันสถานะคำสั่งได้".to_string())?;
    if current_owner != owner_session {
        return Err("delivery_unknown: Lalin Play เริ่ม session ใหม่แล้ว; ตรวจสถานะก่อนกดสั่งอีกครั้ง".into());
    }
    write_frame(&mut pipe, &QueryRequest {
        frame_type: "QUERY_REQUEST", protocol: PROTOCOL, protocol_version: PROTOCOL_VERSION,
        request_id, owner_session,
    })?;
    let value = read_value(&mut pipe, ACK_TIMEOUT)
        .map_err(|_| "delivery_unknown: ไม่พบ ACK เดิมใน owner session ปัจจุบัน".to_string())?;
    if value.get("type").and_then(Value::as_str) == Some("ERROR") { return Err(server_error(value)?); }
    let query: QueryResult = serde_json::from_value(value).map_err(|_| "delivery_unknown: ผล reconciliation ไม่ถูกต้อง".to_string())?;
    let state = read_state(&mut pipe).map_err(|_| "delivery_unknown: STATE reconciliation ไม่สำเร็จ".to_string())?;
    if query.frame_type != "QUERY_RESULT" || query.request_id != request_id || query.owner_session != owner_session || query.status != "found" {
        return Err("delivery_unknown: Lalin Play ยังไม่มีผลบันทึกสำหรับคำสั่งนี้; อย่าส่งซ้ำอัตโนมัติ".into());
    }
    let ack = query.ack.ok_or("delivery_unknown: ACK ที่บันทึกไว้หายไป")?;
    if ack.request_id != request_id || ack.owner_session != owner_session || state.revision < ack.revision {
        return Err("delivery_unknown: ACK และ STATE reconciliation ไม่ตรงกัน".into());
    }
    Ok(PlaybackReply { ack, state })
}

fn read_state(pipe: &mut std::fs::File) -> Result<PlaybackStateFrame, String> {
    let value = read_value(pipe, ACK_TIMEOUT)?;
    if value.get("type").and_then(Value::as_str) == Some("ERROR") { return Err(server_error(value)?); }
    let state: PlaybackStateFrame = serde_json::from_value(value).map_err(|_| "Lalin Play ส่ง STATE ที่ไม่ถูกต้อง".to_string())?;
    if state.frame_type != "STATE" { return Err("Lalin Play ไม่ได้ส่ง STATE".into()); }
    Ok(state)
}

fn server_error(value: Value) -> Result<String, String> {
    let frame: ErrorFrame = serde_json::from_value(value).map_err(|_| "Lalin Play ตอบกลับเป็นข้อมูลที่ไม่รู้จัก".to_string())?;
    if frame.frame_type != "ERROR" { return Err("Lalin Play ตอบกลับเป็นข้อมูลที่ไม่รู้จัก".into()); }
    if frame.code == "delivery_unknown" { Err("delivery_unknown".into()) }
    else { Err(frame.message) }
}

fn write_frame<T: Serialize>(pipe: &mut std::fs::File, value: &T) -> Result<(), String> {
    use std::io::Write;
    let payload = serde_json::to_vec(value).map_err(|_| "สร้าง frame handoff ไม่สำเร็จ".to_string())?;
    if payload.is_empty() || payload.len() > MAX_FRAME_BYTES { return Err("frame_too_large".into()); }
    pipe.write_all(&(payload.len() as u32).to_le_bytes()).map_err(|_| "delivery_unknown".to_string())?;
    pipe.write_all(&payload).map_err(|_| "delivery_unknown".to_string())?;
    pipe.flush().map_err(|_| "delivery_unknown".to_string())
}

fn read_value(pipe: &mut std::fs::File, timeout: Duration) -> Result<Value, String> {
    let bytes = windows_pipe::read_frame(pipe, timeout)?;
    serde_json::from_slice(&bytes).map_err(|_| "Lalin Play ส่ง JSON frame ที่ไม่ถูกต้อง".into())
}

fn resolve_play_executable() -> Result<PathBuf, String> {
    let candidate = if let Ok(raw) = std::env::var("LALIN_PLAY_EXECUTABLE") {
        let raw = raw.trim().trim_matches('"');
        PathBuf::from(raw)
    } else {
        windows_pipe::registered_app_path().ok_or_else(|| "ยังไม่พบ Lalin Play ที่ติดตั้งแล้ว; ตั้งค่า LALIN_PLAY_EXECUTABLE ให้ชี้ไปยัง lalin-play.exe".to_string())?
    };
    let path = std::fs::canonicalize(&candidate).map_err(|_| "ไม่พบ Lalin Play executable ที่กำหนดไว้".to_string())?;
    if !path.is_file() || !path.file_name().and_then(|name| name.to_str()).is_some_and(|name| name.eq_ignore_ascii_case("lalin-play.exe")) {
        return Err("ค่า Lalin Play executable ต้องชี้ไปยังไฟล์ lalin-play.exe ที่มีอยู่จริง".into());
    }
    Ok(path)
}

#[cfg(windows)]
mod windows_pipe {
    use super::*;
    use std::{
        fs::File,
        io::Read,
        os::windows::io::{AsRawHandle, FromRawHandle, RawHandle},
        ptr::{null, null_mut},
        time::Instant,
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, LocalFree, ERROR_FILE_NOT_FOUND, ERROR_PIPE_BUSY, ERROR_SUCCESS, GENERIC_READ, GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE},
        Security::{GetTokenInformation, TOKEN_GROUPS, TOKEN_QUERY, TokenLogonSid},
        Security::Authorization::ConvertSidToStringSidW,
        Storage::FileSystem::{CreateFileW, FILE_ATTRIBUTE_NORMAL, OPEN_EXISTING},
        System::{
            Pipes::{GetNamedPipeServerProcessId, GetNamedPipeServerSessionId, PeekNamedPipe, WaitNamedPipeW},
            RemoteDesktop::ProcessIdToSessionId,
            Registry::{RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, REG_SZ},
            Threading::{GetCurrentProcess, GetCurrentProcessId, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
        },
    };

    const PIPE_PREFIX: &str = r"\\.\pipe\ai.lalin.play.handoff.v1";

    pub fn pipe_name() -> Result<Vec<u16>, String> {
        let sid = current_logon_sid()?;
        let hash = sid.as_bytes().iter().fold(0xcbf29ce484222325u64, |acc, value| (acc ^ u64::from(*value)).wrapping_mul(0x100000001b3));
        Ok(format!("{PIPE_PREFIX}.{hash:016x}").encode_utf16().chain([0]).collect())
    }

    fn current_logon_sid() -> Result<String, String> {
        let mut token: HANDLE = null_mut();
        unsafe {
            if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 { return Err("ไม่สามารถอ่าน Windows logon session ได้".into()); }
        }
        let result = logon_sid_from_token(token);
        unsafe { CloseHandle(token); }
        result
    }

    fn logon_sid_from_token(token: HANDLE) -> Result<String, String> {
        let mut needed = 0u32;
        unsafe { GetTokenInformation(token, TokenLogonSid, null_mut(), 0, &mut needed); }
        if needed == 0 || needed > 64 * 1024 { return Err("Windows logon SID ใช้งานไม่ได้".into()); }
        let mut buffer = vec![0u8; needed as usize];
        unsafe {
            if GetTokenInformation(token, TokenLogonSid, buffer.as_mut_ptr().cast(), needed, &mut needed) == 0 { return Err("ไม่สามารถอ่าน Windows logon SID ได้".into()); }
            let groups = &*(buffer.as_ptr().cast::<TOKEN_GROUPS>());
            let entries = std::slice::from_raw_parts(groups.Groups.as_ptr(), groups.GroupCount as usize);
            let sid = entries.iter().find(|entry| entry.Attributes & 0xc000_0000 == 0xc000_0000).ok_or("ไม่พบ Windows logon SID")?;
            let mut text = null_mut();
            if ConvertSidToStringSidW(sid.Sid, &mut text) == 0 { return Err("ไม่สามารถแปลง Windows logon SID ได้".into()); }
            let mut len = 0;
            while *text.add(len) != 0 { len += 1; }
            let value = String::from_utf16_lossy(std::slice::from_raw_parts(text, len));
            LocalFree(text.cast());
            Ok(value)
        }
    }

    pub fn open_client(name: &[u16], expected_executable: &Path) -> Result<Option<File>, String> {
        let handle = unsafe { CreateFileW(name.as_ptr(), GENERIC_READ | GENERIC_WRITE, 0, null(), OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, null_mut()) };
        if handle == INVALID_HANDLE_VALUE || handle.is_null() {
            let error = unsafe { GetLastError() };
            if error == ERROR_PIPE_BUSY { unsafe { WaitNamedPipeW(name.as_ptr(), 250); } return Ok(None); }
            if error == ERROR_FILE_NOT_FOUND { return Ok(None); }
            return Err("named pipe Lalin Play ถูกปฏิเสธหรือไม่ปลอดภัย".into());
        }
        let pipe = unsafe { File::from_raw_handle(handle as RawHandle) };
        verify_server(pipe.as_raw_handle().cast(), expected_executable)?;
        Ok(Some(pipe))
    }

    fn verify_server(pipe: HANDLE, expected_executable: &Path) -> Result<(), String> {
        let mut pipe_session = 0u32;
        let mut current_session = 0u32;
        let mut pid = 0u32;
        if unsafe { GetNamedPipeServerSessionId(pipe, &mut pipe_session) } == 0
            || unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut current_session) } == 0
            || pipe_session != current_session
            || unsafe { GetNamedPipeServerProcessId(pipe, &mut pid) } == 0
        {
            return Err("Lalin Play pipe ไม่ได้อยู่ใน Windows session ปัจจุบัน".into());
        }
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() { return Err("ไม่สามารถยืนยัน process ของ Lalin Play ได้".into()); }
        let mut buffer = vec![0u16; 32_768];
        let mut length = buffer.len() as u32;
        let queried = unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length) } != 0;
        unsafe { CloseHandle(process); }
        if !queried { return Err("ไม่สามารถยืนยัน executable ของ Lalin Play ได้".into()); }
        let running = PathBuf::from(String::from_utf16_lossy(&buffer[..length as usize]));
        let running = std::fs::canonicalize(running).map_err(|_| "Lalin Play pipe owner ไม่ใช่ executable ที่ติดตั้งไว้".to_string())?;
        let expected = std::fs::canonicalize(expected_executable).map_err(|_| "Lalin Play executable เปลี่ยนตำแหน่งระหว่าง handoff".to_string())?;
        if !running.to_string_lossy().eq_ignore_ascii_case(&expected.to_string_lossy()) {
            return Err("Lalin Play pipe ถูกสร้างโดย executable ที่ไม่ตรงกับแอปที่กำหนดไว้".into());
        }
        Ok(())
    }

    pub fn read_frame(pipe: &mut File, timeout: Duration) -> Result<Vec<u8>, String> {
        let deadline = Instant::now() + timeout;
        let header = read_available(pipe, 4, deadline)?;
        let length = u32::from_le_bytes(header.try_into().map_err(|_| "malformed_frame")?) as usize;
        if length == 0 || length > MAX_FRAME_BYTES { return Err("frame_too_large".into()); }
        read_available(pipe, length, deadline)
    }

    fn read_available(pipe: &mut File, len: usize, deadline: Instant) -> Result<Vec<u8>, String> {
        let mut output = vec![0u8; len];
        let mut offset = 0usize;
        while offset < len {
            let mut available = 0u32;
            if unsafe { PeekNamedPipe(pipe.as_raw_handle().cast(), null_mut(), 0, null_mut(), &mut available, null_mut()) } == 0 {
                return Err("pipe_disconnected".into());
            }
            if available > 0 {
                let take = (len - offset).min(available as usize);
                pipe.read_exact(&mut output[offset..offset + take]).map_err(|_| "pipe_disconnected")?;
                offset += take;
                continue;
            }
            if Instant::now() >= deadline { return Err("delivery_unknown".into()); }
            std::thread::sleep(Duration::from_millis(5));
        }
        Ok(output)
    }

    pub fn registered_app_path() -> Option<PathBuf> {
        app_path_from(HKEY_CURRENT_USER).or_else(|| app_path_from(HKEY_LOCAL_MACHINE))
    }

    fn app_path_from(root: HKEY) -> Option<PathBuf> {
        let key_path: Vec<u16> = "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\lalin-play.exe".encode_utf16().chain([0]).collect();
        let mut key: HKEY = null_mut();
        if unsafe { RegOpenKeyExW(root, key_path.as_ptr(), 0, KEY_READ, &mut key) } != ERROR_SUCCESS { return None; }
        let mut kind = 0u32;
        let mut bytes = 0u32;
        let first = unsafe { RegQueryValueExW(key, null(), null(), &mut kind, null_mut(), &mut bytes) };
        if first != ERROR_SUCCESS || kind != REG_SZ || bytes < 2 || bytes > 65_536 {
            unsafe { RegCloseKey(key); }
            return None;
        }
        let mut buffer = vec![0u8; bytes as usize];
        let result = unsafe { RegQueryValueExW(key, null(), null(), &mut kind, buffer.as_mut_ptr(), &mut bytes) };
        unsafe { RegCloseKey(key); }
        if result != ERROR_SUCCESS || bytes as usize > buffer.len() { return None; }
        let units: Vec<u16> = buffer[..bytes as usize].chunks_exact(2).map(|pair| u16::from_ne_bytes([pair[0], pair[1]])).collect();
        let raw = String::from_utf16_lossy(&units).trim_end_matches('\0').trim().trim_matches('"').to_string();
        if raw.is_empty() { None } else { Some(PathBuf::from(raw)) }
    }
}

#[cfg(not(windows))]
mod windows_pipe {
    use super::*;
    pub fn pipe_name() -> Result<Vec<u16>, String> { Err("Native Play handoff รองรับเฉพาะ Windows".into()) }
    pub fn open_client(_: &[u16], _: &Path) -> Result<Option<std::fs::File>, String> { Err("Native Play handoff รองรับเฉพาะ Windows".into()) }
    pub fn read_frame(_: &mut std::fs::File, _: Duration) -> Result<Vec<u8>, String> { Err("Native Play handoff รองรับเฉพาะ Windows".into()) }
    pub fn registered_app_path() -> Option<PathBuf> { None }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::Cell, rc::Rc};

    #[test]
    fn warm_handoff_reuses_play_without_spawning() {
        let launches = Cell::new(0);
        let (connection, cold) = connect_with_launch(
            || Ok(Some("warm pipe")),
            || { launches.set(launches.get() + 1); Ok(()) },
            || {},
            3,
        ).unwrap();
        assert_eq!(connection, "warm pipe");
        assert!(!cold);
        assert_eq!(launches.get(), 0);
    }

    #[test]
    fn cold_handoff_launches_once_then_connects_when_pipe_is_ready() {
        let started = Rc::new(Cell::new(false));
        let connect_started = started.clone();
        let launch_started = started.clone();
        let launches = Cell::new(0);
        let (connection, cold) = connect_with_launch(
            move || Ok(connect_started.get().then_some("new pipe")),
            || { launches.set(launches.get() + 1); launch_started.set(true); Ok(()) },
            || {},
            3,
        ).unwrap();
        assert_eq!(connection, "new pipe");
        assert!(cold);
        assert_eq!(launches.get(), 1);
    }

    #[test]
    fn unavailable_cold_start_times_out_after_one_launch() {
        let launches = Cell::new(0);
        let result = connect_with_launch(
            || Ok::<Option<()>, String>(None),
            || { launches.set(launches.get() + 1); Ok(()) },
            || {},
            2,
        );
        assert!(result.is_err());
        assert_eq!(launches.get(), 1);
    }

    #[test]
    fn media_command_validation_rejects_urls_and_non_media_paths() {
        assert!(validate_media_file("https://example.test/song.wav", &None).is_err());
        assert!(!is_uuid("not-a-request-id"));
        assert!(is_uuid("00000000-0000-4000-8000-000000000001"));
    }
}
