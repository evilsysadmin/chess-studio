#!/usr/bin/env python3
"""Generate the Chronicles overworld of Terra, MM3 style: areas A1..F6.

    python3 scripts/chronicles/build_terra_world.py [--check]

Might and Magic III splits its outdoors into lettered/numbered areas that join
edge to edge; towns and dungeons open from inside them. This script turns the
design table below into authored runtime manifests in
`backend-python/chronicles_maps/`:

- 34 outdoor areas `terra-<code>` (21x15), each with gates on the edges that
  touch a neighbour. C3 is the existing Camino de los Estandartes and D3 is
  Rookwood: the script only adds their missing edge gates.
- 5 new towns built on the Swordhaven street plan, with an inn, a temple,
  smiths, a guild or store, and the people who move the story.
- 5 dungeons laid out as seeded mazes with a named boss that stays dead.
- The main story «El rey desaparecido» from Vado de Sal to the Corte de
  Bronce, plus side quests per town that send the company across the map.

It is a first pass to iterate on: the table is the design, the layouts are
deterministic (same table -> same bytes). Run `make chronicles-contracts`
afterwards to refresh the mirrors and parity corpora. `--check` fails if the
committed manifests differ from what the table generates.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import deque
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
MAPS = REPO / "backend-python/chronicles_maps"
W, H = 21, 15
CX, CY = 10, 7
GATES = {"N": (10, 1), "S": (10, 13), "W": (1, 7), "E": (19, 7)}
STEP = {"N": (0, -1), "S": (0, 1), "W": (-1, 0), "E": (1, 0)}
OPPOSITE = {"N": "S", "S": "N", "W": "E", "E": "W"}
COLS = "ABCDEF"
EXISTING = {"C3": "banner-road-first-book", "D3": "rookwood-first-book"}
MAIN = {"questId": "lost-king", "title": "El rey desaparecido",
        "description": "La Dama busca a sus caballeros desaparecidos.", "order": 1}

# ─── The world, area by area ───────────────────────────────────────────────
# biome: plains | forest | hills | marsh | coast | snow | ash
AREAS = {
    "A1": ("Glaciar del Cuervo", "snow", "Hielo azul hasta donde alcanza la vista. Un cuervo te sigue de roca en roca."),
    "B1": ("Paso de los Juramentos", "snow", "Un desfiladero entre picos. Los viajeros dejan aquí piedras con su nombre."),
    "C1": ("Llanura de la Vigilia", "snow", "Al fondo, las almenas de Vigilia del Norte humean contra el cielo blanco."),
    "D1": ("Túmulos del Pacto", "snow", "Siete túmulos en círculo. El viento no entra en el del centro."),
    "E1": ("Bosque de Escarcha", "forest", "Pinos cargados de hielo crujen como huesos viejos."),
    "F1": ("Faro Helado", "coast", "Un faro sin farero guarda una costa que ya nadie navega."),
    "A2": ("Acantilados de Hollín", "coast", "El mar golpea abajo. La roca está negra de hollín de algún incendio antiguo."),
    "B2": ("Brezal de los Lobos", "hills", "Brezo hasta la cintura y aullidos que nunca suenan cerca."),
    "C2": ("Colinas de la Corona", "hills", "Desde aquí se ven las torres de Swordhaven y, al norte, la nieve."),
    "D2": ("Viñedos del Rey", "plains", "Vides sin vendimiar. Las uvas se pudren desde que el Rey desapareció."),
    "E2": ("Estribaciones de Escoria", "hills", "La tierra se vuelve gris y huele a fragua."),
    "F2": ("Ladera de Ascuafría", "ash", "Chimeneas de Ascuafría en lo alto; ceniza tibia bajo los pies."),
    "A3": ("Bahía de Hollín", "coast", "Barcas varadas y redes al sol. Puerto de Hollín está a un paso."),
    "B3": ("Calzada del Oeste", "plains", "Una calzada real con mojones rotos a martillazos."),
    "E3": ("Bocamina de Escoria", "ash", "Raíles oxidados se pierden en la boca de una mina."),
    "F3": ("Crestas Volcánicas", "ash", "Lava vieja convertida en piedra. Algo brilla en las grietas."),
    "A4": ("Calas de los Contrabandistas", "coast", "Calas escondidas, cuerdas en la roca y una cueva que respira."),
    "B4": ("Granjas del Trigo", "plains", "Campos de trigo y graneros vacíos. Los granjeros hablan bajo."),
    "C4": ("Encrucijada del Ahorcado", "plains", "Un cruce de caminos con una horca sin ahorcado. Alguien lo descolgó."),
    "D4": ("Lindes de las Marismas", "marsh", "La tierra cede. El aire sabe a sal."),
    "E4": ("Bosque Ceniciento", "forest", "Árboles grises que no dan sombra."),
    "F4": ("Fundición en Ruinas", "ash", "Un horno del tamaño de una iglesia, frío desde hace un siglo."),
    "A5": ("Arrecifes del Naufragio", "coast", "Costillares de barcos asoman entre las rocas."),
    "B5": ("Molinos del Oeste", "plains", "Molinos que giran sin viento. Nadie quiere saber por qué."),
    "C5": ("Orillas de Vado de Sal", "marsh", "Pasarelas de madera sobre el agua salobre; Vado de Sal al alcance."),
    "D5": ("Marismas de Sal", "marsh", "Cañas, lodo y voces que no son de nadie."),
    "E5": ("Ciénaga Negra", "marsh", "Agua negra y quieta. Una choza sobre pilotes, con luz verde."),
    "F5": ("Desierto de Ceniza", "ash", "Dunas grises y el esqueleto de un dragón que nadie se atreve a medir."),
    "A6": ("Isla del Faro Roto", "coast", "Una isla unida a tierra por una lengua de arena que la marea cubre."),
    "B6": ("Dunas Costeras", "coast", "Dunas blancas. El viento borra tus huellas detrás de ti."),
    "C6": ("Salinas Hundidas", "marsh", "Eras de sal abandonadas. Una compuerta lleva bajo tierra."),
    "D6": ("Puertas de Bronce", "plains", "La gran calzada termina en las murallas doradas de la Corte de Bronce."),
    "E6": ("Ruinas del Obispo", "hills", "Una abadía derrumbada. Las campanas están enterradas, no rotas."),
    "F6": ("Umbral Bajo la Corona", "ash", "Una escalinata desciende a una puerta sellada con siete coronas."),
}

TOWNS = {
    # area: (map id, name, flavour)
    "A3": ("puerto-de-hollin", "Puerto de Hollín", "Gaviotas, brea y un campanario que nadie toca desde hace semanas."),
    "C5": ("vado-de-sal", "Vado de Sal", "Casas sobre pilotes, puentes de cuerda y la sal en cada esquina."),
    "F2": ("ascuafria", "Ascuafría", "Martillos en cada calle; el aire tiembla de calor."),
    "C1": ("vigilia-del-norte", "Vigilia del Norte", "Un burgo de piedra y nieve, con más libros que vecinos."),
    "D6": ("corte-de-bronce", "Corte de Bronce", "Cúpulas de bronce, guardias de gala y silencio de luto."),
}

DUNGEONS = {
    # area: (map id, name, hud, theme, boss)
    "C6": ("salinas-hundidas", "Salinas Hundidas", "Salinas", "marsh",
           ("drowned", "el Capitán Ahogado", 16)),
    "A4": ("cueva-contrabandistas", "Cueva de los Contrabandistas", "Cueva", "coast",
           ("bandit-captain", "Mano Negra, jefa de contrabandistas", 18)),
    "E3": ("minas-de-escoria", "Minas de Escoria", "Minas", "ash",
           ("gate-jailer", "el Capataz de Escoria", 22)),
    "D1": ("tumulos-primer-pacto", "Túmulos del Primer Pacto", "Túmulos", "snow",
           ("spectral-bishop", "el Guardián del Túmulo", 24)),
    "E5": ("cienaga-negra", "Choza de la Ciénaga Negra", "Ciénaga", "marsh",
           ("mire-witch", "la Bruja del Cieno", 20)),
}

# Where the story points next, and who stands where. Signposts in every area
# keep a direction in front of the player at all times.
SIGNPOSTS = {
    "C4": "Cartel: al sur, Vado de Sal (C5). Al norte, Swordhaven por el Camino (C3).",
    "B3": "Cartel: al oeste, Puerto de Hollín (A3). Al este, el Camino de los Estandartes (C3).",
    "D2": "Cartel: al este, Ascuafría (F2), por las estribaciones. Al norte, la Vigilia (C1).",
    "C2": "Cartel: al norte, Vigilia del Norte (C1). Al sur, Swordhaven.",
    "D5": "Cartel: al este, la Ciénaga Negra (E5). No vayas de noche. Ni de día.",
    "C5": "Cartel: Vado de Sal, aquí mismo. Al sur, las Salinas Hundidas (C6).",
    "D6": "Cartel: Corte de Bronce. Los peregrinos esperan turno a la puerta.",
    "E2": "Cartel: Ascuafría (F2) al este. Minas de Escoria (E3) al sur.",
    "A2": "Cartel: Puerto de Hollín (A3) al sur, siguiendo el acantilado.",
    "F5": "Cartel borrado por la ceniza. Sólo se lee «...bajo la corona».",
}

SHRINES = {
    "B2": "Fuente de los Lobos", "E1": "Fuente de Escarcha", "B5": "Fuente del Molino",
    "F3": "Fuente de Lava Dormida", "A6": "Fuente del Faro", "E6": "Pila del Obispo",
}

HERMITS = {
    # area: (id, name, line)
    "B4": ("b4-farmer", "la granjera Tesa", "«Desde que el Rey falta, los recaudadores vienen dos veces. Uno de ellos llevaba un anillo de Ascuafría.»"),
    "E4": ("e4-charcoal", "el carbonero Bruno", "«En las Minas de Escoria trabajan de noche. ¿Quién trabaja de noche en una mina?»"),
    "A5": ("a5-wrecker", "el raquero Ismael", "«Los contrabandistas de las calas tienen campana nueva. Una campana no se roba sola.»"),
    "D4": ("d4-eel", "la anguilera Marta", "«En las Salinas Hundidas se oyen gritos de hombres de armas. Llevan semanas gritando.»"),
    "B1": ("b1-pilgrim", "el peregrino Anselmo", "«Los Túmulos del Pacto se abrieron la misma noche que el Rey desapareció.»"),
}

BIOME_FOES = {
    "plains": [("road-bandit", "salteador"), ("ash-goblin", "goblin"), ("sewer-rat", "rata gigante")],
    "forest": [("bone-hound", "sabueso de hueso"), ("weaver-spider", "araña tejedora"), ("ash-goblin", "goblin del bosque")],
    "hills": [("ash-goblin", "goblin de las colinas"), ("road-bandit", "bandolero"), ("bone-hound", "lobo de hueso")],
    "marsh": [("salt-crab", "cangrejo de salitre"), ("drowned", "ahogado"), ("sewer-rat", "rata de marisma")],
    "coast": [("salt-crab", "cangrejo de roca"), ("drowned", "náufrago ahogado"), ("road-bandit", "pirata")],
    "snow": [("bone-hound", "lobo de escarcha"), ("scavenger-knight", "caballero helado"), ("drowned", "congelado")],
    "ash": [("ash-goblin", "goblin de ceniza"), ("ember-wisp", "lumbre de ceniza"), ("gate-jailer", "guardián de escoria")],
}

# Species keep their tactical identity (chroniclesBestiaryBehavior.test.js).
AI = {
    "ash-goblin": {"movement": "cardinal-roam", "attackReach": 1, "engagedMovement": "cardinal-chase", "engageRange": 2},
    "bone-hound": {"movement": "cardinal-roam", "attackReach": 1, "engagedMovement": "cardinal-chase", "engageRange": 4},
    "crypt-spider": {"movement": "cardinal-roam", "attackReach": 1, "engagedMovement": "knight-chase", "engageRange": 3},
    "weaver-spider": {"movement": "cardinal-roam", "attackReach": 1, "engagedMovement": "knight-chase", "engageRange": 3},
    "ember-wisp": {"movement": "hold", "attackReach": 2, "requiresLineOfSight": True},
    "spectral-bishop": {"movement": "hold", "attackReach": 3, "requiresLineOfSight": True},
    "salt-crab": {"movement": "cardinal-roam", "attackReach": 1, "engagedMovement": "knight-chase", "engageRange": 2},
    # The drowned never stop walking; sentries (bandits, knights, jailers)
    # hold their ground until the company comes close.
    "drowned": {"movement": "cardinal-chase", "attackReach": 1, "engagedMovement": "cardinal-chase", "engageRange": 3},
    "sewer-rat": {"movement": "cardinal-roam", "attackReach": 1, "engagedMovement": "cardinal-chase", "engageRange": 3},
}
DEFAULT_AI = {"movement": "hold", "attackReach": 1, "engagedMovement": "cardinal-chase", "engageRange": 2}

DENSITY = {"plains": 0.12, "forest": 0.46, "hills": 0.3, "marsh": 0.32, "coast": 0.24, "snow": 0.22, "ash": 0.28}


def code_xy(code: str) -> tuple[int, int]:
    return COLS.index(code[0]), int(code[1]) - 1


def xy_code(x: int, y: int) -> str | None:
    return f"{COLS[x]}{y + 1}" if 0 <= x < 6 and 0 <= y < 6 else None


def neighbour(code: str, side: str) -> str | None:
    x, y = code_xy(code)
    dx, dy = STEP[side]
    return xy_code(x + dx, y + dy)


def map_id(code: str) -> str:
    return EXISTING.get(code, f"terra-{code.lower()}")


def danger(code: str) -> int:
    x, y = code_xy(code)
    return abs(x - 2) + abs(y - 2)


def gate_exit_id(src: str, dst: str) -> str:
    if (src, dst) == ("C3", "D3"):
        return "to-banner-road-rookwood"
    if (src, dst) == ("D3", "C3"):
        return "to-rookwood-banner-road"
    return f"{src.lower()}-to-{dst.lower()}"


def hash2(x: int, y: int, salt: int) -> float:
    n = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 0xFFFF


def salt_of(text: str) -> int:
    value = 7
    for ch in text:
        value = (value * 131 + ord(ch)) & 0xFFFF
    return value


def tier(level: int) -> str:
    return "bronze" if level <= 1 else "iron" if level <= 3 else "silver" if level <= 5 else "steel"


def adv(objective: str) -> dict:
    return {"type": "advance-quest", **MAIN, "objective": objective}


def xp(award: str, amount: int) -> dict:
    return {"type": "award-xp", "awardId": award, "amount": amount}


def reachable(grid: list[list[str]], start: tuple[int, int]) -> set[tuple[int, int]]:
    seen = {start}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in STEP.values():
            nx, ny = x + dx, y + dy
            if 0 <= nx < len(grid[0]) and 0 <= ny < len(grid) and grid[ny][nx] == "." and (nx, ny) not in seen:
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def carve_line(grid, a, b) -> None:
    (x0, y0), (x1, y1) = a, b
    for x in range(min(x0, x1), max(x0, x1) + 1):
        grid[y0][x] = "."
    for y in range(min(y0, y1), max(y0, y1) + 1):
        grid[y][x1] = "."


# ─── Outdoor areas ─────────────────────────────────────────────────────────
SLOTS = [(5, 4), (15, 4), (5, 10), (15, 10), (4, 7), (16, 7), (10, 4), (10, 10)]
FOE_SLOTS = [(7, 3), (13, 11), (3, 11), (17, 3), (13, 3), (7, 11)]


def area_grid(code: str, biome: str, keep: list[tuple[int, int]]) -> list[str]:
    salt = salt_of(code)
    grid = [["#" if x in (0, W - 1) or y in (0, H - 1) else "." for x in range(W)] for y in range(H)]
    density = DENSITY[biome]
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            cell = (hash2(x // 2, y // 2, salt) * 0.6 + hash2(x, y, salt + 1) * 0.4)
            if cell < density:
                grid[y][x] = "#"
    # Roads: the cross between the edge gates and the centre, and a spur to
    # every feature, so nothing authored can be walled off.
    for gate in GATES.values():
        carve_line(grid, gate, (CX, CY))
    for point in keep:
        carve_line(grid, point, (CX, point[1]) if abs(point[0] - CX) > 0 else (point[0], CY))
        carve_line(grid, (CX, point[1]), (CX, CY))
    open_cells = reachable(grid, (CX, CY))
    rows = []
    for y in range(H):
        rows.append("".join("." if grid[y][x] == "." and (x, y) in open_cells else "#" for x in range(W)))
    return rows


def foe(area: str, index: int, level: int, visual: str, name: str, pos, *, boss=False, extra=None) -> dict:
    hp = 4 + level * 2 + (6 if boss else 0)
    enemy = {
        "id": f"{area}-foe-{index}",
        "visualType": visual,
        "name": name,
        "x": pos[0], "y": pos[1],
        "hpKey": f"{area.replace('-', '_')}Foe{index}Hp",
        "maxHp": hp,
        "retaliation": 1 + level // 3 + (1 if boss else 0),
        "optional": True,
        "activation": "always",
        "ai": dict(AI.get(visual, DEFAULT_AI)),
        "onDefeat": {
            "message": f"{{attacker}} acaba con {name} usando {{attack}}.",
            "effects": [{"type": "grant-gold", "amount": 2 + level * 2}],
        },
    }
    if extra:
        enemy.update(extra)
    return enemy


def build_area(code: str, quests: dict) -> dict:
    name, biome, flavour = AREAS[code]
    area = f"terra-{code.lower()}"
    level = danger(code)
    salt = salt_of(code)
    sides = [side for side in GATES if neighbour(code, side)]
    content_slots = list(SLOTS)
    used: list[tuple[int, int]] = []

    def take() -> tuple[int, int]:
        slot = content_slots.pop(0)
        used.append(slot)
        return slot

    exits, interactables, treasures = [], [], []
    for side in sides:
        dst = neighbour(code, side)
        gx, gy = GATES[side]
        exits.append({
            "id": gate_exit_id(code, dst), "kind": "exit", "x": gx, "y": gy, "requiresReturn": True,
            "openLabel": f"Ir a {dst} · {AREAS.get(dst, ('',))[0] if dst not in EXISTING else ('Camino de los Estandartes' if dst == 'C3' else 'Rookwood')}",
            "lockedLabel": "El paso está cortado", "requirements": [],
            "action": {"effects": [{"type": "transition-map", "mapId": map_id(dst), "entryExitId": gate_exit_id(dst, code)}],
                       "message": f"La compañía entra en {dst}."},
        })
    if code in TOWNS:
        town_id, town_name, _ = TOWNS[code]
        pos = take()
        exits.append({
            "id": f"{code.lower()}-to-town", "kind": "exit", "x": pos[0], "y": pos[1], "requiresReturn": True,
            "openLabel": f"Entrar en {town_name}", "lockedLabel": f"{town_name} · puertas cerradas", "requirements": [],
            "action": {"effects": [{"type": "transition-map", "mapId": town_id, "entryExitId": "town-gate"}],
                       "message": f"La compañía cruza las puertas de {town_name}."},
        })
    if code in DUNGEONS:
        dungeon_id, dungeon_name, *_ = DUNGEONS[code]
        pos = take()
        exits.append({
            "id": f"{code.lower()}-to-dungeon", "kind": "exit", "visualType": "dungeon-arch", "x": pos[0], "y": pos[1],
            "requiresReturn": True, "openLabel": f"Entrar en {dungeon_name}", "lockedLabel": f"{dungeon_name} · sellada",
            "requirements": [],
            "action": {"effects": [{"type": "transition-map", "mapId": dungeon_id, "entryExitId": "dungeon-exit"}],
                       "message": f"La compañía desciende a {dungeon_name}."},
        })
    if code == "F6":
        pos = take()
        exits.append({
            "id": "f6-sealed-temple", "kind": "exit", "visualType": "dungeon-arch", "x": pos[0], "y": pos[1],
            "requiresReturn": True, "openLabel": "Descender al Templo Bajo la Corona",
            "lockedLabel": "Templo Bajo la Corona · siete coronas lo sellan",
            "requirements": [{"key": "lostKingFinalActOpen", "truthy": True,
                              "message": "Siete coronas de piedra sellan la puerta. La Dama sabrá cómo abrirla, cuando llegue el momento."}],
            "action": {"effects": [{"type": "transition-map", "mapId": "terra-f6", "entryExitId": "f6-sealed-temple"}],
                       "message": "La puerta no se mueve."},
        })
    if code in SIGNPOSTS:
        pos = take()
        interactables.append({
            "id": f"{area}-sign", "kind": "lore", "visualType": "signpost", "x": pos[0], "y": pos[1],
            "persistentVisual": True, "label": "Leer el cartel",
            "action": {"effects": [], "message": SIGNPOSTS[code]},
        })
    if code in SHRINES:
        pos = take()
        flag = f"{area.replace('-', '_')}ShrineUsed"
        interactables.append({
            "id": f"{area}-shrine", "kind": "lore", "visualType": "shrine", "x": pos[0], "y": pos[1],
            "label": f"Beber de la {SHRINES[code]}", "when": [{"key": flag, "falsy": True}],
            "action": {"effects": [{"type": "set", "key": flag, "value": True}, {"type": "heal-party", "amount": 8},
                                   {"type": "restore-spell-points"}],
                       "message": f"El agua de la {SHRINES[code]} está helada y sabe a hierro. La compañía recupera fuerzas y puntos de hechizo."},
        })
    if code in HERMITS:
        hid, hname, line = HERMITS[code]
        pos = take()
        interactables.append({
            "id": hid, "kind": "lore", "visualType": "rookwood-mourner", "x": pos[0], "y": pos[1],
            "persistentVisual": True, "label": f"Hablar con {hname}",
            "action": {"effects": [], "message": f"{hname[0].upper()}{hname[1:]}: {line}"},
        })
    # Quest objects placed in this area by the quest table.
    for entry in quests.get(code, {}).get("treasures", []):
        pos = take()
        treasures.append({**entry, "x": pos[0], "y": pos[1]})
    # A chest per area: gold always, gear from the area's material tier.
    if content_slots:
        pos = take()
        flag = f"{area.replace('-', '_')}ChestOpened"
        loot_base = ["sword", "axe", "mace", "spear", "dagger", "staff"][salt % 6]
        loot = f"{tier(level)}-{loot_base}"
        gold = 6 + level * 6
        treasures.append({
            "id": f"{area}-chest", "kind": "pickup", "visualType": "chest", "x": pos[0], "y": pos[1],
            "label": "Abrir el cofre", "when": [{"key": flag, "falsy": True}],
            "action": {"effects": [{"type": "set", "key": flag, "value": True}, {"type": "grant-gold", "amount": gold},
                                   {"type": "grant-item", "itemId": loot, "name": loot.replace("-", " ").capitalize(),
                                    "description": "Botín de un cofre de Terra.", "quantity": 1}],
                       "message": f"El cofre guarda {gold} monedas y algo de equipo."},
        })

    foes = BIOME_FOES[biome]
    count = 2 if level < 3 else 3
    enemies = []
    foe_slots = [slot for slot in FOE_SLOTS if slot not in used]
    for i in range(count):
        visual, foe_name = foes[(salt + i) % len(foes)]
        enemies.append(foe(area, i, level, visual, foe_name, foe_slots[i]))
    for entry in quests.get(code, {}).get("enemies", []):
        slot = foe_slots[count]
        enemies.append({**entry, "x": slot[0], "y": slot[1]})

    keep = [(e["x"], e["y"]) for e in exits] + [(i["x"], i["y"]) for i in interactables + treasures]
    keep += [(e["x"], e["y"]) for e in enemies]
    grid = area_grid(code, biome, keep)
    for x, y in keep:
        assert grid[y][x] == ".", (code, x, y)
    return {
        "id": area, "version": 1, "progressionKey": f"terra-{code.lower()}-v1",
        "title": name, "areaCode": code, "biome": biome,
        "regionKind": "wilderness", "layoutMode": "authored",
        "grid": grid, "partyStart": {"x": CX, "y": CY, "direction": 0},
        "initialFlags": {}, "enemies": enemies, "triggers": [],
        "interactables": interactables, "treasures": treasures, "traps": [], "exits": exits,
        "initialJournal": {"id": f"{area}-arrival", "title": f"{code} · {name}", "body": flavour, "sigil": code},
        "introMessage": f"{code} · {name}. {flavour}",
    }


# ─── Towns ─────────────────────────────────────────────────────────────────
TOWN_GRID = [
    "###################",
    "#.................#",
    "#.###.###.###.###.#",
    "#.###.###.###.###.#",
    "#.................#",
    "#.##...........##.#",
    "#.##...........##.#",
    "#.##...........##.#",
    "#.................#",
    "#........#........#",
    "#.................#",
    "#.###.###.###.###.#",
    "#.###.###.###.###.#",
    "#.................#",
    "###################",
]

SHOP_STOCK = {
    "A3": (["iron-dagger", "iron-spear", "iron-sword", "bronze-axe"], ["leather-leather", "bronze-scale", "iron-ring", "bronze-shield"]),
    "C5": (["iron-mace", "iron-spear", "bronze-sword", "ivory-staff"], ["bronze-leather", "iron-scale", "bronze-ring", "wooden-shield"]),
    "F2": (["steel-dagger", "iron-axe", "silver-sword", "steel-mace"], ["iron-chain", "steel-scale", "iron-splint", "iron-shield"]),
    "C1": (["silver-spear", "steel-sword", "ivory-dagger", "silver-staff"], ["silver-chain", "steel-ring", "iron-plate", "silver-shield"]),
    "D6": (["steel-sword", "steel-axe", "steel-spear", "silver-mace"], ["steel-chain", "steel-splint", "steel-plate", "steel-shield"]),
}

GUILDS = {
    "C1": ("Biblioteca de la Vigilia", 20, ["first-aid", "flying-fist", "elemental-arrow", "detect-magic"]),
    "F2": ("Gremio de la Llama", 15, ["first-aid", "elemental-arrow", "detect-magic"]),
}


def build_town(code: str, people: list[dict]) -> dict:
    town_id, name, flavour = TOWNS[code]
    weapons, armour = SHOP_STOCK[code]
    prefix = town_id
    interactables = [
        {"id": f"{prefix}-inn", "kind": "service", "x": 7, "y": 10, "visualType": "building-tavern",
         "label": "Posada · descansar y curar · 8 oro", "lockedLabel": "Posada · necesitas 8 oro",
         "requirements": [{"itemId": "crown-gold", "quantity": 8, "message": "El posadero cobra por adelantado."}],
         "action": {"effects": [{"type": "consume-item", "itemId": "crown-gold", "quantity": 8}, {"type": "heal-party", "amount": 12},
                                {"type": "refill-class-abilities"}, {"type": "restore-spell-points"}],
                    "message": f"La compañía duerme en la posada de {name}. Heridas curadas, puntos de hechizo recuperados."}},
        {"id": f"{prefix}-weapons", "kind": "merchant", "x": 7, "y": 4, "visualType": "building-forge",
         "label": f"Armería de {name}", "shop": {"stock": weapons},
         "action": {"effects": [], "message": "El armero no levanta la vista del afilador: «Mira lo que quieras. Rompes, pagas»."}},
        {"id": f"{prefix}-armour", "kind": "merchant", "x": 11, "y": 4, "visualType": "building-armor",
         "label": f"Coracería de {name}", "shop": {"stock": armour},
         "action": {"effects": [], "message": "El forjador golpea una coraza al rojo: «Hecha a mano. Como mis precios»."}},
        {"id": f"{prefix}-temple", "kind": "service", "x": 14, "y": 6, "visualType": "building-temple",
         "label": "Templo · sanar a la compañía · 4 oro", "lockedLabel": "Templo · necesitas 4 oro",
         "requirements": [{"itemId": "crown-gold", "quantity": 4, "message": "El templo pide una ofrenda de cuatro monedas."}],
         "action": {"effects": [{"type": "consume-item", "itemId": "crown-gold", "quantity": 4}, {"type": "heal-party", "amount": 20}],
                    "message": "Los sacerdotes rezan sobre la compañía. Las heridas se cierran."}},
    ]
    if code in GUILDS:
        guild_name, fee, spells = GUILDS[code]
        interactables.append({
            "id": f"{prefix}-guild", "kind": "merchant", "x": 15, "y": 4, "visualType": "building-guild",
            "label": f"{guild_name} · hechizos",
            "action": {"effects": [], "message": f"Una archivista encapuchada señala el registro de socios de {guild_name}."},
            "guild": {"membership": fee, "greeting": f"«{guild_name}. Firmad y pagad {fee} de oro, y las estanterías son vuestras».",
                      "memberGreeting": "«Lo que quepa en vuestros libros, y en vuestra bolsa».", "spells": spells},
        })
    interactables.extend(people)
    return {
        "id": town_id, "version": 1, "progressionKey": f"{town_id}-v1", "title": name, "areaCode": code,
        "regionKind": "settlement", "layoutMode": "authored", "grid": TOWN_GRID,
        "partyStart": {"x": 9, "y": 1, "direction": 2}, "initialFlags": {}, "enemies": [], "triggers": [],
        "interactables": interactables, "treasures": [], "traps": [],
        "exits": [{
            "id": "town-gate", "kind": "exit", "x": 9, "y": 1, "requiresReturn": True,
            "openLabel": f"Salir a {code} · {AREAS[code][0]}", "lockedLabel": "Las puertas están cerradas", "requirements": [],
            "action": {"effects": [{"type": "transition-map", "mapId": map_id(code), "entryExitId": f"{code.lower()}-to-town"}],
                       "message": f"La compañía sale de {name}."},
        }],
        "initialJournal": {"id": f"{town_id}-arrival", "title": name, "body": flavour, "sigil": code},
        "introMessage": f"{name}. {flavour}",
    }


# ─── Dungeons ──────────────────────────────────────────────────────────────
DUNGEON_FOES = {
    "marsh": [("drowned", "ahogado"), ("salt-crab", "cangrejo de salitre"), ("sewer-rat", "rata de salina"), ("ember-wisp", "fuego fatuo")],
    "coast": [("road-bandit", "contrabandista"), ("salt-crab", "cangrejo de cueva"), ("sewer-rat", "rata de bodega"), ("ember-wisp", "farol encantado")],
    "ash": [("ash-goblin", "goblin minero"), ("ember-wisp", "lumbre de mina"), ("bone-hound", "sabueso de escoria"), ("crypt-spider", "araña de galería")],
    "snow": [("scavenger-knight", "guerrero del túmulo"), ("spectral-bishop", "sacerdote espectral"), ("bone-hound", "lobo de hueso"), ("crypt-spider", "araña de túmulo")],
}


def maze(seed: int, w: int = 17, h: int = 11) -> list[list[str]]:
    grid = [["#"] * w for _ in range(h)]
    stack = [(1, 1)]
    grid[1][1] = "."
    n = seed
    while stack:
        x, y = stack[-1]
        options = [(dx, dy) for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2))
                   if 0 < x + dx < w - 1 and 0 < y + dy < h - 1 and grid[y + dy][x + dx] == "#"]
        if not options:
            stack.pop()
            continue
        n = (n * 1103515245 + 12345) & 0x7FFFFFFF
        dx, dy = options[n % len(options)]
        grid[y + dy // 2][x + dx // 2] = "."
        grid[y + dy][x + dx] = "."
        stack.append((x + dx, y + dy))
    # A few loops so the maze is not a single corridor.
    for i in range(6):
        n = (n * 1103515245 + 12345) & 0x7FFFFFFF
        x = 2 + (n % (w - 4))
        y = 1 + ((n >> 8) % (h - 2))
        if grid[y][x] == "#" and ((grid[y][x - 1] == "." and grid[y][x + 1] == ".") or (grid[y - 1][x] == "." and grid[y + 1][x] == ".")):
            grid[y][x] = "."
    return grid


def distances(grid, start) -> dict:
    dist = {start: 0}
    queue = deque([start])
    while queue:
        x, y = queue.popleft()
        for dx, dy in STEP.values():
            nx, ny = x + dx, y + dy
            if grid[ny][nx] == "." and (nx, ny) not in dist:
                dist[(nx, ny)] = dist[(x, y)] + 1
                queue.append((nx, ny))
    return dist


def build_dungeon(code: str, boss_drop: dict, quests: dict) -> dict:
    dungeon_id, name, hud, theme, (boss_visual, boss_name, boss_hp) = DUNGEONS[code]
    level = danger(code) + 1
    grid = maze(salt_of(dungeon_id))
    dist = distances(grid, (1, 1))
    ordered = sorted(dist, key=lambda p: (dist[p], p))
    boss_pos = ordered[-1]
    dead_ends = [p for p in ordered if sum(grid[p[1] + dy][p[0] + dx] == "." for dx, dy in STEP.values()) == 1 and p not in ((1, 1), boss_pos)]
    chest_pos = dead_ends[len(dead_ends) // 2] if dead_ends else ordered[len(ordered) // 2]
    slug = dungeon_id.replace("-", "_")
    foes = DUNGEON_FOES[theme]
    enemies = []
    picks = [ordered[len(ordered) * k // 6] for k in (2, 3, 4, 5)]
    for i, pos in enumerate(picks):
        if pos in (boss_pos, chest_pos, (1, 1)):
            continue
        visual, foe_name = foes[i % len(foes)]
        enemies.append(foe(dungeon_id, i, level, visual, foe_name, pos))
    boss_flag = f"{slug}BossDefeated"
    boss = foe(dungeon_id, 9, level, boss_visual, boss_name, boss_pos, boss=True, extra={
        "maxHp": boss_hp, "defeatedFlag": boss_flag,
        "ai": {"movement": "hold", "attackReach": 1, "engagedMovement": "cardinal-chase", "engageRange": 2},
        "blockingMessage": f"{boss_name[0].upper()}{boss_name[1:]} cierra el paso.",
        "onDefeat": {"message": f"{{attacker}} derriba a {boss_name} con {{attack}}.",
                     "effects": [{"type": "set", "key": boss_flag, "value": True}, {"type": "grant-gold", "amount": 10 + level * 4}, boss_drop],
                     "journal": {"id": f"{dungeon_id}-boss", "title": f"Cae {boss_name}", "body": boss_drop["description"], "sigil": "†"}},
    })
    enemies.append(boss)
    chest_flag = f"{slug}ChestOpened"
    loot = f"{tier(level + 1)}-{['sword', 'axe', 'mace', 'spear'][salt_of(dungeon_id) % 4]}"
    armour = f"{tier(level + 1)}-{'chain' if level > 3 else 'scale'}"
    treasures = [{
        "id": f"{dungeon_id}-chest", "kind": "pickup", "visualType": "ember-cache", "x": chest_pos[0], "y": chest_pos[1],
        "label": "Abrir el cofre", "when": [{"key": chest_flag, "falsy": True}],
        "action": {"effects": [{"type": "set", "key": chest_flag, "value": True}, {"type": "grant-gold", "amount": 15 + level * 8},
                               {"type": "grant-item", "itemId": loot, "name": loot.replace("-", " ").capitalize(), "description": "Botín de mazmorra.", "quantity": 1},
                               {"type": "grant-item", "itemId": armour, "name": armour.replace("-", " ").capitalize(), "description": "Botín de mazmorra.", "quantity": 1}],
                   "message": "Un cofre con herrajes de bronce: oro y equipo de calidad."}},
    ]
    return {
        "id": dungeon_id, "version": 1, "progressionKey": f"{dungeon_id}-v1", "title": name, "hudTitle": hud,
        "areaCode": code, "regionKind": "dungeon", "dungeonRole": "main", "layoutMode": "authored",
        "grid": ["".join(row) for row in grid], "partyStart": {"x": 1, "y": 1, "direction": 1},
        "initialFlags": {}, "enemies": enemies, "triggers": [], "interactables": [], "treasures": treasures, "traps": [],
        "exits": [{
            "id": "dungeon-exit", "kind": "exit", "x": 1, "y": 1, "requiresReturn": True,
            "openLabel": f"Salir a {code} · {AREAS[code][0]}", "lockedLabel": "La salida está bloqueada", "requirements": [],
            "action": {"effects": [{"type": "transition-map", "mapId": map_id(code), "entryExitId": f"{code.lower()}-to-dungeon"}],
                       "message": "La compañía sale a la luz."},
        }],
        "initialJournal": {"id": f"{dungeon_id}-arrival", "title": name, "body": f"{name}, bajo {code}.", "sigil": code},
        "introMessage": f"{name}. El aire huele a cerrado y a algo que no quiere visitas.",
        "arrivalAction": {"effects": [], "message": f"{name}. Al fondo de los pasillos espera {boss_name}."},
    }


# ─── The story and the side quests ─────────────────────────────────────────
def item(item_id: str, name: str, description: str) -> dict:
    return {"type": "grant-item", "itemId": item_id, "name": name, "description": description, "quantity": 1}


BOSS_DROPS = {
    "C6": item("squire-testimony", "Testimonio del escudero", "El escudero Bran, el último de la escolta, dejó escrito lo que vio: la campana de Puerto de Hollín sonó la noche de la emboscada."),
    "A4": item("bell-ledger", "Registro de la campana", "Los contrabandistas cobraban por tocar la campana. El último pago, en lingotes con marca de Ascuafría."),
    "E3": item("hollow-crown-mould", "Molde de la corona hueca", "Un molde de corona sin peso. Lleva un sello que no es de la Corona: el del Primer Pacto."),
    "D1": item("oath-tablet", "Tablilla del juramento", "La tablilla del Primer Pacto. Quien la lea en voz alta puede reclamar el juramento del Rey."),
    "E5": item("witch-ladle", "Cucharón de la bruja", "Un cucharón de hueso, todavía tibio. Prueba de que la bruja no volverá a cocinar."),
}


def step(person_id, x, y, visual, label, when, effects, message, journal=None, *, kind="lore", requirements=None, locked=None):
    entry = {"id": person_id, "kind": kind, "x": x, "y": y, "visualType": visual, "label": label, "when": when,
             "action": {"effects": effects, "message": message}}
    if journal:
        entry["action"]["journal"] = journal
    if requirements:
        entry["requirements"] = requirements
        entry["lockedLabel"] = locked or label
    return entry


def reward(reward_id, flag, gold, amount, objective, requirements, *extra):
    return {"type": "claim-reward", "rewardId": reward_id, "requirements": requirements,
            "effects": [{"type": "set", "key": flag, "value": True}, {"type": "grant-gold", "amount": gold}, xp(reward_id, amount),
                        *([adv(objective)] if objective else []), *extra]}


def story() -> tuple[dict, dict]:
    """Return (people per town code, quest content per area code)."""
    people: dict[str, list] = {code: [] for code in TOWNS}
    areas: dict[str, dict] = {}

    def chain(code, giver_id, giver, door, before_flag, start_flag, start_line, objective,
              boss_flag, done_flag, reward_id, gold, amount, done_line, next_objective, *, sigil):
        x, y, visual = door
        people[code].append(step(
            f"{giver_id}-brief", x, y, visual, f"Hablar con {giver}",
            [{"key": before_flag, "truthy": True}, {"key": start_flag, "falsy": True}],
            [{"type": "set", "key": start_flag, "value": True}, adv(objective)], start_line,
            {"id": f"lost-king-{giver_id}", "title": giver[0].upper() + giver[1:], "body": objective, "sigil": sigil}))
        people[code].append(step(
            f"{giver_id}-report", x, y, visual, f"Informar a {giver} · {gold} oro",
            [{"key": start_flag, "truthy": True}, {"key": done_flag, "falsy": True}],
            [reward(reward_id, done_flag, gold, amount, next_objective, [{"key": boss_flag, "truthy": True}])],
            done_line, {"id": f"lost-king-{giver_id}-done", "title": f"{giver[0].upper() + giver[1:]} ha hablado", "body": next_objective, "sigil": sigil},
            kind="quest", requirements=[{"key": boss_flag, "truthy": True, "message": f"{giver[0].upper() + giver[1:]} espera: «Todavía no. {objective}»"}],
            locked=f"{giver[0].upper() + giver[1:]} · «{objective}»"))

    boss = {code: f"{DUNGEONS[code][0].replace('-', '_')}BossDefeated" for code in DUNGEONS}
    chain("C5", "nela", "la barquera Nela", (11, 10, "building-hall"), "swordhavenRouteReported", "vadoNelaBriefed",
          "Nela amarra la barca y mira la hoja de ruta de Garrah: «Esta etapa no existe. Los caballeros nunca cruzaron el vado. Los que volvieron, volvieron muertos, y se los tragaron las Salinas Hundidas, al sur»",
          "Baja a las Salinas Hundidas (C6) y encuentra lo que queda de la escolta de los caballeros.",
          boss["C6"], "vadoNelaReported", "terra:salinas:v1", 40, 80,
          "Nela lee el testimonio del escudero con los labios apretados: «La campana de Puerto de Hollín. Alguien la tocó para avisar de que la escolta pasaba. Id al oeste»",
          "El escudero oyó la campana de Puerto de Hollín (A3) la noche de la emboscada. Habla con el campanero.", sigil="♛")
    chain("A3", "ulric", "el campanero Ulric", (11, 10, "building-hall"), "vadoNelaReported", "hollinUlricBriefed",
          "Ulric se frota las manos negras de hollín: «Yo no la toqué. Fueron los de las calas. Me quitaron la llave del campanario y me dejaron un saco de monedas para callar»",
          "Entra en la Cueva de los Contrabandistas (A4) y recupera el registro de la campana.",
          boss["A4"], "hollinUlricReported", "terra:contrabandistas:v1", 50, 100,
          "Ulric pasa los dedos por el registro: «Lingotes de Ascuafría. Allí funden todo lo que brilla, y también lo que no debería existir»",
          "El registro paga en lingotes de Ascuafría (F2). Busca a la maestra fundidora Hilde.", sigil="♛")
    chain("F2", "hilde", "la maestra fundidora Hilde", (11, 10, "building-hall"), "hollinUlricReported", "ascuafriaHildeBriefed",
          "Hilde se seca el sudor con el antebrazo: «Me encargaron un molde de corona que no pesaba nada. Lo rechacé. Otro lo fundió en las Minas de Escoria, de noche»",
          "Encuentra el molde de la corona hueca en las Minas de Escoria (E3).",
          boss["E3"], "ascuafriaHildeReported", "terra:escoria:v1", 60, 120,
          "Hilde gira el molde al fuego: «Este sello no es de la Corona. Es del Primer Pacto. Sólo el archivero de la Vigilia sabe leerlo»",
          "El molde lleva el sello del Primer Pacto. Llévalo al archivero ciego de Vigilia del Norte (C1).", sigil="♛")
    chain("C1", "osric", "el archivero ciego Osric", (11, 10, "building-hall"), "ascuafriaHildeReported", "vigiliaOsricBriefed",
          "Osric recorre el sello con la yema de los dedos: «El Pacto. Alguien quiere jurar en nombre del Rey. Para eso necesita la tablilla que duerme en los Túmulos, al este»",
          "Desciende a los Túmulos del Primer Pacto (D1) y trae la tablilla del juramento antes que nadie.",
          boss["D1"], "vigiliaOsricReported", "terra:tumulos:v1", 70, 150,
          "Osric sostiene la tablilla contra el pecho: «Ahora nadie puede usurpar el juramento. Llevádsela a la Dama, a la Corte de Bronce. Y no os fiéis del Canciller»",
          "Lleva la tablilla del juramento a la Dama, en la Corte de Bronce (D6).", sigil="♛")
    people["D6"].append(step(
        "dama-audience", 11, 10, "building-hall", "Audiencia con la Dama · 100 oro",
        [{"key": "vigiliaOsricReported", "truthy": True}, {"key": "lostKingFinalActOpen", "falsy": True}],
        [{"type": "claim-reward", "rewardId": "terra:dama:v1", "requirements": [{"key": "vigiliaOsricReported", "truthy": True}],
          "effects": [{"type": "set", "key": "lostKingFinalActOpen", "value": True}, {"type": "grant-gold", "amount": 100},
                      xp("terra:dama:v1", 200),
                      adv("La Dama ha abierto el Templo Bajo la Corona (F6). El Rey espera allí, bajo la piedra. (Último acto en preparación.)")]}],
        "La Dama recibe la tablilla sin testigos: «El Canciller Varren fundió una corona hueca para jurar en lugar del Rey. Y el Rey… el Rey sigue vivo, bajo la piedra, en el Templo Bajo la Corona. Tomad esto: abre las siete coronas»",
        {"id": "lost-king-dama", "title": "La Dama", "body": "El Rey vive bajo el Templo Bajo la Corona (F6). El Canciller Varren es el traidor.", "sigil": "♛"}))

    # Side quests: one hunt and one errand per town, each pointing to an area.
    def hunt(code, giver_id, giver, door, area, beast_visual, beast_name, line, done_line, gold, amount, boss_flag=None):
        x, y, visual = door
        flag = boss_flag or f"{giver_id.replace('-', '_')}Hunted"
        quest_id = f"{giver_id}-hunt"
        people[code].append(step(
            f"{giver_id}-hunt-brief", x, y, visual, f"Hablar con {giver}",
            [{"key": f"{giver_id.replace('-', '_')}HuntStarted", "falsy": True}],
            [{"type": "set", "key": f"{giver_id.replace('-', '_')}HuntStarted", "value": True},
             {"type": "start-quest", "questId": quest_id, "title": f"Caza: {beast_name}", "description": line,
              "objective": f"Acaba con {beast_name} en {area} · {AREAS[area][0]}.", "order": 40}], line))
        people[code].append(step(
            f"{giver_id}-hunt-report", x, y, visual, f"Cobrar la caza a {giver} · {gold} oro",
            [{"questId": quest_id, "questStatus": "active"}],
            [{"type": "claim-reward", "rewardId": f"terra:{quest_id}:v1", "requirements": [{"key": flag, "truthy": True}],
              "effects": [{"type": "complete-quest", "questId": quest_id, "objective": "Side quest completada."},
                          {"type": "grant-gold", "amount": gold}, xp(f"terra:{quest_id}:v1", amount)]}],
            done_line, kind="quest", requirements=[{"key": flag, "truthy": True, "message": f"«{beast_name[0].upper() + beast_name[1:]} sigue vivo en {area}»."}],
            locked=f"{giver[0].upper() + giver[1:]} · «¿Ya cayó {beast_name}?»"))
        if boss_flag:
            return
        level = danger(area) + 1
        areas.setdefault(area, {}).setdefault("enemies", []).append({
            "id": f"{giver_id}-quarry", "visualType": beast_visual, "name": beast_name, "hpKey": f"{giver_id.replace('-', '_')}QuarryHp",
            "maxHp": 10 + level * 3, "retaliation": 2 + level // 3, "optional": True, "activation": "always",
            "defeatedFlag": flag, "ai": dict(AI.get(beast_visual, DEFAULT_AI)),
            "onDefeat": {"message": f"{{attacker}} abate a {beast_name} con {{attack}}.", "effects": [{"type": "set", "key": flag, "value": True}]},
        })

    def errand(code, giver_id, giver, door, area, item_id, item_name, line, done_line, gold, amount):
        x, y, visual = door
        quest_id = f"{giver_id}-errand"
        people[code].append(step(
            f"{giver_id}-errand-brief", x, y, visual, f"Hablar con {giver}",
            [{"key": f"{giver_id.replace('-', '_')}ErrandStarted", "falsy": True}],
            [{"type": "set", "key": f"{giver_id.replace('-', '_')}ErrandStarted", "value": True},
             {"type": "start-quest", "questId": quest_id, "title": item_name, "description": line,
              "objective": f"Busca {item_name.lower()} en {area} · {AREAS[area][0]} y tráelo.", "order": 45}], line))
        people[code].append(step(
            f"{giver_id}-errand-report", x, y, visual, f"Entregar {item_name.lower()} · {gold} oro",
            [{"questId": quest_id, "questStatus": "active"}],
            [{"type": "claim-reward", "rewardId": f"terra:{quest_id}:v1", "requirements": [{"itemId": item_id}],
              "effects": [{"type": "consume-item", "itemId": item_id, "quantity": 1},
                          {"type": "complete-quest", "questId": quest_id, "objective": "Side quest completada."},
                          {"type": "grant-gold", "amount": gold}, xp(f"terra:{quest_id}:v1", amount)]}],
            done_line, kind="quest", requirements=[{"itemId": item_id, "message": f"«¿Y {item_name.lower()}? Está en {area}»."}],
            locked=f"{giver[0].upper() + giver[1:]} · espera {item_name.lower()}"))
        areas.setdefault(area, {}).setdefault("treasures", []).append({
            "id": f"{giver_id}-errand-item", "kind": "pickup", "visualType": "chest", "label": f"Recoger {item_name.lower()}",
            "when": [{"questId": quest_id, "questStatus": "active"}, {"key": f"{giver_id.replace('-', '_')}ErrandFound", "falsy": True}],
            "action": {"effects": [{"type": "set", "key": f"{giver_id.replace('-', '_')}ErrandFound", "value": True},
                                   item(item_id, item_name, f"Lo que pidió {giver}.")], "message": f"Aquí está: {item_name.lower()}."},
        })

    WATCH = (4, 6, "building-watch")
    STORE = (15, 10, "building-store")
    hunt("C5", "vado-watch", "el alguacil del vado", WATCH, "D5", "salt-crab", "la Reina Tenaza",
         "«Una cangreja del tamaño de un carro se come las redes en las Marismas de Sal (D5). Paga el concejo».",
         "El alguacil cuenta las monedas despacio: «Esta noche se cena cangrejo en todo Vado de Sal».", 30, 50)
    hunt("C5", "vado-herbalist", "la curandera Ada", STORE, "E5", "mire-witch", "la Bruja del Cieno",
         "«La bruja de la Ciénaga Negra (E5) envenena los pozos. Hay quien dice que vive en una choza sobre el agua, bajo tierra».",
         "Ada huele el aire: «Ya se nota. El agua vuelve a saber a agua».", 45, 90, boss_flag=boss["E5"])
    errand("A3", "hollin-fisher", "la pescadera Iria", STORE, "A5", "lost-net-charm", "El amuleto de las redes",
           "«Mi marido se ahogó en los Arrecifes del Naufragio (A5) con el amuleto de la familia. Sin él no pesca nadie».",
           "Iria aprieta el amuleto: «Mañana salen las barcas».", 25, 40)
    hunt("A3", "hollin-watch", "el capitán del puerto", WATCH, "A2", "drowned", "el Ahogado del Acantilado",
         "«Algo sube de noche por los Acantilados de Hollín (A2) y se lleva a los vigías».",
         "«El puerto duerme tranquilo. Tomad, os lo habéis ganado».", 30, 60)
    errand("F2", "ascua-smith", "el aprendiz Tomé", STORE, "F3", "lava-glass", "Cristal de lava",
           "«La maestra necesita cristal de lava de las Crestas Volcánicas (F3) para templar acero. Yo no me atrevo a ir».",
           "Tomé sonríe de oreja a oreja: «¡La maestra va a creer que fui yo!».", 35, 60)
    hunt("F2", "ascua-watch", "la capitana de la forja", WATCH, "F4", "gate-jailer", "el Coloso de Escoria",
         "«En la Fundición en Ruinas (F4) algo enorme se mueve entre los hornos. Que alguien lo apague».",
         "«Ni el coloso pudo con vosotros. Respeto»", 45, 90)
    errand("C1", "vigilia-monk", "el monje copista", STORE, "B1", "pilgrim-stone", "La piedra del peregrino",
           "«En el Paso de los Juramentos (B1) los viajeros dejan piedras con su nombre. Tráeme la más antigua: quiero copiarla».",
           "El monje acaricia la piedra: «Un nombre de antes del Pacto. Gracias».", 35, 60)
    hunt("C1", "vigilia-watch", "el sargento de la Vigilia", WATCH, "A1", "bone-hound", "el Cuervo Blanco",
         "«Una bestia de hueso con plumas de cuervo caza en el Glaciar (A1). Ya van tres patrullas».",
         "«Que lo canten los bardos. Yo sólo pago».", 50, 100)
    errand("D6", "corte-steward", "la mayordoma de la Corte", STORE, "E6", "abbey-bell", "La campanilla de la abadía",
           "«La Dama quiere oír la campanilla de las Ruinas del Obispo (E6). Dicen que trae paz a quien la oye».",
           "La mayordoma envuelve la campanilla en seda: «Hoy dormirá alguien en esta corte».", 40, 70)
    hunt("D6", "corte-guard", "el capitán de la guardia", WATCH, "F5", "ember-wisp", "el Fantasma del Dragón",
         "«Una luz roja recorre el Desierto de Ceniza (F5) junto al esqueleto del dragón. Las caravanas no pasan».",
         "«Las caravanas volverán. Y con ellas, los impuestos».", 50, 100)
    return people, areas


def build_all() -> dict[str, dict]:
    people, area_quests = story()
    manifests: dict[str, dict] = {}
    for code in AREAS:
        manifests[map_id(code)] = build_area(code, area_quests)
    for code in TOWNS:
        manifests[TOWNS[code][0]] = build_town(code, people[code])
    for code in DUNGEONS:
        manifests[DUNGEONS[code][0]] = build_dungeon(code, BOSS_DROPS[code], area_quests)
    return manifests


def patch_existing() -> dict[str, dict]:
    """Give the hand-authored C3 and D3 their edge gates into Terra."""
    patched = {}
    for code, existing_id in EXISTING.items():
        path = MAPS / f"{existing_id}.json"
        data = json.loads(path.read_text())
        data["areaCode"] = code
        data.setdefault("biome", "forest" if code == "D3" else "plains")
        grid = [list(row) for row in data["grid"]]
        ids = {exit_["id"] for exit_ in data["exits"]}
        # C3's north gate is Swordhaven; its way to C2 opens further west.
        gates = dict(GATES)
        if code == "C3":
            gates["N"] = (4, 1)
            gates["E"] = (19, 10)
        for side, (gx, gy) in gates.items():
            dst = neighbour(code, side)
            if not dst or gate_exit_id(code, dst) in ids:
                continue
            grid[gy][gx] = "."
            data["exits"].append({
                "id": gate_exit_id(code, dst), "kind": "exit", "x": gx, "y": gy, "requiresReturn": True,
                "openLabel": f"Ir a {dst} · {AREAS[dst][0]}", "lockedLabel": "El paso está cortado", "requirements": [],
                "action": {"effects": [{"type": "transition-map", "mapId": map_id(dst), "entryExitId": gate_exit_id(dst, code)}],
                           "message": f"La compañía entra en {dst}."},
            })
        data["grid"] = ["".join(row) for row in grid]
        open_cells = reachable(grid, (data["partyStart"]["x"], data["partyStart"]["y"]))
        for exit_ in data["exits"]:
            assert (exit_["x"], exit_["y"]) in open_cells, (code, exit_["id"])
        patched[existing_id] = data
    swordhaven = json.loads((MAPS / "swordhaven-first-book.json").read_text())
    old = "La hoja de ruta lleva a las Marismas de Sal. Prepárate para viajar a Vado de Sal."
    new = "La hoja de ruta lleva a las Marismas de Sal. Viaja a Vado de Sal (C5): sal al Camino (C3) y baja al sur por C4."
    text = json.dumps(swordhaven, ensure_ascii=False)
    if old in text:
        patched["swordhaven-first-book"] = json.loads(text.replace(old, new))
    return patched


def fix_arrivals(manifests: dict[str, dict]) -> None:
    """Every gate's entryExitId must exist on the other side."""
    for manifest in manifests.values():
        for exit_ in manifest["exits"]:
            for effect in exit_["action"]["effects"]:
                if effect.get("type") != "transition-map":
                    continue
                target = manifests.get(effect["mapId"])
                if target is None:
                    path = MAPS / f"{effect['mapId']}.json"
                    target = json.loads(path.read_text())
                assert any(e["id"] == effect["entryExitId"] for e in target["exits"]), (manifest["id"], exit_["id"], effect)


def write(manifests: dict[str, dict], check: bool) -> bool:
    stale = False
    for map_id_, data in sorted(manifests.items()):
        path = MAPS / f"{map_id_}.json"
        text = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
        if path.exists() and path.read_text() == text:
            continue
        stale = True
        if check:
            print(f"stale: {path.relative_to(REPO)}", file=sys.stderr)
        else:
            path.write_text(text)
            print(f"wrote {path.relative_to(REPO)}")
    return stale


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    manifests = build_all()
    manifests.update(patch_existing())
    fix_arrivals(manifests)
    stale = write(manifests, args.check)
    if args.check and stale:
        raise SystemExit("Terra manifests are stale: run scripts/chronicles/build_terra_world.py")


if __name__ == "__main__":
    main()
