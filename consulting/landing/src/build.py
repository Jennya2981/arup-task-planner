# -*- coding: utf-8 -*-
"""
Сборка 8 лендингов из content.py.

Запуск:  py build.py
Выход:   preview/service-N.html  — полноценные страницы для просмотра
         tilda/service-N.html    — фрагменты для блока T123 в Tilda
"""

import html
import os
import re
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(BASE, "src")
OUT_PREVIEW = os.path.join(BASE, "preview")
OUT_TILDA = os.path.join(BASE, "tilda")

sys.path.insert(0, SRC)
from content import SERVICES  # noqa: E402

POPUP_ID = "zayavka"
TOTAL = len(SERVICES)

# Соответствие: услуга → (фоновая полоса, врезка). Пустая строка — слота нет.
IMAGES = {
    "service-1": ("36733421", "36714222"),
    "service-2": ("39204813", "36714209"),
    "service-3": ("36733412", "36733322"),
    "service-4": ("36733299", ""),
    "service-5": ("36765716", "39204867"),
    "service-6": ("39204880", ""),
    "service-7": ("36733325", ""),
    "service-8": ("39853392", ""),
}

PLACEHOLDER = (
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
)

with open(os.path.join(SRC, "landing.css"), encoding="utf-8") as f:
    CSS = f.read()
with open(os.path.join(SRC, "landing.js"), encoding="utf-8") as f:
    JS = f.read()


def esc(text):
    return html.escape(str(text), quote=False)


def attr(text):
    return html.escape(str(text), quote=True)


def cta(text, light=False):
    cls = "ar-btn ar-btn--light" if light else "ar-btn"
    return (
        f'<a class="{cls}" href="#popup:{POPUP_ID}" data-ar-cta>'
        f'{esc(text)}<span class="ar-btn__arrow" aria-hidden="true">&#8594;</span></a>'
    )


# ── Изображения ─────────────────────────────────────────────────


def plate_img(service_file, key, mode, width, height):
    name = f"{service_file}-{key}.jpg"
    src = f"../assets/img/{name}" if mode == "preview" else PLACEHOLDER
    return (
        f'<img class="ar-plate__img" src="{src}" alt="" width="{width}" height="{height}" '
        f'loading="lazy" decoding="async" data-ar-img="{key}">'
    )


def final_img(service_file, mode, width=1000, height=1250):
    name = f"{service_file}-final.jpg"
    src = f"../assets/img/{name}" if mode == "preview" else PLACEHOLDER
    return (
        f'<img class="ar-final__img" src="{src}" alt="" width="{width}" height="{height}" '
        f'loading="lazy" decoding="async" data-ar-img="final">'
    )


def render_plates(svc, mode):
    band, accent = IMAGES[svc["file"]]
    main = (
        '<div class="ar-plate ar-plate--main"><div class="ar-plate__frame">'
        + plate_img(svc["file"], "band", mode, 1920, 1080)
        + "</div></div>"
    )
    grid_cls = "ar-plates__grid"
    side = ""
    if accent:
        side = (
            '<div class="ar-plate ar-plate--side"><div class="ar-plate__frame">'
            + plate_img(svc["file"], "accent", mode, 1400, 788)
            + "</div></div>"
        )
    else:
        grid_cls += " ar-plates__grid--single"

    caption = (
        f'<p class="ar-plates__caption"><span>{svc["num"]} / {esc(svc["kicker"])}</span></p>'
    )
    return f"""    <section class="ar-plates" aria-label="Иллюстрации">
      <div class="ar-shell">
        <div class="{grid_cls}">
          {main}
          {side}
        </div>
        {caption}
      </div>
    </section>"""


# ── Блоки ───────────────────────────────────────────────────────


def block_head(block, num, bid):
    return f"""        <div class="ar-block__head" data-ar-reveal>
          <span class="ar-block__num" aria-hidden="true">{num:02d}</span>
          <h2 class="ar-block__title" id="{bid}">{esc(block["title"])}</h2>
        </div>"""


def render_prose(block):
    parts = ['<div class="ar-prose" data-ar-reveal>']
    for para in block.get("paras", []):
        parts.append(f"<p>{esc(para)}</p>")
    if block.get("list_prefix"):
        parts.append(f'<p class="ar-prose__kicker">{esc(block["list_prefix"])}</p>')
    if block.get("list"):
        items = "".join(f"<li>{esc(item)}</li>" for item in block["list"])
        parts.append(f'<ul class="ar-list">{items}</ul>')
    if block.get("after"):
        parts.append(f'<p class="ar-prose__kicker">{esc(block["after"])}</p>')
    if block.get("after_text"):
        parts.append(f"<p>{esc(block['after_text'])}</p>")
    parts.append("</div>")
    return "\n".join(parts)


def render_cards(block):
    numbered = block.get("numbered", False)
    parts = []
    if block.get("intro"):
        parts.append(f'<p class="ar-block__intro" data-ar-reveal>{esc(block["intro"])}</p>')

    cards = ['<div class="ar-cards" data-ar-reveal>']
    for i, card in enumerate(block.get("cards", []), start=1):
        title, text = card
        num = (
            f'<span class="ar-card__num" aria-hidden="true">{i:02d}</span>'
            if numbered
            else ""
        )
        cls = "ar-card" if numbered else "ar-card ar-card--plain"
        cards.append(
            f'<article class="{cls}">{num}<div>'
            f'<h3 class="ar-card__title">{esc(title)}</h3>'
            f'<p class="ar-card__text">{esc(text)}</p>'
            f"</div></article>"
        )
    cards.append("</div>")
    parts.append("\n".join(cards))

    if block.get("closing"):
        parts.append(f'<p class="ar-cards__closing" data-ar-reveal>{esc(block["closing"])}</p>')
    return "\n".join(parts)


def render_process(block):
    parts = []
    if block.get("intro"):
        parts.append(f'<p class="ar-block__intro" data-ar-reveal>{esc(block["intro"])}</p>')
    steps = ['<ol class="ar-steps" data-ar-reveal>']
    for i, step in enumerate(block.get("steps", []), start=1):
        title, text = step
        steps.append(
            f'<li class="ar-step"><span class="ar-step__num" aria-hidden="true">{i:02d}</span>'
            f'<div><h3 class="ar-step__title">{esc(title)}</h3>'
            f'<p class="ar-step__text">{esc(text)}</p></div></li>'
        )
    steps.append("</ol>")
    parts.append("\n".join(steps))
    if block.get("note"):
        parts.append(f'<p class="ar-block__note" data-ar-reveal>{esc(block["note"])}</p>')
    return "\n".join(parts)


def render_result(block):
    parts = []
    if block.get("quote"):
        parts.append(
            f'<figure class="ar-quote" data-ar-reveal><blockquote><p>{esc(block["quote"])}</p>'
            f"</blockquote></figure>"
        )
    if block.get("text"):
        parts.append(f'<p class="ar-result__text" data-ar-reveal>{esc(block["text"])}</p>')
    if block.get("bullets"):
        bullets = ['<div class="ar-bullets" data-ar-reveal>']
        for bullet in block["bullets"]:
            title, text = bullet
            heading = f'<h3 class="ar-bullet__title">{esc(title)}</h3>' if title else ""
            bullets.append(
                f'<div class="ar-bullet"><span class="ar-bullet__mark" aria-hidden="true">&#8594;</span>'
                f'<div>{heading}<p class="ar-bullet__text">{esc(text)}</p></div></div>'
            )
        bullets.append("</div>")
        parts.append("\n".join(bullets))
    return "\n".join(parts)


def render_advantages(block):
    items = ['<div class="ar-advantages" data-ar-reveal>']
    for title, text in block.get("items", []):
        items.append(
            f'<div class="ar-advantage"><h3 class="ar-advantage__title">{esc(title)}</h3>'
            f'<p class="ar-advantage__text">{esc(text)}</p></div>'
        )
    items.append("</div>")
    return "\n".join(items)


def render_bonus(block):
    title = re.sub(r"^Бонус:\s*", "", block["title"])
    return (
        f'<div class="ar-bonus" data-ar-reveal>'
        f'<span class="ar-bonus__label">Бонус</span>'
        f'<h3 class="ar-bonus__title">{esc(title)}</h3>'
        f'<p class="ar-bonus__text">{esc(block["text"])}</p></div>'
    )


def render_formats(block):
    rows = ['<div class="ar-rows" data-ar-reveal>']
    for title, text in block.get("items", []):
        rows.append(
            f'<div class="ar-row"><h3 class="ar-row__title">{esc(title)}</h3>'
            f'<p class="ar-row__text">{esc(text)}</p></div>'
        )
    rows.append("</div>")
    return "\n".join(rows)


def render_platforms(block):
    chips = "".join(f'<li class="ar-chip">{esc(item)}</li>' for item in block.get("items", []))
    out = f'<ul class="ar-chips" data-ar-reveal>{chips}</ul>'
    if block.get("note"):
        out += f'\n<p class="ar-block__footnote" data-ar-reveal>{esc(block["note"])}</p>'
    return out


def render_table(block, bid):
    head = "".join(f'<th scope="col">{esc(cell)}</th>' for cell in block["head"])
    rows = []
    for row in block["rows"]:
        cells = "".join(f"<td>{esc(cell)}</td>" for cell in row[1:])
        rows.append(f'<tr><th scope="row">{esc(row[0])}</th>{cells}</tr>')
    body = "\n".join(rows)
    out = [
        '<p class="ar-table__hint">Таблицу можно прокрутить вбок &#8594;</p>',
        f'<div class="ar-table-wrap" role="region" aria-labelledby="{bid}" tabindex="0">',
        '<table class="ar-table">',
        f"<thead><tr>{head}</tr></thead>",
        f"<tbody>\n{body}\n</tbody>",
        "</table>",
        "</div>",
    ]
    if block.get("note"):
        out.append(f'<p class="ar-block__footnote" data-ar-reveal>{esc(block["note"])}</p>')
    return "\n".join(out)


def render_price(block):
    if block.get("tiers"):
        tiers = ['<div class="ar-tiers" data-ar-reveal>']
        for tier in block["tiers"]:
            badge = (
                f'<span class="ar-tier__badge">{esc(tier["badge"])}</span>'
                if tier.get("badge")
                else ""
            )
            tiers.append(
                f'<div class="ar-tier">{badge}'
                f'<h3 class="ar-tier__title">{esc(tier["title"])}</h3>'
                f'<p class="ar-tier__text">{esc(tier["text"])}</p>'
                f'<p class="ar-tier__amount">{esc(tier["amount"])}'
                f'<span class="ar-tier__unit">{esc(tier["unit"])}</span></p></div>'
            )
        tiers.append("</div>")
        parts = ['\n'.join(tiers)]
        if block.get("note"):
            parts.append(f'<p class="ar-price__tiernote" data-ar-reveal>{esc(block["note"])}</p>')
        if block.get("cta"):
            parts.append(f'<div class="ar-price__bottom">{cta(block["cta"])}</div>')
        return '\n<div class="ar-price" data-ar-reveal>\n' + "\n".join(parts) + "\n</div>"

    includes = "".join(f"<li>{esc(item)}</li>" for item in block.get("includes", []))
    note = f'<p class="ar-price__note">{esc(block["note"])}</p>' if block.get("note") else ""
    side = (
        '<div class="ar-price__side">'
        '<p class="ar-price__label">Что входит</p>'
        f'<ul class="ar-price__includes">{includes}</ul>'
        + (cta(block["cta"]) if block.get("cta") else "")
        + '<p class="ar-price__hint">Точную стоимость и сроки фиксируем в договоре.</p>'
        "</div>"
    )
    return f"""<div class="ar-price" data-ar-reveal>
          <div class="ar-price__grid">
            <div>
              <p class="ar-price__label">Стоимость</p>
              <p class="ar-price__amount">{esc(block["amount"])}</p>
              {note}
            </div>
            {side}
          </div>
        </div>"""


def render_faq(block, svc):
    items = ['<div class="ar-faq" data-ar-reveal>']
    for i, item in enumerate(block.get("items", []), start=1):
        question, answer = item
        pid = f'ar-faq-{svc["num"]}-{i}'
        bid = f'{pid}-btn'
        items.append(
            f'<div class="ar-faq__item">'
            f'<h3 class="ar-faq__q-wrap"><button class="ar-faq__btn" type="button" id="{bid}" '
            f'aria-expanded="false" aria-controls="{pid}">'
            f'<span class="ar-faq__q">{esc(question)}</span>'
            f'<span class="ar-faq__icon" aria-hidden="true"></span></button></h3>'
            f'<div class="ar-faq__panel" id="{pid}" role="region" aria-labelledby="{bid}">'
            f'<div class="ar-faq__inner"><p>{esc(answer)}</p></div></div></div>'
        )
    items.append("</div>")
    return "\n".join(items)


def render_block(block, num, svc):
    bid = "ar-price" if block["type"] == "price" else f'ar-h-{svc["num"]}-{num}'
    section_id = ' id="ar-price"' if block["type"] == "price" else ""

    renderers = {
        "prose": lambda: render_prose(block),
        "cards": lambda: render_cards(block),
        "process": lambda: render_process(block),
        "result": lambda: render_result(block),
        "advantages": lambda: render_advantages(block),
        "bonus": lambda: render_bonus(block),
        "formats": lambda: render_formats(block),
        "platforms": lambda: render_platforms(block),
        "table": lambda: render_table(block, bid),
        "price": lambda: render_price(block),
        "faq": lambda: render_faq(block, svc),
    }
    body = renderers[block["type"]]()

    cls = "ar-block"
    if block["type"] != "price" and num % 2 == 0:
        cls += " ar-block--warm"

    return f"""    <section class="{cls}"{section_id} aria-labelledby="{bid}">
      <div class="ar-shell">
{block_head(block, num, bid)}
{body}
      </div>
    </section>"""


# ── Страница ────────────────────────────────────────────────────


def render_hero(svc):
    lines = svc["h1"]
    title = f'<span>{esc(lines[0])}</span>'
    if len(lines) > 1:
        title += f' <span class="ar-hero__title-i">{esc(lines[1])}</span>'

    meta = "".join(
        f'<div class="ar-metarow__item"><dt class="ar-metarow__label">{esc(label)}</dt>'
        f'<dd class="ar-metarow__value">{esc(value)}</dd></div>'
        for label, value in svc["meta"]
    )

    return f"""    <section class="ar-hero">
      <div class="ar-shell">
        <div class="ar-topline">
          <span class="ar-topline__item">
            <span class="ar-topline__num">{svc["num"]} / {TOTAL:02d}</span>
            <span class="ar-topline__sep" aria-hidden="true"></span>
            <span>{esc(svc["kicker"])}</span>
          </span>
          <span class="ar-topline__item ar-topline__right">{esc(svc["audience"])}</span>
        </div>
        <h1 class="ar-hero__title">{title}</h1>
        <div class="ar-hero__body">
          <p class="ar-hero__lead">{esc(svc["lead"])}</p>
          <div class="ar-hero__actions">
            {cta(svc["cta"])}
            <a class="ar-link" href="#ar-price" data-ar-scroll>Стоимость и форматы <span aria-hidden="true">&#8595;</span></a>
          </div>
          <p class="ar-hero__deck">{esc(svc["deck"])}</p>
          <dl class="ar-metarow">{meta}</dl>
        </div>
      </div>
    </section>"""


def render_facts(svc):
    items = "".join(
        f'<li class="ar-fact"><span class="ar-fact__num">{esc(num)}</span>'
        f'<span class="ar-fact__label">{esc(label)}</span></li>'
        for num, label in svc["facts"]
    )
    return f"""    <section class="ar-facts" aria-label="Ключевые параметры">
      <div class="ar-shell">
        <ul class="ar-facts__list">{items}</ul>
      </div>
    </section>"""


def render_final(svc, mode):
    fin = svc["final"]
    lines = fin["title"]
    title = f'<span>{esc(lines[0])}</span>'
    if len(lines) > 1:
        title += f' <span class="ar-final__title-i">{esc(lines[1])}</span>'
    return f"""    <section class="ar-final" id="ar-final" data-ar-final aria-labelledby="ar-final-title">
      <div class="ar-shell ar-final__grid">
        <div class="ar-final__body">
          <p class="ar-section-label">Следующий шаг</p>
          <h2 class="ar-final__title" id="ar-final-title">{title}</h2>
          <p class="ar-final__text">{esc(fin["text"])}</p>
          <div class="ar-final__actions">
            {cta(fin["cta"], light=True)}
            <a class="ar-link" href="#ar-price" data-ar-scroll style="color:#dcc9ac;border-color:rgba(220,201,172,.45)">Стоимость ещё раз <span aria-hidden="true">&#8593;</span></a>
          </div>
          <p class="ar-final__note">Отвечаем в течение рабочего дня</p>
        </div>
        <figure class="ar-final__figure" data-ar-reveal>
          <div class="ar-final__frame">
            {final_img(svc["file"], mode)}
          </div>
        </figure>
      </div>
    </section>"""


def render_landing(svc, mode):
    blocks = "\n".join(
        render_block(block, i, svc) for i, block in enumerate(svc["blocks"], start=1)
    )
    return f"""<div class="ar-landing" data-ar-page="{svc["file"]}">
<script>document.currentScript.closest(".ar-landing").classList.add("ar-js");</script>
{render_hero(svc)}

{render_plates(svc, mode)}

{render_facts(svc)}

{blocks}

{render_final(svc, mode)}
</div>"""


def preview_page(svc, mode="preview"):
    landing = render_landing(svc, mode)
    title = f'{svc["kicker"]} — консалтинг'
    desc = attr(svc["lead"])
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#f8f4ea">
<title>{esc(title)}</title>
<meta name="description" content="{desc}">
<style>
  html {{ background: #f8f4ea; }}
  body {{ margin: 0; padding: 0; background: #f8f4ea; }}
  .ar-preview-note {{
    max-width: 1200px; margin: 0 auto; padding: 18px 56px 0;
    font: 400 10px/1.6 "Roboto", -apple-system, "Segoe UI", Arial, sans-serif; letter-spacing: .14em;
    text-transform: uppercase; color: #606b56;
  }}
  @media (max-width: 700px) {{ .ar-preview-note {{ padding: 14px 20px 0; }} }}
</style>
<style>
{CSS}
</style>
</head>
<body>
<p class="ar-preview-note">Превью · {svc["file"]} · не для вставки в Tilda</p>
<script>window.AR_POPUP = "{POPUP_ID}";</script>
{landing}
<script>
{JS}
</script>
</body>
</html>
"""


def tilda_page(svc):
    band, accent = IMAGES[svc["file"]]
    landing = render_landing(svc, "tilda")
    accent_line = ",\n    accent: \"\"  // врезка; пусто — слота нет" if accent else ""
    return f"""<!-- ═══════════════════════════════════════════════════════════════════
     {svc["num"]} · {svc["kicker"]}
     Лендинг для вставки в блок T123 («HTML-код») в Tilda.
     Меняйте только блок НАСТРОЙКИ ниже: ID попапа и ссылки на фото.
     ═══════════════════════════════════════════════════════════════════ -->

<!-- ── НАСТРОЙКИ ──────────────────────────────────────────────────── -->

<script>
  // ID попапа Tilda. Ссылка в кнопках станет #popup:ВАШ_ID
  window.AR_POPUP = "{POPUP_ID}";

  // Ссылки на фото, загруженные в Tilda (Файлы → загрузить → скопировать ссылку).
  // Пока пусто — на месте фото будет зелёная плашка.
  window.AR_IMG = {{
    band: ""{accent_line},
    final: ""  // кадр в финальном блоке
  }};
</script>

<!-- ── СТИЛИ И РАЗМЕТКА ───────────────────────────────────────────── -->
<!-- nominify begin -->

<style>
{CSS}
</style>

{landing}

<!-- ── ПОВЕДЕНИЕ ──────────────────────────────────────────────────── -->

<script>
{JS}
</script>

<!-- nominify end -->
"""


def main():
    os.makedirs(OUT_PREVIEW, exist_ok=True)
    os.makedirs(OUT_TILDA, exist_ok=True)

    for svc in SERVICES:
        path = os.path.join(OUT_PREVIEW, f'{svc["file"]}.html')
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(preview_page(svc))
        path = os.path.join(OUT_TILDA, f'{svc["file"]}.html')
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(tilda_page(svc))
        print(f'ok  {svc["file"]}')


if __name__ == "__main__":
    main()
