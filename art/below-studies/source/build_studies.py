"""Three underground design fixtures; not a live-map renderer.
blender -b art/inspection/source/worker-base.blend --python ... -- OUTPUT lifecycle.blend resources.blend
"""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];out=Path(args[0]).resolve();out.mkdir(parents=True,exist_ok=True)
scene=bpy.context.scene
scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.film_transparent=False
scene.render.resolution_x=768;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
worker=[o for o in scene.objects if o.name.startswith('Worker /')]
for o in list(scene.objects):
 if o.type=='MESH' and o not in worker:bpy.data.objects.remove(o,do_unlink=True)
def append(path,prefixes):
 with bpy.data.libraries.load(str(Path(path).resolve()),link=False) as (source,target):target.objects=[n for n in source.objects if any(n.startswith(p) for p in prefixes)]
 parts=target.objects
 for o in parts:scene.collection.objects.link(o);o.parent=None;o.hide_render=True;o.hide_viewport=False
 return parts
nest=append(args[1],['Queen /','Brood /']);food=append(args[2],['Food / crumb'])
queen=[o for o in nest if o.name.startswith('Queen /')];brood=[[o for o in nest if o.name.startswith('Brood / '+n)] for n in ['egg','larva','pupa']]
def group(name,parts):
 root=bpy.data.objects.new(name,None);scene.collection.objects.link(root)
 for o in parts:o.parent=root
 return root
wroot=group('Worker placement',worker);qroot=group('Queen placement',queen)
broots=[group('Brood stage '+str(i),p) for i,p in enumerate(brood)];froot=group('Soil carried in jaws',food)
def mat(name,hex):
 rgb=[int(hex[i:i+2],16)/255 for i in [0,2,4]];linear=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
 m=bpy.data.materials.new(name);m.use_nodes=True;b=m.node_tree.nodes.get('Principled BSDF');b.inputs['Base Color'].default_value=(*linear,1);b.inputs['Roughness'].default_value=.95;return m
soil=[mat('Soil front '+str(i),h) for i,h in enumerate(['8F6844','966E49','88613E','9B7350','82603F'])]
rock=[mat('Rock front '+str(i),h) for i,h in enumerate(['747977','7E8380','6A706F','868A85','646A68'])]
back=mat('Recessed rear cut surface','4A3528');mark=mat('Selected cell','6CB8A3')
R=math.sqrt(3)/2
VISIBLE_CELLS={(0,0),(1,0),(0,1),(-1,1),(-1,0),(-1,-1),(0,-1)}
def cell(x,y):
 fr=y/R;fq=x-fr/2;fs=-fq-fr;q=round(fq);r=round(fr);s=round(fs);dq,dr,ds=abs(q-fq),abs(r-fr),abs(s-fs)
 if dq>dr and dq>ds:q=-r-s
 elif dr>ds:r=-q-s
 return (q+(r-(r&1))//2,r)
facespec=[((1,0,0),[(1,0,0),(1,1,0),(1,1,1),(1,0,1)]),((-1,0,0),[(0,0,0),(0,0,1),(0,1,1),(0,1,0)]),((0,1,0),[(0,1,0),(0,1,1),(1,1,1),(1,1,0)]),((0,-1,0),[(0,0,0),(1,0,0),(1,0,1),(0,0,1)]),((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)]),((0,0,-1),[(0,0,0),(0,1,0),(1,1,0),(1,0,0)])]
def cutaway(name,open_cells,rock_cells):
 step=.06;cells=set();kinds={}
 for x in range(-26,26):
  for z in range(-25,25):
   c=cell((x+.5)*step,-(z+.5)*step);dug=c in open_cells
   if c not in VISIBLE_CELLS:continue
   for y in range(20):
    if dug and y<18:continue
    key=(x,y,z);cells.add(key);kinds[key]=2 if dug else 1 if c in rock_cells else 0
 vertices=[];faces=[];ids=[]
 for x,y,z in sorted(cells):
  for (dx,dy,dz),corners in facespec:
   if (x+dx,y+dy,z+dz) in cells:continue
   k=len(vertices);vertices.extend([((x+a)*step,(y+b)*step,(z+c)*step) for a,b,c in corners]);faces.append(tuple(range(k,k+4)))
   kind=kinds[(x,y,z)];ids.append(10 if kind==2 else kind*5+(((x*73856093)^(z*19349663))%5))
 mesh=bpy.data.meshes.new(name);mesh.from_pydata(vertices,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);scene.collection.objects.link(obj)
 for m in soil+rock+[back]:mesh.materials.append(m)
 for p,i in zip(mesh.polygons,ids):p.material_index=i
 return obj
def selected():
 pieces=[]
 points=[Vector((math.cos(math.pi/6+d*math.pi/3)/math.sqrt(3),-.025,math.sin(math.pi/6+d*math.pi/3)/math.sqrt(3))) for d in range(6)]
 for a,b in zip(points,points[1:]+points[:1]):
  bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)/2);o=bpy.context.object;o.name='Selected hex / edge';o.dimensions=(.009,.009,(b-a).length);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(mark);pieces.append(o)
 return pieces
edges=selected();camera=scene.camera;camera.data.ortho_scale=4.0;camera.location=(1.8,-7,1.25);camera.rotation_euler=(Vector((0,.50,0))-camera.location).to_track_quat('-Z','Y').to_euler()
# Broad front lighting suits a vertical cut rather than the surface model's overhead key.
for o in list(scene.objects):
 if o.type=='LIGHT':bpy.data.objects.remove(o,do_unlink=True)
for name,pos,power,size in [('Front key',(-3,-4,4),470,5),('Soft fill',(4,-3,1),230,4)]:
 data=bpy.data.lights.new(name,'AREA');data.energy=power;data.size=size;o=bpy.data.objects.new(name,data);scene.collection.objects.link(o);o.location=pos;o.rotation_euler=(Vector((0,0,0))-o.location).to_track_quat('-Z','Y').to_euler()
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.16,.12,.09,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
fixtures=[('narrow-passage',{(0,y) for y in range(-3,4)},set()),('chamber-floor',{(x,y) for x in range(-3,4) for y in [-1,0]},set()),('digging-face',{(-3,0),(-2,0),(-1,0),(0,0)},{(0,-1)})]
checks=[]
for name,opened,stone in fixtures:
 for o in worker+nest+food:o.hide_render=True
 wall=cutaway(name,opened,stone)
 wroot.location=(0,.48,-.48);wroot.rotation_euler=(0,0,0)
 if name=='narrow-passage':
  wroot.location=(.41,.48,0);wroot.rotation_euler=(0,-math.pi/2,0)
  for o in worker+food:o.hide_render=False
  bpy.context.view_layer.update();froot.matrix_world=wroot.matrix_world.copy();froot.location=wroot.matrix_world@Vector((.51,0,.16))
 elif name=='chamber-floor':
  for o in worker+queen+sum(brood,[]):o.hide_render=False
  qroot.location=(-.75,.48,-.48);wroot.location=(.85,.48,-.48);wroot.rotation_euler.z=math.pi
  for root,x,depth,height in zip(broots,[-.30,.15,.55],[.30,.40,.72],[-.34,-.37,-.26]):root.location=(x,depth,height)
 else:
  for o in worker:o.hide_render=False
  wroot.location=(-.15,.48,-.48)
 bpy.context.view_layer.update();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
 checks.append({'name':name,'selectedCell':[0,0],'visibleCells':sorted(VISIBLE_CELLS),'openCells':sorted(opened&VISIBLE_CELLS),'rockCells':sorted(stone&VISIBLE_CELLS),'hexWidth':1,'workerBodyLength':.885,'illustrativeDepth':1.20,'recessDepth':1.08,'workerDepth':.48,'description':'Exactly the selected hex and six neighbours. Deliberate topology fixture, not captured gameplay; no front-to-back tunnel connections are implied.'})
 wall.hide_render=True
(out/'studies.json').write_text(json.dumps(checks,indent=2))
for o in scene.objects:
 if o.name in [f[0] for f in fixtures]:o.hide_render=o.name!='digging-face'
 if o.type=='MESH':o.hide_set(o.hide_render)
bpy.ops.wm.save_as_mainfile(filepath=str(out/'below-studies.blend'),compress=True)
print('BELOW_STUDIES_COMPLETE',flush=True)
