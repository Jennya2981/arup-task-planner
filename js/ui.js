/* =========================================================================
   ui.js — отрисовка интерфейса: сайдбар, тулбар, месяц / неделю / день / список
   ========================================================================= */
(function (CAL) {
  'use strict';

  const { state, store, utils } = CAL;
  const { escapeHtml, initials, fmtMonthYear, fmtDayLong, toKey, addDays, addMonths } = utils;

  const el = {};

  /** Высота одного часа в часовой сетке (px); держать в согласии с --hour-h. */
  const HOUR_SLOT_H = 44;

  function cacheElements() {
    [
      'app', 'view', 'periodTitle', 'viewNav', 'assigneeFilters', 'priorityFilters',
      'statusFilters', 'statTotal', 'statToday', 'statOverdue', 'statDone',
      'searchInput', 'searchClear', 'brandSub', 'roleBadge', 'roleSelect',
      'roleHint', 'userAvatar'
    ].forEach((id) => { el[id] = document.getElementById(id); });
    document.documentElement.style.setProperty('--hour-h', HOUR_SLOT_H + 'px');
  }

  /* ----------------------------- Общий рендер ---------------------------- */

  function render() {
    renderRole();
    renderNav();
    renderPeriodTitle();
    renderFilters();
    renderStats();
    renderView();
    renderSearchState();
  }

  /** Роль: администратор может редактировать, обычный пользователь — только смотреть. */
  function renderRole() {
    const admin = store.isAdmin();
    const role = CAL.ROLES[state.user.role];

    document.body.classList.toggle('is-viewer', !admin);
    el.roleBadge.hidden = admin;
    if (el.roleSelect.value !== state.user.role) el.roleSelect.value = state.user.role;
    el.roleHint.textContent = role.hint;
    el.userAvatar.textContent = role.initials;
    el.userAvatar.classList.toggle('is-user', !admin);
  }

  function renderNav() {
    el.viewNav.querySelectorAll('.nav__item').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === state.view);
    });
  }

  function renderPeriodTitle() {
    const cursor = state.cursor;
    switch (state.view) {
      case 'day':
        el.periodTitle.textContent = fmtDayLong(cursor);
        break;
      case 'week': {
        const start = CAL.utils.startOfWeek(cursor);
        const end = addDays(start, 6);
        const sameMonth = start.getMonth() === end.getMonth();
        el.periodTitle.textContent = sameMonth
          ? fmtMonthYear(start)
          : start.getDate() + ' ' + CAL.MONTHS_GEN[start.getMonth()] + ' — ' +
            end.getDate() + ' ' + CAL.MONTHS_GEN[end.getMonth()] + ' ' + end.getFullYear();
        break;
      }
      case 'list':
        el.periodTitle.textContent = 'Задачи · ' + fmtMonthYear(cursor);
        break;
      default:
        el.periodTitle.textContent = fmtMonthYear(cursor);
    }
  }

  function renderSearchState() {
    el.searchClear.hidden = !el.searchInput.value;
  }

  /* ------------------------------- Сайдбар ------------------------------- */

  function renderFilters() {
    renderAssigneeFilters();
    renderOptionFilters(el.priorityFilters, store.dictList('priority'), 'priorities', state.filters.priorities);
    renderOptionFilters(el.statusFilters, store.dictList('status'), 'statuses', state.filters.statuses);
  }

  function renderAssigneeFilters() {
    const counts = {};
    state.tasks.forEach((task) => {
      const key = task.assigneeId || 'none';
      counts[key] = (counts[key] || 0) + 1;
    });

    const items = [];

    state.people.forEach((person) => {
      items.push({
        value: person.id,
        label: person.name,
        color: person.color,
        count: counts[person.id] || 0
      });
    });

    items.push({
      value: 'none',
      label: 'Без ответственного',
      color: '#94a3b8',
      count: counts.none || 0
    });

    el.assigneeFilters.innerHTML = items.map((item) => {
      const checked = state.filters.assignees.size === 0 || state.filters.assignees.has(item.value);
      return `
        <button class="filter-item ${checked ? 'is-checked' : 'is-unchecked'}"
                data-filter-group="assignees" data-filter-value="${escapeHtml(item.value)}">
          <span class="filter-item__box"></span>
          <span class="filter-item__dot" style="background:${escapeHtml(item.color)}"></span>
          <span class="filter-item__label">${escapeHtml(item.label)}</span>
          <span class="filter-item__count">${item.count}</span>
        </button>`;
    }).join('');
  }

  function renderOptionFilters(container, list, group, selected) {
    container.innerHTML = list.map((item) => {
      const checked = selected.size === 0 || selected.has(item.key);
      return `
        <button class="filter-item ${checked ? 'is-checked' : 'is-unchecked'}"
                data-filter-group="${group}" data-filter-value="${escapeHtml(item.key)}">
          <span class="filter-item__box"></span>
          <span class="filter-item__dot" style="background:${escapeHtml(item.color)}"></span>
          <span class="filter-item__label">${escapeHtml(item.label)}</span>
        </button>`;
    }).join('');
  }

  function renderStats() {
    const s = store.stats();
    el.statTotal.textContent = s.total;
    el.statToday.textContent = s.today;
    el.statOverdue.textContent = s.overdue;
    el.statDone.textContent = s.done;
    el.brandSub.textContent = state.people.length
      ? state.people.length + ' ответственных · ' + s.total + ' задач'
      : 'Локальное хранилище';
  }

  /* -------------------------------- Виды --------------------------------- */

  function renderView() {
    // Позиция скролла переживает перерисовку (важно после drop-а в часовой сетке)
    const prevInner = el.view.querySelector('.week__scroll, .dayview__scroll');
    const keep = {
      view: { top: el.view.scrollTop, left: el.view.scrollLeft },
      inner: prevInner ? { top: prevInner.scrollTop, left: prevInner.scrollLeft } : null
    };

    switch (state.view) {
      case 'day': renderDay(); break;
      case 'week': renderWeek(); break;
      case 'list': renderList(); break;
      default: renderMonth();
    }

    const nextInner = el.view.querySelector('.week__scroll, .dayview__scroll');
    if (nextInner && keep.inner) {
      nextInner.scrollTop = keep.inner.top;
      nextInner.scrollLeft = keep.inner.left;
    }
    el.view.scrollTop = keep.view.top;
    el.view.scrollLeft = keep.view.left;
  }

  /* ------------------------------- Месяц -------------------------------- */

  function renderMonth() {
    const first = CAL.utils.startOfMonth(state.cursor);
    const gridStart = CAL.utils.startOfWeek(first);
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const offset = CAL.utils.dayIndex(first);
    const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const today = toKey(new Date());
    const selected = state.selectedDate;

    const cells = [];
    for (let i = 0; i < totalCells; i += 1) {
      const date = addDays(gridStart, i);
      const key = toKey(date);
      const tasks = store.tasksByDate(key);
      const outside = date.getMonth() !== first.getMonth();
      const classes = ['day'];
      if (outside) classes.push('is-outside');
      if (CAL.utils.isWeekend(date)) classes.push('is-weekend');
      if (key === today) classes.push('is-today');
      if (key === selected) classes.push('is-selected');

      const maxVisible = 3;
      const visible = tasks.slice(0, maxVisible);
      const hidden = tasks.length - visible.length;

      cells.push(`
        <div class="${classes.join(' ')}" data-date="${key}">
          <div class="day__head">
            <button class="day__num" data-select-date="${key}" title="${escapeHtml(fmtDayLong(date))}">${date.getDate()}</button>
            <button class="day__add admin-only" data-add-date="${key}" title="Добавить задачу">+</button>
          </div>
          <div class="day__tasks">
            ${visible.map(renderTaskChip).join('')}
            ${hidden > 0 ? `<button class="day__more" data-open-day="${key}">ещё ${hidden}</button>` : ''}
          </div>
        </div>`);
    }

    const dow = CAL.WEEKDAYS_SHORT.map((name, index) => {
      const cls = 'month__dow' + (index >= 5 ? ' is-weekend' : '');
      return `<div class="${cls}">${name}</div>`;
    }).join('');

    el.view.innerHTML = `<div class="month">${dow}${cells.join('')}</div>`;
  }

  /* ------------------------------- Неделя ------------------------------- */

  /** Шкала часов слева (24 подписи). */
  function renderGutter() {
    let html = '';
    for (let h = 0; h < 24; h += 1) {
      html += '<div class="week__hour-label">' + (h < 10 ? '0' + h : h) + ':00</div>';
    }
    return '<div class="week__gutter">' + html + '</div>';
  }

  /** 24 часовых слота — цели drop-а по времени. */
  function renderSlots() {
    let html = '<div class="week__slots">';
    for (let h = 0; h < 24; h += 1) {
      html += '<div class="hour-slot" data-hour="' + h + '"></div>';
    }
    return html + '</div>';
  }

  /**
   * Раскладка задач с временем внутри колонки дня.
   * Возвращает [{task, top, height, left, width}] — позиция в px и % ширины.
   * Пересекающиеся задачи раскладываются по «дорожкам» (lane) внутри кластера.
   */
  function layoutTimed(tasks) {
    const items = [];
    tasks.forEach((task) => {
      const start = utils.parseTime(task.startTime);
      if (start == null) return;
      let end = task.endTime ? utils.parseTime(task.endTime) : null;
      if (end == null || end <= start) end = start + 60;
      items.push({ task, start, end: Math.max(end, start + 15) });
    });
    items.sort((a, b) => a.start - b.start || a.end - b.end);

    // Кластеры: цепочки пересекающихся задач
    const clusters = [];
    let cluster = [];
    let clusterEnd = -1;
    items.forEach((item) => {
      if (cluster.length && item.start >= clusterEnd) {
        clusters.push(cluster);
        cluster = [];
        clusterEnd = -1;
      }
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.end);
    });
    if (cluster.length) clusters.push(cluster);

    const boxes = [];
    clusters.forEach((group) => {
      const laneEnds = [];
      group.forEach((item) => {
        let lane = laneEnds.findIndex((end) => end <= item.start);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(item.end);
        } else {
          laneEnds[lane] = item.end;
        }
        item.lane = lane;
      });
      const total = laneEnds.length;
      group.forEach((item) => {
        boxes.push({
          task: item.task,
          top: Math.round((item.start / 60) * HOUR_SLOT_H),
          height: Math.max(Math.round(((item.end - item.start) / 60) * HOUR_SLOT_H), 20),
          left: (item.lane / total) * 100,
          width: 100 / total
        });
      });
    });
    return boxes;
  }

  function renderTimedEvent(box) {
    const style = 'top:' + box.top + 'px;height:' + box.height + 'px;' +
      'left:calc(' + box.left.toFixed(4) + '% + 2px);width:calc(' + box.width.toFixed(4) + '% - 6px);';
    return '<div class="timed-event" style="' + style + '">' + renderTaskChip(box.task) + '</div>';
  }

  function untimedTasks(tasks) {
    return tasks.filter((task) => utils.parseTime(task.startTime) == null);
  }

  function renderWeek() {
    const start = CAL.utils.startOfWeek(state.cursor);
    const today = toKey(new Date());

    const head = ['<div class="week__corner"></div>'];
    const allday = ['<div class="week__allday-label">Весь<br>день</div>'];
    const cols = [];

    for (let i = 0; i < 7; i += 1) {
      const date = addDays(start, i);
      const key = toKey(date);
      const tasks = store.tasksByDate(key);
      const weekend = CAL.utils.isWeekend(date);

      const headCls = 'week__dow' + (weekend ? ' is-weekend' : '') + (key === today ? ' is-today' : '');
      head.push(`
        <div class="${headCls}">
          <div class="week__dow-top">
            <div class="week__dow-name">${CAL.WEEKDAYS_SHORT[i]}</div>
            <button class="day__add admin-only" data-add-date="${key}" title="Добавить задачу">+</button>
          </div>
          <div class="week__dow-num">${date.getDate()}</div>
        </div>`);

      const stripCls = 'week__allday-col' + (weekend ? ' is-weekend' : '');
      allday.push(
        `<div class="${stripCls}" data-allday-date="${key}">${untimedTasks(tasks).map(renderTaskChip).join('')}</div>`);

      const colCls = 'week__col' + (weekend ? ' is-weekend' : '') + (key === today ? ' is-today' : '');
      cols.push(`
        <div class="${colCls}" data-grid-date="${key}">
          ${renderSlots()}
          <div class="week__events">${layoutTimed(tasks).map(renderTimedEvent).join('')}</div>
        </div>`);
    }

    el.view.innerHTML = `
      <div class="week">
        <div class="week__scroll">
          <div class="week__head">${head.join('')}</div>
          <div class="week__allday">${allday.join('')}</div>
          <div class="week__body">${renderGutter()}${cols.join('')}</div>
        </div>
      </div>`;
  }

  /* -------------------------------- День --------------------------------- */

  function renderDay() {
    const date = state.cursor;
    const key = toKey(date);
    const tasks = store.tasksByDate(key);
    const total = store.visibleTasks().length;
    const admin = store.isAdmin();

    let strip = untimedTasks(tasks).map(renderTaskChip).join('');
    if (!tasks.length) {
      strip = `<span class="allday__hint">${admin
        ? 'Нет задач — дважды кликните по часу или перетащите сюда'
        : 'На этот день задач нет'}</span>`;
    }

    el.view.innerHTML = `
      <div class="dayview">
        <div class="dayview__head">
          <span class="dayview__title">${escapeHtml(fmtDayLong(date))}, ${escapeHtml(utils.fmtWeekday(date))}</span>
          <span class="dayview__sub">${tasks.length} из ${total} задач</span>
          <button class="day__add admin-only dayview__add" data-add-date="${key}" title="Добавить задачу">+</button>
        </div>
        <div class="dayview__scroll">
          <div class="dayview__allday" data-allday-date="${key}">
            <span class="allday__label">Весь день</span>
            ${strip}
          </div>
          <div class="dayview__grid">
            ${renderGutter()}
            <div class="week__col" data-grid-date="${key}">
              ${renderSlots()}
              <div class="week__events">${layoutTimed(tasks).map(renderTimedEvent).join('')}</div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------- Список ------------------------------- */

  function renderList() {
    const first = CAL.utils.startOfMonth(state.cursor);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const tasks = store.tasksInRange(toKey(first), toKey(last));

    if (!tasks.length) {
      el.view.innerHTML = `
        <div class="empty">
          <div class="empty__icon">📋</div>
          <div class="empty__title">Задач нет</div>
          <div class="empty__hint">В этом месяце подходящих задач не найдено — измените фильтры или добавьте новую</div>
        </div>`;
      return;
    }

    const groups = {};
    tasks.forEach((task) => { (groups[task.date] = groups[task.date] || []).push(task); });

    const html = Object.keys(groups).sort().map((key) => {
      const date = CAL.utils.fromKey(key);
      const items = groups[key];
      const doneCount = items.filter((t) => t.status === 'done').length;
      return `
        <div class="list__group">
          <div class="list__group-head">
            <span class="list__group-title">${escapeHtml(fmtDayLong(date))}, ${escapeHtml(utils.fmtWeekday(date))}</span>
            <span class="list__group-sub">${doneCount} из ${items.length} выполнено</span>
          </div>
          ${items.map(renderListRow).join('')}
        </div>`;
    }).join('');

    el.view.innerHTML = `<div class="list">${html}</div>`;
  }

  /* ---------------------------- Элементы задач --------------------------- */

  function priorityInfo(task) {
    return {
      label: store.dictLabel('priority', task.priority),
      color: store.dictColor('priority', task.priority)
    };
  }

  function statusInfo(task) {
    return {
      label: store.dictLabel('status', task.status),
      color: store.dictColor('status', task.status)
    };
  }

  function renderTaskChip(task) {
    const priority = priorityInfo(task);
    const status = statusInfo(task);
    const classes = ['task'];
    if (task.status === 'done') classes.push('is-done');
    if (store.isOverdue(task)) classes.push('is-overdue');

    const time = task.startTime ? '<span class="task__time">' + escapeHtml(utils.fmtTime(task.startTime)) + '</span>' : '';
    const flag = task.priority === 'urgent'
      ? '<span class="task__flag" title="Срочный приоритет">🔥</span>'
      : (task.priority === 'high' ? '<span class="task__flag" title="Высокий приоритет">❗</span>' : '');
    const who = task.assigneeId
      ? '<span class="task__who" style="background:' + escapeHtml(store.personColor(task.assigneeId)) + '" title="' +
        escapeHtml(store.personName(task.assigneeId)) + '">' + escapeHtml(initials(store.personName(task.assigneeId))) + '</span>'
      : '';

    return `
      <button class="${classes.join(' ')}" data-task-id="${escapeHtml(task.id)}"
              style="border-left-color:${escapeHtml(priority.color)}"
              title="${escapeHtml(task.title)} · ${escapeHtml(status.label)} · ${escapeHtml(priority.label)}${task.startTime ? ' · ' + escapeHtml(utils.fmtTime(task.startTime)) : ''}">
        ${time}
        <span class="task__title">${escapeHtml(task.title)}</span>
        ${flag}
        ${who}
      </button>`;
  }

  function renderListRow(task) {
    const priority = priorityInfo(task);
    const status = statusInfo(task);
    const overdue = store.isOverdue(task);

    const time = task.startTime
      ? '<span class="badge badge--time">' + escapeHtml(utils.fmtTime(task.startTime)) +
        (task.endTime ? '–' + escapeHtml(utils.fmtTime(task.endTime)) : '') + '</span>'
      : '';

    const who = task.assigneeId
      ? '<span class="who"><span class="who__dot" style="background:' + escapeHtml(store.personColor(task.assigneeId)) + '">' +
        escapeHtml(initials(store.personName(task.assigneeId))) + '</span>' + escapeHtml(store.personName(task.assigneeId)) + '</span>'
      : '<span class="who who--none">не назначено</span>';

    const notes = task.notes
      ? '<div class="list__notes">' + escapeHtml(task.notes) + '</div>'
      : '';

    const badges =
      (overdue ? '<span class="badge badge--overdue">просрочено</span>' : '') +
      '<span class="badge" style="color:' + escapeHtml(priority.color) + '">' + escapeHtml(priority.label) + '</span>' +
      '<span class="badge" style="color:' + escapeHtml(status.color) + '">' + escapeHtml(status.label) + '</span>';

    return `
      <button class="list__row ${task.status === 'done' ? 'is-done' : ''}" data-task-id="${escapeHtml(task.id)}">
        <span class="list__stripe" style="background:${escapeHtml(priority.color)}"></span>
        <span class="list__main">
          <span class="list__title">${escapeHtml(task.title)}</span>
          ${notes}
        </span>
        <span class="list__meta">
          ${time}
          ${badges}
          ${who}
        </span>
      </button>`;
  }

  /* ------------------------------ Навигация ------------------------------ */

  function navigate(direction) {
    switch (state.view) {
      case 'day':
        state.cursor = addDays(state.cursor, direction);
        state.selectedDate = toKey(state.cursor);
        break;
      case 'week':
        state.cursor = addDays(state.cursor, direction * 7);
        break;
      case 'list':
        state.cursor = addMonths(state.cursor, direction);
        break;
      default:
        state.cursor = addMonths(state.cursor, direction);
    }
    render();
  }

  function goToday() {
    state.cursor = new Date();
    state.selectedDate = toKey(state.cursor);
    render();
  }

  CAL.ui = {
    cacheElements,
    render,
    renderView,
    navigate,
    goToday,
    renderTaskChip,
    renderListRow
  };
})(window.CAL);
