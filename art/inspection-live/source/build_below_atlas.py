"""Rear-cut-plane poses for live below inspection. Blender worker-base, OUTPUT lifecycle.blend resources.blend."""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
args=sys.argv[sys.argv.index('--')+1:];out=Path(args[0]).resolve();out.mkdir(parents=True,exist_ok=True);scene=bpy.context.scene
worker=[o for o in scene.objects if o.name.startswith('Worker /')]
for o in list(scene.objects):
 if o.type=='MESH' and o not in worker:bpy.data.objects.remove(o,do_unlink=True)
def append(path,prefix):
 with bpy.data.libraries.load(str(Path(path).resolve()),link=False) as (source,target):target.objects=[n for n in source.objects if n.startswith(tuple(prefix))]
 for o in target.objects:scene.collection.objects.link(o);o.parent=None;o.hide_render=True;o.hide_viewport=False
 return target.objects
nest=append(args[1],['Queen /','Fallen queen /','Fallen worker /','Brood /']);food=append(args[2],['Food /'])
groups=[('worker-'+str(n),worker,n*math.pi/6) for n in range(12)]
groups += [('queen',[o for o in nest if o.name.startswith('Queen /')],0),('queen-dead',[o for o in nest if o.name.startswith('Fallen queen /')],0),('corpse',[o for o in nest if o.name.startswith('Fallen worker /')],0)]
groups += [('brood-'+str(n),[o for o in nest if o.name.startswith('Brood / '+kind)],0) for n,kind in enumerate(['egg','larva','pupa'])]
groups += [('food-'+kind,[o for o in food if o.name.startswith('Food / '+kind)],0) for kind in ['plain','sweet','crumb']]
root=bpy.data.objects.new('Below pose orientation',None);scene.collection.objects.link(root)
for o in worker+nest+food:o.parent=root
scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.film_transparent=True;scene.render.image_settings.color_mode='RGBA';scene.render.resolution_x=scene.render.resolution_y=384
camera=scene.camera;camera.data.ortho_scale=2.25;camera.location=(1.8,-7,1.25);camera.rotation_euler=(Vector((0,.5,0))-camera.location).to_track_quat('-Z','Y').to_euler()
for o in list(scene.objects):
 if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
for name,pos,power,size in [('Front key',(-3,-4,4),470,5),('Soft fill',(4,-3,1),230,4)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
root.location=(0,1.08,0)
for name,parts,heading in groups:
 assert parts,name
 for o in worker+nest+food:o.hide_render=o not in parts
 root.rotation_euler=(math.pi/2,heading,0);bpy.context.view_layer.update();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
def project(p):
 v=world_to_camera_view(scene,camera,Vector(p));return [v.x*384,(1-v.y)*384]
anchor=project((0,1.08,0));basis=[]
for p in [(1,1.08,0),(0,1.08,-1),(0,.08,0)]:
 a=project(p);basis.append([a[0]-anchor[0],a[1]-anchor[1]])
(out/'below-manifest.json').write_text(json.dumps({'names':[n for n,p,h in groups],'frame':384,'stride':386,'cols':6,'width':2316,'height':1544,'worldFrame':2.25,'anchor':anchor,'basis':basis,'rearDepth':1.08,'description':'Map x / map depth downward / height towards front of cut. Poses contact the illustrative rear cut plane.'},indent=2))
print('BELOW_ATLAS_COMPLETE',len(groups),flush=True)
