from pathlib import Path
from PIL import Image
import json,sys
r=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else Path(__file__).resolve().parent.parent
m=json.loads((r/'assets/lifecycle-manifest.json').read_text());atlas=Image.new('RGBA',(m['width'],m['height']))
for i,name in enumerate(m['names']):atlas.alpha_composite(Image.open(r/'renders'/f'{name}.png'),(i%m['cols']*m['stride']+1,i//m['cols']*m['stride']+1))
atlas.save(r/'assets/inspection-lifecycle.png');print('Packed lifecycle atlas')
