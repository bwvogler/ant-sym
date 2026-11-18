import json,sys
from pathlib import Path
from PIL import Image
r=Path(sys.argv[1]).resolve();m=json.loads((r/'below-manifest.json').read_text());out=Image.new('RGBA',(m['width'],m['height']))
for i,n in enumerate(m['names']):out.alpha_composite(Image.open(r/(n+'.png')),(i%m['cols']*m['stride']+1,i//m['cols']*m['stride']+1))
out.save(r/'below-atlas.png');print('Packed below atlas')
