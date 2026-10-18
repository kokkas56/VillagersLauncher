from PIL import Image, ImageDraw, ImageFont
W, H = 1024, 256
F = 'Monocraft.ttf'

def emerald(px=10):
    rows = [
        ".......dd.......",
        "......dLLd......",
        ".....dLWLGd.....",
        "....dLLGGGGd....",
        "...dLGGGGGGGd...",
        "..dGGGGGGGGGGd..",
        ".dGGGGGGGGGGGGd.",
        "dGGGGGGGGGGGGGDd",
        "dGGGGGGGGGGGGDDd",
        ".dGGGGGGGGGGDDd.",
        "..dGGGGGGGGDDd..",
        "...dGGGGGGDDd...",
        "....dGGGGDDd....",
        ".....dGGDDd.....",
        "......dDDd......",
        ".......dd.......",
    ]
    pal = {'d': (12, 60, 30, 255), 'G': (46, 204, 113, 255), 'L': (140, 245, 175, 255), 'W': (235, 255, 240, 255), 'D': (24, 140, 70, 255)}
    im = Image.new('RGBA', (16 * px, 16 * px), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in pal:
                d.rectangle([x * px, y * px, x * px + px - 1, y * px + px - 1], fill=pal[c])
    return im

def logo():
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    em = emerald(10)
    im.alpha_composite(em, (8, (H - em.height) // 2 - 8))
    d = ImageDraw.Draw(im)
    size = 86
    font = ImageFont.truetype(F, size)
    x0, y0 = 196, 38
    parts = [("Mine", (255, 255, 255, 255)), ("Villagers", (245, 197, 66, 255))]
    x = x0
    for txt, col in parts:
        d.text((x + 6, y0 + 6), txt, font=font, fill=(0, 0, 0, 170))
        d.text((x, y0), txt, font=font, fill=col)
        x += d.textlength(txt, font=font)
    sub = ImageFont.truetype(F, 34)
    d.text((x0 + 4, y0 + 128), "сборка Кокка", font=sub, fill=(0, 0, 0, 150))
    d.text((x0, y0 + 124), "сборка Кокка", font=sub, fill=(120, 230, 160, 255))
    print('text width', x - x0)
    return im

L = logo()
L.save('logo_full.png')
# vanilla mojangstudios.png layout: 512x512, top half = left half of the logo, bottom half = right half
m = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
m.paste(L.crop((0, 0, 512, 256)).resize((512, 256)), (0, 0))
m.paste(L.crop((512, 0, 1024, 256)), (0, 256))
m.save('mojangstudios.png')
