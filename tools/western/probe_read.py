"""Big clean face probes with a fine ruler (neck-local y, labels every 1 cm) for reading eyes and lips by eye."""
import sys, json
from PIL import Image, ImageDraw
D = '/home/claude/models/west/chars/parts/'
out, names = sys.argv[1], sys.argv[2:]
ims = []
for n in names:
    m = json.load(open(D + n + '_probe.json')); RES, Y1 = m['RES'], m['Y1']
    im = Image.open(D + n + '_probe.png').convert('RGB'); K = 5
    y0, y1 = 0.05, -0.20
    im = im.crop((0, int((Y1 - y0) / RES), im.width, int((Y1 - y1) / RES))).resize((im.width * K, int((y0 - y1) / RES) * K), Image.LANCZOS)
    pad = Image.new('RGB', (im.width + 46, im.height), (0, 0, 0)); pad.paste(im, (46, 0)); d = ImageDraw.Draw(pad)
    for k in range(int(y1 * 200), int(y0 * 200) + 1):
        yy = k / 200; r = int((y0 - yy) / RES * K)
        if k % 2 == 0:
            d.line((30, r, 46, r), fill=(255, 255, 0)); d.text((0, r - 6), f'{yy * 100:+.0f}', fill=(255, 255, 0))
            d.line((46, r, pad.width, r), fill=(255, 255, 0) if k % 10 == 0 else (90, 90, 40), width=1) if k % 10 == 0 else None
        else: d.line((38, r, 46, r), fill=(160, 160, 0))
    d.text((50, 2), n, fill=(255, 255, 255)); ims.append(pad)
s = Image.new('RGB', (sum(i.width for i in ims), ims[0].height)); x = 0
for i in ims: s.paste(i, (x, 0)); x += i.width
s.save(out)
