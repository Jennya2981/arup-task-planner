/* =========================================================================
   modal.js — модальные окна: задача, ответственные, справочники,
              подтверждение, уведомления
   ========================================================================= */
(function (CAL) {
  'use strict';

  const { state, store, utils } = CAL;
  const { escapeHtml, initials, toKey } = utils;

  const dom = {};
  let editingTaskId = null;
  let pendingColor = null;
  const dictPendingColor = { priority: null, status: null };

  function cacheElements() {
    dom.taskModal = document.getElementById('taskModal');
    dom.taskForm = document.getElementById('taskForm');
    dom.taskModalTitle = document.getElementById('taskModalTitle');
    dom.taskReadonlyHint = document.getElementById('taskReadonlyHint');
    dom.deleteTaskBtn = document.getElementById('deleteTaskBtn');
    dom.saveTaskBtn = document.getElementById('saveTaskBtn');
    dom.cancelTaskBtn = document.getElementById('cancelTaskBtn');
    dom.peopleModal = document.getElementById('peopleModal');
    dom.peopleForm = document.getElementById('personForm');
    dom.peopleList = document.getElementById('peopleList');
    dom.personSwatches = document.getElementById('personSwatches');
    dom.dictModal = document.getElementById('dictModal');
    dom.dictListPriority = document.getElementById('dictListPriority');
    dom.dictListStatus = document.getElementById('dictListStatus');
    dom.dictSwatchesPriority = document.getElementById('dictSwatchesPriority');
    dom.dictSwatchesStatus = document.getElementById('dictSwatchesStatus');
    dom.confirmModal = document.getElementById('confirmModal');
    dom.confirmText = document.getElementById('confirmText');
    dom.confirmTitle = document.getElementById('confirmTitle');
    dom.confirmOk = document.getElementById('confirmOk');
    dom.tokenModal = document.getElementById('tokenModal');
    dom.tokenForm = document.getElementById('tokenForm');
    dom.tokenError = document.getElementById('tokenError');
    dom.tokenSubmit = document.getElementById('tokenSubmit');
    dom.toasts = document.getElementById('toasts');
  }

  /* --------------------------- Открытие / закрытие ---------------------- */

  function openModal(node) {
    node.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal(node) {
    node.hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.style.overflow = '';
  }

  function isOpen(node) { return node && !node.hidden; }

  function plural(n, forms) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return forms[0];
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
    return forms[2];
  }

  function pluralTasks(n) { return n + ' ' + plural(n, ['задача', 'задачи', 'задач']); }

  /* ------------------------------ Задача -------------------------------- */

  function fillSelect(select, list, selected) {
    select.innerHTML = list.map((item) =>
      '<option value="' + escapeHtml(item.key) + '"' + (item.key === selected ? ' selected' : '') + '>' +
      escapeHtml(item.label) + '</option>').join('');
  }

  /** Включает/выключает режим просмотра формы задачи. */
  function applyTaskFormMode(admin) {
    dom.taskForm.querySelectorAll('input, select, textarea').forEach((control) => {
      control.disabled = !admin;
    });
    dom.saveTaskBtn.hidden = !admin;
    dom.deleteTaskBtn.hidden = !(admin && editingTaskId);
    dom.cancelTaskBtn.textContent = admin ? 'Отмена' : 'Закрыть';
    dom.taskReadonlyHint.hidden = admin;
  }

  function openTaskModal(taskId, dateKey, prefillStartTime) {
    editingTaskId = taskId || null;

    const admin = store.isAdmin();
    const form = dom.taskForm;
    form.reset();

    fillSelect(form.elements.priority, store.dictList('priority'), 'normal');
    fillSelect(form.elements.status, store.dictList('status'), 'todo');

    const people = state.people.map((person) =>
      '<option value="' + escapeHtml(person.id) + '">' + escapeHtml(person.name) + '</option>').join('');
    form.elements.assigneeId.innerHTML = '<option value="">— не назначен —</option>' + people;

    if (taskId) {
      const task = state.tasks.find((t) => t.id === taskId);
      if (!task) return;
      dom.taskModalTitle.textContent = admin ? 'Редактирование задачи' : 'Задача';
      form.elements.title.value = task.title;
      form.elements.date.value = task.date;
      form.elements.startTime.value = task.startTime || '';
      form.elements.endTime.value = task.endTime || '';
      form.elements.assigneeId.value = task.assigneeId || '';
      form.elements.priority.value = task.priority;
      form.elements.status.value = task.status;
      form.elements.notes.value = task.notes || '';
    } else {
      dom.taskModalTitle.textContent = 'Новая задача';
      form.elements.date.value = dateKey || state.selectedDate || toKey(new Date());
      if (prefillStartTime) form.elements.startTime.value = prefillStartTime;
      form.elements.priority.value = store.dictEntry('priority', 'normal') ? 'normal' : store.dictList('priority')[0].key;
      form.elements.status.value = store.dictEntry('status', 'todo') ? 'todo' : store.dictList('status')[0].key;
    }

    applyTaskFormMode(admin);
    openModal(dom.taskModal);
    if (admin) setTimeout(() => form.elements.title.focus(), 30);
  }

  function submitTask(event) {
    event.preventDefault();
    if (!store.isAdmin()) return;

    const form = dom.taskForm;

    const title = form.elements.title.value.trim();
    if (!title) {
      form.elements.title.focus();
      return;
    }

    const date = form.elements.date.value || toKey(new Date());
    let startTime = form.elements.startTime.value || '';
    let endTime = form.elements.endTime.value || '';

    if (startTime && endTime && endTime < startTime) {
      const swap = startTime;
      startTime = endTime;
      endTime = swap;
    }

    const payload = {
      title,
      notes: form.elements.notes.value.trim(),
      date,
      startTime,
      endTime,
      assigneeId: form.elements.assigneeId.value || '',
      priority: form.elements.priority.value,
      status: form.elements.status.value
    };

    if (editingTaskId) {
      store.updateTask(editingTaskId, payload);
      showToast('Задача обновлена');
    } else {
      state.selectedDate = date;
      store.addTask(payload);
      showToast('Задача создана');
    }

    closeModal(dom.taskModal);
  }

  function deleteCurrentTask() {
    if (!store.isAdmin() || !editingTaskId) return;
    const task = state.tasks.find((t) => t.id === editingTaskId);
    if (!task) return;

    confirmDialog(
      'Удалить задачу?',
      'Задача «' + task.title + '» будет удалена безвозвратно.',
      () => {
        const index = state.tasks.findIndex((t) => t.id === editingTaskId);
        store.removeTask(editingTaskId);
        closeModal(dom.taskModal);
        showToast('Задача удалена', {
          actionLabel: 'Вернуть',
          onAction: () => {
            store.restoreTask(task, index);
            showToast('Задача восстановлена');
          }
        });
      }
    );
  }

  /* --------------------------- Ответственные --------------------------- */

  function openPeopleModal() {
    if (!store.isAdmin()) return;
    pendingColor = store.nextPersonColor();
    renderPeopleList();
    renderSwatches();
    openModal(dom.peopleModal);
  }

  function renderSwatches() {
    dom.personSwatches.innerHTML = CAL.PALETTE.map((color) =>
      '<button type="button" class="swatch' + (color === pendingColor ? ' is-active' : '') +
      '" style="background:' + color + '" data-color="' + color + '" title="' + color + '"></button>'
    ).join('');
  }

  function setPendingColor(color) {
    pendingColor = color;
    renderSwatches();
  }

  function renderPeopleList() {
    dom.peopleList.innerHTML = state.people.map((person) => {
      const count = store.taskCountForPerson(person.id);
      return `
        <li class="person-row">
          <span class="person-row__dot" style="background:${escapeHtml(person.color)}">${escapeHtml(initials(person.name))}</span>
          <span class="person-row__name">${escapeHtml(person.name)}</span>
          <span class="person-row__count">${pluralTasks(count)}</span>
          <button type="button" class="mini-btn admin-only" data-person-rename="${escapeHtml(person.id)}">Переименовать</button>
          <button type="button" class="mini-btn admin-only" data-person-color="${escapeHtml(person.id)}">Цвет</button>
          <button type="button" class="mini-btn mini-btn--danger admin-only" data-person-delete="${escapeHtml(person.id)}">Удалить</button>
        </li>`;
    }).join('');
  }

  function addPerson(event) {
    event.preventDefault();
    if (!store.isAdmin()) return;
    const input = dom.peopleForm.elements.name;
    const name = input.value.trim();
    if (!name) return;

    const person = store.addPerson(name, pendingColor || store.nextPersonColor());
    pendingColor = store.nextPersonColor();
    input.value = '';
    renderSwatches();
    renderPeopleList();
    showToast('Добавлен ответственный: ' + person.name);
  }

  function renamePerson(id) {
    if (!store.isAdmin()) return;
    const person = store.getPerson(id);
    if (!person) return;
    const name = window.prompt('Новое имя ответственного', person.name);
    if (name == null) return;
    const clean = name.trim();
    if (!clean) return;
    store.updatePerson(id, { name: clean });
    renderPeopleList();
  }

  function recolorPerson(id) {
    if (!store.isAdmin()) return;
    const person = store.getPerson(id);
    if (!person) return;
    const current = CAL.PALETTE.indexOf(person.color);
    const next = CAL.PALETTE[(current + 1) % CAL.PALETTE.length];
    store.updatePerson(id, { color: next });
    renderPeopleList();
  }

  function deletePerson(id) {
    if (!store.isAdmin()) return;
    const person = store.getPerson(id);
    if (!person) return;
    const count = store.taskCountForPerson(id);
    confirmDialog(
      'Удалить ответственного?',
      'Ответственный «' + person.name + '» будет удалён' +
      (count ? '. ' + pluralTasks(count).replace(/^\d+\s/, '') + ' останутся без назначения.' : '.'),
      () => {
        store.removePerson(id);
        renderPeopleList();
        showToast('Ответственный удалён');
      }
    );
  }

  /* --------------------- Справочники: приоритеты и статусы --------------- */

  function dictSwatchContainer(kind) {
    return kind === 'priority' ? dom.dictSwatchesPriority : dom.dictSwatchesStatus;
  }

  function dictListContainer(kind) {
    return kind === 'priority' ? dom.dictListPriority : dom.dictListStatus;
  }

  function openDictModal() {
    if (!store.isAdmin()) return;
    ['priority', 'status'].forEach((kind) => {
      dictPendingColor[kind] = store.nextDictColor(kind);
    });
    renderDictModal();
    openModal(dom.dictModal);
  }

  function renderDictModal() {
    ['priority', 'status'].forEach(renderDictSection);
  }

  function renderDictSection(kind) {
    renderDictSwatches(kind);
    renderDictList(kind);
  }

  function renderDictSwatches(kind) {
    dictSwatchContainer(kind).innerHTML = CAL.PALETTE.map((color) =>
      '<button type="button" class="swatch' + (color === dictPendingColor[kind] ? ' is-active' : '') +
      '" style="background:' + color + '" data-color="' + color + '" data-dict-kind="' + kind + '"></button>'
    ).join('');
  }

  function setDictColor(kind, color) {
    dictPendingColor[kind] = color;
    renderDictSwatches(kind);
  }

  function renderDictList(kind) {
    const items = store.dictList(kind);
    dictListContainer(kind).innerHTML = items.map((item) => `
      <li class="person-row">
        <span class="person-row__dot" style="background:${escapeHtml(item.color)}"></span>
        <span class="person-row__name">${escapeHtml(item.label)}</span>
        <span class="person-row__count">${pluralTasks(store.dictUsage(kind, item.key))}</span>
        <button type="button" class="mini-btn" data-dict-rename="${kind}:${escapeHtml(item.key)}">Переименовать</button>
        <button type="button" class="mini-btn" data-dict-color="${kind}:${escapeHtml(item.key)}">Цвет</button>
        <button type="button" class="mini-btn mini-btn--danger" data-dict-delete="${kind}:${escapeHtml(item.key)}">Удалить</button>
      </li>`).join('');
  }

  function addDict(kind, form) {
    if (!store.isAdmin()) return;
    const input = form.elements.label;
    const label = input.value.trim();
    if (!label) return;

    const key = store.dictAdd(kind, label, dictPendingColor[kind]);
    dictPendingColor[kind] = store.nextDictColor(kind);
    input.value = '';
    renderDictSection(kind);
    showToast('Добавлен ' + (kind === 'priority' ? 'приоритет' : 'статус') + ': ' + label);
    return key;
  }

  function renameDict(ref) {
    if (!store.isAdmin()) return;
    const [kind, key] = splitRef(ref);
    const current = store.dictEntry(kind, key);
    if (!current) return;
    const label = window.prompt('Новое название', current.label);
    if (label == null) return;
    const clean = label.trim();
    if (!clean) return;
    store.dictUpdate(kind, key, { label: clean });
    renderDictSection(kind);
    showToast('Название изменено: ' + clean);
  }

  function recolorDict(ref) {
    if (!store.isAdmin()) return;
    const [kind, key] = splitRef(ref);
    const current = store.dictEntry(kind, key);
    if (!current) return;
    const all = CAL.PALETTE;
    const next = all[(all.indexOf(current.color) + 1) % all.length];
    store.dictUpdate(kind, key, { color: next });
    renderDictSection(kind);
  }

  function deleteDict(ref) {
    if (!store.isAdmin()) return;
    const [kind, key] = splitRef(ref);
    const current = store.dictEntry(kind, key);
    if (!current) return;
    const kindLabel = kind === 'priority' ? 'приоритет' : 'статус';
    const usage = store.dictUsage(kind, key);
    const remaining = store.dictList(kind).filter((item) => item.key !== key);
    const note = (usage && remaining.length)
      ? ' Задачи (' + usage + ') получат «' + remaining[0].label + '».'
      : '';

    confirmDialog(
      'Удалить ' + kindLabel + '?',
      '«' + current.label + '» будет удалён из справочника.' + note,
      () => {
        const removed = store.dictRemove(kind, key);
        if (!removed) {
          showToast('Нельзя удалить последний элемент справочника');
          return;
        }
        renderDictSection(kind);
        showToast('Запись удалена');
      },
      'Удалить'
    );
  }

  function splitRef(ref) {
    const index = String(ref).indexOf(':');
    return [String(ref).slice(0, index), String(ref).slice(index + 1)];
  }

  /* ---------------------------- Подтверждение --------------------------- */

  let confirmHandler = null;

  function confirmDialog(title, text, onConfirm, okLabel) {
    dom.confirmTitle.textContent = title;
    dom.confirmText.textContent = text;
    dom.confirmOk.textContent = okLabel || 'Удалить';
    confirmHandler = onConfirm;
    openModal(dom.confirmModal);
  }

  function acceptConfirm() {
    closeModal(dom.confirmModal);
    const handler = confirmHandler;
    confirmHandler = null;
    if (handler) handler();
  }

  /* ------------------------------ Уведомления --------------------------- */

  function showToast(message, options) {
    const opts = options || {};
    const toast = document.createElement('div');
    toast.className = 'toast';

    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    if (opts.actionLabel && opts.onAction) {
      const button = document.createElement('button');
      button.className = 'toast__action';
      button.textContent = opts.actionLabel;
      button.addEventListener('click', () => {
        opts.onAction();
        toast.remove();
      });
      toast.appendChild(button);
    }

    dom.toasts.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      setTimeout(() => toast.remove(), 200);
    }, opts.duration || (opts.actionLabel ? 6000 : 2600));
  }

  /* ------------------------------ Export ------------------------------- */

  /* --------------------------- Вход владельца --------------------------- */

  /** Модалка входа владельца: ключ доступа к общему календарю. */
  function openTokenModal() {
    dom.tokenForm.reset();
    dom.tokenError.hidden = true;
    openModal(dom.tokenModal);
    setTimeout(() => dom.tokenForm.elements.token.focus(), 30);
  }

  function submitToken(event) {
    event.preventDefault();
    const value = dom.tokenForm.elements.token.value.trim();
    if (!value) return;

    dom.tokenError.hidden = true;
    dom.tokenSubmit.disabled = true;
    dom.tokenSubmit.textContent = 'Проверяю…';

    store.unlockAdmin(value).then((granted) => {
      dom.tokenSubmit.disabled = false;
      dom.tokenSubmit.textContent = 'Войти';
      if (granted) {
        closeModal(dom.tokenModal);
        showToast('Режим администратора включён');
        if (CAL.app && CAL.app.startSync) CAL.app.startSync();
      } else {
        const reason = (CAL.db && CAL.db.getStatus && CAL.db.getStatus().message) || 'Ключ не подошёл или нет доступа к хранилищу';
        dom.tokenError.textContent = reason;
        dom.tokenError.hidden = false;
      }
    });
  }

  CAL.modal = {
    cacheElements,
    openTaskModal,
    submitTask,
    deleteCurrentTask,
    openPeopleModal,
    setPendingColor,
    addPerson,
    renamePerson,
    recolorPerson,
    deletePerson,
    renderPeopleList,
    renderSwatches,
    openDictModal,
    renderDictModal,
    renderDictSection,
    setDictColor,
    addDict,
    renameDict,
    recolorDict,
    deleteDict,
    confirmDialog,
    acceptConfirm,
    showToast,
    openTokenModal,
    submitToken,
    openModal,
    closeModal,
    isOpen,
    get editingTaskId() { return editingTaskId; }
  };
})(window.CAL);
