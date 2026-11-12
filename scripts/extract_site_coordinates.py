"""Recompute annotation-derived points. Requires numpy and opencv-python-headless. Does not change the app catalog."""
import cv2, numpy as np, json, math
from pathlib import Path
root=Path(__file__).resolve().parents[1]/'docs/site-reference'
geo=json.loads((root/'meeting-point.calculation.json').read_text())['georeference']
a=cv2.imread(str(root/'05-scale-reference.png'),0);s=cv2.SIFT_create(nfeatures=12000);ka,da=s.detectAndCompute(a,None)
items=[('dropoff-demo','오룡관 북측 하차 지점','01-locations.png',[728,256],'사용자가 잠시 하차 가능하다고 표시한 화살표 끝'),('parking-oryong-demo','오룡관 주차장 1','01-locations.png',[794,391],'주차장 1 핀 끝; 주차 구역 대표점, 차량 진입구 아님'),('parking-oryong-2-demo','오룡관 주차장 2','01-locations.png',[566,390],'주차장 2 핀 끝; 주차 구역 대표점, 차량 진입구 아님'),('parking-football-demo','축구장 주차장','02-football-approach.png',[519,614],'축구장 북측 주차 구역을 가리키는 차량 접근 화살표 끝; 정확한 진입구 미확인'),('parking-dorm-demo','대학원 기숙사 주차장','03-parking-branches.png',[148,371],'서측 주차 구역을 가리키는 화살표 끝; 정확한 진입구 미확인'),('meeting-demo','오룡관 주차장 1 입구 옆 만남 지점','04-meeting-point.png',[841,428],'사용자가 최종 선택한 노란 원 중심 부근')]
registrations={};features=[]
for id,name,filename,point,note in items:
 if filename not in registrations:
  b=cv2.imread(str(root/filename),0);kb,db=s.detectAndCompute(b,None)
  pairs=[m for m,n in cv2.BFMatcher().knnMatch(db,da,k=2) if m.distance<.7*n.distance]
  x=np.float32([kb[m.queryIdx].pt for m in pairs]);y=np.float32([ka[m.trainIdx].pt for m in pairs])
  M,mask=cv2.estimateAffinePartial2D(x,y,method=cv2.RANSAC,ransacReprojThreshold=3)
  assert mask.sum()>100
  residual=np.linalg.norm(np.c_[x,np.ones(len(x))]@M.T-y,axis=1)[mask.ravel()==1]
  registrations[filename]={'transform':M.tolist(),'inliers':int(mask.sum()),'medianResidualPixels':float(np.median(residual))}
 M=np.array(registrations[filename]['transform']);ruler=np.r_[point,1.]@M.T
 esri=np.r_[ruler,1.]@np.array(geo['transform']).T
 px,py=esri+np.array(geo['tile_origin'])*256
 lon=px/(256*2**19)*360-180;lat=math.degrees(math.atan(math.sinh(math.pi*(1-2*py/(256*2**19)))))
 features.append({'type':'Feature','geometry':{'type':'Point','coordinates':[round(lon,5),round(lat,5)]},'properties':{'id':id,'name':name,'sourceImage':filename,'sourcePixel':point,'scaleImagePixel':ruler.tolist(),'interpretation':note,'coordinateStatus':'IMAGE_DERIVED_ESTIMATE','fieldVerified':False,'routingReady':False}})
 print(id,round(lat,5),round(lon,5))
output={'type':'FeatureCollection','features':features}
(root/'places.estimated.geojson').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
(root/'places.calculation.json').write_text(json.dumps({'registrations':registrations,'georeferenceSource':'meeting-point.calculation.json','absoluteAccuracyMeters':None,'notes':'Source pixels are manually interpreted annotation tips, not surveyed entrances. Parking order is a demo preference, not a driving route.'},ensure_ascii=False,indent=2)+'\n')
