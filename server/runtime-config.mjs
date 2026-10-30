import path from 'node:path';
/** Test deployments may be ephemeral. Production must explicitly declare persistent storage. */
export function databasePath(env,root){
 const file=env.RADAR_DB_PATH||path.join(root,'.radar/research.sqlite');
 if(env.NODE_ENV==='production'){
  const normalized=path.resolve(file);
  if(env.RADAR_STORAGE_PERSISTENT!=='true'||!env.RADAR_DB_PATH||file===':memory:'||normalized==='/tmp'||normalized.startsWith('/tmp/')||normalized==='/var/tmp'||normalized.startsWith('/var/tmp/'))throw Error('Production requires an explicitly configured persistent database path and RADAR_STORAGE_PERSISTENT=true. Attach persistent storage before starting.');
 }
 return file;
}
