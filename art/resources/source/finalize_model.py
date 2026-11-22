import bpy,json,sys
from pathlib import Path
from mathutils import Vector
r=Path(sys.argv[sys.argv.index('--')+1]).resolve()
def bounds(objects):
 points=[o.matrix_world@Vector(p) for o in objects for p in o.bound_box]
 return [[min(p[i] for p in points) for i in range(3)],[max(p[i] for p in points) for i in range(3)]]
for kind in ['plain','sweet','crumb','aphid']:
 name='Resource | '+kind
 collection=bpy.data.collections.get(name) or bpy.data.collections.new(name)
 if collection.name not in bpy.context.scene.collection.children:bpy.context.scene.collection.children.link(collection)
 objects=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('Aphid /' if kind=='aphid' else 'Food / '+kind)]
 for o in objects:
  for c in list(o.users_collection):c.objects.unlink(o)
  collection.objects.link(o)
 collection.hide_render=collection.hide_viewport=kind!='aphid'
bpy.context.view_layer.update()
body=[o for o in bpy.data.objects if o.type=='MESH' and (o.name.startswith('Aphid / abdomen') or o.name.startswith('Aphid / head'))]
all_aphid=[o for o in bpy.data.objects if o.type=='MESH' and o.name.startswith('Aphid /')]
m=json.loads((r/'assets/model-manifest.json').read_text());b=bounds(body);a=bounds(all_aphid)
m['aphidBodyLength']=round(b[1][0]-b[0][0],6);m['aphidOverallLengthWithAntennae']=round(a[1][0]-a[0][0],6)
m['aphidBounds']=a;m['editingNote']='Aphid visible; toggle Resource collections to edit each food class separately.'
(r/'assets/model-manifest.json').write_text(json.dumps(m,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(r/'source/resources.blend'),compress=True);print('RESOURCE_MODEL_CHECK',m['aphidBodyLength'],m['aphidOverallLengthWithAntennae'])
