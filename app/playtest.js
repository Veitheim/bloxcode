// Play tests: start and stop them from Bloxcode, and run code inside a running test.
// The plugin copies inside a play test poll /playtest/poll; the edit copy starts tests with
// StudioTestService and reports when they end.

const POLL_ALIVE_MS = 2500;

function createPlaytest({ studio, emit }) {
  const last = { server: 0, client: 0 };
  let stopRequested = false;
  let running = false; // started by Bloxcode and not ended yet
  let startedAt = 0;
  let startSeq = 0;
  const queue = { server: [], client: [] };
  const waiting = new Map();
  let reqCounter = 0;

  function active() {
    const now = Date.now();
    return { server: now - last.server < POLL_ALIVE_MS, client: now - last.client < POLL_ALIVE_MS };
  }
  function isRunning() { const a = active(); return a.server || a.client || running; }
  function info() {
    const a = active();
    return { running: a.server || a.client, startedByBloxcode: running, server: a.server, client: a.client, since: startedAt || null };
  }

  /** Called by the play-test plugin about twice a second. */
  function poll(body) {
    const context = body.context === 'client' ? 'client' : 'server';
    const wasRunning = isRunning();
    last[context] = Date.now();
    if (!wasRunning) { startedAt = Date.now(); emit({ state: 'running' }); }
    if (Array.isArray(body.logs) && body.logs.length) studio.onLogs(body.logs);
    const run = queue[context].splice(0);
    const stop = context === 'server' && stopRequested;
    if (stop) stopRequested = false;
    return { run, stop, stopResult: 'Stopped by Bloxcode' };
  }

  function result(body) {
    const w = waiting.get(body.reqId);
    if (!w) return;
    waiting.delete(body.reqId);
    clearTimeout(w.timer);
    w.resolve({ ok: !!body.ok, result: body.result, output: body.output || [], context: body.context });
  }

  studio.events.on('playtest', (e) => {
    if (e.state === 'ended') { running = false; emit({ state: 'ended', result: e.result }); }
  });

  async function start(mode = 'play') {
    if (isRunning()) throw new Error('A play test is already running. Stop it first.');
    await studio.ask({ type: 'startPlaytest', mode: mode === 'run' ? 'run' : 'play' }, { minVersion: 3 });
    running = true;
    startedAt = Date.now();
    startSeq = studio.logSeq;
    emit({ state: 'starting' });
    // wait until the test reports in (or give up after 30 s)
    const until = Date.now() + 30000;
    while (Date.now() < until) {
      const a = active();
      if (a.server || (mode === 'run' && a.server)) return { started: true, logSeq: startSeq };
      if (!running) throw new Error('The play test ended right away. Check the Output for errors.');
      await new Promise((r) => setTimeout(r, 300));
    }
    return { started: true, logSeq: startSeq, slow: true };
  }

  async function stop() {
    if (!isRunning()) return { stopped: false };
    stopRequested = true;
    const until = Date.now() + 10000;
    while (Date.now() < until && isRunning()) await new Promise((r) => setTimeout(r, 250));
    stopRequested = false;
    running = false;
    return { stopped: !isRunning() };
  }

  /** Runs code inside the running test on the server or a client. */
  function runInTest(code, context = 'server') {
    const a = active();
    if (!a[context]) throw new Error(context === 'client' ? 'No play test client is running. Start a Play test first (Run mode has no client).' : 'No play test is running. Start one with start_playtest first.');
    const reqId = 'p' + (++reqCounter);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiting.delete(reqId); reject(new Error('The code did not finish within 30 seconds.')); }, 30000);
      waiting.set(reqId, { resolve, reject, timer });
      queue[context].push({ reqId, code: String(code) });
    });
  }

  return { poll, result, start, stop, runInTest, info, isRunning };
}

module.exports = { createPlaytest };
