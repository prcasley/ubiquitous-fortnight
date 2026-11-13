/* Shared public property views and field-pack data. No private attributes or credentials. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarProperty=api;})(globalThis,()=>{
  'use strict';
  const text=(value,max=500)=>typeof value==='string'?value.slice(0,max):'';
  const number=value=>value!=null&&Number.isFinite(Number(value))?Number(value):null;
  const position=(lon,lat)=>Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90;
  function geometry(input){
    if(!input||!['Point','Polygon','MultiPolygon'].includes(input.type))throw Error('Parcel geometry is unavailable');
    let count=0;
    const pair=p=>{if(!Array.isArray(p)||!position(p[0],p[1])||++count>100000)throw Error('Invalid or oversized parcel geometry');return [p[0],p[1]];};
    const ring=r=>{if(!Array.isArray(r)||r.length<4)throw Error('Invalid parcel ring');return r.map(pair);};
    const polygon=p=>{if(!Array.isArray(p)||!p.length)throw Error('Invalid parcel polygon');return p.map(ring);};
    if(input.type==='MultiPolygon'&&(!Array.isArray(input.coordinates)||!input.coordinates.length))throw Error('Invalid parcel polygon');
    return {type:input.type,coordinates:input.type==='Point'?pair(input.coordinates):input.type==='Polygon'?polygon(input.coordinates):input.coordinates.map(polygon)};
  }
  function points(g){return g.type==='Point'?[g.coordinates]:g.type==='Polygon'?g.coordinates.flat():g.coordinates.flat(2);}
  function ozSnapshot(oz){
    if(!oz||!['ozNJ','ozFL','oz1','oz2'].includes(oz.kind)||!['reference-intersection','reference-point-intersection','no-reference-intersection','unavailable','checking','partial-overlap','boundary-contact','expired'].includes(oz.status))return null;
    return {coverageBasis:['parcel-area','point-only'].includes(oz.coverageBasis)?oz.coverageBasis:null,overlapPercent:typeof oz.overlapPercent==='number'&&Number.isFinite(oz.overlapPercent)&&oz.overlapPercent>=0&&oz.overlapPercent<=100?oz.overlapPercent:null,minimumOverlapPercent:95,eligibilityStatus:['met','not-met','mixed','unknown'].includes(oz.eligibilityStatus)?oz.eligibilityStatus:null,validUntil:text(oz.validUntil,80),kind:oz.kind,status:oz.status,tracts:(Array.isArray(oz.tracts)?oz.tracts:[]).filter(t=>/^\d{11}$/.test(String(t))).slice(0,130),tractDetails:(Array.isArray(oz.tractDetails)?oz.tractDetails:[]).slice(0,130).map(t=>({overlapPercent:typeof t.overlapPercent==='number'&&Number.isFinite(t.overlapPercent)&&t.overlapPercent>=0&&t.overlapPercent<=100?t.overlapPercent:null,geoid:text(t.geoid,11),municipality:text(t.municipality,200),county:text(t.county,100),...(oz.kind==='ozFL'&&['Meets Criteria','Does not Meets Criteria'].includes(t.designation)?{designation:t.designation,poverty:Number.isFinite(t.poverty)&&t.poverty>=0&&t.poverty<=1?t.poverty:null,familyIncome:text(t.familyIncome,20),areaIncome:text(t.areaIncome,20)}:{})})),nominationVerified:oz.kind==='ozNJ'&&oz.nominationVerified===true&&oz.status==='reference-intersection'&&oz.coverageBasis==='parcel-area'&&Number.isFinite(oz.overlapPercent)&&oz.overlapPercent>=95,sourceName:text(oz.sourceName,150),sourceURL:text(oz.sourceURL,1000),checkedAt:text(oz.checkedAt,80)};
  }
  function ozLabel(record){
    const o=ozSnapshot(record.ozObservations?.[record.state==='NJ'?'ozNJ':record.state==='FL'?'ozFL':record.ozObservation?.kind]||record.ozObservation),date=o?.checkedAt?' Checked '+o.checkedAt+'.':'';
    if(record.state==='NJ'){
      if(!o||o.kind!=='ozNJ')return 'NJ nomination status not checked. Eligibility references do not establish nomination.';
      if(o.status==='expired'||o.validUntil&&Date.parse(o.validUntil)<=Date.now())return 'NJ nomination data expired; refresh needed. No parcel nomination or absence was inferred.';
      if(o.status==='checking')return 'Checking official NJ nomination tracts…';
      if(o.status==='unavailable')return 'Official NJ nomination check unavailable; no nomination or absence was inferred.'+date;
      if(o.status==='no-reference-intersection')return 'Not in a designated NJ OZ 2.0 tract in this check. This is not an ineligibility finding.'+date;
      if(['boundary-contact','partial-overlap'].includes(o.status))return 'Designated-tract boundary review: '+(o.status==='boundary-contact'?'line or corner contact only':(o.overlapPercent??0).toFixed(3)+'% of mapped parcel area overlaps designated tracts')+' · tracts '+o.tracts.join(', ')+'. Not counted as a positive parcel match. The 95% screening rule is not a legal eligibility threshold.'+date;
      if(o.coverageBasis==='point-only'||o.status==='reference-point-intersection')return 'Point intersects a designated NJ OZ 2.0 tract, but parcel-area coverage is unknown. No parcel match was inferred.'+date;
      if(!o.nominationVerified)return 'NJ nomination evidence not verified; no nominated status was inferred.';
      return 'Designated OZ 2.0 tract '+o.tracts.map(id=>id+(o.tractDetails.find(t=>t.geoid===id)?.municipality?' ('+o.tractDetails.find(t=>t.geoid===id).municipality+')':'')).join(', ')+'. Parcel overlap '+o.overlapPercent.toFixed(2)+'% (95% area screening rule, not a legal eligibility threshold). Certified by U.S. Treasury (SB0682, Nov 5, 2026; effective Jan 1, 2027 – Dec 31, 2036). Parcel intersection does not establish whole-parcel inclusion or tax qualification.'+date;
    }
    if(o?.kind==='ozFL'){
      const missingFL='Treasury designation list still loading; designation not shown yet.';
      const money=v=>{const n=Number(String(v??'').replace(/[$,]/g,''));return Number.isFinite(n)&&n>0?'$'+Math.round(n).toLocaleString('en-US'):'not published';};
      const facts=t=>t.geoid+(t.poverty!=null||t.familyIncome?' (poverty '+(t.poverty!=null?(t.poverty*100).toFixed(1)+'%':'not published')+', family income '+money(t.familyIncome)+' vs area '+money(t.areaIncome)+')':'');
      const met=(o.tractDetails||[]).filter(t=>t.designation==='Meets Criteria'),not=(o.tractDetails||[]).filter(t=>t.designation==='Does not Meets Criteria');
      const oz1=record.ozObservations?.oz1,legacy=oz1&&['reference-intersection','reference-point-intersection'].includes(oz1.status)?' Also intersects 2018 OZ 1.0 tract '+oz1.tracts.join(', ')+'.':'';
      if(o.validUntil&&Date.parse(o.validUntil)<=Date.now())return 'FloridaCommerce eligibility evidence is expired; recheck the official source. '+missingFL;
      if(o.status==='checking')return 'Checking FloridaCommerce OZ 2.0 eligibility…';
      if(o.status==='unavailable')return 'FloridaCommerce eligibility check unavailable; no eligibility or ineligibility was inferred. '+missingFL+legacy+date;
      if(!met.length&&!not.length)return 'No FloridaCommerce eligibility tract returned for this parcel; this is not an eligibility finding. '+missingFL+legacy+date;
      const lead=met.length&&not.length?'FloridaCommerce OZ 2.0 eligibility: parcel touches tracts that meet ('+met.map(facts).join(', ')+') and do not meet ('+not.map(facts).join(', ')+') the criteria':met.length?'FloridaCommerce OZ 2.0 eligibility: tract '+met.map(facts).join(', ')+' meets the criteria':'FloridaCommerce OZ 2.0 eligibility: tract '+not.map(facts).join(', ')+' does not meet the criteria';
      const D=(typeof window!=='undefined'?window:globalThis).RadarOZ2Designations,des=D?.isLoaded?.()?met.filter(t=>D.get(t.geoid)?.state==='FL'):null;
      const designation=des===null?missingFL:des.length?'Designated OZ 2.0 (Effective Jan 1, 2027): tract '+des.map(t=>t.geoid+(D.get(t.geoid).rural?' (Rural OZ 2.0 — 50% improvement threshold, 30% step-up)':'')).join(', ')+' is on the U.S. Treasury designation list (SB0682, Nov 5, 2026).':'Not designated by U.S. Treasury (SB0682, Nov 5, 2026) — eligible tract was not selected.';
      return (des&&des.length?designation+' '+lead+'.':lead+'. '+designation)+legacy+' Parcel intersection does not establish whole-parcel inclusion or tax qualification.'+date;
    }
    const missing='No official state nomination list connected for '+record.state+'.';
    if(!o)return missing+' OZ reference not checked.';
    return (o.kind==='oz1'?'OZ 1 designated-tract reference':'Third-party OZ 2 eligibility reference')+' · '+(o.status==='no-reference-intersection'?'no matching polygon returned':'reference polygon intersects')+' · tracts '+(o.tracts.join(', ')||'none returned')+'. '+missing+' Final designation and tax qualification unverified.'+date;
  }
  function snapshot(record,meta={}){
    const g=geometry(record.geometry?.geometry||record.geometry),all=points(g);
    const bounds=all.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
    const lon=number(record.lon)??(bounds[0]+bounds[2])/2,lat=number(record.lat)??(bounds[1]+bounds[3])/2;
    if(!record.key||!record.id||!position(lon,lat))throw Error('Property needs a parcel identity and mapped location');
    const sourceURL=text(record.sourceURL||record.source?.url,1000);
    const observation=record.ownership;
    const ownership=observation?.entityName&&(observation.classification==='organization-style'||observation.caveat==='Published assessment entity; not independently verified title or control.')?{entityName:text(observation.entityName,400),sourceURL:text(observation.sourceURL,1000),retrievedAt:text(observation.retrievedAt,80),assessmentYear:observation.assessmentYear??null,caveat:'Published assessment entity; not independently verified title or control.'}:null;
    const ozObservation=ozSnapshot(record.state==='NJ'?(record.ozObservations?.ozNJ||(record.ozObservation?.kind==='ozNJ'?record.ozObservation:null)):record.state==='FL'?(record.ozObservations?.ozFL||record.ozObservation):record.ozObservation);
    const ozObservations=Object.fromEntries(Object.entries(record.ozObservations||{}).map(([kind,o])=>[kind,ozSnapshot(o)]).filter(([kind,o])=>o&&kind===o.kind));
    return {parcelNumber:text(record.parcelNumber,200),sourceIdType:text(record.sourceIdType,60),ozObservation,ozObservations,key:text(record.key,400),id:text(record.id,200),state:text(record.state,2),provider:text(record.provider,40),jurisdiction:text(record.jurisdiction,20),ownership,address:text(record.address,500),type:text(record.type||record.assessmentClass,100),
      acres:number(record.acres),reportedAcres:number(record.reportedAcres),geometryAcres:number(record.geometryAcres),acreageQuality:text(record.acreageQuality,30),acreageWarning:text(record.acreageWarning,500),yearBuilt:number(record.yearBuilt),lat,lon,geometry:g,
      sourceName:text(record.sourceName||record.source?.name,300),sourceURL:/^https:\/\//i.test(sourceURL)?sourceURL:'',
      sourceVintage:text(record.sourceVintage||record.source?.date,300),retrievedAt:text(record.retrievedAt||meta.time,80),
      scanStatus:text(record.scanStatus||meta.status,30),unverifiedCriteria:(record.unverifiedCriteria||meta.unverified||[]).filter(x=>typeof x==='string').slice(0,5).map(x=>x.slice(0,100)),
      precision:g.type==='Point'?'Published point only — parcel boundary unavailable':'Published parcel polygon — planning boundary, not a survey'};
  }
  function links(record){
    const {lat,lon}=record;if(!position(lon,lat))throw Error('Invalid mapped location');
    const coordinate=lat+','+lon,address=text(record.address,180).trim();
    const query=address.length>5&&!/^(?:NJ|FL)$/i.test(address)?address:coordinate;
    return {maps:'https://www.google.com/maps/search/?'+new URLSearchParams({api:'1',query}),
      satellite:'https://www.google.com/maps/@?'+new URLSearchParams({api:'1',map_action:'map',center:coordinate,zoom:'19',basemap:'satellite'}),
      street:'https://www.google.com/maps/@?'+new URLSearchParams({api:'1',map_action:'pano',viewpoint:coordinate}),
      directions:'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',destination:coordinate,travelmode:'driving'})};
  }
  const project=p=>[6378137*p[0]*Math.PI/180,6378137*Math.log(Math.tan(Math.PI/4+Math.max(-85.05112878,Math.min(85.05112878,p[1]))*Math.PI/360))];
  function view(record,width=640,height=360){
    const g=geometry(record.geometry),all=points(g).map(project);
    const box=all.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
    const cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2;
    let w=Math.max(220,(box[2]-box[0])*1.5),h=Math.max(160,(box[3]-box[1])*1.5);
    if(w/h<width/height)w=h*width/height;else h=w*height/width;
    const bounds=[cx-w/2,cy-h/2,cx+w/2,cy+h/2];
    const pixel=p=>{const [x,y]=project(p);return [(x-bounds[0])/w*width,(bounds[3]-y)/h*height];};
    const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
    const paths=polygons.map(rings=>rings.map(r=>r.map((p,i)=>{const [x,y]=pixel(p);return (i?'L':'M')+x.toFixed(2)+' '+y.toFixed(2);}).join(' ')+' Z').join(' '));
    const dot=pixel([record.lon,record.lat]);
    return {width,height,bounds,paths,dot,hasBoundary:g.type!=='Point',imageURL:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?'+new URLSearchParams({
      bbox:bounds.join(','),bboxSR:'3857',imageSR:'3857',size:width+','+height,format:'jpg',f:'image',transparent:'false'})};
  }
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function svg(record,image=''){
    const v=view(record),raster=/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image)?`<image href="${image}" width="640" height="360"/>`:'';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="${v.hasBoundary?'Published parcel outline':'Published point; boundary unavailable'}"><rect width="640" height="360" fill="#e4ebef"/>${raster}${v.paths.map(d=>`<path d="${d}" fill="#ffcc2233" fill-rule="evenodd" stroke="#ffd334" stroke-width="3"/>`).join('')}${v.hasBoundary?'':`<circle cx="${v.dot[0]}" cy="${v.dot[1]}" r="7" fill="#d23b3b" stroke="white" stroke-width="2"/>`}</svg>`;
  }
  return {ozSnapshot,ozLabel,snapshot,geometry,links,view,svg,escape};
});
