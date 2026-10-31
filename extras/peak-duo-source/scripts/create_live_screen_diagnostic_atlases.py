"""Create temporary labeled 2048x1024 atlases for live-screen UV proof."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'evidence'
EVIDENCE.mkdir(exist_ok=True)
WIDTH, HEIGHT, BAND = 2048, 1024, 512
REGIONS = [
    ('LEFT', (28, 103, 186)),
    ('RIGHT', (186, 53, 46)),
    ('COVER', (26, 136, 83)),
    ('UNUSED', (176, 118, 18)),
]

def font(size):
    for candidate in ('C:/Windows/Fonts/seguisb.ttf', 'C:/Windows/Fonts/arialbd.ttf',
                      'C:/Windows/Fonts/segoeuib.ttf'):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    return ImageFont.load_default()

def make_atlas(portrait=False):
    image = Image.new('RGB', (WIDTH, HEIGHT), (3, 5, 9))
    draw = ImageDraw.Draw(image)
    # The physical-screen rotates the landscape atlas for portrait. With the
    # entity's +90 degree Y turn, its halves exchange vertical order, so stage
    # RIGHT first and LEFT second to verify the final upright logical order.
    regions = ([REGIONS[1], REGIONS[0], *REGIONS[2:]] if portrait else REGIONS)
    for index, (label, color) in enumerate(regions):
        x0 = index * BAND
        draw.rectangle((x0, 0, x0 + BAND - 1, HEIGHT - 1), fill=color)
        # Strong boundary bars expose any quarter-atlas or role-order error.
        draw.rectangle((x0, 0, x0 + 10, HEIGHT - 1), fill=(248, 237, 218))
        draw.rectangle((x0 + BAND - 11, 0, x0 + BAND - 1, HEIGHT - 1), fill=(15, 20, 28))
        tile = Image.new('RGBA', (480, 190), (4, 8, 13, 225))
        td = ImageDraw.Draw(tile)
        title = f'ATLAS {label}'
        title_font = font(46)
        small_font = font(23)
        box = td.textbbox((0, 0), title, font=title_font)
        td.text(((480 - (box[2] - box[0])) / 2, 16), title,
                font=title_font, fill=(255, 255, 255, 255), stroke_width=1,
                stroke_fill=(0, 0, 0, 255))
        td.text((75, 112), 'U = 0', font=small_font, fill=(255, 255, 255, 255))
        td.text((330, 112), 'U = 1', font=small_font, fill=(255, 255, 255, 255))
        y = 139
        td.line((78, y, 402, y), fill=(255, 255, 255, 255), width=5)
        td.polygon(((402, y), (383, y - 12), (383, y + 12)), fill=(255, 255, 255, 255))
        if portrait:
            tile = tile.rotate(-90, expand=True, resample=Image.Resampling.BICUBIC)
        image.paste(tile, (x0 + (BAND - tile.width) // 2,
                           (HEIGHT - tile.height) // 2), tile)
    return image

make_atlas(False).save(EVIDENCE / 'live-screen-test-atlas-landscape.png')
make_atlas(True).save(EVIDENCE / 'live-screen-test-atlas-portrait.png')
print('LIVE_SCREEN_TEST_ATLASES', WIDTH, HEIGHT,
      'landscape bands=LEFT,RIGHT,COVER,UNUSED; portrait bands=RIGHT,LEFT,COVER,UNUSED')
