#!/usr/bin/env python3
"""Turn a generated 6x2 piece sheet into the 12 transparent game assets."""

from collections import deque
from pathlib import Path
import sys

from PIL import Image


PIECES = ("P", "R", "N", "B", "Q", "K")


def clear_connected_checker(tile: Image.Image) -> Image.Image:
    rgba = tile.convert("RGBA")
    pixels = rgba.load()
    width, height = rgba.size
    seen = bytearray(width * height)
    queue = deque()

    def background(x: int, y: int) -> bool:
        red, green, blue, _ = pixels[x, y]
        return min(red, green, blue) >= 205 and max(red, green, blue) - min(red, green, blue) <= 16

    def enqueue(x: int, y: int) -> None:
        offset = y * width + x
        if seen[offset] or not background(x, y):
            return
        seen[offset] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)

    while queue:
        x, y = queue.popleft()
        pixels[x, y] = (*pixels[x, y][:3], 0)
        if x:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)
    return rgba


def fit_piece(tile: Image.Image) -> Image.Image:
    # La IA puede dejar una esquirla de la figura de la celda vecina. La
    # silueta principal siempre es el componente opaco mayor; descartamos el
    # resto antes de ajustar tamaño para que ninguna skin "invada" casillas.
    alpha = tile.getchannel("A")
    width, height = tile.size
    opaque = alpha.load()
    seen = bytearray(width * height)
    components = []
    for start_y in range(height):
        for start_x in range(width):
            offset = start_y * width + start_x
            if seen[offset] or opaque[start_x, start_y] < 48:
                continue
            seen[offset] = 1
            queue = deque([(start_x, start_y)])
            points = []
            while queue:
                x, y = queue.popleft()
                points.append((x, y))
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or nx >= width or ny < 0 or ny >= height:
                        continue
                    neighbor = ny * width + nx
                    if seen[neighbor] or opaque[nx, ny] < 48:
                        continue
                    seen[neighbor] = 1
                    queue.append((nx, ny))
            components.append(points)
    if components:
        keep = set(max(components, key=len))
        pixels = tile.load()
        for y in range(height):
            for x in range(width):
                if opaque[x, y] >= 48 and (x, y) not in keep:
                    pixels[x, y] = (*pixels[x, y][:3], 0)

    alpha = tile.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError("empty generated cell")
    piece = tile.crop(bounds)
    piece.thumbnail((116, 150), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (128, 160), (0, 0, 0, 0))
    canvas.alpha_composite(piece, ((128 - piece.width) // 2, 156 - piece.height))
    return canvas


def main() -> None:
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(source).convert("RGB")
    cell_width = sheet.width // 6
    cell_height = sheet.height // 2
    for row, color in enumerate(("w", "b")):
        for column, piece in enumerate(PIECES):
            tile = sheet.crop((column * cell_width, row * cell_height, (column + 1) * cell_width, (row + 1) * cell_height))
            fit_piece(clear_connected_checker(tile)).save(output / f"{color}{piece}.png", optimize=True)


if __name__ == "__main__":
    main()
