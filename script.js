(() => {
  'use strict';
  const KEYS = { task: 'activeTask', start: 'taskStartTime', done: 'completedTasks', settings: 'settings' };
  const $ = id => document.getElementById(id);
  const el = {
    plus: $('plus'), miniPlus: $('mini-plus'), sheet: $('sheet'), form: $('task-form'), input: $('task-input'),
    cancel: $('cancel'), task: $('task-title'), timer: $('timer'), done: $('done'), nope: $('nope'), back: $('back'),
    burst: $('burst'), archive: $('archive'), archiveBody: $('archive-body'),
    openHistory: $('open-history'), closeHistory: $('close-history')
  };
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MIN_MS_BEFORE_KEY_DONE = 1500; // guards against accidental Space presses
  let lastFocus = null, tick = null;

  // ---------- storage ----------
  const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked */ } };
  const state = {
    task: read(KEYS.task, null),
    start: read(KEYS.start, null),
    done: read(KEYS.done, [])
  };
  if (!state.task || !Number.isFinite(state.start)) { state.task = null; state.start = null; }
  if (!read(KEYS.settings, null)) write(KEYS.settings, { version: 1 });

  const isActive = () => state.task !== null;

  // ---------- formatting ----------
  const pad = n => String(n).padStart(2, '0');
  function formatDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s % 3600 / 60))}:${pad(s % 60)}`;
  }
  const formatClock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const dayLabel = t => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();

  // ---------- rendering ----------
  // Shrinks the task text until it fits its box: the typography IS the interface.
  function fitTask() {
    const box = el.task;
    if (!box.textContent) return;
    const max = Math.min(innerWidth * 0.3, innerHeight * 0.5);
    let size = max;
    box.style.fontSize = size + 'px';
    while ((box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1) && size > 28) {
      size *= 0.94;
      box.style.fontSize = size + 'px';
    }
  }

  function renderTimer() {
    if (isActive()) el.timer.textContent = formatDuration(Date.now() - state.start);
  }

  function render() {
    document.body.dataset.state = isActive() ? 'active' : 'idle';
    document.title = isActive() ? `${state.task} — Right Now` : 'Right Now';
    clearInterval(tick);
    if (isActive()) {
      el.task.textContent = state.task;
      fitTask();
      renderTimer();
      tick = setInterval(renderTimer, 500); // timestamps decide the value; the interval only repaints
    }
  }

  // ---------- overlays ----------
  function openSheet() {
    if (isActive()) return showNope();
    lastFocus = document.activeElement;
    el.sheet.hidden = false;
    document.body.classList.add('sheet-open');
    el.input.value = '';
    el.input.focus();
  }
  function closeSheet() {
    el.sheet.hidden = true;
    document.body.classList.remove('sheet-open');
    if (lastFocus) lastFocus.focus();
  }
  function showNope() {
    lastFocus = document.activeElement;
    el.nope.hidden = false;
    el.back.focus();
  }
  function hideNope() {
    el.nope.hidden = true;
    (el.done.offsetParent ? el.done : document.body).focus();
  }
  function openArchive() {
    renderArchive();
    lastFocus = document.activeElement;
    el.archive.hidden = false;
    el.closeHistory.focus();
  }
  function closeArchive() {
    el.archive.hidden = true;
    if (lastFocus) lastFocus.focus();
  }

  function renderArchive() {
    el.archiveBody.textContent = '';
    if (!state.done.length) {
      const p = document.createElement('p');
      p.className = 'empty';
      p.textContent = 'NOTHING YET.';
      el.archiveBody.append(p);
      return;
    }
    const days = new Map();
    [...state.done].reverse().forEach(t => {
      const k = dayKey(t.start);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(t);
    });
    days.forEach(items => {
      const day = document.createElement('section');
      day.className = 'day';
      const h = document.createElement('h3');
      h.textContent = dayLabel(items[0].start);
      const list = document.createElement('div');
      items.forEach(t => {
        const row = document.createElement('div');
        row.className = 'entry';
        const name = Object.assign(document.createElement('span'), { className: 'name', textContent: t.name });
        const dur = Object.assign(document.createElement('span'), { className: 'dur', textContent: formatDuration(t.end - t.start) });
        const when = Object.assign(document.createElement('span'), { className: 'when', textContent: `${formatClock(t.start)} → ${formatClock(t.end)}` });
        row.append(name, dur, when);
        list.append(row);
      });
      day.append(h, list);
      el.archiveBody.append(day);
    });
  }

  // ---------- actions ----------
  function startTask(name) {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean || isActive()) return;
    state.task = clean;
    state.start = Date.now();
    write(KEYS.task, state.task);
    write(KEYS.start, state.start);
    closeSheet();
    render();
    el.done.focus({ preventScroll: true });
  }

  function completeTask() {
    if (!isActive()) return;
    const entry = { name: state.task, start: state.start, end: Date.now() };
    state.done.push(entry);
    write(KEYS.done, state.done);
    state.task = null;
    state.start = null;
    localStorage.removeItem(KEYS.task);
    localStorage.removeItem(KEYS.start);

    el.burst.classList.add('on');
    setTimeout(() => {
      render();
      el.burst.classList.remove('on');
      el.plus.focus({ preventScroll: true });
    }, reduceMotion ? 300 : 750);
  }

  // ---------- events ----------
  el.plus.addEventListener('click', openSheet);
  el.miniPlus.addEventListener('click', openSheet);
  el.form.addEventListener('submit', e => { e.preventDefault(); startTask(el.input.value); });
  el.cancel.addEventListener('click', closeSheet);
  el.done.addEventListener('click', completeTask);
  el.back.addEventListener('click', hideNope);
  el.openHistory.addEventListener('click', openArchive);
  el.closeHistory.addEventListener('click', closeArchive);
  addEventListener('resize', fitTask);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTimer(); });
  addEventListener('storage', e => { // another tab changed things
    if (Object.values(KEYS).includes(e.key)) {
      state.task = read(KEYS.task, null); state.start = read(KEYS.start, null); state.done = read(KEYS.done, []);
      render();
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!el.nope.hidden) return hideNope();
      if (!el.archive.hidden) return closeArchive();
      if (!el.sheet.hidden) return closeSheet();
      return;
    }
    const overlayOpen = !el.sheet.hidden || !el.nope.hidden || !el.archive.hidden;
    const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (overlayOpen || typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'n' || e.key === 'N' || e.key === '+') { e.preventDefault(); openSheet(); }
    else if (e.code === 'Space' && document.activeElement === document.body && isActive()) {
      e.preventDefault();
      if (Date.now() - state.start > MIN_MS_BEFORE_KEY_DONE) completeTask();
    }
  });

  // Keep Tab inside whichever overlay is open
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const layer = [el.nope, el.sheet, el.archive].find(n => !n.hidden);
    if (!layer) return;
    const f = [...layer.querySelectorAll('button,input')].filter(n => !n.disabled);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  document.fonts && document.fonts.ready.then(fitTask);
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
