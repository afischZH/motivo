"""
Builds the self-hosted fonts of the social media editor (M6-AP03) from the
upstream files of the google/fonts repository (branch main, folder ofl/).

Not part of the app build: run it by hand when a font is added or updated,
then commit the output. Needs Python 3 with fontTools and brotli
(`pip install fonttools brotli`).

    python3 assets/fonts/build-fonts.py <folder with ofl/<family>/ files> apps/web/public/fonts

For every family and weight: variable fonts are pinned to that weight (all
other axes at their default), then subset to the Google Fonts "latin" and
"latin-ext" ranges (the same unicode-range values the editor registers),
without hinting, as WOFF2. The family's OFL.txt is copied next to the files.
Output: <out>/<id>/<id>-<weight>-<subset>.woff2 and <out>/<id>/OFL.txt.
Families whose OFL names a Reserved Font Name that equals their name
(Lora, Playfair Display, Merriweather) are left out on purpose: subsetting is
a modification, and a modified version must not carry a reserved name.
Keep FAMILIES in sync with LIBRARY_FONTS in packages/scene/src/fonts.ts.
"""
import os
import shutil
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

# id: (google/fonts folder, upright file, weights)
FAMILIES = {
    "inter": ("inter", "Inter[opsz,wght].ttf", [400, 700]),
    "roboto-flex": (
        "robotoflex",
        "RobotoFlex[GRAD,XOPQ,XTRA,YOPQ,YTAS,YTDE,YTFI,YTLC,YTUC,opsz,slnt,wdth,wght].ttf",
        [400, 700],
    ),
    "poppins": ("poppins", {400: "Poppins-Regular.ttf", 700: "Poppins-Bold.ttf"}, [400, 700]),
    "montserrat": ("montserrat", "Montserrat[wght].ttf", [400, 700]),
    "space-grotesk": ("spacegrotesk", "SpaceGrotesk[wght].ttf", [400, 700]),
    "fraunces": ("fraunces", "Fraunces[SOFT,WONK,opsz,wght].ttf", [400, 700]),
    "eb-garamond": ("ebgaramond", "EBGaramond[wght].ttf", [400, 700]),
    "dm-serif-display": ("dmserifdisplay", "DMSerifDisplay-Regular.ttf", [400]),
    "bebas-neue": ("bebasneue", "BebasNeue-Regular.ttf", [400]),
    "jetbrains-mono": ("jetbrainsmono", "JetBrainsMono[wght].ttf", [400, 700]),
    "caveat": ("caveat", "Caveat[wght].ttf", [400, 700]),
    "pacifico": ("pacifico", "Pacifico-Regular.ttf", [400]),
}

# Google Fonts subsets (css2 API), also in apps/web/components/social-editor/font-files.ts.
SUBSETS = {
    "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,"
    "U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,"
    "U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,"
    "U+2C60-2C7F,U+A720-A7FF",
}


def unicodes(spec):
    out = []
    for part in spec.split(","):
        part = part.strip()[2:]
        lo, _, hi = part.partition("-")
        out.extend(range(int(lo, 16), int(hi or lo, 16) + 1))
    return out


def instance(path, weight):
    font = TTFont(path)
    if "fvar" not in font:
        return font
    axes = {a.axisTag: (weight if a.axisTag == "wght" else a.defaultValue) for a in font["fvar"].axes}
    return instancer.instantiateVariableFont(font, axes, updateFontNames=False)


def main(src, out):
    for font_id, (folder, files, weights) in FAMILIES.items():
        target = os.path.join(out, font_id)
        os.makedirs(target, exist_ok=True)
        shutil.copyfile(os.path.join(src, folder, "OFL.txt"), os.path.join(target, "OFL.txt"))
        for weight in weights:
            file = files[weight] if isinstance(files, dict) else files
            for name, spec in SUBSETS.items():
                font = instance(os.path.join(src, folder, file), weight)
                options = subset.Options()
                options.flavor = "woff2"
                options.hinting = False
                options.desubroutinize = True
                options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
                subsetter = subset.Subsetter(options)
                subsetter.populate(unicodes=unicodes(spec))
                subsetter.subset(font)
                dest = os.path.join(target, f"{font_id}-{weight}-{name}.woff2")
                font.flavor = "woff2"
                font.save(dest)
                print(dest, os.path.getsize(dest))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
