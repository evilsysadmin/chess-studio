import math
import bpy

def action(rig,name,poses,total):
    a=bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action=a
    for p in rig.pose.bones:
        p.rotation_euler=(0,0,0); p.location=(0,0,0); p.keyframe_insert('rotation_euler',frame=1); p.keyframe_insert('location',frame=1)
    for frame,rots,locs in poses:
        for n,v in (rots or {}).items(): rig.pose.bones[n].rotation_euler=v; rig.pose.bones[n].keyframe_insert('rotation_euler',frame=frame)
        for n,v in (locs or {}).items(): rig.pose.bones[n].location=v; rig.pose.bones[n].keyframe_insert('location',frame=frame)
    for p in rig.pose.bones: p.keyframe_insert('rotation_euler',frame=total); p.keyframe_insert('location',frame=total)
    for f in a.fcurves:
        for k in f.keyframe_points: k.interpolation='BEZIER'
    return a

def build_actions(rig):
    d=math.radians
    specs={
      'Idle':(112,[(28,{'spine':(d(1.2),d(-.6),d(-.8)),'head':(d(-1),d(2.5),d(1.2))},{'root':(0,0,.012)}),(56,{'spine':(d(-.3),d(.4),d(.6)),'head':(d(.5),d(-1.8),d(-.8))},{'root':(0,0,-.004)}),(84,{'head':(d(-1.8),d(.2),d(.3))},{'root':(0,0,.008)})]),
      'Speak':(48,[(12,{'head':(d(-2.5),d(1),d(-1)),'forearm.R':(d(-5),0,d(-8)),'spine':(d(1.5),0,d(-1))},None),(24,{'head':(d(2),d(-1.2),d(1)),'forearm.R':(d(3),0,d(5))},None),(36,{'head':(d(-1.2),d(.4),d(-.4)),'forearm.L':(d(-3),0,d(4))},None)]),
      'Think':(84,[(24,{'head':(d(6),d(-8),d(3)),'forearm.R':(d(-14),d(-6),d(-16)),'spine':(d(3),0,d(-2))},None),(58,{'head':(d(3),d(6),d(-2)),'forearm.R':(d(-10),d(-3),d(-11))},None)]),
      'Read':(88,[(28,{'head':(d(8),d(-3),d(1)),'spine':(d(3.5),0,0),'forearm.L':(d(-4),d(3),d(3)),'forearm.R':(d(-4),d(-3),d(-3))},None),(56,{'head':(d(10),d(2),d(-1)),'spine':(d(4),0,0)},None)]),
      'Write':(72,[(18,{'head':(d(9),d(-6),d(2)),'spine':(d(5),0,d(-2)),'forearm.R':(d(-9),d(-6),d(-12))},None),(36,{'forearm.R':(d(-5),d(-3),d(-6))},None),(54,{'forearm.R':(d(-10),d(-7),d(-13))},None)]),
      'Dossier':(80,[(24,{'head':(d(11),d(5),d(-2)),'spine':(d(4),0,d(1.5)),'forearm.L':(d(-6),0,d(6))},None),(52,{'head':(d(7),d(-5),d(2)),'forearm.R':(d(-5),0,d(-5))},None)]),
      'Sip':(72,[(18,{'forearm.R':(d(-18),d(-6),d(-18)),'head':(d(-3),d(3),d(-1))},None),(34,{'forearm.R':(d(-26),d(-8),d(-22))},None),(52,{'forearm.R':(d(-6),0,d(-5))},None)]),
      'Bite':(74,[(18,{'forearm.L':(d(-14),d(6),d(13)),'head':(d(-5),d(-4),d(2))},None),(36,{'forearm.L':(d(-20),d(8),d(18)),'head':(d(2),d(-2),d(1))},None),(54,{'forearm.L':(d(-5),0,d(4))},None)]),
      'Sleep':(104,[(36,{'head':(d(11),d(-6),d(9)),'spine':(d(5),0,d(4))},{'root':(0,0,-.018)}),(72,{'head':(d(13),d(-5),d(10)),'spine':(d(6),0,d(5))},{'root':(0,0,-.026)})]),
    }
    made=[action(rig,n,p,t) for n,(t,p) in specs.items()]; rig.animation_data.action=None
    for a in made:
        tr=rig.animation_data.nla_tracks.new(); tr.name=a.name; tr.strips.new(a.name,1,a)
    return made
