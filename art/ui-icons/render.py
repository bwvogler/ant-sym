"""Draw the game's transparent 24-pixel icons. Run with Python and Pillow."""

from pathlib import Path
from PIL import Image, ImageDraw

OUTPUT = Path(__file__).resolve().parents[2] / "web/public/ui-icons"
INK = "#29241f"
SOIL = "#885c3e"
CLAY = "#c18a58"
SAND = "#edbd83"
PALE = "#fff0ca"
GREEN = "#54865d"
MINT = "#a9cc87"
TEAL = "#367e7a"
SKY = "#a0d4cd"
GRAY = "#777b77"
SILVER = "#cbd1bd"
RUST = "#ad493d"
GOLD = "#dfaa4b"
PURPLE = "#956e9f"


class Sprite:
    def __init__(self):
        self.image = Image.new("RGBA", (24, 24))
        self.draw = ImageDraw.Draw(self.image)

    def rect(self, box, color):
        self.draw.rectangle(box, fill=color)

    def poly(self, points, color, outline=None):
        self.draw.polygon(points, fill=color, outline=outline)

    def line(self, points, color, width=1):
        self.draw.line(points, fill=color, width=width)

    def cube(self, x, y, width, top, left, right):
        half = width // 2
        middle = x + half
        self.poly([(x, y+half), (middle, y), (x+width, y+half), (middle, y+width)], top, INK)
        self.poly([(x, y+half), (middle, y+width), (middle, y+width+half), (x, y+width)], left, INK)
        self.poly([(middle, y+width), (x+width, y+half), (x+width, y+width), (middle, y+width+half)], right, INK)

    def save(self, group, name):
        self.image.resize((192, 192), Image.Resampling.NEAREST).save(OUTPUT / group / f"{name}.png", optimize=True)


def ant(s, x, y, band):
    for offset in (-2, 0, 2):
        s.line([(x+offset, y-4), (x+offset, y+4)], CLAY)
    s.rect((x-6,y-2,x-2,y+2), INK)
    s.rect((x-1,y-1,x+2,y+1), INK)
    s.rect((x+3,y-2,x+6,y+2), INK)
    s.rect((x-5,y-1,x-2,y+1), SOIL)
    s.rect((x-4,y-2,x-3,y+2), band)
    s.line([(x+5,y),(x+8,y-4)], SOIL)
    s.line([(x+5,y),(x+8,y+4)], SOIL)


def shovel(s):
    s.line([(8,16),(19,5)], INK, 5)
    s.line([(8,16),(19,5)], CLAY, 2)
    s.poly([(3,17),(7,11),(13,17),(7,21),(3,21)], GRAY, INK)
    s.line([(5,17),(8,14)], SILVER, 2)
    s.poly([(15,4),(18,2),(22,6),(20,9)], GOLD, INK)


def check(s):
    s.poly([(4,11),(7,8),(10,12),(17,5),(20,8),(10,19)], GREEN, INK)
    s.line([(7,10),(10,14),(17,7)], MINT, 2)


def eye(s):
    s.poly([(2,11),(7,6),(16,6),(21,11),(16,16),(7,16)], PALE, INK)
    s.rect((8,8,15,14), TEAL)
    s.rect((10,9,13,13), INK)
    s.rect((10,9,11,10), SKY)


def hand(s):
    s.poly([(6,18),(3,12),(5,10),(8,13),(8,5),(10,3),(12,5),(14,4),
            (20,7),(20,15),(17,21),(8,21)], SAND, INK)
    s.line([(12,5),(12,10)], CLAY)
    s.line([(15,5),(15,10)], CLAY)
    s.line([(18,6),(18,11)], CLAY)
    s.rect((9,18,17,19), CLAY)


def book(s):
    s.poly([(2,5),(9,4),(12,6),(15,4),(21,5),(21,19),(15,18),(12,21),
            (9,18),(2,19)], SOIL, INK)
    s.poly([(3,6),(9,5),(11,7),(11,17),(9,15),(3,16)], PALE)
    s.poly([(12,7),(15,5),(20,6),(20,16),(15,15),(12,17)], SAND)
    for y in (8,11,14):
        s.line([(5,y),(8,y)], CLAY)
    s.line([(14,11),(18,11)], TEAL, 2)


def layer(s, below):
    s.poly([(2,11),(11,6),(21,11),(21,17),(11,22),(2,17)], SOIL, INK)
    s.poly([(2,11),(11,6),(21,11),(11,16)], SAND if not below else CLAY, INK)
    s.poly([(11,16),(21,11),(21,17),(11,22)], CLAY if not below else SOIL, INK)
    if below:
        s.line([(18,13),(16,14),(16,17),(13,19)], PALE, 2)
        s.rect((12,18,15,19), PALE)
    else:
        s.poly([(6,11),(9,8),(13,8),(16,11),(13,13),(9,13)], CLAY, INK)
        s.rect((10,10,12,11), INK)
        s.rect((17,3,19,5), GOLD)


def draw_icon(name, s):
    if name in {"dig", "build"}:
        shovel(s)
    elif name == "move":
        hand(s)
        s.line([(2,3),(7,3)], TEAL, 2)
        s.poly([(1,3),(3,1),(3,5)], TEAL)
        s.line([(16,2),(21,2)], TEAL, 2)
        s.poly([(22,2),(20,0),(20,4)], TEAL)
    elif name == "little-hands":
        hand(s)
    elif name == "done-building":
        check(s)
    elif name == "smell-vision":
        eye(s)
        s.rect((4,3,5,4), GOLD)
        s.rect((17,18,19,19), GOLD)
    elif name == "tweezers":
        ant(s, 12, 17, GOLD)
        s.poly([(5,3),(18,3),(18,6),(14,13),(12,13),(15,6),(8,6),(11,13),(9,13),(5,6)], SILVER, INK)
    elif name in {"dirt", "rock", "sugar"}:
        top, left, right = {
            "dirt": (CLAY, SOIL, "#63442f"),
            "rock": (SILVER, GRAY, "#4d5653"),
            "sugar": ("#fff9e6", "#dfd4b3", "#aca38a"),
        }[name]
        s.cube(4, 1, 14, top, left, right)
        s.rect((8,7,9,8), left)
        s.rect((13,5,14,6), left)
    elif name == "crumb":
        s.cube(3, 8, 10, SAND, GOLD, SOIL)
        s.cube(14, 5, 6, PALE, SAND, SOIL)
        s.rect((17,16,19,18), CLAY)
    elif name == "aphids":
        s.poly([(3,18),(6,8),(16,4),(21,5),(19,14),(12,19)], GREEN, INK)
        s.line([(4,20),(17,8)], MINT, 2)
        for x, y in ((10,11),(14,7),(14,14)):
            s.rect((x-1,y-1,x+2,y+2), INK)
            s.rect((x,y,x+1,y+1), MINT)
    elif name == "trail-crayon":
        s.poly([(5,14),(15,4),(20,9),(10,19),(3,21)], TEAL, INK)
        s.line([(8,14),(16,6)], SKY, 2)
        s.line([(11,9),(15,13)], PALE, 2)
        s.line([(13,7),(17,11)], PALE, 2)
        s.rect((15,20,17,21), TEAL)
        s.rect((20,17,22,18), TEAL)
    elif name == "no-entry":
        s.rect((10,12,13,21), SOIL)
        s.poly([(6,3),(17,3),(21,7),(21,12),(17,16),(6,16),(2,12),(2,7)], RUST, INK)
        s.rect((6,8,17,10), PALE)
    elif name == "rain":
        s.poly([(3,8),(6,5),(10,5),(12,3),(17,3),(21,7),(21,11),(3,11)], SKY, INK)
        for x, y in ((5,14),(11,17),(17,14)):
            s.line([(x+2,y),(x,y+4)], TEAL, 2)
    elif name == "undo":
        s.poly([(2,9),(9,3),(9,7),(17,7),(21,11),(21,16),(17,20),(9,20),
                (9,16),(16,16),(17,14),(15,12),(9,12),(9,16)], TEAL, INK)
        s.line([(9,8),(16,8),(19,11)], SKY)
    elif name == "fungus":
        for x, y in ((7,10),(17,13),(11,4)):
            s.line([(11,20),(x,y+3)], SOIL, 4)
            s.line([(11,20),(x,y+3)], PALE, 2)
            s.poly([(x-4,y+3),(x-3,y),(x+2,y),(x+4,y+3)], PURPLE, INK)
            s.line([(x-2,y+1),(x,y+1)], PALE)
        s.line([(4,21),(11,18),(20,21)], SOIL, 2)
    elif name == "evolve":
        s.line([(5,20),(11,13),(11,8),(17,3)], TEAL, 3)
        s.line([(17,20),(11,13),(11,8),(5,3)], PURPLE, 3)
        for y in (5,9,15,18):
            s.line([(8,y),(14,y)], GOLD, 2)
        for x, y in ((5,3),(17,3),(5,20),(17,20)):
            s.rect((x-1,y-1,x+1,y+1), PALE)
    elif name == "colonies":
        ant(s, 9, 7, GOLD)
        ant(s, 13, 16, TEAL)
    elif name == "saves":
        s.poly([(4,3),(16,3),(20,7),(20,21),(4,21)], TEAL, INK)
        s.rect((7,4,16,9), SILVER)
        s.rect((13,4,15,8), INK)
        s.rect((7,13,17,19), PALE)
        s.rect((9,15,15,16), SOIL)
    elif name == "learn":
        book(s)
    elif name == "settings":
        s.poly([(9,2),(14,2),(15,5),(19,5),(19,8),(22,9),(22,14),(19,15),
                (19,19),(15,19),(14,22),(9,22),(8,19),(5,19),(5,15),(2,14),
                (2,9),(5,8),(5,5),(8,5)], GRAY, INK)
        s.line([(6,8),(9,5),(13,5)], SILVER, 2)
        s.rect((8,8,15,15), INK)
        s.rect((10,10,13,13), SAND)
    elif name in {"above", "below"}:
        layer(s, name == "below")
    else:
        raise ValueError(name)


if __name__ == "__main__":
    for group, names in {
        "menu": "build colonies evolve fungus learn saves settings above below",
        "builder": "aphids crumb dig dirt done-building little-hands move no-entry rain rock smell-vision sugar trail-crayon tweezers undo",
    }.items():
        for name in names.split():
            sprite = Sprite()
            draw_icon(name, sprite)
            sprite.save(group, name)
