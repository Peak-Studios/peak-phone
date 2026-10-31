"""Draw the static prop display in the phone UI's Aurora palette."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SIZE = (384, 512)


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]
    for path in candidates:
        if path.exists():
            return ImageFont.truetype(str(path), size)
    raise FileNotFoundError("A Segoe UI or DejaVu Sans font is needed to render the lock screen")


def render(size=SIZE, camera_safe=False, orientation_safe=False):
    width, height = size
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    t = np.clip((xx / width * .38 + yy / height * .72), 0, 1)
    pixels = np.empty((height, width, 3), dtype=np.float32)
    top, bottom = np.array((169, 203, 235)), np.array((17, 35, 71))
    pixels[:] = top * (1 - t[..., None]) + bottom * t[..., None]
    for cx, cy, radius, color, strength in [
        (width * .81, height * .08, width * .60, (216, 236, 252), .53),
        (width * .06, height * .52, width * .76, (92, 155, 222), .44),
        (width * .88, height * .76, width * .68, (54, 95, 167), .38),
    ]:
        glow = np.exp(-(((xx - cx) / radius) ** 2 + ((yy - cy) / radius) ** 2) * 1.8)
        pixels += (np.array(color) - pixels) * glow[..., None] * strength
    image = Image.fromarray(np.uint8(np.clip(pixels, 0, 255)), "RGB").convert("RGBA")

    # The translucent curved bands echo web/public/duo/ios.css's Aurora wallpaper.
    bands = Image.new("RGBA", size)
    draw = ImageDraw.Draw(bands)
    draw.ellipse((-width * .94, -height * .45, width * .55, height * 1.06),
                 outline=(214, 237, 255, 45), width=23)
    draw.ellipse((width * .50, -height * .37, width * 1.85, height * 1.14),
                 outline=(125, 180, 236, 38), width=25)
    image = Image.alpha_composite(image, bands.filter(ImageFilter.GaussianBlur(4)))

    # The expanded screen can be rotated in its plane at runtime. This static
    # texture is shared by both poses, so keep its fallback free of direction-
    # dependent marks; the live DUI supplies the correctly oriented UI.
    if orientation_safe:
        return image

    draw = ImageDraw.Draw(image)
    white = (249, 252, 255, 255)
    landscape = height < width
    draw.text((20 if landscape else 28, 10 if landscape else 20), "9:41", font=font(14 if landscape else 18, True), fill=white)
    # Reserve the cover's upper-right camera island; the closed shell carries
    # its own circular sensor there, so status marks stay left of that area.
    status_shift = 44 if camera_safe else 0
    for i, bar in enumerate((6, 9, 12, 15)):
        x, y = width - 96 + i * 7 - status_shift, 26 if landscape else 34
        draw.rounded_rectangle((x, y - bar, x + 4, y), radius=1, fill=white)
    yshift = -8 if landscape else 0
    draw.arc((width - 63 - status_shift, 18 + yshift, width - 44 - status_shift, 37 + yshift), 205, 335, fill=white, width=3)
    draw.arc((width - 58 - status_shift, 23 + yshift, width - 49 - status_shift, 32 + yshift), 205, 335, fill=white, width=3)
    draw.rounded_rectangle((width - 37 - status_shift, 21 + yshift, width - 13 - status_shift, 34 + yshift), radius=3, outline=white, width=2)
    draw.rounded_rectangle((width - 34 - status_shift, 24 + yshift, width - 18 - status_shift, 31 + yshift), radius=1, fill=white)
    draw.rectangle((width - 12 - status_shift, 25 + yshift, width - 10 - status_shift, 30 + yshift), fill=white)

    # Date and oversized time follow the type scale of the live phone UI.
    date = "Friday, September 25"
    date_font = font(16 if landscape else 21)
    box = draw.textbbox((0, 0), date, font=date_font)
    draw.text(((width - (box[2] - box[0])) / 2, 64 if landscape else 111), date, font=date_font, fill=white)
    clock = "9:41"
    clock_font = font(71 if landscape else 94, True)
    box = draw.textbbox((0, 0), clock, font=clock_font)
    draw.text(((width - (box[2] - box[0])) / 2, 78 if landscape else 136), clock, font=clock_font, fill=white,
              stroke_width=0)
    draw.text((20 if landscape else 25, 197 if landscape else 398), "PEAK DUO",
              font=font(11 if landscape else 15, True), fill=(232, 244, 255, 224))
    draw.text((20 if landscape else 25, 215 if landscape else 424), "Swipe up to unlock",
              font=font(12 if landscape else 16), fill=(232, 244, 255, 224))
    draw.rounded_rectangle((width / 2 - 65, height - 24, width / 2 + 65, height - 19), radius=3, fill=white)
    return image


if __name__ == "__main__":
    render().save(Path(__file__).resolve().parents[1] / "source" / "textures" / "peak_lock_screen.png")
