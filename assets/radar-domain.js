/* Shared search semantics. Usable by browsers and Node tests without DOM or network. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.RadarDomain=api;
})(globalThis,()=>{
  'use strict';
  function acreageFilter(value,op='>='){
    const v=Number(value);
    if(!Number.isFinite(v)||v<0||v>99999)throw Error('Acreage must be between 0 and 99,999');
    if(!['>=','>','<','<='].includes(op))throw Error('Unsupported acreage comparison');
    return {value:v,op};
  }
  function matchesAcres(acres,filter){
    if(acres==null||!Number.isFinite(Number(acres)))return filter.value===0&&filter.op==='>=';
    return {'>':acres>filter.value,'>=':acres>=filter.value,'<':acres<filter.value,'<=':acres<=filter.value}[filter.op];
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
  return {acreageFilter,matchesAcres,parcelKey,pbcCategory,intersectsRadius,summarizeScreen};
});
