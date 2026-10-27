#!/usr/bin/env python3
"""Turn a generated image into a game-ready PNG under web/public/art/.

Characters: removes the background, trims to the figure and fits it into the
1200x1600 canvas with the waist on the bottom edge (see web/public/art/README.md).
Backgrounds: centre-crops to 16:9 and resizes to 1920x1080.

  pip install "rembg[cpu]"        # once; the anime cutout model downloads on first use
  scripts/art-ingest.py char aoi idle  ~/Downloads/aoi-idle.png
  scripts/art-ingest.py bg   lobby     ~/Downloads/lobby.png
"""
import argparse
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
ART = ROOT / 'web' / 'public' / 'art'
IDS = ['player', 'rin', 'dango', 'homura', 'shizuka', 'aoi', 'kitsune']
POSES = ['idle', 'smug', 'nervous', 'angry', 'shock', 'cry', 'win']
W, H = 1200, 1600


def character(src: pathlib.Path, cid: str, pose: str) -> pathlib.Path:
    from rembg import new_session, remove

    cut = remove(Image.open(src).convert('RGB'), session=new_session('isnet-anime'))
    box = cut.getchannel('A').point(lambda a: 255 if a > 24 else 0).getbbox()
    if not box:
        sys.exit('no figure found in the image')
    fig = cut.crop(box)
    # fill the height, unless that makes her wider than the canvas
    k = min(H / fig.height, W / fig.width)
    fig = fig.resize((round(fig.width * k), round(fig.height * k)), Image.LANCZOS)
    out = Image.new('RGBA', (W, H))
    out.alpha_composite(fig, ((W - fig.width) // 2, H - fig.height))
    dst = ART / 'characters' / cid / f'{pose}.png'
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, optimize=True)
    return dst


def background(src: pathlib.Path, name: str) -> pathlib.Path:
    im = Image.open(src).convert('RGB')
    tw = min(im.width, round(im.height * 16 / 9))
    th = round(tw * 9 / 16)
    left, top = (im.width - tw) // 2, (im.height - th) // 2
    im = im.crop((left, top, left + tw, top + th)).resize((1920, 1080), Image.LANCZOS)
    dst = ART / 'backgrounds' / f'{name}.png'
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, optimize=True)
    return dst


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='kind', required=True)
    c = sub.add_parser('char')
    c.add_argument('id', choices=IDS)
    c.add_argument('pose', choices=POSES)
    c.add_argument('src', type=pathlib.Path)
    b = sub.add_parser('bg')
    b.add_argument('name', choices=['lobby', 'table'])
    b.add_argument('src', type=pathlib.Path)
    a = p.parse_args()
    dst = character(a.src, a.id, a.pose) if a.kind == 'char' else background(a.src, a.name)
    print(dst.relative_to(ROOT))


if __name__ == '__main__':
    main()
