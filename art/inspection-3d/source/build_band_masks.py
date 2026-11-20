"""Project exposed gaster-band faces into the existing aerial atlases. NumPy and Pillow required."""
import json,math
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[3];assets=root/'web/src/assets'
models=json.loads((assets/'inspection-3d/models.json').read_text())
def raster(model,frame,world,heading=0,scale=1):
 depth=np.full((frame,frame),-np.inf);mask=np.zeros((frame,frame),dtype=bool);theta=-heading;c,s=math.cos(theta),math.sin(theta)
 for band in ('body','band'):
  triangles=np.array(models[model][band]['positions']).reshape(-1,3,3)*scale
  for triangle in triangles:
   x=(c*triangle[:,0]-s*triangle[:,1])*frame/world+frame/2;y=-(s*triangle[:,0]+c*triangle[:,1])*frame/world+frame/2;z=triangle[:,2]
   area=(x[1]-x[0])*(y[2]-y[0])-(y[1]-y[0])*(x[2]-x[0])
   if area>=-1e-9:continue
   x0=max(0,math.floor(min(x)));x1=min(frame-1,math.ceil(max(x)));y0=max(0,math.floor(min(y)));y1=min(frame-1,math.ceil(max(y)))
   if x0>x1 or y0>y1:continue
   xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5)
   a=((x[1]-xx)*(y[2]-yy)-(y[1]-yy)*(x[2]-xx))/area;b=((x[2]-xx)*(y[0]-yy)-(y[2]-yy)*(x[0]-xx))/area;cc=1-a-b
   zz=a*z[0]+b*z[1]+cc*z[2];d=depth[y0:y1+1,x0:x1+1];accept=(a>=-1e-7)&(b>=-1e-7)&(cc>=-1e-7)&(zz>d)
   d[accept]=zz[accept];mask[y0:y1+1,x0:x1+1][accept]=band=='band'
 return mask

def runs(mask):
 flat=mask.ravel();out=[];start=None
 for i,v in enumerate(np.r_[flat,False]):
  if v and start is None:start=i
  elif not v and start is not None:out.extend([start,i-start]);start=None
 return out
out={}
for lod,frame,stride,width,height,world,path in [('workerTiny',20,22,264,22,20/12,'workers/tiny-idle.png'),('workerWalk',42,44,528,352,1.5,'workers/map-walk.png')]:
 whole=np.zeros((height,width),dtype=bool)
 for d in range(12):
  m=raster('worker',frame*4 if lod=='workerTiny' else frame,world,d*math.pi/6)
  if lod=='workerTiny':m=m.reshape(frame,4,frame,4).any(axis=(1,3))
  for row in range(8 if lod=='workerWalk' else 1):whole[row*stride+1:row*stride+1+frame,d*stride+1:d*stride+1+frame]=m
 whole &= np.array(Image.open(assets/path))[:,:,3]>0;out[lod]=runs(whole)
for lod,frame in [('nestTiny',27),('nestWalk',64)]:
 out[lod]={kind:runs(raster('queen',frame,2.25,scale=.9 if kind=='alate-body' else 1)) for kind in ['queen','alate-body']}
(assets/'inspection-3d/abdomen-bands.json').write_text(json.dumps(out,separators=(',',':')))
print('BAND_PIXELS', {k:sum(v[1::2]) for k,v in out.items() if isinstance(v,list)})
