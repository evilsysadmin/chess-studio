#!/usr/bin/env python3
"""Add hand-authored costume silhouette meshes to the canonical Chronicles party."""
import argparse, os, sys
import bpy


def material(name):
    return bpy.data.materials.get('chron_' + name)


def authored_mesh(name, root, verts, faces, mat_name):
    mesh = bpy.data.meshes.new(name + '__mesh')
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.parent = root
    if material(mat_name):
        obj.data.materials.append(material(mat_name))
    bevel = obj.modifiers.new('authored tailoring edge softness', 'BEVEL')
    bevel.width = .018
    bevel.segments = 2
    obj['authored_costume_mesh'] = True
    return obj


def panel(name, root, x0, x1, y_front, y_back, z0, z1, shoulder_inset, mat_name):
    verts = [
        (x0, y_front, z0), (x1, y_front, z0),
        (x1 - shoulder_inset, y_front, z1), (x0 + shoulder_inset, y_front, z1),
        (x0, y_back, z0), (x1, y_back, z0),
        (x1 - shoulder_inset, y_back, z1), (x0 + shoulder_inset, y_back, z1),
    ]
    faces = [(0,1,2,3),(4,7,6,5),(0,4,5,1),(3,2,6,7),(1,5,6,2),(0,3,7,4)]
    return authored_mesh(name, root, verts, faces, mat_name)


def hildegard(root):
    x = root.location.x
    panel('rook__authored_tabard', root, x-.22, x+.22, -.245, -.175, .82, 1.30, .055, 'navy')
    # Asymmetric armored fauld: a deliberate warrior silhouette rather than a chess-piece cone.
    verts=[(x-.30,-.13,.88),(x+.30,-.13,.88),(x+.37,-.10,.58),(x+.20,-.18,.48),(x,-.20,.54),(x-.20,-.18,.48),(x-.37,-.10,.58),
           (x-.28,.10,.88),(x+.28,.10,.88),(x+.33,.09,.60),(x+.18,.08,.52),(x,.07,.57),(x-.18,.08,.52),(x-.33,.09,.60)]
    faces=[(0,1,2,3,4,5,6),(7,13,12,11,10,9,8),(0,7,8,1),(1,8,9,2),(2,9,10,3),(3,10,11,4),(4,11,12,5),(5,12,13,6),(6,13,7,0)]
    authored_mesh('rook__authored_armored_fauld',root,verts,faces,'steel')


def aziz(root):
    x = root.location.x
    panel('bishop__authored_robe_front', root, x-.24, x+.24, -.235, -.165, .54, 1.27, .065, 'green')
    # Draped shoulder shawl with an intentionally uneven hem.
    verts=[(x-.34,-.19,1.34),(x+.27,-.19,1.31),(x+.24,-.23,1.13),(x+.03,-.25,1.08),(x-.18,-.24,1.16),(x-.38,-.18,1.22),
           (x-.31,.06,1.32),(x+.24,.06,1.29),(x+.21,.05,1.16),(x+.02,.04,1.12),(x-.17,.04,1.19),(x-.34,.05,1.23)]
    faces=[(0,1,2,3,4,5),(6,11,10,9,8,7),(0,6,7,1),(1,7,8,2),(2,8,9,3),(3,9,10,4),(4,10,11,5),(5,11,6,0)]
    authored_mesh('bishop__authored_draped_shawl',root,verts,faces,'ochre')


def faust(root):
    x = root.location.x
    # Split long-coat tails create a lean, mobile alchemist silhouette.
    panel('knight__authored_coat_left', root, x-.27, x-.015, -.20, .10, .48, 1.20, .035, 'brown')
    panel('knight__authored_coat_right', root, x+.015, x+.27, -.20, .10, .48, 1.20, .035, 'brown')
    verts=[(x-.27,-.22,1.33),(x-.08,-.24,1.36),(x,-.25,1.25),(x+.08,-.24,1.36),(x+.27,-.22,1.33),
           (x+.19,-.25,1.19),(x,-.27,1.12),(x-.19,-.25,1.19)]
    authored_mesh('knight__authored_high_collar',root,verts,[(0,1,2,3,4,5,6,7)],'leather')


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--blend',required=True); ap.add_argument('--glb',required=True)
    args=ap.parse_args(sys.argv[sys.argv.index('--')+1:])
    bpy.ops.wm.open_mainfile(filepath=args.blend)
    roots={role:bpy.data.objects.get('ChroniclesParty__'+role) for role in ('rook','bishop','knight')}
    assert all(roots.values()), roots
    hildegard(roots['rook']); aziz(roots['bishop']); faust(roots['knight'])
    for root in roots.values(): root['party_art']='authored-v6'
    bpy.context.scene['chronicles_party_asset_version']='chronicles-humanoid-party-v6'
    bpy.context.scene['chronicles_party_visual_contract']='authored-humanoid-tailored-silhouettes-v3'
    os.makedirs(os.path.dirname(os.path.abspath(args.glb)),exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=args.blend)
    bpy.ops.export_scene.gltf(filepath=args.glb, export_format='GLB', export_apply=True)

if __name__=='__main__': main()
