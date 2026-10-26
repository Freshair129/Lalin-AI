const translations = {
  en: {
    eyebrow: 'Isolated browser capability check', scope: 'TLS feasibility', network: 'Local network only',
    'intro-title': 'Check this browser and secure connection',
    'intro-copy': 'This page checks secure-context and camera permission support, then sends one temporary nonce over same-origin WSS. It does not pair a device or control playback.',
    origin: 'Page origin', 'secure-context': 'Secure context', 'camera-api': 'Camera API', 'camera-permission': 'Camera permission',
    'browser-permission': 'Browser permission', 'camera-title': 'Camera capability',
    'camera-copy': 'Request access only when you press the button. If granted, the temporary camera track is stopped immediately.',
    'camera-button': 'Check camera access', 'same-origin': 'Same-origin transport', 'probe-title': 'WSS nonce probe',
    'probe-copy': 'Opens one secure WebSocket, sends one random nonce and checks the matching acknowledgement. No payload is logged or saved.',
    'probe-button': 'Run secure transport probe', footer: 'Feasibility harness only · no pairing, remote commands, queue, audio, or file access',
    'checks-label': 'Capability checks', language: 'Language', checking: 'Checking…', available: 'Available', unavailable: 'Unavailable',
    'not-exposed': 'Not exposed by this browser', 'permission-query-fallback': 'Query unavailable; use the button to check',
    prompt: 'prompt', granted: 'granted', denied: 'denied', 'camera-idle': 'No permission request has been made.',
    'camera-requesting': 'Requesting camera permission…', 'camera-granted': 'Permission granted. Temporary camera tracks were stopped.',
    'camera-denied': 'Permission was denied or blocked by browser policy.', 'camera-no-device': 'No camera device is available.',
    'camera-unavailable': 'Camera access is unavailable in this browser or device.',
    'waiting-https': 'Waiting for a secure page context.', 'open-https': 'Open this page through the configured HTTPS origin.',
    'probe-connecting': 'Connecting over same-origin WSS…', 'probe-invalid-response': 'The server returned an invalid probe response.',
    'probe-passed': 'Secure transport passed. The nonce matched.', 'probe-mismatch': 'The server response did not match this probe.',
    'probe-failed': 'Secure transport failed. Check certificate trust and the local network.',
    'probe-closed': 'The secure connection closed before the probe completed.', 'probe-timeout': 'The secure probe timed out.',
  },
  th: {
    eyebrow: 'ตรวจความสามารถของเบราว์เซอร์', scope: 'ทดสอบ TLS', network: 'ใช้ในเครือข่ายภายในเท่านั้น',
    'intro-title': 'ตรวจเบราว์เซอร์และการเชื่อมต่อที่ปลอดภัย',
    'intro-copy': 'หน้านี้ตรวจ secure context และการรองรับสิทธิ์กล้อง จากนั้นส่ง nonce ชั่วคราวหนึ่งครั้งผ่าน WSS ต้นทางเดียวกัน หน้านี้ไม่จับคู่อุปกรณ์และไม่ควบคุมการเล่นเพลง',
    origin: 'ต้นทางของหน้า', 'secure-context': 'Secure context', 'camera-api': 'Camera API', 'camera-permission': 'สิทธิ์กล้อง',
    'browser-permission': 'สิทธิ์ของเบราว์เซอร์', 'camera-title': 'ความสามารถของกล้อง',
    'camera-copy': 'จะขอสิทธิ์เมื่อกดปุ่มเท่านั้น หากอนุญาต ระบบจะหยุดแทร็กกล้องชั่วคราวทันที',
    'camera-button': 'ตรวจสิทธิ์กล้อง', 'same-origin': 'การเชื่อมต่อต้นทางเดียวกัน', 'probe-title': 'ทดสอบ nonce ผ่าน WSS',
    'probe-copy': 'เปิด WebSocket ที่ปลอดภัยหนึ่งครั้ง ส่ง nonce สุ่มหนึ่งค่า และตรวจคำตอบที่ตรงกัน โดยไม่บันทึกหรือแสดง payload ใน log',
    'probe-button': 'ทดสอบการเชื่อมต่อที่ปลอดภัย', footer: 'เครื่องมือทดสอบเท่านั้น · ไม่มีการจับคู่ คำสั่งระยะไกล คิวเพลง เสียง หรือไฟล์',
    'checks-label': 'รายการตรวจสอบความสามารถ', language: 'ภาษา', checking: 'กำลังตรวจสอบ…', available: 'พร้อมใช้งาน', unavailable: 'ไม่พร้อมใช้งาน',
    'not-exposed': 'เบราว์เซอร์นี้ไม่เปิดเผยข้อมูลดังกล่าว', 'permission-query-fallback': 'ตรวจสถานะไม่ได้ กดปุ่มเพื่อทดสอบ',
    prompt: 'ยังไม่ตัดสินใจ', granted: 'อนุญาตแล้ว', denied: 'ปฏิเสธแล้ว', 'camera-idle': 'ยังไม่มีการขอสิทธิ์กล้อง',
    'camera-requesting': 'กำลังขอสิทธิ์กล้อง…', 'camera-granted': 'อนุญาตแล้ว และหยุดแทร็กกล้องชั่วคราวแล้ว',
    'camera-denied': 'ถูกปฏิเสธหรือถูกนโยบายเบราว์เซอร์บล็อก', 'camera-no-device': 'ไม่พบอุปกรณ์กล้อง',
    'camera-unavailable': 'เบราว์เซอร์หรืออุปกรณ์นี้ไม่สามารถเข้าถึงกล้องได้',
    'waiting-https': 'รอการเปิดหน้าใน secure context', 'open-https': 'เปิดหน้านี้ผ่าน HTTPS origin ที่กำหนด',
    'probe-connecting': 'กำลังเชื่อมต่อผ่าน WSS ต้นทางเดียวกัน…', 'probe-invalid-response': 'เซิร์ฟเวอร์ตอบกลับการทดสอบไม่ถูกต้อง',
    'probe-passed': 'การเชื่อมต่อปลอดภัยผ่าน และ nonce ตรงกัน', 'probe-mismatch': 'คำตอบจากเซิร์ฟเวอร์ไม่ตรงกับการทดสอบนี้',
    'probe-failed': 'การเชื่อมต่อไม่สำเร็จ ตรวจการเชื่อถือใบรับรองและเครือข่ายภายใน',
    'probe-closed': 'การเชื่อมต่อปิดก่อนการทดสอบเสร็จ', 'probe-timeout': 'หมดเวลาทดสอบการเชื่อมต่อ',
  },
};

let language = 'en';
const originValue = document.querySelector('#origin-value');
const secureValue = document.querySelector('#secure-value');
const cameraApiValue = document.querySelector('#camera-api-value');
const cameraPermissionValue = document.querySelector('#camera-permission-value');
const cameraButton = document.querySelector('#camera-button');
const cameraResult = document.querySelector('#camera-result');
const probeButton = document.querySelector('#probe-button');
const probeResult = document.querySelector('#probe-result');
const languageEn = document.querySelector('#language-en');
const languageTh = document.querySelector('#language-th');
const secure = window.isSecureContext === true;
const cameraSupported = secure && Boolean(navigator.mediaDevices?.getUserMedia);
const probeSupported = secure && typeof WebSocket === 'function' && Boolean(window.crypto?.getRandomValues);

function setMessage(element, key) {
  element.dataset.messageKey = key;
  element.textContent = translations[language][key] ?? key;
}

function applyLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language;
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    element.textContent = translations[language][key] ?? key;
  });
  document.querySelectorAll('[data-message-key]').forEach((element) => {
    const key = element.dataset.messageKey;
    element.textContent = translations[language][key] ?? key;
  });
  document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
    element.setAttribute('aria-label', translations[language][element.dataset.i18nAria] ?? '');
  });
  languageEn.setAttribute('aria-pressed', String(language === 'en'));
  languageTh.setAttribute('aria-pressed', String(language === 'th'));
}

originValue.textContent = window.location.origin;
setMessage(secureValue, secure ? 'available' : 'unavailable');
secureValue.dataset.state = secure ? 'good' : 'bad';
setMessage(cameraApiValue, cameraSupported ? 'available' : 'unavailable');
cameraApiValue.dataset.state = cameraSupported ? 'good' : 'bad';
cameraButton.disabled = !cameraSupported;
probeButton.disabled = !probeSupported;
if (!secure) setMessage(probeResult, 'open-https');

if (!secure || !navigator.permissions?.query) {
  setMessage(cameraPermissionValue, 'not-exposed');
} else {
  navigator.permissions.query({ name: 'camera' }).then((permission) => {
    const key = ['prompt', 'granted', 'denied'].includes(permission.state) ? permission.state : 'not-exposed';
    setMessage(cameraPermissionValue, key);
    permission.onchange = () => {
      const nextKey = ['prompt', 'granted', 'denied'].includes(permission.state) ? permission.state : 'not-exposed';
      setMessage(cameraPermissionValue, nextKey);
    };
  }).catch(() => setMessage(cameraPermissionValue, 'permission-query-fallback'));
}

languageEn.addEventListener('click', () => applyLanguage('en'));
languageTh.addEventListener('click', () => applyLanguage('th'));
applyLanguage('en');

cameraButton.addEventListener('click', async () => {
  cameraButton.disabled = true;
  setMessage(cameraResult, 'camera-requesting');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    for (const track of stream.getTracks()) track.stop();
    setMessage(cameraResult, 'camera-granted');
  } catch (error) {
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
      setMessage(cameraResult, 'camera-denied');
    } else if (error?.name === 'NotFoundError') {
      setMessage(cameraResult, 'camera-no-device');
    } else {
      setMessage(cameraResult, 'camera-unavailable');
    }
  } finally {
    cameraButton.disabled = !cameraSupported;
  }
});

probeButton.addEventListener('click', () => {
  probeButton.disabled = true;
  setMessage(probeResult, 'probe-connecting');
  const nonceBytes = new Uint8Array(16);
  window.crypto.getRandomValues(nonceBytes);
  const nonce = Array.from(nonceBytes, (value) => value.toString(16).padStart(2, '0')).join('');
  const socket = new WebSocket('wss://' + window.location.host + '/probe');
  let sent = false;
  let finished = false;
  const finish = (key) => {
    if (finished) return;
    finished = true;
    setMessage(probeResult, key);
    probeResult.dataset.state = key === 'probe-passed' ? 'good' : 'bad';
    probeButton.disabled = !probeSupported;
    try { socket.close(); } catch {}
  };
  socket.addEventListener('open', () => {
    if (sent) return;
    sent = true;
    socket.send(JSON.stringify({ type: 'probe', nonce }));
  }, { once: true });
  socket.addEventListener('message', (event) => {
    let reply;
    try { reply = JSON.parse(event.data); } catch { finish('probe-invalid-response'); return; }
    if (reply?.type === 'ack' && reply.nonce === nonce) finish('probe-passed');
    else finish('probe-mismatch');
  }, { once: true });
  socket.addEventListener('error', () => finish('probe-failed'), { once: true });
  socket.addEventListener('close', () => {
    if (!finished) finish('probe-closed');
  }, { once: true });
  window.setTimeout(() => {
    if (!finished) finish('probe-timeout');
  }, 7000);
});
