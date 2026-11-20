"""Blender -b art/lifecycle/source/lifecycle.blend --python THIS -- resources.blend models.json.
Export exposed voxel faces, a separate gaster band, and discrete cadaver decay stages.
"""
import bpy, sys, json, math
from pathlib import Path
from mathutils import Vector
resource, target = sys.argv[sys.argv.index('--') + 1:]
with bpy.data.libraries.load(resource, link=False) as (source, dest):
    dest.objects = [n for n in source.objects if n.startswith(('Food /', 'Aphid /'))]
for obj in dest.objects:
    if obj and obj.name not in bpy.context.scene.objects:
        bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.update()
for obj in dest.objects:
    if obj:
        matrix = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = matrix
bpy.context.view_layer.update()

def part(): return dict(positions=[], colours=[])
def emit(output, points, colour):
    for i in range(1, len(points)-1):
        for p in (points[0], points[i], points[i+1]):
            output['positions'].extend(round(v, 6) for v in p)
            output['colours'].extend(round(v, 5) for v in colour[:3])

def export(prefix, stage=0, live=False):
    objects = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.startswith(prefix)]
    gaster = [o.matrix_world @ v.co for o in objects if 'gaster' in o.name.lower() for v in o.data.vertices]
    low, high = (min(v.x for v in gaster), max(v.x for v in gaster)) if gaster else (0, 0)
    band_low, band_high = low+(high-low)*.38, low+(high-low)*.63
    exposed = {}
    for obj in objects:
        name = obj.name.lower()
        if stage >= 2 and any(n in name for n in ('antenna', 'foot', 'shin', 'knee', 'mandible')): continue
        points = [obj.matrix_world @ v.co for v in obj.data.vertices]
        if stage:
            for p in points:
                p.y *= [.0, .94, .77][min(stage,2)]
                p.z *= [.0, .88, .64][min(stage,2)]
        for polygon in obj.data.polygons:
            ps = [points[i] for i in polygon.vertices]
            if len(ps)<3: continue
            n = (ps[1]-ps[0]).cross(ps[2]-ps[0])
            if n.length < 1e-9: continue
            key = tuple(sorted(tuple(round(v, 5) for v in p) for p in ps))
            material = obj.data.materials[polygon.material_index] if obj.data.materials else None
            shader = material.node_tree.nodes.get('Principled BSDF') if material and material.use_nodes else None
            colour = shader.inputs['Base Color'].default_value[:] if shader else (.15,.13,.1,1)
            if stage: colour = (.12,.09,.055,1) if stage == 1 else (.21,.16,.095,1)
            band = live and 'gaster' in name and band_low <= sum(p.x for p in ps)/len(ps) <= band_high
            old = exposed.get(key)
            if old and old[1].dot(n)<0: del exposed[key]
            elif not old: exposed[key] = (ps, n, colour, band)
    model = dict(body=part(), band=part())
    for ps, _, colour, band in exposed.values(): emit(model['band' if band else 'body'], ps, colour)
    return model

models = {name: export(prefix, live=live) for name,prefix,live in [
    ('worker','Worker /',True), ('queen','Queen /',True), ('queen-dead','Fallen queen /',False),
    ('corpse','Fallen worker /',False), ('brood-0','Brood / egg',False), ('brood-1','Brood / larva',False), ('brood-2','Brood / pupa',False),
    ('food-plain','Food / plain',False), ('food-sweet','Food / sweet',False), ('food-crumb','Food / crumb',False), ('aphid','Aphid /',False)
]}
models['corpse-0'] = models['corpse']
models['corpse-1'] = export('Fallen worker /', 1)
models['corpse-2'] = export('Fallen worker /', 2)
models['alate-body'] = models['queen']
models['corpse-3'] = dict(body=part(), band=part())
def box(at, size):
    x,y,z=[at[i]-size[i]/2 for i in range(3)]; a,b,c=size
    points=[(x,y,z),(x+a,y,z),(x+a,y+b,z),(x,y+b,z),(x,y,z+c),(x+a,y,z+c),(x+a,y+b,z+c),(x,y+b,z+c)]
    for ids in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(3,7,6,2),(1,2,6,5),(0,4,7,3)]:
        emit(models['corpse-3']['body'], [Vector(points[i]) for i in ids], (.25,.2,.12))
for at,size in [((-.25,0,.035),(.18,.12,.07)), ((.02,.03,.022),(.11,.08,.044)), ((.24,-.025,.02),(.1,.075,.04)), ((-.09,.14,.013),(.055,.035,.026)), ((.11,-.16,.014),(.07,.03,.028))]: box(at,size)
out=Path(target);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(models,separators=(',',':')))
print('VOXEL_EXPORT', {n:len(m['body']['positions'])//9 for n,m in models.items()},flush=True)
