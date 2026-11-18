import json,sys
from pathlib import Path
from PIL import Image
out=Path(sys.argv[1]).resolve();m=json.loads((out/'manifest.json').read_text())
for lod in ['tiny','walk']:
 a=m[lod];sheet=Image.new('RGBA',(a['width'],a['height']))
 for i,name in enumerate(m['names']):
  im=Image.open(out/(name+'.png')).convert('RGBA').resize((a['frame'],a['frame']),Image.Resampling.NEAREST)
  sheet.alpha_composite(im,(i*a['stride']+1,1))
 sheet.save(out/('nest-'+lod+'.png'))
