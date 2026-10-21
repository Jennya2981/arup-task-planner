/* =========================================================================
   db.js — общий календарь: чтение и запись данных в файл GitHub.
   Чтение — открытое (виден всем, у кого есть ссылка).
   Запись — только по ключу доступа, который вводит владелец; ключ хранится
   исключительно в его браузере и в код не попадает.
   ========================================================================= */
window.CAL = window.CAL || {};

(function (CAL) {
  'use strict';

  const CFG = window.CAL_CONFIG || {};
  const TOKEN_KEY = 'task-calendar.token';
  const CACHE_KEY = 'task-calendar.shared-cache';
  const API = 'https://api.github.com';

  let status = { state: 'idle', message: '', at: Date.now() };
  const statusListeners = [];
  let pollTimer = null;
  let lastSha = null;
  let limitedUntil = 0;   // до какого момента действует лимит запросов без ключа

  /* ----------------------------- Настройки ------------------------------- */

  function enabled() {
    return !!(CFG.shared && CFG.owner && CFG.repo && CFG.file);
  }

  function pollMs() {
    return Number(CFG.pollMs) || 20000;
  }

  function contentsPath() {
    return '/repos/' + CFG.owner + '/' + CFG.repo + '/contents/' + CFG.file;
  }

  function rawUrl() {
    return 'https://raw.githubusercontent.com/' + CFG.owner + '/' + CFG.repo + '/' +
      (CFG.branch || 'main') + '/' + CFG.file + '?v=' + Date.now();
  }

  function authHeaders(token) {
    return {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  function base64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  /* ------------------------------- Ключ ---------------------------------- */

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (err) { return ''; }
  }

  function setToken(token) {
    try { localStorage.setItem(TOKEN_KEY, token || ''); } catch (err) { /* приватный режим */ }
  }

  function clearToken() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (err) { /* пусто */ }
  }

  function hasToken() {
    return !!getToken();
  }

  /* ------------------------------ Статус --------------------------------- */

  function setStatus(state, message) {
    status = { state, message: message || '', at: Date.now() };
    statusListeners.forEach((fn) => fn(status));
  }

  function onStatus(fn) {
    statusListeners.push(fn);
  }

  function getStatus() {
    return status;
  }

  /* ------------------------------- Чтение -------------------------------- */

  /** Расшифровка ответа Contents API (файл приходит в base64). */
  function decodeContent(data) {
    if (data && data.content && data.encoding === 'base64') {
      const bin = atob(String(data.content).replace(/\s/g, ''));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return JSON.parse(new TextDecoder().decode(bytes));
    }
    return data;
  }

  function check(data) {
    if (!data || !Array.isArray(data.tasks)) throw new Error('неожиданный формат данных');
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (err) { /* пусто */ }
    return data;
  }

  /** Чтение через API: данные свежие сразу после записи. */
  async function loadApi(token) {
    const headers = token ? authHeaders(token) : { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    const res = await fetch(API + contentsPath(), { headers, cache: 'no-store' });
    if (!res.ok) {
      const err = new Error('хранилище ответило ' + res.status);
      err.status = res.status;
      throw err;
    }
    const wrapper = await res.json();
    if (wrapper.sha) lastSha = wrapper.sha;
    return check(decodeContent(wrapper));
  }

  /**
   * Запасной путь: открытая ссылка на файл. GitHub отдаёт её из кэша
   * (до 5 минут), поэтому помечаем состояние как «возможно устарело».
   */
  async function loadRaw() {
    const res = await fetch(rawUrl(), { cache: 'no-store' });
    if (!res.ok) throw new Error('хранилище ответило ' + res.status);
    setStatus('warn', 'показаны данные из кэша GitHub, они могут отставать');
    return check(await res.json());
  }

  /**
   * Чтение календаря.
   * С ключом — через API: без ограничений и сразу после записи.
   * Без ключа — тоже через API (60 запросов в час на адрес); если лимит
   * исчерпан, работаем с открытой ссылкой.
   */
  async function load() {
    const token = getToken();
    if (token) {
      const data = await loadApi(token);
      setStatus('ok', '');
      return data;
    }

    const limited = limitedUntil && Date.now() < limitedUntil;
    if (limited) return loadRaw();

    try {
      const data = await loadApi('');
      limitedUntil = 0;
      setStatus('ok', '');
      return data;
    } catch (err) {
      if (err.status !== 403 && err.status !== 429) throw err;
      limitedUntil = Date.now() + 10 * 60 * 1000;
      return loadRaw();
    }
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  /* ------------------------------- Запись -------------------------------- */

  /** Проверка ключа доступа: есть ли у него доступ к репозиторию и право записи. */
  async function verify(token) {
    if (!token) return false;
    try {
      const res = await fetch(API + '/repos/' + CFG.owner + '/' + CFG.repo, { headers: authHeaders(token) });
      if (!res.ok) {
        setStatus('error', res.status === 404 ? 'ключ не подошёл' : 'хранилище ответило ' + res.status);
        return false;
      }
      const repo = await res.json();
      if (!repo || !repo.permissions) {
        setStatus('error', 'не удалось проверить права ключа');
        return false;
      }
      if (repo.permissions.push === false && !(await canWrite(token))) {
        setStatus('error', 'у ключа нет права записи в хранилище');
        return false;
      }
      return true;
    } catch (err) {
      setStatus('error', 'не удалось проверить ключ');
      return false;
    }
  }

  async function put(snapshot, sha, token) {
    const key = token || getToken();
    if (!key) throw new Error('нет ключа доступа');

    const body = {
      message: 'Календарь: обновление ' + new Date().toISOString(),
      content: base64(JSON.stringify(snapshot, null, 2)),
      branch: CFG.branch || 'main'
    };
    if (sha) body.sha = sha;

    const res = await fetch(API + contentsPath(), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(key)),
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const e = new Error((err && err.message) || ('хранилище ответило ' + res.status));
      e.status = res.status;
      throw e;
    }
    return res.json();
  }

  /** Пробная запись: переписываем файл тем же содержимым, чтобы убедиться, что ключ пишет. */
  async function canWrite(token) {
    try {
      const res = await fetch(API + contentsPath(), { headers: authHeaders(token), cache: 'no-store' });
      if (!res.ok) return false;
      const wrapper = await res.json();
      const data = decodeContent(wrapper);
      if (!data || !Array.isArray(data.tasks)) return false;
      const saved = await put(data, wrapper.sha, token);
      if (saved && saved.content && saved.content.sha) lastSha = saved.content.sha;
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Сохранить состояние календаря в общий файл. */
  async function save(snapshot) {
    let sha = lastSha;
    try {
      const res = await fetch(API + contentsPath(), { headers: authHeaders(getToken()), cache: 'no-store' });
      if (res.ok) {
        const cur = await res.json();
        sha = cur.sha || null;
        lastSha = sha;
      }
    } catch (err) {
      /* пойдём без sha — при конфликте повторим */
    }

    try {
      const res = await put(snapshot, sha);
      lastSha = (res.content && res.content.sha) || lastSha;
    } catch (err) {
      if (err.status !== 409 && err.status !== 422) throw err;
      const res = await fetch(API + contentsPath(), { headers: authHeaders(getToken()), cache: 'no-store' });
      const cur = await res.json();
      lastSha = cur.sha;
      const again = await put(snapshot, lastSha);
      lastSha = (again.content && again.content.sha) || lastSha;
    }
    setStatus('saved', '');
  }

  /* ------------------------------- Опрос --------------------------------- */

  function startPolling(fn, interval) {
    stopPolling();
    pollTimer = setInterval(fn, interval || pollMs());
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  CAL.db = {
    enabled, pollMs, load, save, verify, readCache,
    getToken, setToken, clearToken, hasToken,
    setStatus, onStatus, getStatus, startPolling, stopPolling
  };
})(window.CAL);
