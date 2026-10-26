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
  function snapshot(record,meta={}){
    const g=geometry(record.geometry?.geometry||record.geometry),all=points(g);
    const bounds=all.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
    const lon=number(record.lon)??(bounds[0]+bounds[2])/2,lat=number(record.lat)??(bounds[1]+bounds[3])/2;
    if(!record.key||!record.id||!position(lon,lat))throw Error('Property needs a parcel identity and mapped location');
    const sourceURL=text(record.sourceURL||record.source?.url,1000);
    const observation=record.ownership;
    const ownership=observation?.entityName&&(observation.classification==='organization-style'||observation.caveat==='Published assessment entity; not independently verified title or control.')?{entityName:text(observation.entityName,400),sourceURL:text(observation.sourceURL,1000),retrievedAt:text(observation.retrievedAt,80),assessmentYear:observation.assessmentYear??null,caveat:'Published assessment entity; not independently verified title or control.'}:null;
    return {key:text(record.key,400),id:text(record.id,200),state:text(record.state,2),provider:text(record.provider,40),jurisdiction:text(record.jurisdiction,20),ownership,address:text(record.address,500),type:text(record.type||record.assessmentClass,100),
      acres:number(record.acres),yearBuilt:number(record.yearBuilt),lat,lon,geometry:g,
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
  return {snapshot,geometry,links,view,svg,escape};
});
