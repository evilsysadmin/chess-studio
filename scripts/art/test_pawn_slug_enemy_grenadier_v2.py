#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from derive_pawn_slug_enemy_grenadier_v2 import CELL, FRAMES, build


def make_source(path: Path) -> None:
    atlas = Image.new("RGBA", (640, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(atlas)
    for i in range(FRAMES):
        x = i * CELL
        d.rectangle((x + 20, 20, x + 66, 69), fill=(72, 63"ÂSÂ#SR’¢Bç&V7FævÆR‚‡‚²‚Âc’Â‚²c2ÂsR’Âf–ÆÃÒƒCBÂ3’Â3"Â#SR’¢FÆ2ç6fR‡F‚Â%är"  ¦6Æ72w&VæF–W%c%FW7G2‡Væ—GFW7BåFW7D66R“ ¢FVbFW7Eöw&VæF–W%ö6†ævW5÷WW%÷&öf–ÆU÷v—F†÷WEöÖ÷f–æuöfVWB‡6VÆb’ÓâæöæS ¢v—F‚FV×f–ÆRåFV×÷&'”F—&V7F÷'’‚’2F× ¢&ö÷BÒF‚‡F×¢7&2Â÷WBÒ&ö÷Bò'6÷W&6Rçær"Â&ö÷Bò&÷WB ¢Ö¶U÷6÷W&6R‡7&2¢&W÷'BÒ'V–ÆB‡7&2Â÷WB¢&W7VÇBÒ–ÖvRæ÷Vâ†÷WBò&W÷'E²&÷WGWB%Ò’æ6öçfW'B‚%$t$"¢&6RÒ–ÖvRæ÷Vâ‡7&2’æ6öçfW'B‚%$t$"’æ7&÷‚ƒÂÂcCÂƒ’¢6VÆbæ76W'DWVÂ‡&W7VÇBç6—¦RÂƒcCÂƒ’¢6VÆbæ76W'D—4æ÷DæöæR„–ÖvT6†÷2æF–ffW&Væ6R‡&W7VÇBÂ&6R’ævWF&&÷‚‚’¢f÷"’–â&ævR„e$ÔU2“ ¢&Vf÷&RÒ&6Ræ7&÷‚†’¢4TÄÂÂÂ†’²’¢4TÄÂÂ4TÄÂ’’ævWF6†ææVÂ‚$"’ævWF&&÷‚‚¢gFW"Ò&W7VÇBæ7&÷‚†’¢4TÄÂÂÂ†’²’¢4TÄÂÂ4TÄÂ’’ævWF6†ææVÂ‚$"’ævWF&&÷‚‚¢6VÆbæ76W'DWVÂ†gFW%³5ÒÂ&Vf÷&U³5Ò¢6VÆbæ76W'Dw&VFW$WVÂ†gFW%³%ÒÂ&Vf÷&U³%Ò  ¦–bõöæÖUõòÓÒ%õöÖ–åõò# ¢Væ—GFW7BæÖ–â‚