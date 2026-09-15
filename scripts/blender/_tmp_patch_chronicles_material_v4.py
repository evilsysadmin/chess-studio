#!/usr/bin/env python3
from pathlib import Path

producer = Path('scripts/blender/build_chronicles_tactics_party.py')
text = producer.read_text()
text = text.replace(
'''class MaterialSpec:
    color: tuple[float, float, float]
    roughness: float = 0.6
    metallic: float = 0.0
    emission: tuple[float, float, float] | None = None
    emission_strength: float = 0.0
''',
'''class MaterialSpec:
    color: tuple[float, float, float]
    roughness: float = 0.6
    metallic: float = 0.0
    emission: tuple[float, float, float] | None = None
    emission_strength: float = 0.0
    coat_weight: float = 0.0
    coat_roughness: float = 0.35
''',
1,
)

before_materials = '''MATERIALS = {
    "stone": MaterialSpec((0.36, 0.39, 0.40), 0.52, 0.18),
    "steel": MaterialSpec((0.63, 0.67, 0.69), 0.25, 0.78),
    "black_steel": MaterialSpec((0.075, 0.085, 0.095), 0.34, 0.68),
    "blue_cloth": MaterialSpec((0.075, 0.11, 0.14), 0.78, 0.02),
    "ember": MaterialSpec((0.52, 0.20, 0.07), 0.44, 0.28),
    "sandstone": MaterialSpec((0.58, 0.48, 0.33), 0.75, 0.03),
    "brass": MaterialSpec((0.58, 0.37, 0.09), 0.28, 0.82),
    "green_robe": MaterialSpec((0.055, 0.16, 0.13), 0.73, 0.02),
    "green_trim": MaterialSpec((0.12, 0.28, 0.23), 0.61, 0.05),
    "ochre": MaterialSpec((0.49, 0.29, 0.09), 0.7, 0.03),
    "lantern": MaterialSpec((0.95, 0.54, 0.10), 0.25, 0.12, (1.0, 0.24, 0.025), 3.2),
    "rune_gold": MaterialSpec((0.72, 0.48, 0.16), 0.30, 0.45, (0.62, 0.20, 0.035), 1.2),
    "bone": MaterialSpec((0.55, 0.49, 0.39), 0.72, 0.03),
    "iron": MaterialSpec((0.24, 0.27, 0.29), 0.38, 0.64),
    "leather": MaterialSpec((0.28, 0.14, 0.065), 0.84, 0.02),
    "dark_leather": MaterialSpec((0.12, 0.065, 0.035), 0.88, 0.01),
    "brown_cloth": MaterialSpec((0.17, 0.12, 0.105), 0.8, 0.01),
    "copper": MaterialSpec((0.50, 0.24, 0.08), 0.34, 0.62),
    "skin_warm": MaterialSpec((0.63, 0.40, 0.27), 0.88, 0.0),
    "ink": MaterialSpec((0.008, 0.009, 0.01), 0.9, 0.0),
}
'''
after_materials = '''MATERIALS = {
    # Mineral/organic surfaces stay broad and matte. Metals get a restrained coat
    # so they catch the rear key light without turning the cast into plastic toys.
    "stone": MaterialSpec((0.34, 0.37, 0.38), 0.72, 0.04),
    "steel": MaterialSpec((0.62, 0.66, 0.69), 0.20, 0.90, coat_weight=0.22, coat_roughness=0.16),
    "black_steel": MaterialSpec((0.065, 0.075, 0.085), 0.27, 0.84, coat_weight=0.16, coat_roughness=0.22),
    "blue_cloth": MaterialSpec((0.065, 0.10, 0.13), 0.88, 0.01),
    "ember": MaterialSpec((0.55, 0.20, 0.055), 0.38, 0.20),
    "sandstone": MaterialSpec((0.56, 0.46, 0.31), 0.86, 0.01),
    "brass": MaterialSpec((0.62, 0.39, 0.075), 0.22, 0.91, coat_weight=0.24, coat_roughness=0.18),
    "green_robe": MaterialSpec((0.048, 0.145, 0.115), 0.86, 0.01),
    "green_trim": MaterialSpec((0.11, 0.255, 0.205), 0.76, 0.02),
    "ochre": MaterialSpec((0.48, 0.275, 0.075), 0.80, 0.01),
    "lantern": MaterialSpec((0.96, 0.55, 0.085), 0.23, 0.10, (1.0, 0.24, 0.025), 3.2),
    "rune_gold": MaterialSpec((0.74, 0.49, 0.14), 0.25, 0.67, (0.62, 0.20, 0.035), 1.2, coat_weight=0.18, coat_roughness=0.24),
    "bone": MaterialSpec((0.56, 0.50, 0.405), 0.84, 0.01),
    "iron": MaterialSpec((0.225, 0.25, 0.27), 0.33, 0.76, coat_weight=0.10, coat_roughness=0.28),
    "leather": MaterialSpec((0.275, 0.135, 0.060), 0.78, 0.01),
    "dark_leather": MaterialSpec((0.115, 0.060, 0.030), 0.84, 0.01),
    "brown_cloth": MaterialSpec((0.16, 0.11, 0.095), 0.89, 0.01),
    "copper": MaterialSpec((0.53, 0.245, 0.065), 0.25, 0.85, coat_weight=0.22, coat_roughness=0.20),
    "skin_warm": MaterialSpec((0.63, 0.39, 0.255), 0.91, 0.0),
    "ink": MaterialSpec((0.006, 0.007, 0.008), 0.96, 0.0),
}
'''
if before_materials not in text:
    raise SystemExit('material catalog anchor missing')
text = text.replace(before_materials, after_materials, 1)

before_node = '''    node.inputs["Roughness"].default_value = spec.roughness
    node.inputs["Metallic"].default_value = spec.metallic
    if spec.emission:
'''
after_node = '''    node.inputs["Roughness"].default_value = spec.roughness
    node.inputs["Metallic"].default_value = spec.metallic
    coat = node.inputs.get("Coat Weight") or node.inputs.get("Clearcoat")
    coat_roughness = node.inputs.get("Coat Roughness") or node.inputs.get("Clearcoat Roughness")
    if coat:
        coat.default_value = spec.coat_weight
    if coat_roughness:
        coat_roughness.default_value = spec.coat_roughness
    mat["chronicles_roughness"] = spec.roughness
    mat["chronicles_metallic"] = spec.metallic
    mat["chronicles_coat_weight"] = spec.coat_weight
    if spec.emission:
'''
if before_node not in text:
    raise SystemExit('principled material anchor missing')
text = text.replace(before_node, after_node, 1)
text = text.replace('ASSET_VERSION = "chronicles-tactics-party-v3"', 'ASSET_VERSION = "chronicles-tactics-party-v4"', 1)
producer.write_text(text)

updates = {
    'frontend/src/chroniclesOfMatthiasPartyBlenderArt.js': (
        "CHRONICLES_TACTICS_PARTY_ASSET_VERSION = 'chronicles-tactics-party-v3'",
        "CHRONICLES_TACTICS_PARTY_ASSET_VERSION = 'chronicles-tactics-party-v4'",
    ),
    'frontend/src/chroniclesOfMatthiasPartyBlenderArt.test.js': (
        "expect(CHRONICLES_TACTICS_PARTY_ASSET_VERSION).toBe('chronicles-tactics-party-v3');",
        "expect(CHRONICLES_TACTICS_PARTY_ASSET_VERSION).toBe('chronicles-tactics-party-v4');",
    ),
    'frontend/src/chroniclesOfMatthiasBlenderArt.js': (
        "partyAssetVersion: 'chronicles-tactics-party-v3'",
        "partyAssetVersion: 'chronicles-tactics-party-v4'",
    ),
}
for filename, (before, after) in updates.items():
    path = Path(filename)
    source = path.read_text()
    if before not in source:
        raise SystemExit(f'version anchor missing in {filename}')
    path.write_text(source.replace(before, after, 1))
