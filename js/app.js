/* =========================================================================
   app.js — инициализация, события, горячие клавиши
   ========================================================================= */
(function (CAL) {
  'use strict';

  const { state, store, utils } = CAL;
  const { toKey, fromKey } = utils;

  const dom = {};
  let searchTimer = null;
  let syncTick = null;
  let syncPeriod = 0;

  function cacheElements() {
    [
      'viewNav', 'prevBtn', 'nextBtn', 'todayBtn', 'newTaskBtn', 'menuBtn',
      'searchInput', 'searchClear', 'managePeopleBtn', 'exportBtn', 'importBtn',
      'importFile', 'resetBtn', 'app', 'roleSelect', 'managePriorityBtn',
      'manageStatusBtn', 'dictFormPriority', 'dictFormStatus', 'adminLoginBtn',
      'syncStatus', 'userRegBtn', 'userLoginBtn', 'userProfileBtn', 'userLogoutBtn',
      'notifUsersBtn', 'userSessionHint', 'bellBtn', 'bellBadge'
    ].forEach((id) => { dom[id] = document.getElementById(id); });
  }

  /* -------------------------------- Старт -------------------------------- */

  async function init() {
    CAL.ui.cacheElements();
    CAL.modal.cacheElements();
    cacheElements();

    bindStaticEvents();
    bindDelegatedEvents();
    bindKeyboard();

    store.subscribe(() => { CAL.ui.render(); updateBellUI(); });

    await store.load();
    CAL.ui.render();
    if (CAL.modal && CAL.modal.bindUserEvents) CAL.modal.bindUserEvents();
    if (CAL.modal && CAL.modal.bindBellEvents) CAL.modal.bindBellEvents();
    updateUserSessionUI();

    if (store.isShared()) {
      CAL.db.onStatus(renderSync);
      startSync();
      renderSync(CAL.db.getStatus());
    }
  }

  function updateBellUI() {
    if (!dom.bellBadge) return;
    const c = store.unreadCount ? store.unreadCount() : 0;
    if (c > 0) {
      dom.bellBadge.textContent = c > 99 ? '99+' : String(c);
      dom.bellBadge.style.display = 'inline-block';
    } else {
      dom.bellBadge.style.display = 'none';
    }
  }

  function updateUserSessionUI() {
    const s = store.getUserSession ? store.getUserSession() : null;
    if (dom.userRegBtn) dom.userRegBtn.hidden = !!s;
    if (dom.userLoginBtn) dom.userLoginBtn.hidden = !!s;
    if (dom.userProfileBtn) dom.userProfileBtn.hidden = !s;
    if (dom.userLogoutBtn) dom.userLogoutBtn.hidden = !s;
    const isAdmin = store.isAdmin ? store.isAdmin() : false;
    if (dom.notifUsersBtn) dom.notifUsersBtn.hidden = !isAdmin;
    if (dom.userSessionHint) {
      if (s) {
        dom.userSessionHint.hidden = false;
        dom.userSessionHint.textContent = 'Уведомления: ' + s.login;
      } else {
        dom.userSessionHint.hidden = true;
        dom.userSessionHint.textContent = '';
      }
    }
    updateBellUI();
    if (CAL.modal && CAL.modal.renderNotifUsers && isAdmin) CAL.modal.renderNotifUsers();
  }

  function syncInterval() {
    const base = store.isAdmin() ? 20000 : 90000;
    return (CAL.db && CAL.db.suggestedInterval) ? CAL.db.suggestedInterval(base) : base;
  }

  function startSync() {
    if (!store.isShared() || !CAL.db) return;
    syncTick = () => {
      if (document.visibilityState === 'hidden') return;
      store.refresh();
      resync();
    };
    syncPeriod = syncInterval();
    CAL.db.startPolling(syncTick, syncPeriod);
  }

  /** Период может измениться, когда кончается квота запросов без ключа. */
  function resync() {
    if (!CAL.db || !syncTick) return;
    const want = syncInterval();
    if (want !== syncPeriod) {
      syncPeriod = want;
      CAL.db.startPolling(syncTick, syncPeriod);
    }
  }

  /** Индикатор связи с общим календарём. */
  function renderSync(status) {
    if (!dom.syncStatus) return;
    const s = status || {};
    const time = new Date(s.at || Date.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    dom.syncStatus.hidden = false;

    if (s.state === 'error') {
      dom.syncStatus.textContent = 'Нет связи';
      dom.syncStatus.className = 'sync sync--warn';
      dom.syncStatus.title = s.message || 'Не удалось связаться с общим календарём';
    } else if (s.state === 'warn') {
      dom.syncStatus.textContent = 'Обновление с задержкой';
      dom.syncStatus.className = 'sync sync--warn';
      dom.syncStatus.title = s.message || 'Показан кэш GitHub, данные могут отставать';
    } else if (s.state === 'saved') {
      dom.syncStatus.textContent = 'Сохранено в общий календарь';
      dom.syncStatus.className = 'sync sync--ok';
      dom.syncStatus.title = 'Изменения записаны в общее хранилище';
    } else {
      dom.syncStatus.textContent = 'Общий календарь · ' + time;
      dom.syncStatus.className = 'sync';
      dom.syncStatus.title = 'Данные общие для всех, кто открыл ссылку';
    }
  }

  /* ------------------------------ События -------------------------------- */

  function bindStaticEvents() {
    dom.viewNav.addEventListener('click', (event) => {
      const btn = event.target.closest('.nav__item');
      if (!btn) return;
      state.view = btn.dataset.view;
      CAL.ui.render();
    });

    dom.prevBtn.addEventListener('click', () => CAL.ui.navigate(-1));
    dom.nextBtn.addEventListener('click', () => CAL.ui.navigate(1));
    dom.todayBtn.addEventListener('click', () => CAL.ui.goToday());

    dom.newTaskBtn.addEventListener('click', () => {
      if (!store.isAdmin()) return;
      CAL.modal.openTaskModal(null, state.selectedDate);
    });

    dom.roleSelect.addEventListener('change', () => {
      if (dom.roleSelect.value === 'user') {
        store.lockAdmin();
        CAL.modal.showToast('Режим администратора выключен — только просмотр');
        startSync();
        return;
      }
      if (!store.hasAdminGrant()) {
        dom.roleSelect.value = state.user.role;
        return;
      }
      store.setRole('admin');
      CAL.modal.showToast('Роль: Администратор — редактирование доступно');
      startSync();
    });

    dom.adminLoginBtn.addEventListener('click', () => {
      if (store.isShared()) {
        CAL.modal.openTokenModal();
        return;
      }
      const pwd = window.prompt('Пароль администратора');
      if (pwd === null) return;
      store.unlockAdmin(pwd).then((granted) => {
        CAL.modal.showToast(granted
          ? 'Режим администратора включён'
          : 'Неверный пароль — остаётся режим просмотра');
      });
    });

    dom.menuBtn.addEventListener('click', () => {
      dom.app.classList.toggle('is-sidebar-hidden');
    });

    dom.searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.filters.search = dom.searchInput.value;
        CAL.ui.render();
      }, 140);
    });

    dom.searchClear.addEventListener('click', () => {
      dom.searchInput.value = '';
      state.filters.search = '';
      CAL.ui.render();
      dom.searchInput.focus();
    });

    dom.managePeopleBtn.addEventListener('click', () => CAL.modal.openPeopleModal());

    dom.managePriorityBtn.addEventListener('click', () => CAL.modal.openDictModal());
    dom.manageStatusBtn.addEventListener('click', () => CAL.modal.openDictModal());

    dom.dictFormPriority.addEventListener('submit', (event) => {
      event.preventDefault();
      CAL.modal.addDict('priority', dom.dictFormPriority);
    });

    dom.dictFormStatus.addEventListener('submit', (event) => {
      event.preventDefault();
      CAL.modal.addDict('status', dom.dictFormStatus);
    });

    dom.exportBtn.addEventListener('click', exportData);
    dom.importBtn.addEventListener('click', () => dom.importFile.click());

    dom.importFile.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = store.importData(String(reader.result), true);
          CAL.modal.showToast('Импортировано: задач — ' + result.tasks + ', ответственных — ' + result.people);
        } catch (err) {
          CAL.modal.showToast('Ошибка импорта: ' + err.message);
        }
        event.target.value = '';
      };
      reader.readAsText(file);
    });

    dom.resetBtn.addEventListener('click', () => {
      CAL.modal.confirmDialog(
        'Очистить все данные?',
        'Все задачи и ответственные будут удалены безвозвратно. Сделайте экспорт, если хотите сохранить копию.',
        () => {
          store.resetAll();
          CAL.modal.showToast('Данные очищены');
        },
        'Очистить'
      );
    });

    dom.taskFormSubmit = document.getElementById('taskForm');
    dom.taskFormSubmit.addEventListener('submit', CAL.modal.submitTask);
    document.getElementById('deleteTaskBtn').addEventListener('click', CAL.modal.deleteCurrentTask);

    document.getElementById('personForm').addEventListener('submit', CAL.modal.addPerson);
    document.getElementById('confirmOk').addEventListener('click', CAL.modal.acceptConfirm);
    document.getElementById('tokenForm').addEventListener('submit', CAL.modal.submitToken);
  }

  function bindDelegatedEvents() {
    document.addEventListener('click', (event) => {
      const target = event.target;

      const closeBtn = target.closest('[data-close]');
      if (closeBtn) {
        const modal = closeBtn.closest('.modal');
        if (modal) CAL.modal.closeModal(modal);
        return;
      }

      const filterItem = target.closest('.filter-item');
      if (filterItem) {
        toggleFilter(filterItem.dataset.filterGroup, filterItem.dataset.filterValue);
        return;
      }

      const taskBtn = target.closest('[data-task-id]');
      if (taskBtn) {
        if (CAL.dnd.consumeClick()) return;
        CAL.modal.openTaskModal(taskBtn.dataset.taskId);
        return;
      }

      const addBtn = target.closest('[data-add-date]');
      if (addBtn) {
        if (!store.isAdmin()) return;
        CAL.modal.openTaskModal(null, addBtn.dataset.addDate);
        return;
      }

      const selectBtn = target.closest('[data-select-date]');
      if (selectBtn) {
        state.selectedDate = selectBtn.dataset.selectDate;
        state.cursor = fromKey(state.selectedDate);
        CAL.ui.render();
        return;
      }

      const openDayBtn = target.closest('[data-open-day]');
      if (openDayBtn) {
        state.selectedDate = openDayBtn.dataset.openDay;
        state.cursor = fromKey(state.selectedDate);
        state.view = 'day';
        CAL.ui.render();
        return;
      }

      const swatch = target.closest('[data-color]');
      if (swatch) {
        if (swatch.dataset.dictKind) CAL.modal.setDictColor(swatch.dataset.dictKind, swatch.dataset.color);
        else CAL.modal.setPendingColor(swatch.dataset.color);
        return;
      }

      const dictRename = target.closest('[data-dict-rename]');
      if (dictRename) {
        CAL.modal.renameDict(dictRename.dataset.dictRename);
        return;
      }

      const dictColor = target.closest('[data-dict-color]');
      if (dictColor) {
        CAL.modal.recolorDict(dictColor.dataset.dictColor);
        return;
      }

      const dictDelete = target.closest('[data-dict-delete]');
      if (dictDelete) {
        CAL.modal.deleteDict(dictDelete.dataset.dictDelete);
        return;
      }

      const renameBtn = target.closest('[data-person-rename]');
      if (renameBtn) {
        CAL.modal.renamePerson(renameBtn.dataset.personRename);
        return;
      }

      const colorBtn = target.closest('[data-person-color]');
      if (colorBtn) {
        CAL.modal.recolorPerson(colorBtn.dataset.personColor);
        return;
      }

      const deleteBtn = target.closest('[data-person-delete]');
      if (deleteBtn) {
        CAL.modal.deletePerson(deleteBtn.dataset.personDelete);
      }
    });

    // Двойной клик по часовому слоту — новая задача в этот час;
    // по полосе «Весь день» — новая задача без времени.
    document.addEventListener('dblclick', (event) => {
      if (!store.isAdmin()) return;
      if (event.target.closest('[data-task-id]')) return;

      const slot = event.target.closest('.hour-slot');
      if (slot) {
        const col = slot.closest('[data-grid-date]');
        if (!col) return;
        const hour = Number(slot.dataset.hour) || 0;
        const prefill = (hour < 10 ? '0' + hour : hour) + ':00';
        CAL.modal.openTaskModal(null, col.dataset.gridDate, prefill);
        return;
      }

      const allday = event.target.closest('[data-allday-date]');
      if (allday) {
        CAL.modal.openTaskModal(null, allday.dataset.alldayDate);
      }
    });
  }

  function toggleFilter(group, value) {
    if (!group || !value) return;
    const set = state.filters[group];
    if (!set) return;
    if (set.size === 0) {
      set.add(value);
    } else if (set.has(value)) {
      set.delete(value);
    } else {
      set.add(value);
    }
    CAL.ui.render();
  }

  /* ---------------------------- Экспорт данных --------------------------- */

  function exportData() {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'tasks-' + toKey(new Date()) + '.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    CAL.modal.showToast('Файл с задачами сохранён');
  }

  /* ---------------------------- Горячие клавиши --------------------------- */

  function isTyping(target) {
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  function topModal() {
    const modals = Array.from(document.querySelectorAll('.modal'));
    return modals.reverse().find((m) => !m.hidden) || null;
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (CAL.dnd.isDragging()) {
        if (event.key === 'Escape') {
          event.preventDefault();
          CAL.dnd.cancel();
        }
        return;
      }

      if (event.key === 'Escape') {
        const modal = topModal();
        if (modal) {
          event.preventDefault();
          CAL.modal.closeModal(modal);
        }
        return;
      }

      if (isTyping(event.target)) {
        if (event.key === 'Enter' && event.target === dom.searchInput) {
          dom.searchInput.blur();
        }
        return;
      }

      if (topModal()) return;

      switch (event.key) {
        case 'd': case 'в': case 'D':
          state.view = 'day'; CAL.ui.render(); break;
        case 'w': case 'ц': case 'W':
          state.view = 'week'; CAL.ui.render(); break;
        case 'm': case 'ь': case 'M':
          state.view = 'month'; CAL.ui.render(); break;
        case 'l': case 'д': case 'L':
          state.view = 'list'; CAL.ui.render(); break;
        case 't': case 'е': case 'T':
          CAL.ui.goToday(); break;
        case 'n': case 'т': case 'N':
          if (!store.isAdmin()) break;
          event.preventDefault();
          CAL.modal.openTaskModal(null, state.selectedDate);
          break;
        case '/':
          event.preventDefault();
          dom.searchInput.focus();
          dom.searchInput.select();
          break;
        case 'ArrowLeft':
          event.preventDefault();
          CAL.ui.navigate(-1);
          break;
        case 'ArrowRight':
          event.preventDefault();
          CAL.ui.navigate(1);
          break;
        default:
          break;
      }
    });
  }

  CAL.app = { startSync, syncInterval, updateUserSessionUI, updateBellUI };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.CAL);
