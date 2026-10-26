import './styles.css';

const messages = {
  en: {
    preview: 'STATIC PREVIEW',
    heading: 'Your music, in control.',
    intro: 'A phone-sized controller for the Lalin Play session on your PC.',
    host: 'PC PLAYER',
    disconnected: 'Not connected',
    hostHelp: 'The live connection flow is not part of this preview.',
    nowPlaying: 'NOW PLAYING',
    demoTrack: 'Moonlit Drive',
    demoArtist: 'Lalin demo track',
    previewOnly: 'Preview controls only',
    queue: 'Up next',
    queueCount: (count) => `${count} demo tracks`,
    session: 'YOUR SESSION',
    add: 'Add demo track',
    volume: 'PC volume',
    volumeNote: 'Local preview control · no audio is sent',
    simulated: 'Buttons only change this page. No pairing, network, audio, or player commands are active.',
    now: 'Player',
    queueTab: 'Queue',
    language: 'Language',
    emptyQueue: 'No tracks in this preview queue.',
    play: 'Play preview',
    pause: 'Pause preview',
    previous: 'Previous demo track',
    next: 'Next demo track',
    added: 'Demo track added',
    home: 'Controller preview',
    mins: 'min',
  },
  th: {
    preview: 'ตัวอย่างหน้าจอ',
    heading: 'คุมเพลงได้จากมือถือ',
    intro: 'หน้าควบคุมขนาดมือถือสำหรับเซสชัน Lalin Play บน PC',
    host: 'เครื่องเล่นบน PC',
    disconnected: 'ยังไม่ได้เชื่อมต่อ',
    hostHelp: 'ตัวอย่างนี้ยังไม่มีขั้นตอนเชื่อมต่อจริง',
    nowPlaying: 'กำลังเล่น',
    demoTrack: 'ขับรถใต้แสงจันทร์',
    demoArtist: 'เพลงตัวอย่าง Lalin',
    previewOnly: 'ปุ่มควบคุมตัวอย่าง',
    queue: 'เพลงถัดไป',
    queueCount: (count) => `${count} เพลงตัวอย่าง`,
    session: 'เซสชันของคุณ',
    add: 'เพิ่มเพลงตัวอย่าง',
    volume: 'ระดับเสียง PC',
    volumeNote: 'ควบคุมเฉพาะหน้า preview · ไม่มีเสียงถูกส่ง',
    simulated: 'ปุ่มเปลี่ยนเฉพาะหน้านี้ ไม่มีการจับคู่ เครือข่าย เสียง หรือคำสั่งไปยังเครื่องเล่น',
    now: 'เครื่องเล่น',
    queueTab: 'คิวเพลง',
    language: 'ภาษา',
    emptyQueue: 'ไม่มีเพลงในคิวตัวอย่าง',
    play: 'เล่นตัวอย่าง',
    pause: 'หยุดตัวอย่างชั่วคราว',
    previous: 'เพลงตัวอย่างก่อนหน้า',
    next: 'เพลงตัวอย่างถัดไป',
    added: 'เพิ่มเพลงตัวอย่างแล้ว',
    home: 'ตัวอย่างรีโมท',
    mins: 'นาที',
  },
};

const demoTracks = [
  { title: 'Moonlit Drive', duration: '3:42' },
  { title: 'Paper Satellites', duration: '4:08' },
  { title: 'Quiet Morning', duration: '3:16' },
];

const state = {
  language: 'en',
  queue: [...demoTracks],
  currentIndex: 0,
  playing: false,
  volume: 58,
};

const root = document.querySelector('#app');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function render() {
  const t = messages[state.language];
  document.documentElement.lang = state.language;
  const current = state.queue[state.currentIndex] ?? demoTracks[0];
  const queueRows = state.queue.length
    ? state.queue.map((track, index) => `
      <li class="queue-row ${index === state.currentIndex ? 'is-current' : ''}">
        <span class="queue-index">${String(index + 1).padStart(2, '0')}</span>
        <span class="queue-copy"><strong>${escapeHtml(track.title)}</strong><small>${t.demoArtist}</small></span>
        <span class="queue-duration">${escapeHtml(track.duration)}</span>
      </li>`).join('')
    : `<li class="queue-empty">${t.emptyQueue}</li>`;

  root.innerHTML = `
    <div class="page-shell">
      <header class="topbar">
        <a class="brand" href="#top" aria-label="Lalin Play ${t.home}">
          <span class="brand-mark" aria-hidden="true"><span></span><span></span><span></span></span>
          <span class="brand-name">Lalin <strong>Play</strong></span>
        </a>
        <div class="topbar-actions">
          <span class="preview-pill"><span class="status-dot"></span>${t.preview}</span>
          <div class="language-switch" role="group" aria-label="${t.language}">
            <button class="language-option ${state.language === 'en' ? 'selected' : ''}" data-action="language-en" aria-pressed="${state.language === 'en'}">ENG</button>
            <span aria-hidden="true">|</span>
            <button class="language-option ${state.language === 'th' ? 'selected' : ''}" data-action="language-th" aria-pressed="${state.language === 'th'}">TH</button>
          </div>
        </div>
      </header>

      <main id="top" class="content">
        <section class="intro-block" aria-labelledby="page-title">
          <p class="eyebrow">LALIN PLAY · REMOTE</p>
          <h1 id="page-title">${t.heading}</h1>
          <p class="intro-copy">${t.intro}</p>
        </section>

        <section class="connection-card" aria-labelledby="host-title">
          <div class="connection-icon" aria-hidden="true">⌘</div>
          <div class="connection-copy">
            <p class="eyebrow">${t.host}</p>
            <h2 id="host-title">${t.disconnected}</h2>
            <p>${t.hostHelp}</p>
          </div>
          <span class="connection-state"><span class="state-dot"></span>${t.disconnected}</span>
        </section>

        <section class="player-card" aria-labelledby="track-title">
          <div class="section-heading">
            <p class="eyebrow">${t.nowPlaying}</p>
            <span class="local-badge">${t.previewOnly}</span>
          </div>
          <div class="now-playing">
            <div class="cover-art" aria-hidden="true">
              <span class="cover-orbit orbit-one"></span>
              <span class="cover-orbit orbit-two"></span>
              <span class="cover-sun"></span>
              <span class="cover-wordmark">LP</span>
            </div>
            <div class="track-info">
              <h2 id="track-title">${escapeHtml(current.title)}</h2>
              <p>${t.demoArtist}</p>
              <span class="track-type">${t.previewOnly}</span>
            </div>
          </div>
          <div class="progress-wrap" aria-label="Preview progress">
            <div class="progress-track"><span></span></div>
            <div class="progress-labels"><span>0:48</span><span>${escapeHtml(current.duration)}</span></div>
          </div>
          <div class="transport" aria-label="${t.nowPlaying}">
            <button class="transport-button" data-action="previous" aria-label="${t.previous}"><span aria-hidden="true">|◀</span></button>
            <button class="play-button" data-action="toggle-play" aria-label="${state.playing ? t.pause : t.play}" aria-pressed="${state.playing}">
              <span aria-hidden="true">${state.playing ? 'Ⅱ' : '▶'}</span>
            </button>
            <button class="transport-button" data-action="next" aria-label="${t.next}"><span aria-hidden="true">▶|</span></button>
          </div>
        </section>

        <section class="queue-card" id="queue" aria-labelledby="queue-title">
          <div class="section-heading queue-heading">
            <div><p class="eyebrow">${t.session}</p><h2 id="queue-title">${t.queue}</h2></div>
            <span class="queue-count">${t.queueCount(state.queue.length)}</span>
          </div>
          <ol class="queue-list">${queueRows}</ol>
          <button class="add-button" data-action="add-track"><span aria-hidden="true">＋</span>${t.add}</button>
        </section>

        <section class="volume-card" aria-labelledby="volume-title">
          <div class="volume-heading">
            <div><h2 id="volume-title">${t.volume}</h2><p>${t.volumeNote}</p></div>
            <span class="volume-value">${state.volume}%</span>
          </div>
          <input type="range" min="0" max="100" value="${state.volume}" data-action="volume" aria-label="${t.volume}" />
        </section>

        <p class="prototype-note"><span aria-hidden="true">ⓘ</span>${t.simulated}</p>
      </main>

      <nav class="bottom-nav" aria-label="${t.home}">
        <a class="nav-item active" href="#top" aria-current="page"><span aria-hidden="true">◉</span><span>${t.now}</span></a>
        <a class="nav-item" href="#queue"><span aria-hidden="true">≡</span><span>${t.queueTab}</span></a>
      </nav>
    </div>`;
}

root.addEventListener('click', (event) => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (!action) return;

  if (action === 'language-en') state.language = 'en';
  if (action === 'language-th') state.language = 'th';
  if (action === 'toggle-play') state.playing = !state.playing;
  if (action === 'previous') state.currentIndex = (state.currentIndex - 1 + state.queue.length) % state.queue.length;
  if (action === 'next') state.currentIndex = (state.currentIndex + 1) % state.queue.length;
  if (action === 'add-track') {
    const next = demoTracks[state.queue.length % demoTracks.length];
    state.queue.push({ ...next, title: `${next.title} ${Math.floor(state.queue.length / demoTracks.length) + 1}` });
  }

  render();
});

root.addEventListener('input', (event) => {
  if (event.target.matches('[data-action="volume"]')) {
    state.volume = Number(event.target.value);
    const output = root.querySelector('.volume-value');
    if (output) output.textContent = `${state.volume}%`;
  }
});

render();
