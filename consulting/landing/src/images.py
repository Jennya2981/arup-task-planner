# -*- coding: utf-8 -*-
"""Подготовка фотографий: ресайз под слоты, JPEG q82 progressive."""

import os
import sys

from PIL import Image, ImageOps

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(os.path.dirname(BASE), "pictures_for_lend")
OUT_DIR = os.path.join(BASE, "assets", "img")

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

BAND_WIDTH = 1920
ACCENT_WIDTH = 1400
QUALITY = 82

# Финальный блок: услуга → (id фото, сдвиг фрагмента по горизонтали 0..1).
# Каждый кадр — тот же исходник, но другой фрагмент, и ни один не занят
# на самой странице (в блоке «Плашки»).
FINAL = {
    "service-1": ("36733412", 0.03),
    "service-2": ("39204867", 0.37),
    "service-3": ("36714209", 0.20),
    "service-4": ("39204880", 0.30),
    "service-5": ("36733325", 0.20),
    "service-6": ("36714222", 0.53),
    "service-7": ("36765716", 0.30),
    "service-8": ("36733322", 0.42),
}

FINAL_WIDTH = 1000
FINAL_ASPECT = 4 / 5  # портрет 4:5


def resize_photo(source, target_width, out_path):
    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        if img.width > target_width:
            height = round(img.height * target_width / img.width)
            img = img.resize((target_width, height), Image.LANCZOS)
        img.save(
            out_path,
            "JPEG",
            quality=QUALITY,
            optimize=True,
            progressive=True,
            subsampling="4:2:0",
        )
    return img.size


def crop_resize(source, x0, target_width, aspect, out_path):
    """Отрезает вертикальный фрагмент нужной пропорции и ресайзит."""
    with Image.open(source) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        w, h = img.size
        crop_w = min(w, int(round(h * aspect)))
        left = int(round(x0 * (w - crop_w)))
        left = max(0, min(left, w - crop_w))
        img = img.crop((left, 0, left + crop_w, h))
        if img.width > target_width:
            height = round(img.height * target_width / img.width)
            img = img.resize((target_width, height), Image.LANCZOS)
        img.save(
            out_path,
            "JPEG",
            quality=QUALITY,
            optimize=True,
            progressive=True,
            subsampling="4:2:0",
        )
    return img.size


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    missing = []
    total = 0

    for service, (band, accent) in IMAGES.items():
        for key, photo_id, width in (
            ("band", band, BAND_WIDTH),
            ("accent", accent, ACCENT_WIDTH),
        ):
            if not photo_id:
                continue
            source = os.path.join(SRC_DIR, f"pexels-silverkblack-{photo_id}.jpg")
            if not os.path.exists(source):
                missing.append(source)
                continue
            out = os.path.join(OUT_DIR, f"{service}-{key}.jpg")
            size = resize_photo(source, width, out)
            total += os.path.getsize(out)
            print(f"{os.path.basename(out):24s} {size[0]}x{size[1]}  {os.path.getsize(out) // 1024} KB")

    for service, (photo_id, x0) in FINAL.items():
        source = os.path.join(SRC_DIR, f"pexels-silverkblack-{photo_id}.jpg")
        if not os.path.exists(source):
            missing.append(source)
            continue
        out = os.path.join(OUT_DIR, f"{service}-final.jpg")
        size = crop_resize(source, x0, FINAL_WIDTH, FINAL_ASPECT, out)
        total += os.path.getsize(out)
        print(f"{os.path.basename(out):24s} {size[0]}x{size[1]}  {os.path.getsize(out) // 1024} KB")

    print(f"\nИтого: {total // 1024} KB")
    if missing:
        print("НЕ НАЙДЕНЫ:")
        for path in missing:
            print("  ", path)
        sys.exit(1)


if __name__ == "__main__":
    main()
