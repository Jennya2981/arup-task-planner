/* =========================================================================
   store.js — состояние приложения, справочники, даты и localStorage
   ========================================================================= */
window.CAL = window.CAL || {};

(function (CAL) {
  'use strict';

  /* ----------------------------- Константы ----------------------------- */

  const CFG = window.CAL_CONFIG || {};
  // Пространство имён по репозиторию: страницы на jennya2981.github.io
  // используют один домен, поэтому ключи разных календарей не должны пересекаться.
  const NS = (CFG.repo || 'local').replace(/[^a-zA-Z0-9_-]/g, '_');
  const STORAGE_KEY = 'task-calendar.' + NS + '.v1';

  /* Права администратора: выдаются только этому браузеру после ввода пароля владельца.
     Пароль хранится не текстом, а SHA-256 хэшем — чтобы его нельзя было прочитать в коде.
     Чтобы сменить пароль: node -e "console.log(require('crypto').createHash('sha256').update('НОВЫЙ_ПАРОЛЬ').digest('hex'))" */
  const ADMIN_KEY = 'task-calendar.' + NS + '.admin';
  const ADMIN_PWD_HASH = '4e1d0a7f06351f71e874ac97d7a645b4f92a0dbdd29cc169403f2f86057ac01a';

  const DEFAULT_PRIORITIES = {
    low:    { label: 'Низкий',        color: '#94a3b8' },
    normal: { label: 'Обычный',       color: '#3b82f6' },
    high:   { label: 'Высокий',       color: '#f59e0b' },
    urgent: { label: 'Срочный',       color: '#ef4444' },
    info:   { label: 'Для информации', color: '#8b5cf6' }
  };

  const DEFAULT_STATUSES = {
    todo:        { label: 'К выполнению', color: '#64748b' },
    doing:       { label: 'В работе',     color: '#0ea5e9' },
    done:        { label: 'Выполнено',    color: '#22c55e' },
    cancelled:   { label: 'Отмена',       color: '#94a3b8' },
    rescheduled: { label: 'Перенос',      color: '#f59e0b' }
  };

  const ROLES = {
    admin: { label: 'Администратор', hint: 'Может редактировать задачи и справочники', initials: 'А' },
    user:  { label: 'Пользователь',  hint: 'Только просмотр — редактирование недоступно', initials: 'П' }
  };

  const PALETTE = [
    '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'
  ];

  /* Повторяющиеся задачи: храним не бесконечное правило, а конкретные задачи серии.
     Без даты окончания создаём повторения на год вперёд, но не больше лимита. */
  const REPEAT_MAX = 200;
  const REPEAT_HORIZON_MONTHS = 12;
  const REPEAT_FREQS = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'];

  const WEEKDAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const WEEKDAYS_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  /* ------------------------------ Утилиты ------------------------------ */

  const pad = (n) => String(n).padStart(2, '0');

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Локальная дата -> 'YYYY-MM-DD' (без сдвига часового пояса). */
  function toKey(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  /** 'YYYY-MM-DD' -> локальная дата в полночь. */
  function fromKey(key) {
    if (!key) return new Date();
    const parts = String(key).split('-').map(Number);
    return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
  }

  function todayKey() { return toKey(new Date()); }

  function addDays(date, count) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + count);
    return d;
  }

  function addMonths(date, count) {
    const d = new Date(date.getFullYear(), date.getMonth() + count, 1);
    const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(date.getDate(), maxDay));
    return d;
  }

  /** Понедельник недели, в которую попала дата. */
  function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = (d.getDay() + 6) % 7;
    return addDays(d, -day);
  }

  function startOfMonth(date) {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  function isSameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }

  function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  function dayIndex(date) { return (date.getDay() + 6) % 7; }

  function fmtMonthYear(date) {
    return MONTHS_NOM[date.getMonth()] + ' ' + date.getFullYear();
  }

  function fmtDayLong(date) {
    return date.getDate() + ' ' + MONTHS_GEN[date.getMonth()] + ' ' + date.getFullYear();
  }

  function fmtDayShort(date) {
    return date.getDate() + ' ' + MONTHS_GEN[date.getMonth()].slice(0, 3) + '.';
  }

  function fmtWeekday(date) {
    return WEEKDAYS_FULL[dayIndex(date)];
  }

  function fmtTime(value) {
    if (!value) return '';
    return String(value).slice(0, 5);
  }

  /** 'HH:MM' -> минуты от 00:00; null для пустого или некорректного значения. */
  function parseTime(value) {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''));
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }

  /** Минуты от 00:00 -> 'HH:MM' (кламп в пределы суток). */
  function minutesToTime(total) {
    const value = Math.max(0, Math.min(1439, Math.round(total)));
    return pad(Math.floor(value / 60)) + ':' + pad(value % 60);
  }

  function initials(name) {
    if (!name) return '?';
    const parts = String(name).trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* --------------------------- Повторяющиеся задачи --------------------- */

  function normalizeRepeat(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const freq = String(raw.freq || '');
    if (REPEAT_FREQS.indexOf(freq) === -1) return null;
    let interval = Math.round(Number(raw.interval));
    if (!isFinite(interval) || interval < 1) interval = 1;
    if (interval > 99) interval = 99;
    const until = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.until || '')) ? String(raw.until) : '';
    return { freq: freq, interval: interval, until: until };
  }

  function cloneRepeat(raw) {
    const repeat = normalizeRepeat(raw);
    return repeat ? { freq: repeat.freq, interval: repeat.interval, until: repeat.until } : null;
  }

  function pluralWord(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  /** Ближайший будний день (сдвиг вперёд). */
  function nextWeekday(date) {
    let d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
    return d;
  }

  /**
   * Даты повторений серии. Первая дата — старт (кроме «по будням»,
   * где выходной сдвигается на понедельник).
   */
  function buildRepeatDates(startKey, repeat) {
    const r = normalizeRepeat(repeat);
    if (!r) return [startKey];

    const start = fromKey(startKey);
    const until = r.until ? fromKey(r.until) : null;
    const horizon = addMonths(start, REPEAT_HORIZON_MONTHS);
    const limit = until && until < horizon ? until : horizon;
    const dates = [];
    let date = r.freq === 'weekdays' ? nextWeekday(start) : new Date(start);
    let guard = 0;

    while (dates.length < REPEAT_MAX && guard < REPEAT_MAX * 3 + 10) {
      guard += 1;
      if (date.getTime() > limit.getTime()) break;
      if (date.getTime() < start.getTime()) { date = addDays(date, 1); continue; }

      dates.push(toKey(date));
      const step = dates.length;

      if (r.freq === 'weekdays') {
        date = nextWeekday(addDays(date, 1));
      } else if (r.freq === 'daily') {
        date = addDays(start, step * r.interval);
      } else if (r.freq === 'weekly') {
        date = addDays(start, step * r.interval * 7);
      } else if (r.freq === 'monthly') {
        date = addMonths(start, step * r.interval);
      } else {
        date = addMonths(start, step * r.interval * 12);
      }
    }

    if (!dates.length) {
      dates.push(toKey(r.freq === 'weekdays' ? nextWeekday(start) : start));
    }
    return dates;
  }

  function repeatLabel(repeat) {
    const r = normalizeRepeat(repeat);
    if (!r) return '';
    let text;
    if (r.freq === 'weekdays') {
      text = 'По будням';
    } else {
      const single = {
        daily: 'Ежедневно', weekly: 'Еженедельно',
        monthly: 'Ежемесячно', yearly: 'Ежегодно'
      }[r.freq];
      const units = {
        daily: ['день', 'дня', 'дней'],
        weekly: ['неделю', 'недели', 'недель'],
        monthly: ['месяц', 'месяца', 'месяцев'],
        yearly: ['год', 'года', 'лет']
      }[r.freq];
      text = r.interval === 1
        ? single
        : 'Каждые ' + r.interval + ' ' + pluralWord(r.interval, units);
    }
    if (r.until) text += ', до ' + fmtDayShort(fromKey(r.until));
    return text;
  }

  /** Все задачи одной серии повторений. */
  function seriesMembers(seriesId) {
    if (!seriesId) return [];
    return state.tasks.filter((task) => task.seriesId === seriesId);
  }

  /* --------------------------- Состояние ------------------------------- */

  const state = {
    tasks: [],
    people: [],
    priorities: {},
    statuses: {},
    users: [],
    user: { role: 'user' },
    view: 'month',
    cursor: new Date(),          // текущая дата навигации
    selectedDate: todayKey(),
    filters: {
      assignees: new Set(),      // пусто = показывать всех
      priorities: new Set(),     // пусто = показывать все
      statuses: new Set(),       // пусто = показывать все
      search: ''
    }
  };

  const listeners = [];

  /* --------------------------- Общий календарь -------------------------- */

  let shared = false;      // данные лежат в общем хранилище, а не только в браузере
  let saveTimer = null;    // отложенная запись в общее хранилище
  let dirty = false;       // есть несохранённые правки — их нельзя затирать опросом
  let appliedAt = 0;       // метка времени последних принятых данных (из exportedAt)
  let _prevSnap = null;    // предыдущий снимок tasks/users — для поиска событий уведомлений

  /* --------------------------- Пользователи/сессия ----------------------- */

  const USER_SESSION_KEY = 'task-calendar.' + NS + '.userSession';
  // Регистрации, созданные в этом браузере: без ключа доступа коллега не может
  // записать нового пользователя в общий файл, поэтому копия хранится локально
  // и подмешивается к общему списку пользователей.
  const LOCAL_USERS_KEY = 'task-calendar.' + NS + '.localUsers';
  let userSession;  // { id, login, assigneeId, email, role: 'user'|'admin' }; undefined = ещё не загружена из localStorage

  function loadLocalUsers() {
    try {
      const raw = localStorage.getItem(LOCAL_USERS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function saveLocalUsers(list) {
    try { localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(list || [])); } catch (err) { /* приватный режим */ }
  }

  function loadUserSession() {
    try {
      const raw = localStorage.getItem(USER_SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.id || !s.login) return null;
      return s;
    } catch (err) {
      return null;
    }
  }

  function saveUserSession(s) {
    try {
      if (!s) {
        localStorage.removeItem(USER_SESSION_KEY);
        userSession = null;
        return;
      }
      localStorage.setItem(USER_SESSION_KEY, JSON.stringify(s));
      userSession = s;
    } catch (err) {
      userSession = s || null;
    }
  }

  function getUserSession() {
    if (userSession === undefined) userSession = loadUserSession();
    if (userSession === undefined) userSession = null;
    return userSession;
  }

  function sha256Hex(text) {
    try {
      const enc = new TextEncoder().encode(String(text || ''));
      return crypto.subtle.digest('SHA-256', enc).then((buf) => {
        const arr = Array.from(new Uint8Array(buf));
        return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
      });
    } catch (err) {
      // Фоллбек для старых окружений (редко)
      let h = 0;
      const s = String(text || '');
      for (let i = 0; i < s.length; i++) h = ( (h << 5) - h ) + s.charCodeAt(i), h |= 0;
      return Promise.resolve(('00000000' + (h >>> 0).toString(16)).slice(-8));
    }
  }

  function normalizeUserRecord(u) {
    if (!u || !u.id || !u.login || !u.passHash) return null;
    return {
      id: String(u.id),
      login: String(u.login).trim(),
      passHash: String(u.passHash),
      email: u.email ? String(u.email).trim() : '',
      assigneeId: u.assigneeId ? String(u.assigneeId) : '',
      notify: {
        onAssign: u.notify && u.notify.onAssign !== false,
        onMove: u.notify && u.notify.onMove !== false,
        remind: u.notify && u.notify.remind !== false,
        beforeMinutes: Array.isArray(u.notify && u.notify.beforeMinutes) ? u.notify.beforeMinutes.filter((n) => typeof n === 'number') : [15, 30, 60]
      },
      channels: Array.isArray(u.channels) && u.channels.length ? u.channels.filter((c) => c === 'email') : ['email'],
      createdAt: u.createdAt || new Date().toISOString(),
      updatedAt: u.updatedAt || new Date().toISOString()
    };
  }

  function ensureUsers(data) {
    const source = data && Array.isArray(data.users) ? data.users : [];
    const out = [];
    const seen = new Set();
    source.concat(loadLocalUsers()).forEach((raw) => {
      const user = normalizeUserRecord(raw);
      if (!user || seen.has(user.id)) return;
      seen.add(user.id);
      out.push(user);
    });
    return out;
  }

  function getUsers() {
    return ensureUsers(state);
  }

  function findUserByLogin(login) {
    const l = String(login || '').trim().toLowerCase();
    if (!l) return null;
    return getUsers().find((u) => u.login.toLowerCase() === l) || null;
  }

  function upsertUser(user) {
    if (!user || !user.id) return;
    const list = ensureUsers(state);
    const idx = list.findIndex((u) => u.id === user.id);
    const now = new Date().toISOString();
    const normalized = {
      id: String(user.id),
      login: String(user.login || '').trim(),
      passHash: String(user.passHash || ''),
      email: user.email ? String(user.email).trim() : '',
      assigneeId: user.assigneeId ? String(user.assigneeId) : '',
      notify: {
        onAssign: user.notify && user.notify.onAssign !== false,
        onMove: user.notify && user.notify.onMove !== false,
        remind: user.notify && user.notify.remind !== false,
        beforeMinutes: Array.isArray(user.notify && user.notify.beforeMinutes) ? user.notify.beforeMinutes.filter((n) => typeof n === 'number') : [15, 30, 60]
      },
      channels: Array.isArray(user.channels) && user.channels.length ? user.channels.filter((c) => c === 'email') : ['email'],
      createdAt: user.createdAt || now,
      updatedAt: now
    };
    if (idx >= 0) list[idx] = normalized; else list.push(normalized);
    state.users = list;

    // Локальная копия нужна, чтобы регистрация выжила после опроса общего
    // хранилища (у пользователя без ключа нет права записать её в GitHub).
    const local = loadLocalUsers().filter((u) => !u || String(u.id) !== normalized.id);
    local.push(normalized);
    saveLocalUsers(local);
    emit(true);
  }

  function deleteUser(userId) {
    const list = ensureUsers(state);
    const next = list.filter((u) => u.id !== String(userId));
    if (next.length === list.length) return;
    state.users = next;
    saveLocalUsers(loadLocalUsers().filter((u) => u && String(u.id) !== String(userId)));
    emit(true);
  }

  /* --------------------- Уведомления (колокольчик) ---------------------- */
  /* Хранятся локально в браузере получателя. Общий файл задаёт лишь события:
     кому назначили/перенесли задачу — по привязке user.assigneeId. */

  const NOTIF_KEY = 'task-calendar.' + NS + '.notifications';
  const NOTIF_SEEN_KEY = 'task-calendar.' + NS + '.notifSeen';
  const NOTIF_LIMIT = 100;

  function loadNotifications() {
    try {
      const raw = localStorage.getItem(NOTIF_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function saveNotifications(list) {
    try {
      localStorage.setItem(NOTIF_KEY, JSON.stringify((list || []).slice(-NOTIF_LIMIT)));
    } catch (err) { /* приватный режим */ }
  }

  function loadSeen() {
    try {
      const raw = localStorage.getItem(NOTIF_SEEN_KEY);
      const seen = raw ? JSON.parse(raw) : [];
      return Array.isArray(seen) ? seen : [];
    } catch (err) {
      return [];
    }
  }

  function saveSeen(list) {
    try {
      localStorage.setItem(NOTIF_SEEN_KEY, JSON.stringify(list || []));
    } catch (err) { /* приватный режим */ }
  }

  function addNotification(entry) {
    if (!entry || !entry.id) return null;
    const list = loadNotifications();
    if (list.some((n) => n.id === entry.id)) return null;
    const item = {
      id: String(entry.id),
      kind: String(entry.kind || 'info'),
      taskId: entry.taskId ? String(entry.taskId) : '',
      title: String(entry.title || ''),
      text: String(entry.text || ''),
      at: entry.at || new Date().toISOString()
    };
    list.push(item);
    saveNotifications(list);
    return item;
  }

  function clearNotifications() {
    saveNotifications([]);
    saveSeen([]);
  }

  function markAllRead() {
    saveSeen(loadNotifications().map((n) => n.id));
    emit(false);
  }

  function unreadCount() {
    const seen = new Set(loadSeen());
    return loadNotifications().filter((n) => !seen.has(n.id)).length;
  }

  /** Моя привязка к ответственному: сессия пользователя или её отсутствие. */
  function myAssigneeId() {
    const s = getUserSession();
    return s && s.assigneeId ? String(s.assigneeId) : '';
  }

  /**
   * Сравнивает свежие данные с предыдущим снимком и создаёт уведомления
   * о назначении задачи и о переносе даты/времени.
   */
  function scanForNotifications(data) {
    const prev = _prevSnap;
    const me = myAssigneeId();

    if (prev && me) {
      const prevTasks = new Map((prev.tasks || []).map((t) => [t.id, t]));
      (data.tasks || []).forEach((task) => {
        const before = prevTasks.get(task.id);
        const person = state.people.find((p) => p.id === task.assigneeId);

        // Назначение: задачу только что передали мне.
        if (task.assigneeId === me && (!before || before.assigneeId !== me)) {
          addNotification({
            id: 'assign:' + (task.seriesId || task.id) + ':' + (task.updatedAt || task.date),
            kind: 'assign',
            taskId: task.id,
            title: 'Назначена задача',
            text: task.title + (person ? ' — ' + person.name : '')
          });
          return;
        }

        if (!before || before.assigneeId !== me || task.assigneeId !== me) return;

        // Перенос даты/времени: у меня изменились дата или время начала.
        const moved = before.date !== task.date ||
          (before.startTime || '') !== (task.startTime || '');
        if (moved) {
          addNotification({
            id: 'move:' + task.id + ':' + (task.updatedAt || task.date),
            kind: 'move',
            taskId: task.id,
            title: 'Перенос задачи',
            text: task.title + ' → ' +
              fmtDayLong(fromKey(task.date)) + (task.startTime ? ', ' + fmtTime(task.startTime) : '')
          });
        }
      });
    }

    _prevSnap = {
      tasks: (data.tasks || []).map((t) => ({
        id: t.id, assigneeId: t.assigneeId, date: t.date, startTime: t.startTime
      }))
    };
  }

  function subscribe(fn) { listeners.push(fn); }

  function emit(persist) {
    if (persist !== false) save();
    listeners.forEach((fn) => fn());
  }

  function isShared() {
    return shared;
  }

  function sharedEnabled() {
    return !!(CAL.db && CAL.db.enabled());
  }

  /* ----------------------------- Справочники --------------------------- */

  function cloneDict(source) {
    const out = {};
    Object.keys(source).forEach((key, index) => {
      out[key] = { label: source[key].label, color: source[key].color, order: index };
    });
    return out;
  }

  function reindex(dict) {
    Object.keys(dict)
      .sort((a, b) => (dict[a].order || 0) - (dict[b].order || 0))
      .forEach((key, index) => { dict[key].order = index; });
    return dict;
  }

  function normalizeDict(raw, fallback) {
    if (!raw || typeof raw !== 'object' || !Object.keys(raw).length) return cloneDict(fallback);
    const out = {};
    Object.keys(raw).forEach((key, index) => {
      const entry = raw[key];
      if (!entry || !entry.label) return;
      out[key] = {
        label: String(entry.label),
        color: entry.color || PALETTE[index % PALETTE.length],
        order: typeof entry.order === 'number' ? entry.order : index
      };
    });
    if (!Object.keys(out).length) return cloneDict(fallback);
    // Добавляем отсутствующие элементы из стандартного набора, не трогая существующие.
    if (fallback && typeof fallback === 'object') {
      Object.keys(fallback).forEach((key) => {
        if (out[key]) return;
        out[key] = {
          label: fallback[key].label,
          color: fallback[key].color || PALETTE[Object.keys(out).length % PALETTE.length],
          order: Object.keys(out).length
        };
      });
    }
    return reindex(out);
  }

  function dictRef(kind) {
    return kind === 'priority' ? state.priorities : state.statuses;
  }

  /** Список записей справочника, отсортированный по order. */
  function dictList(kind) {
    const dict = dictRef(kind);
    return Object.keys(dict).map((key) => ({
      key: key,
      label: dict[key].label,
      color: dict[key].color,
      order: dict[key].order
    })).sort((a, b) => a.order - b.order);
  }

  function dictEntry(kind, key) {
    const dict = dictRef(kind);
    return (key && dict[key]) || null;
  }

  function dictLabel(kind, key) {
    const entry = dictEntry(kind, key);
    return entry ? entry.label : '—';
  }

  function dictColor(kind, key) {
    const entry = dictEntry(kind, key);
    return entry ? entry.color : '#94a3b8';
  }

  function dictUsage(kind, key) {
    const field = kind === 'priority' ? 'priority' : 'status';
    return state.tasks.filter((task) => task[field] === key).length;
  }

  function nextDictColor(kind) {
    const dict = dictRef(kind);
    const used = new Set(Object.keys(dict).map((key) => dict[key].color));
    return PALETTE.find((color) => !used.has(color)) || PALETTE[Object.keys(dict).length % PALETTE.length];
  }

  function dictAdd(kind, label, color) {
    const dict = dictRef(kind);
    const prefix = kind === 'priority' ? 'pr' : 'st';
    const key = uid(prefix);
    dict[key] = {
      label: label,
      color: color || nextDictColor(kind),
      order: Object.keys(dict).length
    };
    emit();
    return key;
  }

  function dictUpdate(kind, key, data) {
    const dict = dictRef(kind);
    if (!dict[key]) return null;
    Object.assign(dict[key], data);
    emit();
    return dict[key];
  }

  /** Удаляет запись; задачи перевешиваются на первый оставшийся элемент. */
  function dictRemove(kind, key) {
    const dict = dictRef(kind);
    if (!dict[key]) return false;
    const keys = Object.keys(dict);
    if (keys.length <= 1) return false;

    const fallback = dictList(kind).filter((item) => item.key !== key)[0].key;
    const field = kind === 'priority' ? 'priority' : 'status';
    state.tasks.forEach((task) => {
      if (task[field] === key) task[field] = fallback;
    });

    delete dict[key];
    reindex(dict);

    const group = kind === 'priority' ? 'priorities' : 'statuses';
    state.filters[group].delete(key);

    emit();
    return true;
  }

  function sanitizeTasks() {
    const fallbackPriority = dictList('priority')[0];
    const fallbackStatus = dictList('status')[0];
    state.tasks.forEach((task) => {
      if (!dictEntry('priority', task.priority)) task.priority = fallbackPriority.key;
      if (!dictEntry('status', task.status)) task.status = fallbackStatus.key;
      if (task.assigneeId && !getPerson(task.assigneeId)) task.assigneeId = '';
    });
  }

  /* -------------------------------- Роль -------------------------------- */

  function isAdmin() {
    return state.user.role === 'admin';
  }

  /** Выдан ли этому браузеру ключ администратора. */
  function hasAdminGrant() {
    if (sharedEnabled() && CAL.db) return CAL.db.hasToken();
    try {
      return localStorage.getItem(ADMIN_KEY) === '1';
    } catch (err) {
      return false;
    }
  }

  /** SHA-256 от строки -> hex. */
  function sha256(text) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
      .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join(''));
  }

  /** Вход владельца. В общем режиме — по ключу доступа, локально — по паролю. */
  function unlockAdmin(secret) {
    if (!secret) return Promise.resolve(false);

    if (sharedEnabled() && CAL.db) {
      return CAL.db.verify(String(secret).trim()).then((valid) => {
        if (!valid) return false;
        CAL.db.setToken(String(secret).trim());
        state.user.role = 'admin';
        saveLocal();
        emit(false);
        return true;
      });
    }

    return sha256(String(secret)).then((hash) => {
      if (hash !== ADMIN_PWD_HASH) return false;
      try { localStorage.setItem(ADMIN_KEY, '1'); } catch (err) { /* приватный режим */ }
      state.user.role = 'admin';
      saveLocal();
      emit(false);
      return true;
    });
  }

  /** Снятие прав администратора в этом браузере (возврат к режиму просмотра). */
  function lockAdmin() {
    if (sharedEnabled() && CAL.db) CAL.db.clearToken();
    else { try { localStorage.removeItem(ADMIN_KEY); } catch (err) { /* пусто */ } }
    state.user.role = 'user';
    saveLocal();
    emit(false);
  }

  function setRole(role) {
    if (role === 'user') { lockAdmin(); return; }
    if (role === 'admin') {
      if (!hasAdminGrant()) return;
      state.user.role = 'admin';
      saveLocal();
      emit(false);
      return;
    }
    if (!ROLES[role]) return;
    state.user.role = role;
    emit(false);
  }

  function normalizeUser(raw) {
    const role = raw && ROLES[raw.role] ? raw.role : 'user';
    return { role: role };
  }

  /* --------------------------- Хранилище ------------------------------- */

  /** Текущее состояние в формате общего файла. */
  function snapshot() {
    return {
      version: 3,
      exportedAt: new Date().toISOString(),
      people: state.people,
      tasks: state.tasks,
      priorities: state.priorities,
      statuses: state.statuses,
      users: ensureUsers(state)
    };
  }

  function save() {
    if (shared) {
      // Зритель без ключа не может писать в общее хранилище: не пытаемся,
      // иначе индикатор связи показывал бы ошибку при каждой регистрации.
      if (!CAL.db || !CAL.db.hasToken()) return;
      schedulePush();
      return;
    }
    saveLocal();
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 3,
        tasks: state.tasks,
        people: state.people,
        priorities: state.priorities,
        statuses: state.statuses,
        users: ensureUsers(state),
        user: state.user
      }));
    } catch (err) {
      console.warn('Не удалось сохранить данные:', err);
    }
  }

  /** Отложенная запись в общее хранилище — чтобы не слать запрос на каждое движение мыши. */
  function schedulePush() {
    dirty = true;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(push, 600);
  }

  async function push() {
    saveTimer = null;
    if (!shared || !CAL.db) return;
    try {
      const snap = snapshot();
      await CAL.db.save(snap);
      dirty = false;
      appliedAt = Date.parse(snap.exportedAt || '') || appliedAt;
    } catch (err) {
      CAL.db.setStatus('error', err.message);
    }
  }

  /** Отпечаток данных — чтобы понять, изменилось ли что-то в общем хранилище. */
  function fingerprint(data) {
    const people = Array.isArray(data.people) ? data.people.map(normalizePerson) : [];
    const tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
    return JSON.stringify({
      people,
      tasks,
      priorities: normalizeDict(data.priorities, DEFAULT_PRIORITIES),
      statuses: normalizeDict(data.statuses, DEFAULT_STATUSES),
      users: ensureUsers(data)
    });
  }

  function applyData(data) {
    state.people = Array.isArray(data.people) ? data.people.map(normalizePerson) : [];
    state.priorities = normalizeDict(data.priorities, DEFAULT_PRIORITIES);
    state.statuses = normalizeDict(data.statuses, DEFAULT_STATUSES);
    state.tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
    state.users = ensureUsers(data);
    sanitizeTasks();
    scanForNotifications(data);
    appliedAt = Date.parse(data.exportedAt || '') || appliedAt;
  }

  /** Проверка обновлений в общем хранилище. */
  async function refresh() {
    if (!shared || !CAL.db || dirty) return false;
    try {
      const data = await CAL.db.load();
      const stamp = Date.parse(data.exportedAt || '') || 0;

      // GitHub отдаёт открытую ссылку с задержкой — такие данные не должны
      // откатывать более свежее состояние.
      if (stamp && appliedAt && stamp < appliedAt) return false;
      if (fingerprint(data) === fingerprint(snapshot())) return false;

      applyData(data);
      saveLocal();
      emit(false);
      return true;
    } catch (err) {
      CAL.db.setStatus('error', err.message);
      return false;
    }
  }

  async function load() {
    if (sharedEnabled()) {
      shared = true;
      try {
        const data = await CAL.db.load();
        applyData(data);
      } catch (err) {
        const cached = CAL.db.readCache();
        if (cached) applyData(cached);
        else { state.people = []; state.tasks = []; seed(); }
        CAL.db.setStatus('error', err.message);
      }
      state.user.role = CAL.db.hasToken() ? 'admin' : 'user';
      saveLocal();
      return;
    }

    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      console.warn('localStorage недоступен:', err);
    }

    if (!raw) {
      seed();
      saveLocal();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      applyData(parsed);
      state.user = normalizeUser(parsed.user);
      if (!hasAdminGrant()) state.user.role = 'user';
    } catch (err) {
      console.warn('Повреждённые данные, создаю демо-набор:', err);
      state.people = [];
      state.tasks = [];
      seed();
      saveLocal();
    }
  }

  function normalizePerson(raw) {
    return {
      id: raw.id || uid('p'),
      name: String(raw.name || 'Без имени'),
      color: raw.color || PALETTE[0]
    };
  }

  function normalizeTask(raw) {
    const history = Array.isArray(raw.history) ? raw.history.map((item) => ({
      type: String(item && item.type || ''),
      at: item && item.at || '',
      from: item && item.from ? {
        date: item.from.date || '',
        startTime: item.from.startTime || '',
        endTime: item.from.endTime || '',
        status: item.from.status || ''
      } : null,
      to: item && item.to ? {
        date: item.to.date || '',
        startTime: item.to.startTime || '',
        endTime: item.to.endTime || '',
        status: item.to.status || ''
      } : null,
      note: item && item.note ? String(item.note) : ''
    })) : [];

    return {
      id: raw.id || uid('t'),
      title: String(raw.title || 'Без названия'),
      notes: String(raw.notes || ''),
      date: raw.date || todayKey(),
      startTime: raw.startTime || '',
      endTime: raw.endTime || '',
      assigneeId: raw.assigneeId || '',
      priority: raw.priority || 'normal',
      status: raw.status || 'todo',
      seriesId: raw.seriesId || '',
      repeat: raw.repeat ? {
        freq: raw.repeat.freq || '',
        interval: raw.repeat.interval || 1,
        until: raw.repeat.until || ''
      } : null,
      history: history,
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || new Date().toISOString()
    };
  }

  /** Демонстрационные данные для первого запуска. */
  function seed() {
    state.priorities = cloneDict(DEFAULT_PRIORITIES);
    state.statuses = cloneDict(DEFAULT_STATUSES);

    const anna = normalizePerson({ id: 'p_anna', name: 'Анна Ковалёва', color: '#4f46e5' });
    const igor = normalizePerson({ id: 'p_igor', name: 'Игорь Петров', color: '#0ea5e9' });
    const lena = normalizePerson({ id: 'p_lena', name: 'Лена Соколова', color: '#10b981' });
    state.people = [anna, igor, lena];

    const today = new Date();
    const d = (offset) => toKey(addDays(today, offset));

    state.tasks = [
      normalizeTask({
        id: 't_1', title: 'Планёрка команды', date: d(0), startTime: '10:00', endTime: '10:30',
        assigneeId: anna.id, priority: 'normal', status: 'doing',
        notes: 'Обсудить релиз и блокеры по спринту.'
      }),
      normalizeTask({
        id: 't_2', title: 'Ревью макета личного кабинета', date: d(0), startTime: '14:00', endTime: '15:00',
        assigneeId: lena.id, priority: 'high', status: 'todo'
      }),
      normalizeTask({
        id: 't_3', title: 'Созвон с подрядчиком по API', date: d(1), startTime: '11:30', endTime: '12:00',
        assigneeId: igor.id, priority: 'urgent', status: 'todo'
      }),
      normalizeTask({
        id: 't_4', title: 'Подготовить отчёт за неделю', date: d(-1), startTime: '17:00',
        assigneeId: anna.id, priority: 'normal', status: 'todo',
        notes: 'Сводка по задачам и рискам.'
      }),
      normalizeTask({
        id: 't_5', title: 'Обновить зависимости в бэклоге', date: d(2),
        assigneeId: igor.id, priority: 'low', status: 'todo'
      }),
      normalizeTask({
        id: 't_6', title: 'Тест-прогон после релиза', date: d(3), startTime: '16:00', endTime: '17:30',
        assigneeId: lena.id, priority: 'high', status: 'todo'
      }),
      normalizeTask({
        id: 't_7', title: 'Согласование договора', date: d(-3),
        assigneeId: anna.id, priority: 'normal', status: 'done'
      })
    ];
  }

  /* ------------------------------- CRUD -------------------------------- */

  function getPerson(id) {
    return state.people.find((p) => p.id === id) || null;
  }

  function personName(id) {
    const person = getPerson(id);
    return person ? person.name : '';
  }

  function personColor(id) {
    const person = getPerson(id);
    return person ? person.color : '#94a3b8';
  }

  function addTask(data) {
    const task = normalizeTask(Object.assign({ id: uid('t') }, data));
    task.createdAt = new Date().toISOString();
    task.updatedAt = task.createdAt;
    state.tasks.push(task);
    emit();
    return task;
  }

  function updateTask(id, data) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    Object.assign(task, data, { updatedAt: new Date().toISOString() });
    emit();
    return task;
  }

  function removeTask(id) {
    const index = state.tasks.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const [removed] = state.tasks.splice(index, 1);
    emit();
    return removed;
  }

  function restoreTask(task, index) {
    state.tasks.splice(index == null ? state.tasks.length : index, 0, task);
    emit();
  }

  /* --------------------------- Серии повторений ------------------------- */

  /** Задачи серии по правилу повтора. Первая получает id firstId (при конвертации). */
  function buildSeriesTasks(data, repeat, options) {
    const opts = options || {};
    const dates = buildRepeatDates(data.date, repeat);
    const seriesId = opts.seriesId || uid('s');
    const now = new Date().toISOString();
    const base = Object.assign({}, data);
    delete base.id;
    delete base.repeat;
    delete base.seriesId;

    return dates.map((date, index) => {
      const task = normalizeTask(Object.assign(
        { id: index === 0 && opts.firstId ? opts.firstId : uid('t') },
        base,
        { date: date, seriesId: seriesId, repeat: repeat }
      ));
      task.createdAt = (index === 0 && opts.createdAt) || now;
      task.updatedAt = now;
      return task;
    });
  }

  /** Создаёт серию задач по правилу повтора. */
  function addTaskSeries(data) {
    const repeat = normalizeRepeat(data.repeat);
    if (!repeat) return [addTask(data)];
    const tasks = buildSeriesTasks(data, repeat);
    Array.prototype.push.apply(state.tasks, tasks);
    emit();
    return tasks;
  }

  /** Превращает обычную задачу в серию, сохраняя её id. */
  function startSeries(id, data) {
    const index = state.tasks.findIndex((t) => t.id === id);
    if (index === -1) return [];
    const existing = state.tasks[index];
    const repeat = normalizeRepeat(data.repeat);
    if (!repeat) {
      updateTask(id, data);
      return [existing];
    }
    const tasks = buildSeriesTasks(data, repeat, {
      seriesId: id,
      firstId: id,
      createdAt: existing.createdAt
    });
    state.tasks.splice(index, 1, tasks[0]);
    Array.prototype.push.apply(state.tasks, tasks.slice(1));
    emit();
    return tasks;
  }

  /**
   * Обновляет серию от указанной задачи.
   * - правило не изменилось: поля применяются ко всем, дата — только к текущей;
   * - правило изменилось: будущие повторения пересоздаются с текущей даты;
   * - повтор выключен: серия останавливается, прошедшие задачи остаются обычными.
   */
  function updateSeries(seriesId, anchorId, data) {
    const anchor = state.tasks.find((t) => t.id === anchorId && t.seriesId === seriesId);
    if (!anchor) return null;

    const repeat = normalizeRepeat(data.repeat);
    const now = new Date().toISOString();
    const fields = {
      title: data.title,
      notes: data.notes,
      startTime: data.startTime,
      endTime: data.endTime,
      assigneeId: data.assigneeId,
      priority: data.priority,
      status: data.status
    };
    const anchorDate = data.date || anchor.date;

    if (!repeat) {
      state.tasks = state.tasks.filter((t) => t.seriesId !== seriesId || t.date <= anchorDate);
      state.tasks.forEach((t) => {
        if (t.seriesId !== seriesId) return;
        Object.assign(t, fields, { updatedAt: now, seriesId: '', repeat: null });
        if (t.id === anchorId) t.date = anchorDate;
      });
      emit();
      return { stopped: true };
    }

    const changed = JSON.stringify(anchor.repeat || null) !== JSON.stringify(repeat);
    if (changed) {
      state.tasks.forEach((t) => {
        if (t.seriesId === seriesId && t.date < anchorDate) {
          Object.assign(t, fields, { updatedAt: now, repeat: cloneRepeat(repeat) });
        }
      });
      state.tasks = state.tasks.filter((t) => !(t.seriesId === seriesId && t.date >= anchorDate));
      const fresh = buildSeriesTasks(data, repeat, { seriesId: seriesId, firstId: anchorId });
      Array.prototype.push.apply(state.tasks, fresh);
      emit();
      return { regenerated: true, tasks: fresh };
    }

    const members = seriesMembers(seriesId);
    members.forEach((t) => {
      Object.assign(t, fields, { updatedAt: now, repeat: cloneRepeat(repeat) });
    });
    anchor.date = anchorDate;
    emit();
    return { tasks: members };
  }

  /** Удаляет все задачи серии; возвращает их для отмены. */
  function removeSeries(seriesId) {
    const members = seriesMembers(seriesId);
    if (!members.length) return [];
    state.tasks = state.tasks.filter((t) => t.seriesId !== seriesId);
    emit();
    return members;
  }

  function restoreTasks(list) {
    if (!Array.isArray(list) || !list.length) return;
    const existing = new Set(state.tasks.map((t) => t.id));
    list.forEach((task) => {
      if (!task || !task.id || existing.has(task.id)) return;
      state.tasks.push(task);
      existing.add(task.id);
    });
    emit();
  }

  function addPerson(name, color) {
    const person = normalizePerson({ id: uid('p'), name, color: color || nextPersonColor() });
    state.people.push(person);
    emit();
    return person;
  }

  function updatePerson(id, data) {
    const person = getPerson(id);
    if (!person) return null;
    Object.assign(person, data);
    emit();
    return person;
  }

  function removePerson(id) {
    const index = state.people.findIndex((p) => p.id === id);
    if (index === -1) return null;
    const [removed] = state.people.splice(index, 1);
    state.tasks.forEach((task) => {
      if (task.assigneeId === id) task.assigneeId = '';
    });
    emit();
    return removed;
  }

  function nextPersonColor() {
    const used = new Set(state.people.map((p) => p.color));
    return PALETTE.find((c) => !used.has(c)) || PALETTE[state.people.length % PALETTE.length];
  }

  function taskCountForPerson(id) {
    return state.tasks.filter((t) => t.assigneeId === id).length;
  }

  /* --------------------------- Выборка задач --------------------------- */

  function matchesFilters(task, filters) {
    const f = filters || state.filters;

    if (f.assignees.size) {
      const key = task.assigneeId || 'none';
      if (!f.assignees.has(key)) return false;
    }

    if (f.priorities.size && !f.priorities.has(task.priority)) return false;
    if (f.statuses.size && !f.statuses.has(task.status)) return false;

    const query = (f.search || '').trim().toLowerCase();
    if (query) {
      const who = personName(task.assigneeId).toLowerCase();
      const haystack = (task.title + ' ' + task.notes + ' ' + who).toLowerCase();
      if (haystack.indexOf(query) === -1) return false;
    }

    return true;
  }

  function visibleTasks() {
    return state.tasks.filter((t) => matchesFilters(t));
  }

  function tasksByDate(dateKey) {
    return visibleTasks()
      .filter((t) => t.date === dateKey)
      .sort(compareTasks);
  }

  function tasksInRange(from, to) {
    return visibleTasks()
      .filter((t) => t.date >= from && t.date <= to)
      .sort(compareTasks);
  }

  function compareTasks(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.startTime !== b.startTime) {
      if (!a.startTime) return 1;
      if (!b.startTime) return -1;
      return a.startTime < b.startTime ? -1 : 1;
    }
    const pa = dictEntry('priority', a.priority);
    const pb = dictEntry('priority', b.priority);
    return (pb ? pb.order : 0) - (pa ? pa.order : 0);
  }

  function isOverdue(task) {
    if (task.status === 'done' || task.status === 'cancelled' || task.status === 'rescheduled') return false;
    return task.date < todayKey();
  }

  /* ------------------------------ Статистика --------------------------- */

  function stats() {
    const today = todayKey();
    const monthPrefix = toKey(startOfMonth(state.cursor)).slice(0, 7);
    return {
      total: state.tasks.length,
      today: state.tasks.filter((t) => t.date === today).length,
      overdue: state.tasks.filter(isOverdue).length,
      done: state.tasks.filter((t) => t.status === 'done' && t.date.indexOf(monthPrefix) === 0).length
    };
  }

  /* ------------------------------- Экспорт ----------------------------- */

  function exportData() {
    return JSON.stringify(snapshot(), null, 2);
  }

  function importData(json, merge) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    if (!parsed || !Array.isArray(parsed.tasks)) throw new Error('Некорректный формат файла');

    const people = Array.isArray(parsed.people) ? parsed.people.map(normalizePerson) : [];

    if (merge) {
      const personIds = new Set(state.people.map((p) => p.id));
      people.forEach((p) => {
        if (!personIds.has(p.id)) state.people.push(p);
      });
      const taskIds = new Set(state.tasks.map((t) => t.id));
      parsed.tasks.map(normalizeTask).forEach((t) => {
        if (!taskIds.has(t.id)) state.tasks.push(t);
      });
      if (parsed.priorities) mergeDict('priority', parsed.priorities);
      if (parsed.statuses) mergeDict('status', parsed.statuses);
      if (Array.isArray(parsed.users)) {
        const existing = new Map(getUsers().map((u) => [u.id, u]));
        parsed.users.forEach((u) => {
          if (!u || !u.id) return;
          existing.set(String(u.id), ensureUsers({ users: [u] })[0]);
        });
        state.users = Array.from(existing.values());
      }
    } else {
      state.people = people;
      state.tasks = parsed.tasks.map(normalizeTask);
      state.priorities = normalizeDict(parsed.priorities, DEFAULT_PRIORITIES);
      state.statuses = normalizeDict(parsed.statuses, DEFAULT_STATUSES);
      state.users = ensureUsers(parsed);
    }
    sanitizeTasks();
    emit();
    return { people: people.length, tasks: parsed.tasks.length };
  }

  function mergeDict(kind, raw) {
    const dict = dictRef(kind);
    const incoming = normalizeDict(raw, kind === 'priority' ? DEFAULT_PRIORITIES : DEFAULT_STATUSES);
    Object.keys(incoming).forEach((key) => {
      if (!dict[key]) {
        dict[key] = {
          label: incoming[key].label,
          color: incoming[key].color,
          order: Object.keys(dict).length
        };
      }
    });
    reindex(dict);
  }

  function resetAll() {
    state.tasks = [];
    state.people = [];
    state.priorities = cloneDict(DEFAULT_PRIORITIES);
    state.statuses = cloneDict(DEFAULT_STATUSES);
    state.users = [];
    saveLocalUsers([]);
    saveUserSession(null);
    state.filters.assignees.clear();
    state.filters.priorities.clear();
    state.filters.statuses.clear();
    state.filters.search = '';
    emit();
  }

  /* ------------------------------- Export ------------------------------ */

  CAL.ROLES = ROLES;
  CAL.PALETTE = PALETTE;
  CAL.WEEKDAYS_SHORT = WEEKDAYS_SHORT;
  CAL.MONTHS_GEN = MONTHS_GEN;

  CAL.state = state;
  CAL.utils = {
    toKey, fromKey, todayKey, addDays, addMonths, startOfWeek, startOfMonth,
    isSameDay, isWeekend, dayIndex, fmtMonthYear, fmtDayLong, fmtDayShort,
    fmtWeekday, fmtTime, parseTime, minutesToTime, initials, escapeHtml, uid
  };

  CAL.store = {
    load, save, subscribe, emit, refresh, isShared, snapshot,
    getPerson, personName, personColor, taskCountForPerson,
    addTask, updateTask, removeTask, restoreTask,
    addTaskSeries, startSeries, updateSeries, removeSeries, restoreTasks, repeatLabel, seriesMembers,
    addPerson, updatePerson, removePerson, nextPersonColor,
    dictList, dictEntry, dictLabel, dictColor, dictUsage, nextDictColor,
    dictAdd, dictUpdate, dictRemove,
    isAdmin, setRole, unlockAdmin, lockAdmin, hasAdminGrant,
    matchesFilters, visibleTasks, tasksByDate, tasksInRange, isOverdue,
    stats, exportData, importData, resetAll,
    sha256Hex, getUserSession, saveUserSession, getUsers, findUserByLogin, upsertUser, deleteUser, ensureUsers,
    loadLocalUsers, saveLocalUsers,
    loadNotifications, saveNotifications, loadSeen, saveSeen, addNotification, clearNotifications, markAllRead, unreadCount, scanForNotifications
  };
})(window.CAL);
