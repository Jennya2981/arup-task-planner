/* =========================================================================
   dnd.js — перетаскивание задач между днями и часами (Pointer Events)
   ========================================================================= */
(function (CAL) {
  'use strict';

  const { state, store, utils } = CAL;

  const THRESHOLD = 5;      // px, после которых жест становится drag-ом
  const SNAP = 15;          // шаг времени в минутах
  const EDGE = 44;          // px до края области просмотра — автоскролл
  const SCROLL_STEP = 14;   // px за кадр автоскролла
  const CLICK_SUPPRESS = 350; // мс, в течение которых гасится клик после drop-а

  let drag = null;
  let suppressUntil = 0;

  /* ------------------------------ Утилиты ------------------------------ */

  function snapMinutes(value) {
    return Math.max(0, Math.min(1425, Math.round(value / SNAP) * SNAP));
  }

  /** Длительность задачи в минутах (0 — задача без времени/без конца). */
  function durationOf(task) {
    const start = utils.parseTime(task.startTime);
    const end = task.endTime ? utils.parseTime(task.endTime) : null;
    if (start == null || end == null || end <= start) return 0;
    return end - start;
  }

  function noModalOpen() {
    return !document.querySelector('.modal:not([hidden])');
  }

  function slotHeight(col) {
    const slot = col.querySelector('.hour-slot');
    return (slot && slot.offsetHeight) || parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--hour-h')) || 44;
  }

  /* ------------------------------ Начало -------------------------------- */

  function onPointerDown(event) {
    suppressUntil = 0;
    if (event.button != null && event.button !== 0) return;
    if (drag) return;
    if (!store.isAdmin()) return;
    if (!noModalOpen()) return;

    const chip = event.target.closest && event.target.closest('[data-task-id]');
    if (!chip) return;
    // перетаскивание доступно только в видах, где есть цели (месяц/неделя/день)
    if (!chip.closest('.month, .week, .dayview')) return;

    const task = state.tasks.find((t) => t.id === chip.dataset.taskId);
    if (!task) return;

    drag = {
      task,
      src: chip,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      offsetX: 0,
      offsetY: 0,
      active: false,
      ghost: null,
      target: null,
      targetEl: null,
      preview: null,
      raf: 0
    };

    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onDragKey, true);
  }

  /* ------------------------------ Drag-жест ----------------------------- */

  function onPointerMove(event) {
    if (!drag) return;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;

    if (!drag.active) {
      if (Math.abs(drag.lastX - drag.startX) < THRESHOLD &&
          Math.abs(drag.lastY - drag.startY) < THRESHOLD) return;
      startDrag();
    }
    if (event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    updateGhost();
    updateTarget();
  }

  function startDrag() {
    drag.active = true;
    document.body.classList.add('is-dragging');

    const rect = drag.src.getBoundingClientRect();
    drag.offsetX = drag.startX - rect.left;
    drag.offsetY = drag.startY - rect.top;

    const ghost = drag.src.cloneNode(true);
    ghost.classList.add('drag-ghost');
    ghost.classList.remove('is-dragging-src');
    ghost.removeAttribute('id');
    ghost.removeAttribute('title');
    ghost.querySelectorAll('[title]').forEach((node) => node.removeAttribute('title'));
    ghost.style.width = Math.max(rect.width, 130) + 'px';
    document.body.appendChild(ghost);
    drag.ghost = ghost;

    drag.src.classList.add('is-dragging-src');

    try { drag.src.setPointerCapture(drag.pointerId); } catch (err) { /* нет захвата — не критично */ }

    updateGhost();
    updateTarget();
    drag.raf = requestAnimationFrame(scrollTick);
  }

  function updateGhost() {
    if (!drag.ghost) return;
    const x = drag.lastX - drag.offsetX;
    const y = drag.lastY - drag.offsetY;
    drag.ghost.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
  }

  /* ------------------------------ Цели drop-а --------------------------- */

  function resolveTarget(el) {
    const gridCol = el.closest('[data-grid-date]');
    if (gridCol) return { type: 'grid', el: gridCol, date: gridCol.dataset.gridDate };
    const allday = el.closest('[data-allday-date]');
    if (allday) return { type: 'allday', el: allday, date: allday.dataset.alldayDate };
    const monthCell = el.closest('.day[data-date]');
    if (monthCell) return { type: 'day', el: monthCell, date: monthCell.dataset.date };
    return null;
  }

  function clearHighlight() {
    if (drag.preview) { drag.preview.remove(); drag.preview = null; }
    if (drag.targetEl) { drag.targetEl.classList.remove('is-drop-target'); drag.targetEl = null; }
    drag.target = null;
  }

  function updateTarget() {
    const under = document.elementFromPoint(drag.lastX, drag.lastY);
    const found = under ? resolveTarget(under) : null;

    clearHighlight();
    if (!found) return;

    if (found.type === 'grid') {
      // Точное время по позиции курсора внутри колонки
      const rect = found.el.getBoundingClientRect();
      const hourH = slotHeight(found.el);
      const minutes = snapMinutes(((drag.lastY - rect.top) / hourH) * 60);

      const preview = document.createElement('div');
      preview.className = 'drop-preview';
      const duration = durationOf(drag.task) || 45;
      preview.style.top = ((minutes / 60) * hourH) + 'px';
      preview.style.height = Math.max((Math.max(duration, SNAP) / 60) * hourH, 20) + 'px';
      const events = found.el.querySelector('.week__events');
      if (events) events.appendChild(preview);

      drag.preview = preview;
      drag.target = { type: 'grid', date: found.date, minutes: minutes };
      return;
    }

    found.el.classList.add('is-drop-target');
    drag.targetEl = found.el;
    drag.target = { type: found.type, date: found.date };
  }

  /* --------------------------- Автоскролл при drag ---------------------- */

  function scrollTick() {
    drag.raf = 0;
    if (!drag || !drag.active) return;

    // Просмотры «неделя» и «день» скроллятся внутренним контейнером,
    // «месяц»/«список» — самим #view.
    const scroller = (drag.src && drag.src.closest('.week__scroll, .dayview__scroll')) ||
      document.getElementById('view');
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const insideX = drag.lastX >= rect.left && drag.lastX <= rect.right;
      const insideY = drag.lastY >= rect.top && drag.lastY <= rect.bottom;
      let dx = 0;
      let dy = 0;
      if (insideX) {
        if (drag.lastY < rect.top + EDGE) dy = -SCROLL_STEP;
        else if (drag.lastY > rect.bottom - EDGE) dy = SCROLL_STEP;
      }
      if (insideY) {
        if (drag.lastX < rect.left + EDGE) dx = -SCROLL_STEP;
        else if (drag.lastX > rect.right - EDGE) dx = SCROLL_STEP;
      }
      if (dx || dy) {
        scroller.scrollBy(dx, dy);
        updateGhost();
        updateTarget();
      }
    }
    if (drag && drag.active) drag.raf = requestAnimationFrame(scrollTick);
  }

  /* ------------------------------ Завершение ---------------------------- */

  function onPointerUp(event) {
    if (!drag) return;
    if (event.pointerId !== drag.pointerId) return;
    const wasActive = drag.active;
    const task = drag.task;
    const target = drag.target;
    finishDrag();
    if (!wasActive) return;
    suppressUntil = Date.now() + CLICK_SUPPRESS;
    if (target) applyDrop(task, target);
  }

  function onCancel() {
    if (!drag) return;
    const wasActive = drag.active;
    finishDrag();
    if (wasActive) suppressUntil = Date.now() + CLICK_SUPPRESS;
  }

  function onDragKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }
  }

  function finishDrag() {
    if (!drag) return;
    clearHighlight();
    if (drag.raf) cancelAnimationFrame(drag.raf);
    if (drag.ghost) drag.ghost.remove();
    if (drag.src) drag.src.classList.remove('is-dragging-src');
    document.body.classList.remove('is-dragging');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onCancel);
    document.removeEventListener('keydown', onDragKey, true);
    try {
      if (drag.src && drag.src.hasPointerCapture &&
          drag.src.hasPointerCapture(drag.pointerId)) {
        drag.src.releasePointerCapture(drag.pointerId);
      }
    } catch (err) { /* noop */ }
    drag = null;
  }

  /* ------------------------------- Drop --------------------------------- */

  function applyDrop(task, target) {
    if (!store.isAdmin()) return;
    const prev = {
      date: task.date,
      startTime: task.startTime,
      endTime: task.endTime
    };

    if (target.type === 'day') {
      // В месяце меняется только дата, время сохраняется
      if (target.date === prev.date) return;
      store.updateTask(task.id, { date: target.date });
      notify(task, target.date, null, prev);
      return;
    }

    if (target.type === 'allday') {
      // В полосу «Весь день» — дата и очистка времени
      if (target.date === prev.date && !prev.startTime) return;
      store.updateTask(task.id, { date: target.date, startTime: '', endTime: '' });
      notify(task, target.date, '', prev);
      return;
    }

    // Часовой слот — дата + новое время, длительность сохраняется
    if (target.date === prev.date &&
        utils.parseTime(prev.startTime) === target.minutes) return;
    const duration = durationOf(task);
    const startTime = utils.minutesToTime(target.minutes);
    const endTime = duration
      ? utils.minutesToTime(Math.min(target.minutes + duration, 1439))
      : '';
    store.updateTask(task.id, { date: target.date, startTime: startTime, endTime: endTime });
    notify(task, target.date, startTime, prev);
  }

  function notify(task, dateKey, startTime, prev) {
    const when = utils.fmtDayLong(utils.fromKey(dateKey)) +
      (startTime ? ', ' + startTime : '');
    CAL.modal.showToast('«' + task.title + '» → ' + when, {
      actionLabel: 'Вернуть',
      onAction: () => {
        store.updateTask(task.id, prev);
        CAL.modal.showToast('Перенос отменён');
      }
    });
  }

  /* ------------------------------ Слушатели ----------------------------- */

  function init() {
    document.addEventListener('pointerdown', onPointerDown);
  }

  /** Поглощает клик, произошедший сразу после перетаскивания. */
  function consumeClick() {
    if (Date.now() < suppressUntil) {
      suppressUntil = 0;
      return true;
    }
    return false;
  }

  function isDragging() { return !!(drag && drag.active); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  CAL.dnd = {
    consumeClick,
    isDragging,
    cancel: onCancel,
    init
  };
})(window.CAL);
