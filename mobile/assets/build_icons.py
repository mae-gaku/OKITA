"""Generate OKITA app icons (icon, adaptive, splash, favicon) at brand colors.

Run:  python3 assets/build_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).parent

BG = (244, 237, 224)        # #f4ede0  cream
INK = (26, 24, 20)           # #1a1814  ink
ACCENT = (255, 87, 34)       # #ff5722  orange
ACCENT_DEEP = (200, 57, 15)  # #c8390f


def _disc(canvas: Image.Image, cx: int, cy: int, radius: int, fill, drop_shadow=True):
    if drop_shadow:
        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        offset = max(8, radius // 30)
        sd.ellipse(
            [cx - radius + offset, cy - radius + offset * 2,
             cx + radius + offset, cy + radius + offset * 2],
            fill=(0, 0, 0, 70),
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius // 25))
        canvas.alpha_composite(shadow)
    d = ImageDraw.Draw(canvas)
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=fill)


def make_icon(size: int = 1024, margin_ratio: float = 0.18) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG + (255,))
    cx = cy = size // 2
    radius = int(size * (0.5 - margin_ratio))
    _disc(img, cx, cy, radius, ACCENT + (255,))

    # Subtle horizon line at the bottom to evoke "sunrise"
    d = ImageDraw.Draw(img)
    line_y = int(size * 0.78)
    line_w = max(2, size // 256)
    d.rectangle(
        [int(size * 0.16), line_y, int(size * 0.84), line_y + line_w],
        fill=INK + (255,),
    )
    return img


def make_adaptive_foreground(size: int = 1024) -> Image.Image:
    """Android adaptive icon foreground. The system applies a circular mask;
    keep critical content within the inner 66% safe-zone."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    cx = cy = size // 2
    radius = int(size * 0.30)  # smaller; adaptive bg fills the rest
    _disc(img, cx, cy, radius, ACCENT + (255,), drop_shadow=False)
    return img


def make_splash(width: int = 1284, height: int = 2778) -> Image.Image:
    img = Image.new("RGBA", (width, height), BG + (255,))
    cx = width // 2
    cy = int(height * 0.42)
    radius = int(min(width, height) * 0.18)
    _disc(img, cx, cy, radius, ACCENT + (255,))

    # Wordmark "OKITA." underneath. We don't have Fraunces — use default but
    # render large, the splash is meant to feel calm.
    d = ImageDraw.Draw(img)
    try:
        # Try a system font; fall back gracefully.
        from PIL import ImageFont
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
            int(min(width, height) * 0.07),
        )
    except Exception:
        font = None
    text = "OKITA."
    if font is not None:
        bbox = d.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        ty = cy + radius + int(min(width, height) * 0.06)
        d.text((cx - tw // 2 - bbox[0], ty - bbox[1]), text, fill=INK + (255,), font=font)
        # Re-paint the trailing "." in accent.
        # Simpler: draw whole again but accent dot.
        # (For reliability, we'll just leave it as ink; the icon is the brand carrier.)
    return img


def make_keyvisual(width: int = 1080, height: int = 1920) -> Image.Image:
    """okita-keyvisual.svg と同じレイアウトを Pillow で再現。"""
    BG_WARM = (235, 224, 204)  # #ebe0cc

    img = Image.new("RGBA", (width, height), BG + (255,))

    icon_size = 360
    icon_x = (width - icon_size) // 2  # 360
    icon_y = 720
    rx = 80

    # Soft drop shadow for the icon card
    shadow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        [icon_x, icon_y + 14, icon_x + icon_size, icon_y + icon_size + 14],
        radius=rx,
        fill=(0, 0, 0, 41),  # ~16% alpha → matches SVG slope 0.16
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    img.alpha_composite(shadow)

    d = ImageDraw.Draw(img)
    d.rounded_rectangle(
        [icon_x, icon_y, icon_x + icon_size, icon_y + icon_size],
        radius=rx,
        fill=BG_WARM + (255,),
    )

    # Sun (orange disc)
    cx = icon_x + 180
    cy = icon_y + 180
    sun_r = 121
    d.ellipse(
        [cx - sun_r, cy - sun_r, cx + sun_r, cy + sun_r],
        fill=ACCENT + (255,),
    )

    # Horizon line — sun rises above it
    line_y = icon_y + 284
    d.line(
        [icon_x + 46, line_y, icon_x + 314, line_y],
        fill=INK + (255,),
        width=3,
    )

    # Wordmark "OKITA." (Fraunces unavailable → DejaVuSerif-Bold fallback)
    try:
        from PIL import ImageFont
        font = ImageFont.truetype(
            "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 108
        )
    except Exception:
        font = None

    if font is not None:
        text = "OKITA"
        dot = "."
        bbox_text = d.textbbox((0, 0), text, font=font)
        bbox_dot = d.textbbox((0, 0), dot, font=font)
        tw = bbox_text[2] - bbox_text[0]
        dw = bbox_dot[2] - bbox_dot[0]
        total = tw + dw
        baseline_y = 1240
        text_x = (width - total) // 2 - bbox_text[0]
        text_y = baseline_y - bbox_text[3]
        d.text((text_x, text_y), text, fill=INK + (255,), font=font)
        d.text((text_x + tw, text_y), dot, fill=ACCENT + (255,), font=font)

    return img


def main() -> None:
    icon = make_icon(1024)
    icon.convert("RGB").save(OUT / "icon.png", "PNG", optimize=True)
    print("wrote", OUT / "icon.png")

    adaptive = make_adaptive_foreground(1024)
    adaptive.save(OUT / "adaptive-icon.png", "PNG", optimize=True)
    print("wrote", OUT / "adaptive-icon.png")

    splash = make_splash(1284, 2778)
    splash.convert("RGB").save(OUT / "splash.png", "PNG", optimize=True)
    print("wrote", OUT / "splash.png")

    favicon = icon.resize((96, 96), Image.LANCZOS)
    favicon.convert("RGB").save(OUT / "favicon.png", "PNG", optimize=True)
    print("wrote", OUT / "favicon.png")

    keyvisual = make_keyvisual(1080, 1920)
    keyvisual.convert("RGB").save(OUT / "okita-keyvisual.png", "PNG", optimize=True)
    print("wrote", OUT / "okita-keyvisual.png")


if __name__ == "__main__":
    main()
