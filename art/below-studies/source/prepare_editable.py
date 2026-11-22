import bpy,sys
from pathlib import Path
destination=Path(sys.argv[sys.argv.index('--')+1]).resolve()
for o in bpy.context.scene.objects:
 if o.name in ['narrow-passage','chamber-floor','digging-face']:o.hide_render=o.name!='digging-face'
 if o.type=='MESH':o.hide_set(o.hide_render)
bpy.ops.wm.save_as_mainfile(filepath=str(destination),compress=True)
