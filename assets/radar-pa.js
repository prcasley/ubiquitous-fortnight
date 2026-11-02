/* County endpoints discovered from OpenAddresses catalogs; live schema validation is mandatory.
   No owner/contact fields are projected. Catalog references do not establish source uptime or reuse rights. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RadarPA=api;})(globalThis,()=>{
  'use strict';
  const sources={
    Lehigh:{name:'Lehigh County public parcel GIS',url:'https://gis.lehighcounty.org/arcgis/rest/services/ParcelSDE/MapServer/0',id:'PIN',provider:'lehigh',jurisdiction:'42077',attribution:'Lehigh County GIS',date:'Source vintage requires live metadata verification',geometry:'polygon',bounds:[-75.91,40.40,-75.32,40.88]},
    Northampton:{name:'Northampton County public parcel GIS',url:'https://gis.northamptoncounty.org/arcgisweb/rest/services/Assessment_Services/Land_Records_LGM/MapServer/0',id:'CAMA_ID',parcelField:'PARCEL_ID',provider:'northampton',jurisdiction:'42095',attribution:'Northampton County GIS',date:'Source vintage requires live metadata verification',geometry:'polygon',bounds:[-75.66,40.52,-75.05,41.03],
      // Fallbacks used ONLY when the live parcel layer publishes no coded-value domain for MUNI / LUC.
      municipalities:{source:'Northampton County GIS · Administration/OperationalLayers Municipal Boundary (MUNI_CODE → FULLNAME)',url:'https://gis.northamptoncounty.org/arcgisweb/rest/services/Administration/OperationalLayers/MapServer/0',checked:'2026-11-02',
        names:{'01':'Allen Township','02':'Bangor Borough','03':'Bath Borough','04':'Bethlehem City','05':'Bethlehem Township','06':'Bushkill Township','07':'Chapman Borough','08':'East Allen Township','09':'East Bangor Borough','10':'Easton City','11':'Forks Township','12':'Freemansburg Borough','13':'Glendon Borough','14':'Hanover Township','15':'Hellertown Borough','16':'Lehigh Township','17':'Lower Mount Bethel Township','18':'Lower Nazareth Township','19':'Lower Saucon Township','20':'Moore Township','21':'Nazareth Borough','22':'Northampton Borough','23':'North Catasauqua Borough','24':'Palmer Township','25':'Pen Argyl Borough','26':'Plainfield Township','27':'Portland Borough','28':'Roseto Borough','29':'Stockertown Borough','30':'Tatamy Borough','31':'Upper Mount Bethel Township','32':'Upper Nazareth Township','33':'Walnutport Borough','34':'Washington Township','35':'West Easton Borough','36':'Williams Township','37':'Wilson Borough','38':'Wind Gap Borough'}},
      // The supplied fix package reports no county LUC code table. Its families were checked by its author against county-published IMPROVEMENT_NAME values
      // (e.g. 700/701 manufacturers, 702 business centers, 710 self storage, 730 supply yards; 300/301 apartments; 400/410 offices; 500/560 retail and dealers).
      // Codes outside these families stay unclassified rather than guessed.
      useFamilies:[{prefix:'7',type:'Industrial',label:'County 700-series screening family (industrial, flex, storage or yard; exact use unverified)'},{prefix:'3',type:'Multifamily',label:'County 300-series code (apartments / multifamily)'},{prefix:'4',type:'Commercial',label:'County 400-series code (office / commercial)'},{prefix:'5',type:'Commercial',label:'County 500-series code (retail / commercial)'}]}
  };
  const familyFor=(source,raw)=>{const code=String(raw??'').trim();return /^\d{3}$/.test(code)?source.useFamilies?.find(f=>code[0]===f.prefix)||null:null;};
  const muniName=(source,raw)=>{if(raw==null||!source.municipalities)return null;const code=String(raw).trim().padStart(2,'0');return source.municipalities.names[code]||null;};
  const modeFamilies=(source,mode)=>{const target={industrial:'Industrial',multifamily:'Multifamily',vacant:'Vacant'}[mode];return target?(source.useFamilies||[]).filter(f=>f.type===target):[];};
  function supportsMode(source,mode){if(mode==='all')return true;const use=source.mappings?.use?.[0];if(use?.domain?.codedValues?.length||(source.supportsUse&&!source.useFamilyFallback))return !!source.supportsUse;return modeFamilies(source,mode).length>0;}
  const candidates={acres:['ASMT_ACREAGE','ACRES','ACREAGE','CALC_ACRE','DEED_ACRES','GIS_ACRES','LAND_ACRES','ACREAGE_DEEDED'],year:['COM_YEAR_BUILT','YEAR_BUILT','YR_BUILT','YR_CONSTR','YEARBUILT'],use:['LAND_USE_DESC','LANDUSE_DESC','LUC_DESC','LUC_DESCRIPTION','USE_DESC','CLASS_DESC','PROPERTY_USE','LAND_USE','LANDUSE','USE_CODE','LUC','LAND_USE_CODE'],address:['SITE_ADDRESS','SITUS_ADDRESS','FULL_ADDRESS','PROPERTY_ADDRESS','SITE_ADDR','PROP_LOC','LOCATION','ADDRESS'],number:['SITUS_ADDR_NUM','ADDRNUM'],street:['SITUS_FDPRE','SITUS_FNAME','SITUS_FTYPE','SITUS_FDSUF','FULLNAME'],city:['SITUS_CITY','POST_COMM','MUNICIPALITY','MUN_NAME','MUNI_NAME','MUNI'],land:['LAND_VALUE'],improvement:['BLDG_VALUE'],salePrice:['SALE_PRICE'],saleDate:['SALE_DATE'],saleValidity:['SALE_VALIDITY_CODE'],koz:['FLAG_10_KOZ']};
  function schema(source,meta){
    if(meta.geometryType!=='esriGeometryPolygon')throw Error(source.name+' did not verify as a parcel polygon layer');
    const fields=new Map((meta.fields||[]).map(f=>[f.name.toUpperCase(),f]));
    const id=fields.get(source.id.toUpperCase()),oid=(meta.fields||[]).find(f=>f.type==='esriFieldTypeOID');
    if(!id||!oid)throw Error(source.name+' parcel ID/order fields could not be verified');
    if(!meta.advancedQueryCapabilities?.supportsPagination||!meta.advancedQueryCapabilities?.supportsOrderBy)throw Error(source.name+' does not verify ordered pagination support');
    const mappings=Object.fromEntries(Object.entries(candidates).map(([kind,names])=>[kind,names.map(n=>fields.get(n)).filter(Boolean)]));
    for(const kind of ['acres','year'])mappings[kind]=mappings[kind].filter(f=>/Integer|SmallInteger|Double|Single/.test(f.type));
    const use=mappings.use[0],publishedUseCodes=!!use&&((use.domain?.codedValues?.length||0)>0||(meta.types||[]).some(t=>(t.domains?.[use.name]?.codedValues?.length||0)>0));
    let rendererHadLabels=false;
    // Numeric use codes only acquire meaning from the source's own coded-value domain.
    // Some county domains are attached to subtypes instead of the field itself.
    for(const field of [use,...mappings.city].filter(Boolean)){
      const values=[...(field.domain?.codedValues||[]),...(meta.types||[]).flatMap(t=>t.domains?.[field.name]?.codedValues||[])];
      if(values.length){
        const codes=new Map();for(const v of values){const key=String(v.code),entry=codes.get(key);if(!entry)codes.set(key,{...v});else if(entry.name!==v.name)entry.conflict=true;}
        field.domain={codedValues:[...codes.values()].filter(v=>!v.conflict)};
      }
    }
    // A single-field official renderer can supply the county's published code labels.
    const renderer=meta.drawingInfo?.renderer;
    if(use&&!use.domain?.codedValues?.length&&renderer?.type==='uniqueValue'&&String(renderer.field1).toUpperCase()===use.name.toUpperCase()&&!renderer.field2&&!renderer.field3){
      const values=(renderer.uniqueValueInfos||[]).filter(v=>v.value!=null&&typeof v.label==='string'&&v.label.trim()&&v.label.trim()!==String(v.value).trim()).map(v=>({code:v.value,name:v.label.trim()}));
      rendererHadLabels=values.length>0;
      const codes=new Map();for(const v of values){const k=String(v.code),old=codes.get(k);if(!old)codes.set(k,v);else if(old.name!==v.name)old.conflict=true;}
      if(codes.size)use.domain={codedValues:[...codes.values()].filter(v=>!v.conflict)};
    }
    const useFamilyFallback=!!use&&!publishedUseCodes&&!rendererHadLabels&&!use.domain?.codedValues?.length&&!/DESC|PROPERTY_USE/.test(use.name.toUpperCase())&&!!source.useFamilies?.length;
    const supportsUse=!!use&&(!!use.domain?.codedValues?.length||/DESC|PROPERTY_USE/.test(use.name.toUpperCase())||useFamilyFallback);
    const projected=[id.name,oid.name,...(fields.has(source.parcelField)?[source.parcelField]:[]),...Object.values(mappings).flat().map(f=>f.name)];
    return {...source,id:id.name,idType:id.type,orderField:oid.name,fields:[...new Set(projected)].join(','),mappings,supportsUse,useFamilyFallback,
      date:meta.editingInfo?.lastEditDate?'Source last edit '+new Date(meta.editingInfo.lastEditDate).toISOString():'Source last-edit date not published',verifiedAt:new Date().toISOString()};
  }
  async function prepare(source,{fetcher=globalThis.fetch,signal}={}){
    const response=await fetcher(source.url+'?f=json',{credentials:'omit',mode:'cors',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    if(!response.ok)throw Error(source.name+' unavailable (HTTP '+response.status+'). Pennsylvania coverage could not be verified; no fallback location was searched');
    const meta=await response.json();if(meta.error)throw Error(source.name+' did not return usable layer metadata');return schema(source,meta);
  }
  const category=description=>/VACANT|UNDEVELOPED/i.test(description)?'Vacant':/INDUSTR|WAREHOUS|MANUFACTUR|DISTRIBUTION/i.test(description)?'Industrial':/APART|MULTI.?FAM/i.test(description)?'Multifamily':/COMMERCIAL|RETAIL|OFFICE/i.test(description)?'Commercial':/RESIDENT|SINGLE.?FAM|DWELLING|CONDOMINIUM|MOBILE HOME/i.test(description)?'Residential':'Other';
  function where(source,mode,filter){
    const terms=[],field=source.mappings.acres[0]?.name;
    if(field&&(filter.value>0||filter.op!=='>='))terms.push(filter.op==='between'?`${field} >= ${filter.value} AND ${field} <= ${filter.max}`:`${field} ${filter.op} ${filter.value}`);
    const use=source.mappings.use[0],target={industrial:'Industrial',vacant:'Vacant',multifamily:'Multifamily'}[mode];
    if(target&&source.supportsUse){
      if(source.useFamilyFallback){const fams=modeFamilies(source,mode);terms.push(fams.length?'('+fams.map(f=>/Integer|SmallInteger|Double|Single/.test(use.type)?use.name+" >= "+Number(f.prefix)*100+" AND "+use.name+" < "+(Number(f.prefix)+1)*100:use.name+" LIKE '"+f.prefix+"__'").join(' OR ')+')':'1=0');}
      else if(use.domain?.codedValues?.length){const codes=use.domain.codedValues.filter(v=>category(v.name)===target).map(v=>"'"+String(v.code).replaceAll("'","''")+"'");terms.push(codes.length?use.name+' IN ('+codes.join(',')+')':'1=0');}
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
    const family=source.useFamilyFallback?familyFor(source,raw):null;
    const description=useField?.domain?.codedValues?.length?(useField.domain.codedValues.find(v=>String(v.code)===String(raw))?.name||''):source.useFamilyFallback?(family?family.label+' · code '+String(raw).trim():''):(source.supportsUse?String(raw??''):'');
    const type=family?family.type:category(description);
    const acres=Number(value('acres')),year=Number(value('year'));
    const cityField=source.mappings?.city?.find(f=>a[f.name]!=null),cityRaw=cityField?a[cityField.name]:null;
    const city=cityField?.domain?.codedValues?.find(v=>String(v.code)===String(cityRaw))?.name||(/^[a-z .'-]+$/i.test(String(cityRaw||''))?cityRaw:(cityField&&!cityField.domain?.codedValues?.length?muniName(source,cityRaw):null)||(cityRaw!=null?'Municipality code '+cityRaw+' (name unverified)':''));
    const street=value('address')||[value('number'),...(source.mappings?.street||[]).map(f=>a[f.name])].filter(Boolean).join(' ');
    const address=[String(street||'').trim().replace(/[,\s]+$/,''),city].filter(Boolean).join(', ');
    return {...(cityField&&!cityField.domain?.codedValues?.length&&muniName(source,cityRaw)?{municipalityObservation:{name:muniName(source,cityRaw),sourceURL:source.municipalities.url,sourceName:source.municipalities.source,checkedAt:source.municipalities.checked,caveat:'Municipality name from the supplied county code reference; parcel position against the boundary has not been verified.'}}:{}),address:address?address+', PA':'',acres:Number.isFinite(acres)&&acres>0?acres:null,yearBuilt:Number.isInteger(year)&&year>=1800&&year<=new Date().getFullYear()?year:null,type,use:description||(raw!=null?'County land-use code '+raw+' — meaning unverified':'Assessment classification not published')};
  }
  function createCollector(source,geo){
    const groups=new Map();
    const propertiesKey=a=>JSON.stringify(Object.keys(a).filter(k=>k!==source.orderField).sort().map(k=>[k,a[k]]));
    return {
      add(feature){
        const a=feature.properties||{},raw=a[source.id];if(raw==null||!String(raw).trim())throw Error('County boundary row omitted its parcel identity');
        if(/Integer|Double|Single|OID/.test(source.idType||'')&&(!/^\d+$/.test(String(raw))||!Number.isSafeInteger(Number(raw))))throw Error('County boundary row has an invalid numeric identity');
        if(!['Polygon','MultiPolygon'].includes(feature.geometry?.type))throw Error('County boundary row is not a polygon');
        const key=String(raw),signature=propertiesKey(a),geometryKey=JSON.stringify(feature.geometry),old=groups.get(key);
        if(!old){groups.set(key,{signature,geometries:new Set([geometryKey]),feature:{...feature,radarSourceParts:1}});return;}
        if(old.signature!==signature)throw Error('Conflicting county attributes for parcel '+key+'; acreage and other facts were not combined');
        if(old.geometries.has(geometryKey))return;
        const merged=geo.union(geo.featureCollection([old.feature,feature]));if(!merged?.geometry)throw Error('County boundary pieces could not be combined');
        old.geometries.add(geometryKey);old.feature={...old.feature,geometry:merged.geometry,radarSourceParts:old.geometries.size};
      },
      features:()=>[...groups.values()].map(v=>v.feature)
    };
  }
  function pageWhere(where,source,last){
    if(last==null)return where;
    const field=source.id,value=String(last);
    if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)||!value.trim())throw Error('County parcel paging key unavailable');
    const numeric=/Integer|SmallInteger|Double|Single|OID/.test(source.idType||'');
    if(numeric&&(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))))throw Error('County numeric paging key invalid');
    return '('+where+') AND '+field+' > '+(numeric?value:"'"+value.replaceAll("'","''")+"'");
  }
  return {sources,schema,prepare,attributes,financial,where,pageWhere,createCollector,supportsMode};
});
