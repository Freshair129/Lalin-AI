// ทดสอบ UI จริงด้วย API/media fixture ใน browser context หรือ WebView2 profile แยกเท่านั้น
// PLAYWRIGHT_MODULE ระบุ module ที่ติดตั้งไว้; LALIN_SMOKE_CDP ใช้เฉพาะแอป debug ที่เปิดด้วย profile ทดสอบ
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const native = Boolean(process.env.LALIN_SMOKE_CDP);
const origin = native ? 'http://localhost:5173' : 'http://127.0.0.1:5173';
const output = path.resolve(__dirname, '../../runtime/playback-verification');
fs.mkdirSync(output, { recursive: true });
const result = { mode: native ? 'native-debug-isolated-profile' : 'browser-isolated-context', fixture: 'synthetic silence WAV and mocked API, no real user media', checks: [] };
const check = (name) => { result.checks.push(name); console.log('PASS', name); };

// 60 วินาที PCM silence: ตรวจ state/progress ได้โดยไม่ส่งเสียงทดสอบออกลำโพง
const wav = Buffer.alloc(44 + 24000 * 60 * 2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28); wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const entries = ['fixture-a.wav', 'fixture-b.wav'].map(name => ({ name, type: 'file', size: wav.length, modified: 0, ext: 'wav' }));
const savedItem = { id: 'saved-fixture', title: 'Restored fixture', url: 'http://127.0.0.1:8756/fs/file?path=restored.wav', sourceKind: 'workspace' };
const savedQueue = { items: [savedItem], currentIndex: -1, repeatMode: 'off', shuffle: false };
const savedEQ = { enabled: true, preamp: -3, bands: [31,62,125,250,500,1000,2000,4000,8000,16000].map(frequency => ({ frequency, gain: 0 })), currentPreset: 'Flat', customPresets: {} };

async function snapshot(page) {
  return page.evaluate(async () => {
    // ใช้ URL ที่ Vite โหลดจริง (รวม HMR timestamp) เพื่อไม่สร้าง store realm จำลองในเทสต์
    const moduleUrl = performance.getEntriesByType('resource').find(entry => entry.name.includes('/src/playback/usePlaybackStore.ts')).name;
    const { usePlaybackStore } = await import(moduleUrl);
    const { queue, nowPlaying, eq } = usePlaybackStore.getState();
    return { queue, nowPlaying, eq, audio: window.__playbackProbe };
  });
}
async function waitOwner(page, predicate) {
  const test = new Function('s', `return (${predicate})`);
  const deadline = Date.now() + 10000;
  let last;
  do {
    last = await snapshot(page);
    if (test(last)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(`Owner state timeout: ${predicate}; last=${JSON.stringify(last)}`);
}
async function waitNative(read, expected) {
  const deadline = Date.now() + 10000;
  do {
    const state = await read();
    if (Object.entries(expected).every(([key, value]) => state[key] === value)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(`Native window state timeout: ${JSON.stringify(expected)}`);
}

(async () => {
  let browser;
  try {
    if (native && !process.env.LALIN_SMOKE_PROFILE) throw new Error('Native smoke requires explicit isolated LALIN_SMOKE_PROFILE');
    browser = native
      ? await chromium.connectOverCDP(process.env.LALIN_SMOKE_CDP)
      : await chromium.launch({ channel: 'msedge', headless: true });
    const context = native ? browser.contexts()[0] : await browser.newContext();
    context.setDefaultTimeout(10000);
    const errors = [];
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    for (const page of context.pages()) page.on('pageerror', error => errors.push(error.message));
    await context.addInitScript(() => {
      window.__playbackProbe = { audioCreated: 0, playCalls: 0, events: [] };
      const OriginalAudio = window.Audio;
      window.Audio = new Proxy(OriginalAudio, { construct(target, args) {
        window.__playbackProbe.audioCreated++;
        const audio = Reflect.construct(target, args);
        for (const type of ['play', 'waiting', 'playing', 'pause', 'error']) {
          audio.addEventListener(type, () => window.__playbackProbe.events.push(type));
        }
        return audio;
      } });
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        window.__playbackProbe.playCalls++;
        return originalPlay.apply(this, args);
      };
      let fullscreenElement = null;
      Object.defineProperty(Document.prototype, 'fullscreenElement', {
        configurable: true,
        get: () => fullscreenElement,
      });
      Object.defineProperty(Element.prototype, 'requestFullscreen', {
        configurable: true,
        value: async function () {
          fullscreenElement = this;
          document.dispatchEvent(new Event('fullscreenchange'));
        },
      });
      Object.defineProperty(Document.prototype, 'exitFullscreen', {
        configurable: true,
        value: async () => {
          fullscreenElement = null;
          document.dispatchEvent(new Event('fullscreenchange'));
        },
      });
    });
    await context.route('http://127.0.0.1:8756/**', async route => {
      const url = new URL(route.request().url());
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
      if (url.pathname === '/fs/file' || url.pathname.startsWith('/files/input/')) {
        return route.fulfill({ status: 200, contentType: 'audio/wav', headers, body: wav });
      }
      const data = url.pathname === '/health' ? { ok: true, brain: { provider: 'test fixture' } }
        : url.pathname === '/fs' ? { path: '', entries }
        : url.pathname === '/packs' ? { packs: [{ id: 'fixture-a.wav', name: 'Fixture pack', author: 'Test fixture', color: '#444', installed: true }] }
        : url.pathname === '/runtime/status' ? null
        : url.pathname === '/projects' ? { projects: [] }
        : url.pathname === '/jobs' ? { jobs: [] }
        : url.pathname === '/voices' ? { voices: [] } : {};
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) });
    });

    let main = native ? context.pages().find(p => !p.url().includes('surface=play')) : await context.newPage();
    assert.ok(main, 'Studio WebView exists');
    await main.goto(origin);
    await main.evaluate(({ queue, eq }) => {
      localStorage.setItem('lalin:playback:queue', JSON.stringify(queue));
      localStorage.setItem('lalin:playback:eq', JSON.stringify(eq));
    }, { queue: savedQueue, eq: savedEQ });
    let play = native ? context.pages().find(p => p.url().includes('surface=play')) : null;
    if (native) {
      assert.ok(play, 'predeclared Play WebView exists');
      await play.reload();
      await play.getByRole('application', { name: 'Lalin Play Window' }).waitFor();
      const restored = await snapshot(play);
      assert.deepEqual(restored.queue.items, [savedItem]);
      assert.equal(restored.eq.preamp, -3);
      assert.equal(restored.nowPlaying.state, 'idle');
      check('existing queue/EQ is shared from Studio storage to the native Play WebView without autoplay');
    }
    await main.reload();
    await main.getByTitle('Library', { exact: true }).click();
    await main.locator('.fm-item').filter({ hasText: 'fixture-a.wav' }).waitFor();
    const popup = native ? null : context.waitForEvent('page');
    await main.locator('.fm-item').filter({ hasText: 'fixture-a.wav' }).dblclick();
    if (!native) play = await popup;
    await play.getByRole('application', { name: 'Lalin Play Window' }).waitFor();
    await waitOwner(play, 's.nowPlaying.item?.title === "fixture-a.wav" && ["playing","error"].includes(s.nowPlaying.state)');
    let current = await snapshot(play);
    if (current.nowPlaying.state === 'error') {
      result.autoplayMessage = current.nowPlaying.error;
      await play.getByTitle('Play (Space)', { exact: true }).click();
    }
    await waitOwner(play, 's.nowPlaying.state === "playing" && s.nowPlaying.currentTime > 0');
    current = await snapshot(play);
    result.firstPlay = current;
    assert.equal(current.queue.items.length, 2);
    assert.equal(current.eq.preamp, -3);
    assert.equal(current.audio.audioCreated, 1);
    assert.equal(current.audio.playCalls, result.autoplayMessage ? 2 : 1);
    assert.equal(await main.evaluate(() => window.__playbackProbe.audioCreated), 0);
    assert.equal(await main.evaluate(() => window.__playbackProbe.playCalls), 0);
    check('first FileManager Play delivered once, one owner audio element, no Studio playback, persisted queue/EQ preserved');

    const beforeTv = await snapshot(play);
    await play.getByTestId('tv-mode-toggle').click();
    await play.getByRole('application', { name: 'Lalin Play TV Mode' }).waitFor();
    const tvRoot = play.getByRole('application', { name: 'Lalin Play TV Mode' });
    assert.equal(await tvRoot.getAttribute('data-tv-mode'), 'true');
    await play.waitForFunction(() => document.querySelector('[data-tv-mode="true"]')?.getAttribute('data-fullscreen') === 'true');
    assert.equal(await tvRoot.getAttribute('data-fullscreen'), 'true');
    await play.keyboard.press('ArrowDown');
    assert.equal(await play.evaluate(() => document.activeElement?.tagName), 'BUTTON');
    const inTv = await snapshot(play);
    assert.deepEqual(inTv.queue.items, beforeTv.queue.items);
    assert.equal(inTv.eq.preamp, beforeTv.eq.preamp);
    assert.equal(inTv.nowPlaying.item?.id, beforeTv.nowPlaying.item?.id);
    await play.keyboard.press('Escape');
    await play.getByRole('application', { name: 'Lalin Play Window' }).waitFor();
    const afterTv = await snapshot(play);
    assert.equal(await play.locator('[data-tv-mode="false"]').count(), 1);
    assert.equal(await play.locator('[data-fullscreen="false"]').count(), 1);
    assert.deepEqual(afterTv.queue.items, beforeTv.queue.items);
    assert.equal(afterTv.eq.preamp, beforeTv.eq.preamp);
    assert.equal(afterTv.nowPlaying.item?.id, beforeTv.nowPlaying.item?.id);
    result.hardwareGamepad = 'NOT_RUN (no physical controller attached)';
    check('TV Mode enter/exit, visible focus and keyboard Escape preserve queue/EQ/Now Playing; physical gamepad evidence is NOT_RUN');

    await main.locator('.fm-item').filter({ hasText: 'fixture-b.wav' }).click({ button: 'right' });
    await main.getByText('Add to Queue', { exact: true }).click();
    await waitOwner(play, 's.queue.items.length === 3');
    const ownerBefore = await snapshot(play);
    await main.getByTitle('Open Lalin Play', { exact: true }).click();
    await main.getByTitle('Workspace', { exact: true }).click();
    await waitOwner(play, 's.nowPlaying.state === "playing"');
    assert.equal(context.pages().filter(p => p.url().includes('surface=play')).length, 1);
    assert.equal((await snapshot(play)).audio.playCalls, ownerBefore.audio.playCalls);
    check('warm focus and Studio navigation preserve playback without reopening or replaying');

    if (native) {
      const nativeInfo = () => main.evaluate(async () => {
        const { WebviewWindow } = await import('/node_modules/.vite/deps/@tauri-apps_api_webviewWindow.js');
        const win = await WebviewWindow.getByLabel('play');
        return { visible: await win.isVisible(), minimized: await win.isMinimized(), maximized: await win.isMaximized(), fullscreen: await win.isFullscreen() };
      });
      await play.getByTestId('tv-mode-toggle').click();
      await play.getByRole('application', { name: 'Lalin Play TV Mode' }).waitFor();
      await waitNative(nativeInfo, { fullscreen: true });
      await play.keyboard.press('Escape');
      await play.getByRole('application', { name: 'Lalin Play Window' }).waitFor();
      await waitNative(nativeInfo, { fullscreen: false });
      check('native TV Mode toggles the fixed Play window fullscreen state and exits with Escape');
      await play.getByTitle('Minimize', { exact: true }).click();
      await waitNative(nativeInfo, { minimized: true });
      await main.getByTitle('Open Lalin Play', { exact: true }).click();
      await waitNative(nativeInfo, { minimized: false });
      await play.getByTitle('Maximize / Restore', { exact: true }).click();
      await waitNative(nativeInfo, { maximized: true });
      await play.getByTitle('Maximize / Restore', { exact: true }).click();
      await waitNative(nativeInfo, { maximized: false });
      await play.getByTitle('Close / Hide to Background', { exact: true }).click();
      await waitNative(nativeInfo, { visible: false });
      await main.getByTitle('Open Lalin Play', { exact: true }).click();
      await waitNative(nativeInfo, { visible: true });
      require('node:child_process').execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File',
        path.join(__dirname, 'playback_native_close.ps1'), '-ProcessId', process.env.LALIN_SMOKE_PID]);
      await waitNative(nativeInfo, { visible: false });
      await main.getByTitle('Open Lalin Play', { exact: true }).click();
      await waitNative(nativeInfo, { visible: true });
      assert.equal((await snapshot(play)).audio.playCalls, ownerBefore.audio.playCalls);
      const denied = await play.evaluate(async () => {
        try { await window.__TAURI_INTERNALS__.invoke('plugin:process|exit', { code: 0 }); return false; }
        catch { return true; }
      });
      assert.equal(denied, true);
      check('native minimize/restore, maximize/restore, custom hide, OS close-request hide preserve owner; Play cannot invoke process exit');
    }
    assert.deepEqual(errors, []);
    await play.screenshot({ path: path.join(output, `${native ? 'native' : 'browser'}-play.png`) });
    if (!native) {
      await play.close();
      await main.getByTitle('Library', { exact: true }).click();
      const reopened = context.waitForEvent('page');
      await main.locator('.fm-item').filter({ hasText: 'fixture-b.wav' }).click({ button: 'right' });
      await main.getByText('Play Next', { exact: true }).click();
      play = await reopened;
      await play.getByRole('application', { name: 'Lalin Play Window' }).waitFor();
      await waitOwner(play, 's.queue.items.length === 4');
      const queueOnly = await snapshot(play);
      assert.equal(queueOnly.queue.items[queueOnly.queue.currentIndex + 1].title, 'fixture-b.wav');
      assert.equal(queueOnly.nowPlaying.state, 'idle');
      assert.equal(queueOnly.audio.playCalls, 0);
      await main.getByTitle('Open Lalin Play', { exact: true }).click();
      assert.equal((await snapshot(play)).audio.playCalls, 0);
      check('cold queue-only action reopens the owner and restored queue without autoplay');
    }
    assert.deepEqual(errors, []);
    result.status = 'PASS';
  } catch (error) {
    result.status = 'FAIL'; result.error = String(error.stack || error); process.exitCode = 1;
  } finally {
    result.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(output, `${native ? 'native' : 'browser'}-smoke.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ mode: result.mode, status: result.status, error: result.error }, null, 2));
    if (browser) await browser.close();
  }
})();
