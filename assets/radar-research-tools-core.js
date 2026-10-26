(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarResearchToolsCore=api;})(globalThis,()=>{
  'use strict';
  function parseCSV(text){
    if(typeof text!=='string'||text.length>5000000)throw Error('Choose a CSV under 5 MB');
    text=text.replace(/^\uFEFF/,'');let rows=[],row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell)throw Error('Invalid CSV quoting');else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';if(rows.length>5001)throw Error('Choose at most 5,000 comparable rows');}
      else cell+=c;
    }
    if(quoted)throw Error('Unclosed quote in CSV');row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
    if(rows.length>5001)throw Error('Choose at most 5,000 comparable rows');return rows;
  }
  const header=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const numeric=value=>{if(value==null||String(value).trim()==='')return null;const n=Number(String(value).replace(/[$,\s]/g,''));return Number.isFinite(n)?n:null;};
  function importComps(text){
    const rows=parseCSV(text);if(rows.length<2)throw Error('CSV needs a header and at least one record');
    const aliases={id:['compid','id'],parcelId:['parcelid','pin','apn'],address:['address','propertyaddress'],type:['transactiontype','comptype','type'],price:['saleprice','price','transactionprice'],buildingSF:['buildingsqft','buildingsf','buildingarea'],date:['saledate','transactiondate','date'],lat:['latitude','lat'],lon:['longitude','lon','lng'],sourceURL:['sourceurl','source'],state:['state']};
    const columns=Object.fromEntries(Object.entries(aliases).map(([k,names])=>[k,rows[0].findIndex(v=>names.includes(header(v)))]));
    if(columns.id<0||columns.address<0||columns.type<0)throw Error('Required headers: comp_id, address, transaction_type');
    const seen=new Set();return rows.slice(1).map((row,index)=>{
      const get=field=>columns[field]>=0?String(row[columns[field]]||'').trim():'';
      const id=get('id');if(!id||seen.has(id))throw Error('Missing or duplicate comp ID at row '+(index+2));seen.add(id);
      const rawType=get('type').toLowerCase(),type=/^(closed[- ]?)?sale$/.test(rawType)?'closed-sale':/^(closed[- ]?)?lease$/.test(rawType)?'lease':/asking|listing|for sale/.test(rawType)?'asking':'unclassified';
      const price=numeric(get('price')),buildingSF=numeric(get('buildingSF')),lat=numeric(get('lat')),lon=numeric(get('lon'));
      return {id,parcelId:get('parcelId'),address:get('address').slice(0,500),state:get('state').toUpperCase().slice(0,2),type,
        price:price!=null&&price>=0?price:null,buildingSF:buildingSF>0?buildingSF:null,
        pricePerBuildingSF:type==='closed-sale'&&price>=0&&price!=null&&buildingSF>0?price/buildingSF:null,
        date:get('date').slice(0,80),lat:lat!=null&&Math.abs(lat)<=90?lat:null,lon:lon!=null&&Math.abs(lon)<=180?lon:null,
        sourceURL:/^https:\/\//.test(get('sourceURL'))?get('sourceURL').slice(0,1500):'',importedAt:new Date().toISOString()};
    });
  }
  function csv(rows,columns){
    const cell=value=>{let s=String(value??'');if(typeof value!=='number'&&/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
    return [columns.map(cell).join(','),...rows.map(row=>columns.map(c=>cell(row[c])).join(','))].join('\r\n');
  }
  function assemblySummary(items,geo){
    const known=items.filter(r=>r.acres!=null),polygons=items.filter(r=>['Polygon','MultiPolygon'].includes(r.geometry.type)),links=polygons.map(()=>[]);let overlaps=0;
    for(let a=0;a<polygons.length;a++)for(let b=a+1;b<polygons.length;b++)if(geo.booleanIntersects(geo.feature(polygons[a].geometry),geo.feature(polygons[b].geometry))){links[a].push(b);links[b].push(a);if(geo.intersect(geo.featureCollection([geo.feature(polygons[a].geometry),geo.feature(polygons[b].geometry)])))overlaps++;}
    let components=0;const seen=new Set();for(let i=0;i<polygons.length;i++)if(!seen.has(i)){components++;const queue=[i];while(queue.length){const j=queue.pop();if(seen.has(j))continue;seen.add(j);queue.push(...links[j]);}}
    return {count:items.length,knownAcreage:known.reduce((n,r)=>n+r.acres,0),unknownAcreage:items.length-known.length,pointOnly:items.length-polygons.length,polygonComponents:components,overlappingPairs:overlaps};
  }
  function geoJSON(items){return {type:'FeatureCollection',features:items.map(r=>({type:'Feature',geometry:r.geometry,properties:{parcel_id:r.id,state:r.state,reported_acres:r.acres,source_url:r.sourceURL,retrieved_at:r.retrievedAt,precision:r.precision}}))};}
  return {parseCSV,importComps,csv,assemblySummary,geoJSON};
});
