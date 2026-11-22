"""Seven-cell surface design fixtures. Load worker-base.blend, pass OUTPUT resources.blend."""
import bpy,math,sys,json
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];out=Path(args[0]).resolve();out.mkdir(parents=True,exist_ok=True);scene=bpy.context.scene
scene.cycles.samples=64;scene.cycles.use_denoising=False;scene.render.film_transparent=False
scene.render.resolution_x=768;scene.render.resolution_y=640;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
base=[o for o in scene.objects if o.name.startswith('Worker /')]
for o in list(scene.objects):
 if o.type=='MESH' and o not in base:bpy.data.objects.remove(o,do_unlink=True)
with bpy.data.libraries.load(str(Path(args[1]).resolve()),link=False) as (source,target):target.objects=[n for n in source.objects if n.startswith(('Food /','Aphid /'))]
resources=target.objects
for o in resources:scene.collection.objects.link(o);o.parent=None;o.hide_render=True;o.hide_viewport=False
def mat(name,hex):
 c=[int(hex[i:i+2],16)/255 for i in [0,2,4]];c=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c]
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=.85;return m
soil=[mat('Soil top '+str(i),c) for i,c in enumerate(['A8794B','A27447','AE8051','9C7045','B28658'])]+[mat('Soil cut side','916442'),mat('Soil cut lower','69472F')]
marker=mat('Selected cell','68AF9A');thread=mat('Mycelium','7A4FA0');spore=mat('Spores','B18DD1')
visible={(0,0),(1,0),(0,1),(-1,1),(-1,0),(-1,-1),(0,-1)};R=math.sqrt(3)/2
def cell(x,y):
 fr=y/R;fq=x-fr/2;fs=-fq-fr;q=round(fq);r=round(fr);s=round(fs);dq,dr,ds=abs(q-fq),abs(r-fr),abs(s-fs)
 if dq>dr and dq>ds:q=-r-s
 elif dr>ds:r=-q-s
 return q+(r-(r&1))//2,r
s=.05;cells={(x,y,z) for x in range(-31,31) for y in range(-30,30) if cell((x+.5)*s,-(y+.5)*s) in visible for z in range(-4,0)}
face=[((1,0,0),[(1,0,0),(1,1,0),(1,1,1),(1,0,1)]),((-1,0,0),[(0,0,0),(0,0,1),(0,1,1),(0,1,0)]),((0,1,0),[(0,1,0),(0,1,1),(1,1,1),(1,1,0)]),((0,-1,0),[(0,0,0),(1,0,0),(1,0,1),(0,0,1)]),((0,0,1),[(0,0,1),(1,0,1),(1,1,1),(0,1,1)]),((0,0,-1),[(0,0,0),(0,1,0),(1,1,0),(1,0,0)])]
verts=[];faces=[];ids=[]
for x,y,z in sorted(cells):
 for (dx,dy,dz),corners in face:
  if (x+dx,y+dy,z+dz) in cells:continue
  k=len(verts);verts.extend([((x+a)*s,(y+b)*s,(z+c)*s) for a,b,c in corners]);faces.append(tuple(range(k,k+4)));ids.append(((x*73856093)^(y*19349663))%5 if dz==1 else 5 if z>=-2 else 6)
mesh=bpy.data.meshes.new('Continuous seven-cell ground');mesh.from_pydata(verts,[],faces);mesh.update();ground=bpy.data.objects.new('Continuous seven-cell ground',mesh);scene.collection.objects.link(ground)
for m in soil:mesh.materials.append(m)
for p,i in zip(mesh.polygons,ids):p.material_index=i
def beam(name,a,b,width,m):
 a,b=Vector(a),Vector(b);bpy.ops.mesh.primitive_cube_add(size=1,location=(a+b)/2);o=bpy.context.object;o.name=name;o.dimensions=(width,width,(b-a).length);o.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();o.data.materials.append(m);return o
points=[(math.cos(math.pi/6+d*math.pi/3)/math.sqrt(3),math.sin(math.pi/6+d*math.pi/3)/math.sqrt(3),.012) for d in range(6)]
for a,b in zip(points,points[1:]+points[:1]):beam('Selected cell / outline',a,b,.008,marker)
def clone(parts,name,x,y,heading=0):
 root=bpy.data.objects.new(name,None);scene.collection.objects.link(root);items=[]
 for o in parts:
  p=o.copy();p.name=name+' / '+o.name;p.hide_render=False;p.hide_viewport=False;scene.collection.objects.link(p);p.parent=root;items.append(p)
 root.location=(x,-y,0);root.rotation_euler.z=-heading;return items
for o in base:o.hide_render=True
camera=scene.camera;camera.data.ortho_scale=4.15;camera.location=(1.1,-3.3,2.5);camera.rotation_euler=(Vector((0,0,.07))-camera.location).to_track_quat('-Z','Y').to_euler()
scene.world.node_tree.nodes['Background'].inputs['Color'].default_value=(.78,.75,.69,1);scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.25
groups={};checks=[]
def food(kind,x,y):return clone([o for o in resources if o.name.startswith('Food / '+kind)],'Food '+kind,x,y)
for name in ['foraging','aphids','fungal-growth']:
 actors=[]
 if name=='foraging':
  actors+=clone(base,'Worker / centre',.03,.02,.25);actors+=clone(base,'Worker / west',-1,0,0);actors+=clone(base,'Worker / south-east',.5,R,math.pi)
  for x,y in [(1,-.12),(.9,.15),(1.18,.08)]:actors+=food('plain',x,y)
 elif name=='aphids':
  actors+=clone(base,'Worker / centre',-.08,.08,-.4);actors+=clone(base,'Worker / east',1,0,math.pi)
  aphid=[o for o in resources if o.name.startswith('Aphid /')]
  for i,(x,y) in enumerate([(.30,-R-.10),(.62,-R+.05),(.48,-R+.20)]):actors+=clone(aphid,'Aphid '+str(i),x,y,i*math.pi/2)
  for x,y in [(.36,-R+.12),(.63,-R-.13)]:actors+=food('sweet',x,y)
 else:
  actors+=clone(base,'Worker / centre',.08,.08,.65);actors+=clone(base,'Worker / north-west',-.5,-R,-.5)
  for end in [(1,0),(-1,0),(-.5,R)]:
   a=Vector((0,0,.015));b=Vector((*end,.015));n=max(1,math.ceil((b-a).length/.035))
   for j in range(n):actors.append(beam('Fungal thread',a.lerp(b,j/n),a.lerp(b,(j+1)/n),.025,thread))
  for x,y in [(-.2,.20),(.25,-.13),(-.5,R),(-.68,R-.1)]:
   bpy.ops.mesh.primitive_cube_add(size=.035,location=(x,y,.03));o=bpy.context.object;o.name='Spore field / mark';o.data.materials.append(spore);actors.append(o)
 bpy.context.view_layer.update();scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True);groups[name]=actors
 checks.append({'name':name,'visibleCells':sorted(visible),'selectedCell':[0,0],'hexWidth':1,'workerBodyLength':.885,'continuousGround':True,'context':'Deliberate composition fixture, not captured gameplay. Centre selection only; neighbouring contents give context.'})
 for o in actors:o.hide_render=True
for o in groups['aphids']:o.hide_render=False
for o in scene.objects:
 if o.type=='MESH':o.hide_set(o.hide_render)
(out/'studies.json').write_text(json.dumps(checks,indent=2));bpy.ops.wm.save_as_mainfile(filepath=str(out/'surface-seven-cells.blend'),compress=True)
print('SURFACE_STUDIES_COMPLETE',flush=True)
