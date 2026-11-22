"""Build fixed-world-size voxel resources with the worker's lighting. Blender 4.3 CPU Cycles."""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector
root=Path(sys.argv[sys.argv.index('--')+1]).resolve();scene=bpy.context.scene
for folder in ['renders','assets','source']:(root/folder).mkdir(parents=True,exist_ok=True)
for o in list(bpy.data.objects):bpy.data.objects.remove(o,do_unlink=True)
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=96;scene.cycles.use_denoising=False;scene.render.film_transparent=True
scene.render.threads_mode='FIXED';scene.render.threads=4;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast';scene.view_settings.exposure=0;scene.view_settings.gamma=1
world=scene.world or bpy.data.worlds.new('World');scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.52,.60,.73,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.18
for name,loc,power,colour,size in [('warm key',(-1.6,-2.2,3),145,(1,.83,.62),1.7),('copper rim',(-1.3,-.8,1.7),125,(1,.58,.28),.9),('cool fill',(2,-2,3),105,(.63,.76,1),2.5)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=colour;data.shape='DISK';data.size=size
 light=bpy.data.objects.new(name,data);scene.collection.objects.link(light);light.location=loc;light.rotation_euler=(Vector((0,0,.1))-light.location).to_track_quat('-Z','Y').to_euler()
camera=bpy.data.objects.new('Resource camera',bpy.data.cameras.new('Resource camera'));scene.collection.objects.link(camera);scene.camera=camera
def mat(name,colour):
 m=bpy.data.materials.new(name);m.diffuse_color=(*colour,1);m.use_nodes=True
 bs=m.node_tree.nodes.get('Principled BSDF');bs.inputs['Base Color'].default_value=(*colour,1);bs.inputs['Roughness'].default_value=.8
 return m
green=mat('Aphid | green',(.22,.48,.07));dark=mat('Aphid | dark joints',(.08,.20,.025));eye=mat('Aphid | eye',(.025,.035,.02))
plain=mat('Food | ordinary',(.11,.39,.24));sweet=mat('Food | sweet',(.86,.26,.48));crumb=mat('Food | crumb',(.55,.30,.10))
def box(name,p,size,m):
 bpy.ops.mesh.primitive_cube_add(size=1,location=p);o=bpy.context.object;o.name=name;o.dimensions=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(m);return o
def voxellipsoid(name,c,r,s,m):
 cells=set()
 for x in range(math.floor((c[0]-r[0])/s),math.ceil((c[0]+r[0])/s)):
  for y in range(math.floor((c[1]-r[1])/s),math.ceil((c[1]+r[1])/s)):
   for z in range(math.floor((c[2]-r[2])/s),math.ceil((c[2]+r[2])/s)):
    if sum((((v+.5)*s-c[i])/r[i])**2 for i,v in enumerate((x,y,z)))<=1:cells.add((x,y,z))
 # Cubes stay editable. Internal faces are immaterial at these small object counts.
 return [box(name,(s*(x+.5),s*(y+.5),s*(z+.5)),(s,s,s),m) for x,y,z in sorted(cells)]
def beam(name,a,b,width,m):
 a,b=Vector(a),Vector(b);o=box(name,(a+b)/2,(width,width,(b-a).length),m);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();return o
food={}
for kind,m in [('plain',plain),('sweet',sweet),('crumb',crumb)]:
 parts=voxellipsoid('Food / '+kind,(0,0,.06),(.12,.085,.07),.04,m)
 if kind=='crumb':parts.append(box('Food / crumb / fleck',(.02,-.015,.125),(.045,.04,.015),crumb))
 if kind=='sweet':parts.append(box('Food / sweet / glint',(-.025,-.025,.125),(.04,.04,.02),sweet))
 food[kind]=parts
aphid=[]
aphid+=voxellipsoid('Aphid / abdomen',(-.025,0,.085),(.115,.085,.08),.025,green)
aphid+=voxellipsoid('Aphid / head',(.115,0,.075),(.05,.05,.045),.025,green)
for sign in [-1,1]:
 for j in range(3):
  x=-.045+j*.055;aphid.append(beam('Aphid / leg',(x,sign*.055,.065),(x+(j-1)*.025,sign*.16,.015),.012,dark))
 aphid.append(beam('Aphid / antenna',(.15,sign*.025,.09),(.205,sign*.075,.10),.012,dark))
 aphid.append(beam('Aphid / cornicle',(-.085,sign*.055,.125),(-.11,sign*.07,.18),.018,dark))
 aphid.append(box('Aphid / eye',(.145,sign*.038,.092),(.012,.012,.012),eye))
objects=[o for o in bpy.data.objects if o.type=='MESH'];camera=scene.camera;camera.data.type='ORTHO';camera.data.ortho_scale=.5;camera.location=(0,0,4);camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
aroot=bpy.data.objects.new('Aphid orientation',None);scene.collection.objects.link(aroot)
for o in aphid:o.parent=aroot
items=[('plain',food['plain'],0),('sweet',food['sweet'],0),('crumb',food['crumb'],0)]+[(f'aphid-{n}',aphid,n) for n in range(4)]
for i,(name,parts,direction) in enumerate(items):
 for o in objects:o.hide_render=o not in parts
 aroot.rotation_euler.z=-direction*math.pi/2
 for lod,size in [('tiny',6),('near',14),('master',128)]:
  scene.render.resolution_x=scene.render.resolution_y=size;scene.render.filepath=str(root/'renders'/f'{name}-{lod}.png');bpy.ops.render.render(write_still=True)
for o in objects:o.hide_render=False
aroot.rotation_euler.z=0
bpy.ops.wm.save_as_mainfile(filepath=str(root/'source/resources.blend'))
(root/'assets/model-manifest.json').write_text(json.dumps({'worldFrame':.5,'workerBodyLength':.885,'aphidBodyLength':.305,'aphidOverallLengthWithAntennae':.345,'foodBodyLength':.24,'columns':[i[0] for i in items],'tinyNativeHex':12,'nearNativeHex':28,'blender':bpy.app.version_string},indent=2))
print('RESOURCE_EXPORT_COMPLETE',len(items)*3,flush=True)
