"""Load art/inspection/source/worker-base.blend, export nest stages with the inspection camera."""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector,Matrix
from bpy_extras.object_utils import world_to_camera_view
root=Path(sys.argv[sys.argv.index('--')+1]).resolve();scene=bpy.context.scene
for name in ['source','renders','assets']:(root/name).mkdir(parents=True,exist_ok=True)
scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.film_transparent=True
scene.render.resolution_x=scene.render.resolution_y=384;scene.render.image_settings.color_mode='RGBA'
camera=scene.camera;camera.data.ortho_scale=2.25;camera.location=(1.1,-3.3,2.5);camera.rotation_euler=(Vector((0,0,.07))-camera.location).to_track_quat('-Z','Y').to_euler()
worker=[o for o in bpy.data.objects if o.name.startswith('Worker /')]
def material(name,c):
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=.8;return m
grey=material('Fallen / muted chitin',(.12,.115,.10));egg=material('Brood / egg',(.75,.70,.57));larva=material('Brood / larva',(.65,.49,.26));pupa=material('Brood / pupa',(.43,.28,.12))
def copy_group(prefix,scale=1):
 parts=[]
 for o in worker:
  c=o.copy();c.data=o.data.copy();c.name=prefix+' / '+o.name.removeprefix('Worker /');scene.collection.objects.link(c)
  for v in c.data.vertices:v.co=o.matrix_world@v.co
  c.matrix_world=Matrix.Identity(4)
  for v in c.data.vertices:v.co*=scale
  parts.append(c)
 return parts
queen=copy_group('Queen',1.18)
for o in queen:
 if o.name.endswith('gaster'):
  center=Vector((-.245*1.18,0,.285*1.18))
  front=max(v.co.x for v in o.data.vertices)
  for v in o.data.vertices:
   d=v.co-center
   # Keep the waist connection fixed while the abdomen extends rearward.
   v.co=Vector((front+(v.co.x-front)*1.9,center.y+d.y*1.35,center.z+d.z*1.15))
corpse=copy_group('Fallen worker')
roll=Matrix.Rotation(math.pi/2,4,'X')
for o in corpse:
 o.data.materials.clear();o.data.materials.append(grey)
 for v in o.data.vertices:
  p=roll@(v.co-Vector((0,0,.25)));p.z*=.45;v.co=p
minimum=min(v.co.z for o in corpse for v in o.data.vertices)
for o in corpse:
 for v in o.data.vertices:v.co.z-=minimum
dead_queen=[]
for o in queen:
 c=o.copy();c.data=o.data.copy();c.name='Fallen queen / '+o.name;scene.collection.objects.link(c);c.data.materials.clear();c.data.materials.append(grey)
 for v in c.data.vertices:
  p=roll@(v.co-Vector((0,0,.25)));p.z*=.45;v.co=p
 dead_queen.append(c)
minimum=min(v.co.z for o in dead_queen for v in o.data.vertices)
for o in dead_queen:
 for v in o.data.vertices:v.co.z-=minimum
def voxel(name,c,r,s,m):
 parts=[]
 for x in range(math.floor((c[0]-r[0])/s),math.ceil((c[0]+r[0])/s)):
  for y in range(math.floor((c[1]-r[1])/s),math.ceil((c[1]+r[1])/s)):
   for z in range(math.floor((c[2]-r[2])/s),math.ceil((c[2]+r[2])/s)):
    if sum((((q+.5)*s-c[i])/r[i])**2 for i,q in enumerate((x,y,z)))>1:continue
    bpy.ops.mesh.primitive_cube_add(size=s,location=((x+.5)*s,(y+.5)*s,(z+.5)*s));o=bpy.context.object;o.name=name;o.data.materials.append(m);parts.append(o)
 return parts
stages=[voxel('Brood / egg',(0,0,.05),(.075,.05,.05),.025,egg),voxel('Brood / larva',(0,0,.065),(.15,.07,.065),.025,larva),voxel('Brood / pupa',(0,0,.075),(.21,.08,.075),.03,pupa)]
groups=[('queen',queen),('corpse',corpse)]+[(f'brood-{i}',p) for i,p in enumerate(stages)]+[('queen-dead',dead_queen)]
allmesh=[o for o in scene.objects if o.type=='MESH']
for name,parts in groups:
 for o in allmesh:o.hide_render=o not in parts
 scene.render.filepath=str(root/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)
for o in allmesh:o.hide_render=o not in queen
bpy.ops.wm.save_as_mainfile(filepath=str(root/'source/lifecycle.blend'),compress=True)
bpy.context.view_layer.update();anchor=world_to_camera_view(scene,camera,Vector((0,0,0)))
(root/'assets/lifecycle-manifest.json').write_text(json.dumps({'names':[n for n,p in groups],'frame':384,'stride':386,'cols':3,'width':1158,'height':772,'worldFrame':2.25,'anchor':[anchor.x*384,(1-anchor.y)*384],'scaleNote':'Queen is a visual caste treatment, worker-based at 1.18 scale with enlarged gaster; body lengths of brood 0.15 / 0.30 / 0.42 world units. Same inspection camera and lights. Wider frames preserve physical scale and source pixels per world unit.'},indent=2))
print('LIFECYCLE_EXPORT_COMPLETE',flush=True)
