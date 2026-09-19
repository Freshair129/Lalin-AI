use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use socket2::{Domain, Protocol, Socket, Type};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

const MEDIA_LABEL: &str = "media";
const DIAL_EVENT: &str = "lalin-media-dial-request";
const SSDP_ADDRESS: Ipv4Addr = Ipv4Addr::new(239, 255, 255, 250);
const SSDP_PORT: u16 = 1900;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_BODY_BYTES: usize = 102_400;
const RESPONSE_WAIT: Duration = Duration::from_secs(5);
const APP_AGENT: &str = "VacuumTube/1.8.2";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DialInfo {
    pub host: String,
    pub port: u16,
    pub base: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DialRequest {
    request_id: String,
    method: String,
    path: String,
    body: String,
    host: String,
}

struct PendingResponse {
    status: u16,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

type ResponseStore = Arc<(Mutex<HashMap<String, PendingResponse>>, Condvar)>;

pub struct DialState {
    info: Option<DialInfo>,
    device_id: Arc<Mutex<String>>,
    responses: ResponseStore,
}

struct HttpRequest {
    method: String,
    path: String,
    body: String,
}

pub fn disabled_state() -> DialState {
    DialState {
        info: None,
        device_id: Arc::new(Mutex::new(String::new())),
        responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
    }
}

pub fn start(app: &AppHandle) -> Result<DialState, String> {
    let local_ip = local_ipv4().unwrap_or(Ipv4Addr::LOCALHOST);
    let device_id = Arc::new(Mutex::new(load_or_create_device_id(app)));
    let hostname = hostname();

    let http_listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, 0))
        .map_err(|error| format!("DIAL HTTP bind failed: {error}"))?;
    http_listener
        .set_nonblocking(true)
        .map_err(|error| format!("DIAL HTTP nonblocking setup failed: {error}"))?;
    let port = http_listener
        .local_addr()
        .map_err(|error| format!("DIAL HTTP address lookup failed: {error}"))?
        .port();

    let ssdp_socket = bind_ssdp_socket(local_ip)
        .map_err(|error| format!("DIAL SSDP bind failed on UDP {SSDP_PORT}: {error}"))?;
    ssdp_socket
        .set_read_timeout(Some(Duration::from_millis(500)))
        .map_err(|error| format!("DIAL SSDP timeout setup failed: {error}"))?;
    ssdp_socket
        .set_multicast_ttl_v4(2)
        .map_err(|error| format!("DIAL SSDP multicast setup failed: {error}"))?;
    ssdp_socket
        .join_multicast_v4(&SSDP_ADDRESS, &local_ip)
        .map_err(|error| format!("DIAL SSDP multicast membership failed: {error}"))?;

    let info = DialInfo {
        host: local_ip.to_string(),
        port,
        base: format!("http://{local_ip}:{port}"),
    };
    let responses = Arc::new((Mutex::new(HashMap::new()), Condvar::new()));
    let stop = Arc::new(AtomicBool::new(false));
    let state = DialState {
        info: Some(info.clone()),
        device_id: device_id.clone(),
        responses: responses.clone(),
    };

    let http_app = app.clone();
    let http_state = RuntimeState {
        info: info.clone(),
        device_id: device_id.clone(),
        hostname: hostname.clone(),
        responses,
        stop: stop.clone(),
    };
    thread::Builder::new()
        .name("lalin-dial-http".to_owned())
        .spawn(move || run_http(http_listener, http_app, http_state))
        .map_err(|error| format!("DIAL HTTP thread failed: {error}"))?;

    let ssdp_state = RuntimeState {
        info,
        device_id,
        hostname,
        responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
        stop,
    };
    thread::Builder::new()
        .name("lalin-dial-ssdp".to_owned())
        .spawn(move || run_ssdp(ssdp_socket, ssdp_state))
        .map_err(|error| format!("DIAL SSDP thread failed: {error}"))?;

    Ok(state)
}

#[derive(Clone)]
struct RuntimeState {
    info: DialInfo,
    device_id: Arc<Mutex<String>>,
    hostname: String,
    responses: ResponseStore,
    stop: Arc<AtomicBool>,
}

#[tauri::command]
pub fn dial_respond(
    request_id: String,
    status: u16,
    headers: Vec<(String, String)>,
    body: Option<String>,
    state: State<'_, DialState>,
) -> Result<(), String> {
    if !(100..=599).contains(&status) {
        return Err("DIAL response status is invalid".to_owned());
    }
    if request_id.len() > 128 {
        return Err("DIAL request id is too long".to_owned());
    }
    if headers.len() > 32 {
        return Err("DIAL response has too many headers".to_owned());
    }
    for (key, value) in &headers {
        if key.is_empty()
            || key.len() > 128
            || value.len() > 4096
            || key.contains(['\r', '\n'])
            || value.contains(['\r', '\n'])
        {
            return Err("DIAL response header is invalid".to_owned());
        }
    }

    let body = body.unwrap_or_default().into_bytes();
    if body.len() > MAX_BODY_BYTES {
        return Err("DIAL response body is too large".to_owned());
    }

    let (responses, wake) = &*state.responses;
    let mut pending = responses
        .lock()
        .map_err(|_| "DIAL response store is unavailable".to_owned())?;
    if !pending.contains_key(&request_id) {
        return Err("DIAL request has expired".to_owned());
    }
    pending.insert(
        request_id,
        PendingResponse {
            status,
            headers,
            body,
        },
    );
    wake.notify_all();
    Ok(())
}

#[tauri::command]
pub fn dial_get_info(state: State<'_, DialState>) -> Option<DialInfo> {
    state.info.clone()
}

#[tauri::command]
pub fn dial_set_device_id(device_id: String, state: State<'_, DialState>) -> Result<(), String> {
    if device_id.is_empty() || device_id.len() > 128 || device_id.contains(['\r', '\n', '<', '>']) {
        return Err("DIAL device id is invalid".to_owned());
    }
    let mut current = state
        .device_id
        .lock()
        .map_err(|_| "DIAL device identity is unavailable".to_owned())?;
    *current = device_id;
    Ok(())
}

fn run_http(listener: TcpListener, app: AppHandle, state: RuntimeState) {
    while !state.stop.load(Ordering::Relaxed) {
        match listener.accept() {
            Ok((mut stream, _)) => {
                let app = app.clone();
                let state = state.clone();
                let _ = thread::Builder::new()
                    .name("lalin-dial-http-request".to_owned())
                    .spawn(move || handle_http(&mut stream, &app, &state));
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                thread::sleep(Duration::from_millis(50));
            }
            Err(error) => {
                eprintln!("Lalin Media: DIAL HTTP accept failed: {error}");
                break;
            }
        }
    }
}

fn handle_http(stream: &mut TcpStream, app: &AppHandle, state: &RuntimeState) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
    let request = match read_http_request(stream) {
        Ok(request) => request,
        Err(HttpReadError::TooLarge) => {
            write_empty_response(stream, 413);
            return;
        }
        Err(HttpReadError::Invalid) => {
            write_empty_response(stream, 400);
            return;
        }
    };

    if request.method == "GET" && request.path == "/" {
        let body = device_description(state);
        let application_url = format!("{}/apps", state.info.base);
        let headers = vec![
            (
                "Content-Type".to_owned(),
                "text/xml; charset=\"utf-8\"".to_owned(),
            ),
            ("Application-URL".to_owned(), application_url),
        ];
        write_response(stream, 200, &headers, body.as_bytes());
        return;
    }

    if request.path == "/apps" || request.path.starts_with("/apps/") {
        let request_id = Uuid::new_v4().to_string();
        let dial_request = DialRequest {
            request_id: request_id.clone(),
            method: request.method,
            path: request.path,
            body: request.body,
            host: format!("{}:{}", state.info.host, state.info.port),
        };
        if app.emit_to(MEDIA_LABEL, DIAL_EVENT, &dial_request).is_err() {
            write_empty_response(stream, 503);
            return;
        }

        let response = wait_for_response(&state.responses, &request_id);
        match response {
            Some(response) => {
                write_response(stream, response.status, &response.headers, &response.body)
            }
            None => write_empty_response(stream, 504),
        }
        return;
    }

    write_empty_response(stream, 404);
}

fn run_ssdp(socket: UdpSocket, state: RuntimeState) {
    let mut buffer = [0_u8; 16 * 1024];
    while !state.stop.load(Ordering::Relaxed) {
        match socket.recv_from(&mut buffer) {
            Ok((size, source)) => {
                if is_dial_search(&buffer[..size]) {
                    let response = ssdp_response(&state);
                    let _ = socket.send_to(response.as_bytes(), source);
                }
            }
            Err(error)
                if matches!(
                    error.kind(),
                    io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                ) => {}
            Err(error) => {
                eprintln!("Lalin Media: DIAL SSDP receive failed: {error}");
                break;
            }
        }
    }
}

fn is_dial_search(message: &[u8]) -> bool {
    let text = String::from_utf8_lossy(message);
    let mut lines = text.lines();
    let first_line = lines.next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    if parts.next() != Some("M-SEARCH") || parts.next() != Some("*") {
        return false;
    }

    lines.any(|line| {
        let Some((key, value)) = line.split_once(':') else {
            return false;
        };
        key.eq_ignore_ascii_case("ST")
            && (value.trim().eq_ignore_ascii_case("ssdp:all")
                || value
                    .trim()
                    .eq_ignore_ascii_case("urn:dial-multiscreen-org:service:dial:1"))
    })
}

fn ssdp_response(state: &RuntimeState) -> String {
    let device_id = state
        .device_id
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    format!(
        "HTTP/1.1 200 OK\r\nCACHE-CONTROL: max-age=1800\r\nDATE: {}\r\nEXT:\r\nLOCATION: {}/\r\nSERVER: Windows/10 UPnP/1.0 {APP_AGENT}\r\nST: urn:dial-multiscreen-org:service:dial:1\r\nUSN: uuid:{}::urn:dial-multiscreen-org:service:dial:1\r\n\r\n",
        httpdate::fmt_http_date(std::time::SystemTime::now()),
        state.info.base,
        device_id
    )
}

fn device_description(state: &RuntimeState) -> String {
    let device_id = state
        .device_id
        .lock()
        .map(|value| value.clone())
        .unwrap_or_default();
    format!(
        "<?xml version=\"1.0\"?><root xmlns=\"urn:schemas-upnp-org:device-1-0\"><specVersion><major>1</major><minor>0</minor></specVersion><URLBase>{}</URLBase><device><deviceType>urn:dial-multiscreen-org:device:dial:1</deviceType><friendlyName>Lalin Media on {}</friendlyName><manufacturer>Lalin</manufacturer><modelName>VacuumTube 1.8.2 compatible</modelName><UDN>uuid:{}</UDN></device></root>",
        xml_escape(&state.info.base),
        xml_escape(&state.hostname),
        xml_escape(&device_id)
    )
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, HttpReadError> {
    let mut buffer = Vec::with_capacity(4096);
    let header_end = loop {
        let mut chunk = [0_u8; 4096];
        let read = stream
            .read(&mut chunk)
            .map_err(|_| HttpReadError::Invalid)?;
        if read == 0 {
            return Err(HttpReadError::Invalid);
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.len() > MAX_HEADER_BYTES + MAX_BODY_BYTES {
            return Err(HttpReadError::TooLarge);
        }
        if let Some(end) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            break end + 4;
        }
        if buffer.len() > MAX_HEADER_BYTES {
            return Err(HttpReadError::TooLarge);
        }
    };

    let header_text =
        std::str::from_utf8(&buffer[..header_end]).map_err(|_| HttpReadError::Invalid)?;
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next().ok_or(HttpReadError::Invalid)?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or(HttpReadError::Invalid)?
        .to_owned();
    let target = request_parts
        .next()
        .ok_or(HttpReadError::Invalid)?
        .to_owned();
    let version = request_parts.next().ok_or(HttpReadError::Invalid)?;
    if !version.starts_with("HTTP/") || method.len() > 16 || target.len() > MAX_HEADER_BYTES {
        return Err(HttpReadError::Invalid);
    }

    let content_length = lines
        .filter_map(|line| line.split_once(':'))
        .find(|(key, _)| key.eq_ignore_ascii_case("content-length"))
        .map(|(_, value)| {
            value
                .trim()
                .parse::<usize>()
                .map_err(|_| HttpReadError::Invalid)
        })
        .transpose()?
        .unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Err(HttpReadError::TooLarge);
    }
    while buffer.len() < header_end + content_length {
        let mut chunk = [0_u8; 4096];
        let read = stream
            .read(&mut chunk)
            .map_err(|_| HttpReadError::Invalid)?;
        if read == 0 {
            return Err(HttpReadError::Invalid);
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
    let body_bytes = &buffer[header_end..header_end + content_length];
    let body = String::from_utf8(body_bytes.to_vec()).map_err(|_| HttpReadError::Invalid)?;
    let path = target.split('?').next().unwrap_or(&target).to_owned();
    Ok(HttpRequest { method, path, body })
}

enum HttpReadError {
    Invalid,
    TooLarge,
}

fn wait_for_response(store: &ResponseStore, request_id: &str) -> Option<PendingResponse> {
    let (responses, wake) = &**store;
    let deadline = Instant::now() + RESPONSE_WAIT;
    let mut responses = responses.lock().ok()?;
    loop {
        if let Some(response) = responses.remove(request_id) {
            return Some(response);
        }
        let remaining = deadline.checked_duration_since(Instant::now())?;
        let (next, result) = wake.wait_timeout(responses, remaining).ok()?;
        responses = next;
        if result.timed_out() {
            responses.remove(request_id);
            return None;
        }
    }
}

fn write_empty_response(stream: &mut TcpStream, status: u16) {
    write_response(stream, status, &[], b"");
}

fn write_response(stream: &mut TcpStream, status: u16, headers: &[(String, String)], body: &[u8]) {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "Response",
    };
    let mut response = format!(
        "HTTP/1.1 {status} {reason}\r\nServer: Lalin Media\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (key, value) in headers {
        response.push_str(key);
        response.push_str(": ");
        response.push_str(value);
        response.push_str("\r\n");
    }
    response.push_str("\r\n");
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.write_all(body);
}

fn local_ipv4() -> io::Result<Ipv4Addr> {
    let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))?;
    socket.connect((Ipv4Addr::new(224, 0, 0, 0), 80))?;
    match socket.local_addr()?.ip() {
        IpAddr::V4(address) => Ok(address),
        IpAddr::V6(_) => Err(io::Error::new(
            io::ErrorKind::AddrNotAvailable,
            "IPv4 unavailable",
        )),
    }
}

fn bind_ssdp_socket(local_ip: Ipv4Addr) -> io::Result<UdpSocket> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
    socket.set_reuse_address(true)?;
    socket.bind(&std::net::SocketAddr::from((local_ip, SSDP_PORT)).into())?;
    Ok(socket.into())
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Lalin Media".to_owned())
}

fn load_or_create_device_id(app: &AppHandle) -> String {
    if let Ok(store) = app.store("media-settings.json") {
        if let Some(value) = store
            .get("dialDeviceId")
            .and_then(|value| value.as_str().map(str::to_owned))
        {
            if value.len() <= 128 && !value.contains(['\r', '\n', '<', '>']) {
                return value;
            }
        }
        let id = Uuid::new_v4().to_string();
        store.set("dialDeviceId", id.as_str());
        let _ = store.save();
        return id;
    }

    Uuid::new_v4().to_string()
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::{device_description, is_dial_search, ssdp_response, DialInfo, RuntimeState};
    use std::collections::HashMap;
    use std::sync::atomic::AtomicBool;
    use std::sync::{Arc, Condvar, Mutex};

    fn state() -> RuntimeState {
        RuntimeState {
            info: DialInfo {
                host: "192.168.1.5".to_owned(),
                port: 43210,
                base: "http://192.168.1.5:43210".to_owned(),
            },
            device_id: Arc::new(Mutex::new("device-123".to_owned())),
            hostname: "Lalin-PC".to_owned(),
            responses: Arc::new((Mutex::new(HashMap::new()), Condvar::new())),
            stop: Arc::new(AtomicBool::new(false)),
        }
    }

    #[test]
    fn accepts_dial_m_search_and_rejects_other_ssdp_messages() {
        let search = b"M-SEARCH * HTTP/1.1\r\nST: urn:dial-multiscreen-org:service:dial:1\r\n\r\n";
        let all = b"M-SEARCH * HTTP/1.1\r\nST: ssdp:all\r\n\r\n";
        let notify = b"NOTIFY * HTTP/1.1\r\nNT: ssdp:all\r\n\r\n";
        assert!(is_dial_search(search));
        assert!(is_dial_search(all));
        assert!(!is_dial_search(notify));
    }

    #[test]
    fn emits_dial_descriptor_and_ssdp_identity() {
        let state = state();
        let descriptor = device_description(&state);
        let response = ssdp_response(&state);
        assert!(descriptor.contains("urn:dial-multiscreen-org:device:dial:1"));
        assert!(!descriptor.contains("Application-URL"));
        assert!(descriptor.contains("Lalin-PC"));
        assert!(response.contains("LOCATION: http://192.168.1.5:43210/"));
        assert!(response.contains("USN: uuid:device-123::urn:dial-multiscreen-org:service:dial:1"));
    }
}
