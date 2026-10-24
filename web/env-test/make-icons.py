# Regenerates the TEST-site icons from the production icons in public/.
# Run: python3 env-test/make-icons.py  (needs Pillow + numpy)
import numpy as np
from PIL import Image, ImageDraw, ImageFont
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

def recolor(im):
    im = im.convert('RGBA')
    hsv = np.array(im.convert('RGB').convert('HSV')).astype(np.int16)
    # Only the dark navy background turns amber; the white and blue W keep their colours.
    bg = (hsv[..., 2] < 150) & (hsv[..., 1] > 60)
    hsv[..., 0][bg] = 22                                   # amber hue
    hsv[..., 1][bg] = 235
    hsv[..., 2][bg] = np.clip(hsv[..., 2][bg] * 0.9 + 120, 0, 255)
    out = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGBA')
    out.putalpha(im.getchannel('A'))
    return out

def badge(im, safe):
    w, h = im.size
    d = ImageDraw.Draw(im)
    bh = int(h * (0.20 if safe else 0.24))
    y1 = int(h * (0.86 if safe else 1.0))
    y0 = y1 - bh
    x0, x1 = (int(w * 0.12), int(w * 0.88)) if safe else (0, w)
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(bh * 0.25) if safe else 0, fill=(200, 16, 46, 255))
    font = ImageFont.truetype(FONT, int(bh * 0.72))
    d.text(((x0 + x1) / 2, (y0 + y1) / 2), 'TEST', font=font, fill='white', anchor='mm')
    return im

for src, dst, safe in [
    ('icon-v2-192.png', 'icon-test-192.png', False),
    ('icon-v2-512.png', 'icon-test-512.png', False),
    ('icon-v2-maskable-512.png', 'icon-test-maskable-512.png', True),
    ('apple-touch-icon-v2.png', 'apple-touch-icon-test.png', False),
    ('favicon-64.png', 'favicon-test-64.png', False),
]:
    im = Image.open('public/' + src)
    out = recolor(im)
    if dst != 'favicon-test-64.png':
        out = badge(out, safe)
    out.save('env-test/' + dst, optimize=True)
    print(dst, out.size)
