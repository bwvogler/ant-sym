from pathlib import Path
from PIL import Image
import json,math,sys
r=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent;m=json.loads((r/'assets/projection.json').read_text())
atlas=Image.new('RGBA',(m['cols']*m['stride'],math.ceil(len(m['names'])/m['cols'])*m['stride']))
for i,n in enumerate(m['names']):
 im=Image.open(r/'renders'/f'{n}.png').convert('RGBA');atlas.alpha_composite(im,(i%m['cols']*258+1,i//m['cols']*258+1))
atlas.save(r/'assets/inspection-atlas.png');print('Packed inspection layers',atlas.size)
