"""Rasterize the same four mesh stages for the aerial map, at its established pixels per world unit."""
import json,math
from pathlib import Path
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[3];assets=root/'web/src/assets';models=json.loads((assets/'inspection-3d/models.json').read_text())
def render(stage,frame):
 image=np.zeros((frame,frame,4),dtype=np.uint8);depth=np.full((frame,frame),-np.inf);model=models['corpse-'+str(stage)]['body'];positions=np.array(model['positions']).reshape(-1,3,3);colours=np.array(model['colours']).reshape(-1,3,3)
 for triangle,cols in zip(positions,colours):
  x=triangle[:,0]*frame/2.25+frame/2;y=-triangle[:,1]*frame/2.25+frame/2;z=triangle[:,2];area=(x[1]-x[0])*(y[2]-y[0])-(y[1]-y[0])*(x[2]-x[0])
  if area>=-1e-9:continue
  x0=max(0,math.floor(min(x)));x1=min(frame-1,math.ceil(max(x)));y0=max(0,math.floor(min(y)));y1=min(frame-1,math.ceil(max(y)))
  if x0>x1 or y0>y1:continue
  xx,yy=np.meshgrid(np.arange(x0,x1+1)+.5,np.arange(y0,y1+1)+.5);a=((x[1]-xx)*(y[2]-yy)-(y[1]-yy)*(x[2]-xx))/area;b=((x[2]-xx)*(y[0]-yy)-(y[2]-yy)*(x[0]-xx))/area;c=1-a-b;zz=a*z[0]+b*z[1]+c*z[2];d=depth[y0:y1+1,x0:x1+1];accept=(a>=-1e-7)&(b>=-1e-7)&(c>=-1e-7)&(zz>d);d[accept]=zz[accept]
  normal=np.cross(triangle[1]-triangle[0],triangle[2]-triangle[0]);normal/=np.linalg.norm(normal);light=np.array([-3,-5,8]);light=light/np.linalg.norm(light);rgb=cols[0]*(.58+.65*max(0,np.dot(normal,light)));rgb=np.where(rgb<=.0031308,rgb*12.92,1.055*rgb**(1/2.4)-.055);rgba=np.r_[np.clip(np.rint(rgb*255),0,255),255].astype(np.uint8);image[y0:y1+1,x0:x1+1][accept]=rgba
 return Image.fromarray(image)
for lod,frame,stride in [('tiny',27,29),('walk',64,66)]:
 image=Image.new('RGBA',(stride*4,stride));
 for stage in range(4):image.paste(render(stage,frame),(stage*stride+1,1))
 image.save(assets/'inspection-3d'/('cadavers-'+lod+'.png'))
