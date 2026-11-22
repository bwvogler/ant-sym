"""Blender -b lifecycle.blend --python THIS -- OUTPUT. Straight onto the walking plane; world scale unchanged."""
import bpy,sys,json,math
from pathlib import Path
from mathutils import Vector
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True)
s=bpy.context.scene;s.render.resolution_x=s.render.resolution_y=64;s.render.resolution_percentage=100;s.render.film_transparent=True;s.render.image_settings.color_mode='RGBA';s.cycles.samples=32
c=s.camera;c.location=(0,0,8);c.rotation_euler=(Vector((0,0,0))-c.location).to_track_quat('-Z','Y').to_euler();c.data.ortho_scale=2.25
# Alates have no recorded heading; use the same fixed orientation as the previous map symbol.
queen=[o for o in list(s.objects) if o.type=='MESH' and o.name.startswith('Queen /')]
for o in queen:
 clone=o.copy();clone.data=o.data.copy();clone.name='Alate body / '+o.name;s.collection.objects.link(clone)
 for v in clone.data.vertices:v.co*=.9
wing=bpy.data.materials.new('Alate / pale voxel wings');wing.diffuse_color=(.3,.36,.32,1);wing.use_nodes=True
wing.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.3,.36,.32,1)
for sign in [-1,1]:
 for ix in range(-12,5):
  for iy in range(-7,8):
   u=ix*.045;v=iy*.045
   if ((u+.17)/.37)**2+(v/.13)**2>1:continue
   angle=sign*.55;x=u*math.cos(angle)-v*math.sin(angle);y=sign*.16+u*math.sin(angle)+v*math.cos(angle)
   bpy.ops.mesh.primitive_cube_add(size=1,location=(x,y,.36));o=bpy.context.object;o.name='Alate wings / voxel';o.scale=(.045,.045,.024);o.data.materials.append(wing)
names=['queen','queen-dead','corpse','brood-0','brood-1','brood-2','alate-body','alate-wings']
prefixes=['Queen /','Fallen queen /','Fallen worker /','Brood / egg','Brood / larva','Brood / pupa','Alate body /','Alate wings /']
for name,prefix in zip(names,prefixes):
 for o in s.objects:
  if o.type=='MESH':o.hide_render=not o.name.startswith(prefix)
 s.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
(out/'manifest.json').write_text(json.dumps({'names':names,'worldFrame':2.25,'tiny':{'frame':27,'stride':29,'width':232,'height':29},'walk':{'frame':64,'stride':66,'width':528,'height':66}},indent=2))
