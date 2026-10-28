/* Shared search semantics. Usable by browsers and Node tests without DOM or network. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RadarDomain=api;
})(globalThis,()=>{
  'use strict';
  function acreageFilter(value,op='>=',upper){
    const v=Number(value);
    if(!Number.isFinite(v)||v<0||v>99999)throw Error('Acreage must be between 0 and 99,999');
    if(!['>=','>','<','<=','=','between'].includes(op))throw Error('Unsupported acreage comparison');
    if(op==='between'){
      const max=Number(upper);
      if(upper==null||upper===''||!Number.isFinite(max)||max<v||max>99999)throw Error('Enter an upper acreage at least as large as the lower acreage');
      return {value:v,op,max};
    }
    return {value:v,op};
  }
  function matchesAcres(acres,filter){
    if(acres==null||!Number.isFinite(Number(acres)))return filter.value===0&&filter.op==='>=';
    return {'>':acres>filter.value,'>=':acres>=filter.value,'<':acres<filter.value,'<=':acres<=filter.value,'=':Number(acres)===filter.value,between:acres>=filter.value&&acres<=filter.max}[filter.op];
  }
  function acreageSQL(field,filter,scale=1){
    if(!/^[A-Z_]+$/.test(field))throw Error('Invalid acreage field');
    const valid=acreageFilter(filter.value,filter.op,filter.max),number=v=>Number((v*scale).toFixed(4));
    return valid.op==='between'?`${field} >= ${number(valid.value)} AND ${field} <= ${number(valid.max)}`:`${field} ${valid.op} ${number(valid.value)}`;
  }
  function parcelKey(provider,state,county,id){
    if(!provider||!state||!county||!id)throw Error('Parcel identity requires provider, state, jurisdiction and local ID');
    return [provider,state,county,id].map(v=>encodeURIComponent(String(v))).join(':');
  }
  function pbcCategory(value){
    const use=String(value||'').toUpperCase();
    if(/VACANT|UNDEVELOPED/.test(use))return 'Vacant';
    if(/WAREH|DISTRIBUTION|DIST\b|MFG|MANUF|INDUSTR|LUMBER YARD|OPEN STORAGE/.test(use))return 'Industrial';
    if(/APART|MULTI.?FAM/.test(use))return 'Multifamily';
    return 'Other';
  }
  function intersectsRadius(geometry,center,miles,geo=globalThis.turf){
    if(!geo)throw Error('Spatial library unavailable');
    const area=geo.circle([center.lon,center.lat],miles,{units:'miles',steps:96});
    return geo.booleanIntersects(geo.feature(geometry),area);
  }
  function acreageObservation(reported,geometry,geo=globalThis.turf){
    const valid=reported!=null&&Number.isFinite(Number(reported))&&Number(reported)>0;
    const raw=valid?Number(reported):null;
    let measured=null;
    if(geometry&&['Polygon','MultiPolygon'].includes(geometry.type)&&geo){try{const area=geo.area(geo.feature(geometry))/4046.8564224;if(area>0&&Number.isFinite(area))measured=area;}catch{}}
    const suspect=raw!=null&&measured!=null&&Math.abs(raw-measured)>1&&(raw>measured*5||measured>raw*5);
    return {acres:suspect?null:raw,reportedAcres:raw,geometryAcres:measured,acreageQuality:suspect?'suspect':raw==null?'missing':measured==null?'point-only':'reported',
      acreageWarning:suspect?'Source acreage differs by more than 5× and one acre from the mapped polygon area. Excluded from size filters and rankings pending verification; neither figure is a survey.':''};
  }
  // Screening geometry is GeoJSON WGS84. Turf area uses geodesic area, not degree-squared area.
  function summarizeScreen(parcel,features,geo=globalThis.turf){
    if(!geo)throw Error('Spatial library unavailable');
    if(!['Point','Polygon','MultiPolygon'].includes(parcel.type))throw Error('Unsupported parcel geometry');
    if(!Array.isArray(features))throw Error('Invalid screening features');
    const subject=geo.feature(parcel);
    const hits=features.filter(f=>{
      if(!f?.geometry||!['Polygon','MultiPolygon'].includes(f.geometry.type))throw Error('Screening source returned invalid geometry');
      return geo.booleanIntersects(subject,f);
    });
    const pointOnly=parcel.type==='Point';
    let percent=null;
    if(!pointOnly){
      const total=geo.area(subject);
      if(!(total>0))throw Error('Parcel has zero area');
      const clipped=hits.map(f=>geo.intersect(geo.featureCollection([subject,f]))).filter(Boolean);
      const merged=clipped.length>1?geo.union(geo.featureCollection(clipped)):clipped[0];
      percent=merged?Math.min(100,geo.area(merged)/total*100):0;
    }
    return {status:hits.length?'mapped-intersection':'no-mapped-intersection',
      precision:pointOnly?'point-only':'parcel-polygon',overlapPercent:percent,
      labels:[...new Set(hits.map(f=>String(f.properties?.FLD_ZONE||f.properties?.WETLAND_TYPE||f.properties?.ATTRIBUTE||'Mapped feature')))]};
  }
  return {acreageFilter,matchesAcres,acreageSQL,parcelKey,pbcCategory,intersectsRadius,summarizeScreen,acreageObservation};
});
