const {test}=require('node:test');const assert=require('node:assert/strict');
const S=require('../js/dooh-surfaces.js'),Sites=require('../js/outdoor-sites.js');
test('Lesseps adds exactly one screen at the connected kiosk viewpoint, without borrowing Vila audiences',()=>{
 const screens=S.all.filter(s=>s.siteId==='lesseps');assert.equal(screens.length,1);assert.equal(S.all.length,4);
 assert.equal(screens[0].pano,Sites.get('lesseps').entry.pano);assert.equal(Sites.get('lesseps').audienceSiteId,null);
 assert.equal(new Set(S.all.map(s=>s.elementId)).size,4);
});
test('Lesseps corners follow independently observed photographic features after a four degree turn',()=>{
 const surface=S.get('lesseps-main');const observed={tl:[525,328],tr:[561,335],br:[562,472],bl:[526,475]};
 for(const [corner,point] of Object.entries(surface.corners)){
  const projected=S.project(...point,{heading:301.5,pitch:1.5},2.8,1440,814);
  assert.ok(Math.hypot(projected[0]-observed[corner][0],projected[1]-observed[corner][1])<1);
 }
 for(const [width,height] of [[1440,814],[390,760]])assert.ok(S.fit(surface,width,height).zoom<=3);
});
