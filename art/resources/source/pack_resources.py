from pathlib import Path
from PIL import Image
import json,sys
r=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
m=json.loads((r/'assets/model-manifest.json').read_text())
palettes=[[(30,84,57),(40,121,76),(73,160,94),(127,191,117)],[(160,47,100),(214,72,140),(238,139,175),(255,206,224)],[(106,67,33),(150,100,52),(188,141,80),(222,182,117)],[(31,70,26),(73,126,36),(112,165,52),(161,202,79)]]
checks=[]
for lod,frame in [('tiny',6),('near',14)]:
 atlas=Image.new('RGBA',((frame+2)*7,frame+2))
 for col,name in enumerate(m['columns']):
  im=Image.open(r/'renders'/f'{name}-{lod}.png').convert('RGBA');p=palettes[min(3,col)]
  pixels=[]
  for red,g,b,a in im.getdata():
   if a<70:pixels.append((0,0,0,0));continue
   c=min(p,key=lambda c:(c[0]-red)**2+(c[1]-g)**2+(c[2]-b)**2);pixels.append((*c,255))
  im.putdata(pixels);assert im.getbbox(),name
  atlas.alpha_composite(im,(col*(frame+2)+1,1));checks.append({'kind':name,'lod':lod,'opaqueBounds':im.getbbox()})
 atlas.save(r/'assets'/f'resource-{lod}.png')
(r/'assets/atlas-checks.json').write_text(json.dumps(checks,indent=2))
print('Packed 7 fixed-scale sprites at two native resolutions.')
