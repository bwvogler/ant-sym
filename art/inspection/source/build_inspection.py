"""blender -b worker-base.blend --python build_inspection.py -- OUTPUT resources.blend"""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
args=sys.argv[sys.argv.index('--')+1:];root=Path(args[0]).resolve();resources=Path(args[1]).resolve();scene=bpy.context.scene
for f in ['renders','assets','source']:(root/f).mkdir(parents=True,exist_ok=True)
scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.film_transparent=True
scene.render.image_settings.color_mode='RGBA';scene.render.resolution_x=scene.render.resolution_y=256
camera=scene.camera;camera.data.ortho_scale=1.5;camera.location=(1.1,-3.3,2.5);camera.rotation_euler=(Vector((0,0,.07))-camera.location).to_track_quat('-Z','Y').to_euler()
worker=[o for o in bpy.data.objects if o.name.startswith('Worker /')]
terrain=[o for o in bpy.data.objects if o.name.startswith('Tile /')]
rotation=bpy.data.objects.new('Inspection / heading',None);scene.collection.objects.link(rotation)
for o in worker:o.parent=rotation
with bpy.data.libraries.load(str(resources),link=False) as (source,target):target.objects=[name for name in source.objects if name.startswith(('Food /','Aphid /'))]
res=target.objects
for o in res:
 scene.collection.objects.link(o);o.parent=None;o.hide_render=False;o.hide_viewport=False
aroot=bpy.data.objects.new('Inspection / aphid heading',None);scene.collection.objects.link(aroot)
for o in res:
 if o.name.startswith('Aphid /'):o.parent=aroot
allmesh=[o for o in scene.objects if o.type=='MESH']
def only(objects):
 for o in allmesh:o.hide_render=o not in objects
def render(name):
 scene.render.filepath=str(root/'renders'/f'{name}.png');bpy.ops.render.render(write_still=True)
def material(name,colour):
 m=bpy.data.materials.new(name);m.use_nodes=True;bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*colour,1);bs.inputs['Roughness'].default_value=.9;return m
ground=next(o for o in terrain if o.name=='Tile / stepped hex');old=list(ground.data.materials)
def ground_materials(materials):
 ground.data.materials.clear()
 for m in materials:ground.data.materials.append(m)
 colour=materials[0].node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value[:]
 for j,k in enumerate([.84,.92,1,1.06,1.13]):ground.data.materials.append(material(f'Inspection / grain / {materials[0].name} / {j}',tuple(min(1,v*k) for v in colour[:3])))
 for face in ground.data.polygons:
  if face.normal.z>.9 and face.center.z>-.00001:
   ix=round(face.center.x*20);iy=round(face.center.y*20);face.material_index=3+((ix*73856093)^(iy*19349663))%5
ground_materials(old)
only(terrain);render('ground-open')
for name,colours in [('soil',[(.17,.11,.065),(.12,.07,.03),(.07,.035,.015)]),('rock',[(.14,.16,.17),(.09,.11,.12),(.06,.07,.08)])]:
 ground_materials([material(f'Inspection / {name} / {n}',c) for n,c in enumerate(colours)])
 render('ground-'+name)
ground_materials(old)
for n in range(12):
 only(worker);rotation.rotation_euler.z=-n*math.tau/12;render(f'worker-{n}')
rotation.rotation_euler.z=0
for kind in ['plain','sweet','crumb']:
 only([o for o in res if o.name.startswith('Food / '+kind)]);render('food-'+kind)
for n in range(4):
 only([o for o in res if o.name.startswith('Aphid /')]);aroot.rotation_euler.z=-n*math.pi/2;render(f'aphid-{n}')
aroot.rotation_euler.z=0
bpy.context.view_layer.update()
def project(p):
 v=world_to_camera_view(scene,camera,Vector(p));return [v.x*256,(1-v.y)*256]
a=project((0,0,0));basis=[]
for p in [(1,0,0),(0,-1,0),(0,0,1)]:
 b=project(p);basis.append([b[0]-a[0],b[1]-a[1]])
names=['ground-open','ground-soil','ground-rock']+[f'worker-{n}' for n in range(12)]+['food-plain','food-sweet','food-crumb']+[f'aphid-{n}' for n in range(4)]
(root/'assets/projection.json').write_text(json.dumps({'frame':256,'stride':258,'cols':5,'names':names,'anchor':a,'basis':basis,'worldFrame':1.5,'note':'basis vectors: map x, map y (Blender -Y), vertical z; fixed orthographic camera'},indent=2))
only(terrain+worker);bpy.ops.wm.save_as_mainfile(filepath=str(root/'source/inspection.blend'),compress=True)
print('INSPECTION_EXPORT_COMPLETE',len(names),flush=True)
