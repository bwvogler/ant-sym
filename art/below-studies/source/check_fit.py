"""Read-only check of model depth inside the revised tunnel recess."""
import bpy,json
from mathutils import Vector
bpy.context.view_layer.update()
for name in ['Worker /','Queen /']:
 points=[o.matrix_world@Vector(p) for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith(name) for p in o.bound_box]
 lo=min(p.y for p in points);hi=max(p.y for p in points)
 assert lo>=0 and hi<=1.08,(name,lo,hi)
 print(json.dumps({'model':name,'frontDepth':lo,'backDepth':hi,'recessDepth':1.08,'fits':True}))
