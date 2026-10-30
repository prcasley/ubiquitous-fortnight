/* County endpoints discovered from OpenAddresses catalogs; live schema validation is mandatory.
   No owner/contact fields are projected. Catalog references do not establish source uptime or reuse rights. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPA=api;})(globalThis,()=>{
  'use strict';
  const sources={
    Lehigh:{name:'Lehigh County public parcel GIS',url:'https://gis.lehighcounty.org/arcgis/rest/services/ParcelSDE/MapServer/0',id:'PIN',provider:'lehigh',jurisdiction:'42077',attribution:'Lehigh County GIS',date:'Source vintage requires live metadata verification',geometry:'polygon',bounds:[-75.91,40.40,-75.32,40.88]},
    Northampton:{name:'Northampton County public parcel GIS',url:'https://gis.northamptoncounty.org/arcgisweb/rest/services/Assessment_Services/Land_Records_LGM/MapServer/0',id:'PARCEL_ID',provider:'northampton',jurisdiction:'42095',attribution:'Northampton County GIS',date:'Source vintage requires live metadata verification',geometry:'polygon',bounds:[-75.66,40.52,-75.05,41.03]}
  };
  const candidates={acres:['ASMT_ACREAGE','ACRES','ACREAGE','CALC_ACRE','DEED_ACRES','GIS_ACRES','LAND_ACRES','ACREAGE_DEEDED'],year:['COM_YEAR_BUILT','YEAR_BUILT','YR_BUILT','YR_CONSTR','YEARBUILT'],use:['LAND_USE_DESC','LANDUSE_DESC','USE_DESC','CLASS_DESC','PROPERTY_USE','LAND_USE','LANDUSE','USE_CODE','LUC','LAND_USE_CODE'],address:['SITE_ADDRESS','SITUS_ADDRESS','FULL_ADDRESS','PROPERTY_ADDRESS','SITE_ADDR','PROP_LOC','LOCATION','ADDRESS'],number:['SITUS_ADDR_NUM','ADDRNUM'],street:['SITUS_FDPRE','SITUS_FNAME','SITUS_FTYPE','SITUS_FDSUF','FULLNAME'],city:['SITUS_CITY','POST_COMM','MUNICIPALITY','MUNI'],land:['LAND_VALUE'],improvement:['BLDG_VALUE'],salePrice:['SALE_PRICE'],saleDate:['SALE_DATE'],saleValidity:['SALE_VALIDITY_CODE'],koz:['FLAG_10_KOZ']};
  function schema(source,meta){
    if(meta.geometryType!=='esriGeometryPolygon')throw Error(source.name+' did not verify as a parcel polygon layer');
    const fields=new Map((meta.fields||[]).map(f=>[f.name.toUpperCase(),f]));
    const id=fields.get(source.id.toUpperCase()),oid=(meta.fields||[]).find(f=>f.type==='esriFieldTypeOID');
    if(!id||!oid)throw Error(source.name+' parcel ID/order fields could not be verified');
    if(!meta.advancedQueryCapabilities?.supportsPagination||!meta.advancedQueryCapabilities?.supportsOrderBy)throw Error(source.name+' does not verify ordered pagination support');
    const mappings=Object.fromEntries(Object.entries(candidates).map(([kind,names])=>[kind,names.map(n=>fields.get(n)).filter(Boolean)]));
    for(const kind of ['acres','year'])mappings[kind]=mappings[kind].filter(f=>/Integer|SmallInteger|Double|Single/.test(f.type));
    const use=mappings.use[0];
    // Numeric use codes only acquire meaning from the source's own coded-value domain.
    // Some county domains are attached to subtypes instead of the field itself.
    for(const field of [use,...mappings.city].filter(Boolean)){
      const values=[...(field.domain?.codedValues||[]),...(meta.types||[]).flatMap(t=>t.domains?.[field.name]?.codedValues||[])];
      if(values.length){
        const codes=new Map();for(const v of values){const key=String(v.code),entry=codes.get(key);if(!entry)codes.set(key,{...v});else if(entry.name!==v.name)entry.conflict=true;}
        field.domain={codedValues:[...codes.values()].filter(v=>!v.conflict)};
      }
    }
    const supportsUse=!!use&&(!!use.domain?.codedValues?.length||/DESC|PROPERTY_USE/.test(use.name.toUpperCase()));
    const projected=[id.name,oid.name,...Object.values(mappings).flat().map(f=>f.name)];
    return {...source,id:id.name,orderField:oid.name,fields:[...new Set(projected)].join(','),mappings,supportsUse,
      date:meta.editingInfo?.lastEditDate?'Source last edit '+new Date(meta.editingInfo.lastEditDate).toISOString():'Source last-edit date not published',verifiedAt:new Date().toISOString()};
  }
  async function prepare(source,{fetcher=globalThis.fetch,signal}={}){
    const response=await fetcher(source.url+'?f=json',{credentials:'omit',mode:'cors',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(source.name+' unavailable (HTTP '+response.status+'). Pennsylvania coverage could not be verified; no fallback location was searched');
    const meta=await response.json();if(meta.error)throw Error(source.name+' did not return usable layer metadata');return schema(source,meta);
  }
  const category=description=>/VACANT|UNDEVELOPED/i.test(description)?'Vacant':/INDUSTR|WAREHOUS|MANUFACTUR|DISTRIBUTION/i.test(description)?'Industrial':/APART|MULTI.?FAM/i.test(description)?'Multifamily':/COMMERCIAL|RETAIL|OFFICE/i.test(description)?'Commercial':'Other';
  function where(source,mode,filter){
    const terms=[],field=source.mappings.acres[0]?.name;
    if(field&&(filter.value>0||filter.op!=='>='))terms.push(filter.op==='between'?`${field} >= ${filter.value} AND ${field} <= ${filter.max}`:`${field} ${filter.op} ${filter.value}`);
    const use=source.mappings.use[0],target={industrial:'Industrial',vacant:'Vacant',multifamily:'Multifamily'}[mode];
    if(target&&source.supportsUse){
      if(use.domain?.codedValues?.length){const codes=use.domain.codedValues.filter(v=>category(v.name)===target).map(v=>"'"+String(v.code).replaceAll("'","''")+"'");terms.push(codes.length?use.name+' IN ('+codes.join(',')+')':'1=0');}
      else {const words={industrial:['INDUSTR','WAREHOUS','MANUFACTUR','DISTRIBUTION'],vacant:['VACANT','UNDEVELOPED'],multifamily:['APART','MULTIFAM','MULTI-FAM','MULTI FAM']}[mode];terms.push('('+words.map(w=>'UPPER('+use.name+") LIKE '%"+w+"%'").join(' OR ')+')');}
    }
    return terms.join(' AND ')||'1=1';
  }
  function financial(a,source){
    const value=kind=>source.mappings?.[kind]?.map(f=>a[f.name]).find(v=>v!=null&&String(v).trim()!=='');
    const positive=v=>v!=null&&Number.isFinite(Number(v))&&Number(v)>0?Number(v):null;
    const landValue=positive(value('land')),improvementValue=value('improvement')!=null&&Number(value('improvement'))>=0?Number(value('improvement')):null;
    const rawDate=value('saleDate');let date=null;if(rawDate!=null){const d=new Date(typeof rawDate==='number'?rawDate:String(rawDate));if(Number.isFinite(d.getTime()))date=d.toISOString().slice(0,10);}
    const price=positive(value('salePrice')),valid=price>1&&date&&date!=='1979-01-01';
    const koz=value('koz');return {landValue,improvementValue,assessedValue:landValue!=null&&improvementValue!=null?landValue+improvementValue:null,recordedSalePrice:valid?price:null,recordedSaleDate:valid?date:null,saleValidityCode:value('saleValidity')??null,saleSuppressed:!valid&&(price!=null||rawDate!=null),kozFlag:koz==null?null:String(koz)};
  }
  function attributes(a,source){
    const value=kind=>source.mappings?.[kind]?.map(f=>a[f.name]).find(v=>v!=null&&String(v).trim()!=='');
    const useField=source.mappings?.use[0],raw=useField?a[useField.name]:null;
    const description=useField?.domain?.codedValues?.length?(useField.domain.codedValues.find(v=>String(v.code)===String(raw))?.name||''):(source.supportsUse?String(raw??''):'');
    const type=category(description);
    const acres=Number(value('acres')),year=Number(value('year'));
    const cityField=source.mappings?.city?.find(f=>a[f.name]!=null),cityRaw=cityField?a[cityField.name]:null;
    const city=cityField?.domain?.codedValues?.find(v=>String(v.code)===String(cityRaw))?.name||(/^[a-z .'-]+$/i.test(String(cityRaw||''))?cityRaw:cityRaw!=null?'Municipality code '+cityRaw+' (name unverified)':'');
    const street=value('address')||[value('number'),...(source.mappings?.street||[]).map(f=>a[f.name])].filter(Boolean).join(' ');
    const address=[String(street||'').trim().replace(/[,\s]+$/,''),city].filter(Boolean).join(', ');
    return {address:address?address+', PA':'',acres:Number.isFinite(acres)&&acres>0?acres:null,yearBuilt:Number.isInteger(year)&&year>=1800&&year<=new Date().getFullYear()?year:null,type,use:description||(raw!=null?'County land-use code '+raw+' — meaning unverified':'Assessment classification not published')};
  }
  function pageWhere(where,source,last){
    if(last==null)return where;
    const field=source.id,value=String(last);
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)||!value.trim())throw Error('County parcel paging key unavailable');
    return '('+where+') AND '+field+" > '"+value.replaceAll("'","''")+"'";
  }
  return {sources,schema,prepare,attributes,financial,where,pageWhere};
});
