/* =========================================================================
   store.js — состояние приложения, справочники, даты и localStorage
   ========================================================================= */
window.CAL = window.CAL || {};

(function (CAL) {
  'use strict';

  /* ----------------------------- Константы ----------------------------- */

  const STORAGE_KEY = 'task-calendar.v1';

  /* Права администратора: выдаются только этому браузеру после ввода пароля владельца.
     Пароль хранится не текстом, а SHA-256 хэшем — чтобы его нельзя было прочитать в коде.
     Чтобы сменить пароль: node -e "console.log(require('crypto').createHash('sha256').update('НОВЫЙ_ПАРОЛЬ').digest('hex'))" */
  const ADMIN_KEY = 'task-calendar.admin';
  const ADMIN_PWD_HASH = '4e1d0a7f06351f71e874ac97d7a645b4f92a0dbdd29cc169403f2f86057ac01a';

  const DEFAULT_PRIORITIES = {
    low:    { label: 'Низкий',   color: '#94a3b8' },
    normal: { label: 'Обычный',  color: '#3b82f6' },
    high:   { label: 'Высокий', color: '#f59e0b' },
    urgent: { label: 'Срочный',  color: '#ef4444' }
  };

  const DEFAULT_STATUSES = {
    todo:  { label: 'К выполнению', color: '#64748b' },
    doing: { label: 'В работе',     color: '#0ea5e9' },
    done:  { label: 'Выполнено',    color: '#22c55e' }
  };

  const ROLES = {
    admin: { label: 'Администратор', hint: 'Может редактировать задачи и справочники', initials: 'А' },
    user:  { label: 'Пользователь',  hint: 'Только просмотр — редактирование недоступно', initials: 'П' }
  };

  const PALETTE = [
    '#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
    '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'
  ];

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

  /* --------------------------- Состояние ------------------------------- */

  const state = {
    tasks: [],
    people: [],
    priorities: {},
    statuses: {},
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
      version: 2,
      exportedAt: new Date().toISOString(),
      people: state.people,
      tasks: state.tasks,
      priorities: state.priorities,
      statuses: state.statuses
    };
  }

  function save() {
    if (shared) {
      schedulePush();
      return;
    }
    saveLocal();
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 2,
        tasks: state.tasks,
        people: state.people,
        priorities: state.priorities,
        statuses: state.statuses,
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
      statuses: normalizeDict(data.statuses, DEFAULT_STATUSES)
    });
  }

  function applyData(data) {
    state.people = Array.isArray(data.people) ? data.people.map(normalizePerson) : [];
    state.priorities = normalizeDict(data.priorities, DEFAULT_PRIORITIES);
    state.statuses = normalizeDict(data.statuses, DEFAULT_STATUSES);
    state.tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
    sanitizeTasks();
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
    if (task.status === 'done') return false;
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
    } else {
      state.people = people;
      state.tasks = parsed.tasks.map(normalizeTask);
      state.priorities = normalizeDict(parsed.priorities, DEFAULT_PRIORITIES);
      state.statuses = normalizeDict(parsed.statuses, DEFAULT_STATUSES);
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
    addPerson, updatePerson, removePerson, nextPersonColor,
    dictList, dictEntry, dictLabel, dictColor, dictUsage, nextDictColor,
    dictAdd, dictUpdate, dictRemove,
    isAdmin, setRole, unlockAdmin, lockAdmin, hasAdminGrant,
    matchesFilters, visibleTasks, tasksByDate, tasksInRange, isOverdue,
    stats, exportData, importData, resetAll
  };
})(window.CAL);
