# Контекст проекта — 8 лендингов услуг

Технический контекст для продолжения работы: как устроены исходники, какие
решения приняты и почему. Пользовательская инструкция — в `README.md`,
задачи — в `TASKS.md`, рамки — в `PROJECT_BRIEF.md`.

## Структура

```
consulting/
├── Brand_style.jpg            # источник палитры
├── pictures_for_lend/         # 12 исходников Pexels (3800–3840 px)
└── landing/
    ├── preview/service-N.html # полные страницы для браузера (с фото)
    ├── tilda/service-N.html   # сниппеты для блока T123 (фото — плейсхолдеры)
    ├── assets/img/            # 20 JPEG: 8 band + 4 accent + 8 final
    └── src/
        ├── content.py         # все тексты, цены, состав блоков 8 услуг
        ├── build.py           # сборщик preview + tilda, POPUP_ID, AR_IMG
        ├── images.py          # ресайз/кроп фото, IMAGES, FINAL
        ├── landing.css        # дизайн-система (~1500 строк, всё в .ar-landing)
        └── landing.js         # попап, скролл, FAQ, reveal, подстановка фото
```

Сводной index нет — пользователь явно попросил убрать, 8 страниц независимы.

## Дизайн-система

Палитра (из `Brand_style.jpg`): paper `#F8F4EA`, cream `#FFFCF3`,
sage `#E9EEE0`, sage-soft `#F3F5EA`, sage-deep `#DDE5D1`, ink `#1E3628`,
olive `#475A3B`, olive-soft `#606B56`, ochre `#B96A24`, sand `#DCC9AC`,
on-dark `#FBF6E9`, sage-on-dark `#C7D2B6`, terracotta `#A2551A`,
clay `#D99564`, golden `#846837`, deep-green `#243C2B`, olive-deep `#585B35`.

**Шрифт один — Roboto**, `@import` в первой строке CSS, `--ar-font`. Веса
только 300 (hero, финал, цены, цифры, курсив-акцент), 400 (текст),
500 (подписи, кнопки, карточки). Bold убран по требованию.

**Персонализация страниц** — через CSS-токены с дефолтом = схема service-1
и переопределениями `[data-ar-page="service-N"]` в конце `landing.css`:

- `--ar-accent`, `--ar-btn-bg/-fg/-hover/-hover-fg` — кнопки;
- `--ar-band-bg/-fg/-label/-line` — полоса цифр;
- `--ar-block-alt`, `--ar-bonus-bg/-label-bg/-label-fg`, `--ar-badge-bg/-fg`.

Схемы кнопок/полос: 1 ink/sage-deep · 2 terracotta/sand · 3 clay+ink/sage ·
4 olive/sage-deep · 5 deep-green/тёмная `#243C2B` · 6 golden/sand ·
7 sand+ink/sage-soft · 8 olive-deep (ховер terracotta)/sage. Все связки
проходят AA; ochre `#B96A24` — только волосяные детали, не текст кнопок.

## Фотографии

Автор: Vitaly Gariev, Pexels. Лицензия не требует атрибуции — кредит со
страниц убран, имя осталось в README §7.

Слоты на странице: `band` (широкая полоса 1920×1080), `accent` (врезка
1400×788, только у услуг 1/2/3/5), `final` (портрет 1000×1250, 4:5, справа
в финальном блоке, у всех 8). Тонирование запрещено — фильтр только
`saturate(0.92) contrast(1.03) brightness(1.02)`.

Соответствия — `IMAGES` (band/accent) и `FINAL` (id + сдвиг `x0` обрезки)
в `src/images.py`. Финальные кадры — фрагменты тех же 12 исходников, но
(1) не занятые на своей странице и (2) с другой обрезкой, чтобы не
дублировать чужой кадр. Кроп — `crop_resize()`: вертикальный фрагмент
`aspect 4/5` со сдвигом `x0` (0..1), затем ресайз до 1000 px, JPEG q82
progressive.

Замены по замечанию пользователя: service-5 → `36733325` (x0 0.20),
service-8 → `36733322` (x0 0.42; кадр 36733322 на service-3 — другая
обрезка).

## Сборка и Tilda

`py src/build.py` собирает обе папки из `content.py` + CSS + JS.
Python 3.10+ (в среде 3.14), Pillow — только для `images.py`.

Сниппет: настройки `window.AR_POPUP` / `window.AR_IMG` (с ключами
`band`, `accent`, `final`), затем inline `<style>`, разметка и inline
`<script>`. Плейсхолдер изображения — 1×1 GIF data-URI, JS подставляет
ссылки из `AR_IMG` при загрузке и снимает `data-ar-empty` с фрейма.
Селектор фрейма: `.ar-plate__frame, .ar-final__frame`.

Попап: JS ищет `[id="popup:ID"]`; если не нашёл — плавный скролл
к `#ar-final` (`window.scrollTo`, не `scrollIntoView`). `POPUP_ID`
дефолтится как `zayavka` (placeholder; реальный ID неизвестен).

Изоляция: все скоупы `.ar-landing`, проверено внутри реальной вёрстки Tilda
(T123 рендерится в `.t-container_100 > .t-width_100`).

## Окружение (для агента)

- Python — команда `py`; `py -c` с кириллицей ломается — писать скрипты
  в файлы (`C:\Users\jenny\AppData\Local\Temp\opencode`).
- Shell требует явный workdir для кириллических путей.
- Локальный сервер превью: `py -m http.server 8137` из `landing/`
  (запущен в фоне), страницы — `http://127.0.0.1:8137/preview/service-N.html`.
- Скриншоты Playwright попадают в `.playwright-mcp/` (в gitignore не
  заносился — папка untracked, в коммит не входит).
- Git: репозиторий корневой `ARUP`; проект лежит в `consulting/`.

## Проверки (прогонялись после каждой крупной правки)

8 страниц × 360/768/1440 через Playwright: контраст AA по всем текстовым
узлам, отсутствие горизонтального overflow, только Roboto и без весов
700/900, загрузка всех `<img>`, работа reveal при скролле. Отдельно
проверялось, что ленивые финальные фото подгружаются при долистывании.
