/** Shared API for the website and Expo apps. Existing text IDs and status values remain stable. */
class ApiError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
const statuses = ['ACTIVE','REPAIR','RETIRED','LOST'];
const types = ['Ski','Snowboard','Boot','Pole','Helmet','Other'];
function str(value, name, max=120, required=true) {
  if (value != null && typeof value !== 'string') throw new ApiError(`${name} must be text.`);
  const result=(value || '').trim();
  if ((required && !result) || result.length>max) throw new ApiError(`Invalid ${name}.`);
  return result;
}
function date(value, name, required=false) {
  const s=str(value,name,10,required);
  if (s && (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(Date.parse(s)) || new Date(s).toISOString().slice(0,10)!==s)) throw new ApiError(`Invalid ${name}. Use YYYY-MM-DD.`);
  return s || null;
}
function today(env) { return new Intl.DateTimeFormat('en-CA',{timeZone:env.SHOP_TIME_ZONE || 'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
function tomorrow(env) { const d=new Date(today(env)+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+1); return d.toISOString().slice(0,10); }
async function equalSecret(a,b) {
  const enc=new TextEncoder();
  const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',enc.encode(a)),crypto.subtle.digest('SHA-256',enc.encode(b))]);
  return crypto.subtle.timingSafeEqual(x,y);
}
async function auth(req,env,admin=false) {
  const token=(req.headers.get(admin?'x-admin-token':'authorization') || '').replace(/^Bearer\s+/i,'').trim();
  if (!token) throw new ApiError(admin?'Administrator access required.':'PIN rejected.',admin?403:401);
  const shopKeys={'mountain-village':'MOUNTAIN_VILLAGE_PIN','canyons-village':'CANYONS_VILLAGE_PIN'};
  const binding=shopKeys[req.headers.get('x-shop-id')];
  if(!admin && !binding) throw new ApiError('Select your resort and shop before continuing.');
  const key=admin ? env.ADMIN_TOKEN : env[binding];
  if (!key) throw new ApiError(admin?'Administrator access is not configured.':'Shop access is not configured.',503);
  if (!await equalSecret(token,key)) throw new ApiError(admin?'Administrator access required.':'PIN rejected.',admin?403:401);
}
const inventorySelect=`SELECT gear_id AS gearId,gear_type AS gearType,size,size AS gearSize,end_of_life_date AS endOfLifeDate,end_of_life_date AS eolDate,status,notes,shop_id AS shopId,(SELECT name FROM shops WHERE shop_id=inventory.shop_id) AS shopName,updated_at AS updatedAt FROM inventory`;
const rentalSelect=`SELECT rental_id AS id,rental_id AS rentalId,pass_id AS passId,out_time AS outTime,closed_time AS closedTime,status,due_date AS dueDate,notes,shop_id AS shopId,(SELECT name FROM shops WHERE shop_id=rentals.shop_id) AS shopName FROM rentals`;
const itemSelect=`SELECT i.item_id AS id,i.item_id AS itemId,i.rental_id AS rentalId,i.pass_id AS passId,i.gear_id AS gearId,COALESCE(v.gear_type,i.gear_type) AS gearType,v.size,v.size AS gearSize,v.end_of_life_date AS endOfLifeDate,v.status AS equipmentStatus,i.out_time AS outTime,i.return_time AS returnTime,i.status,i.notes,r.shop_id AS shopId,(SELECT name FROM shops WHERE shop_id=r.shop_id) AS shopName,r.due_date AS dueDate FROM rental_items i JOIN rentals r ON r.rental_id=i.rental_id LEFT JOIN inventory v ON v.gear_id=i.gear_id`;
async function rows(env,sql,...args) { return (await env.DB.prepare(sql).bind(...args).all()).results || []; }
async function first(env,sql,...args) { return env.DB.prepare(sql).bind(...args).first(); }
function statement(env,sql,...args) { return env.DB.prepare(sql).bind(...args); }
function overdue(row,env) { return {...row,overdue:row.status==='OUT' && !!row.dueDate && row.dueDate<today(env)}; }
async function items(env,where,...args) { return (await rows(env,itemSelect+' WHERE ('+where+')'+(env.SHOP_ID?' AND r.shop_id=?':'')+' ORDER BY i.out_time DESC,i.item_id',...args,...(env.SHOP_ID?[env.SHOP_ID]:[]))).map(r=>overdue(r,env)); }
function action(env,message) { return statement(env,"INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",env.SHOP_ID?'last_action:'+env.SHOP_ID:'last_action',message); }
async function rental(env,id) { const r=await first(env,rentalSelect+' WHERE rental_id=?',id); if(!r) throw new ApiError('Rental not found.',404); if(env.SHOP_ID && r.shopId!==env.SHOP_ID) throw new ApiError('Rental belongs to '+r.shopName+'. Switch shops to continue.',409); return overdue(r,env); }
async function inventory(env,id) { const v=await first(env,inventorySelect+' WHERE gear_id=?',id); if(v && env.SHOP_ID && v.shopId!==env.SHOP_ID) throw new ApiError('Equipment belongs to '+v.shopName+'. Switch shops to continue.',409); return v; }
function validateInventory(b) {
  const gearId=str(b.gearId,'gearId');
  const gearType=str(b.gearType || 'Other','gearType');
  const status=str(b.status || 'ACTIVE','status');
  if (!types.includes(gearType) || !statuses.includes(status)) throw new ApiError('Invalid equipment type or service status.');
  return {gearId,gearType,size:str(b.size ?? b.gearSize,'size',80,false),endOfLifeDate:date(b.endOfLifeDate ?? b.eolDate,'endOfLifeDate'),status,notes:str(b.notes,'notes',4000,false)};
}
async function saveInventory(env,b,createOnly=false) {
  const v=validateInventory(b);
  const old=await inventory(env,v.gearId);
  const shopId=env.SHOP_ID || b.shopId || old?.shopId;
  if(!shopId || !await first(env,'SELECT 1 FROM shops WHERE shop_id=?',shopId)) throw new ApiError('Select a valid shop.');
  if(env.SHOP_ID && b.shopId && b.shopId!==env.SHOP_ID) throw new ApiError('Only administrators can move equipment between shops.',403);
  if (createOnly && old) throw new ApiError('This inventory barcode already exists.',409);
  await statement(env,`INSERT INTO inventory(gear_id,gear_type,size,end_of_life_date,status,notes,updated_at,shop_id) VALUES(?,?,?,?,?,?,?,?) ${createOnly?'':`ON CONFLICT(gear_id) DO UPDATE SET gear_type=excluded.gear_type,size=excluded.size,end_of_life_date=excluded.end_of_life_date,status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at,shop_id=excluded.shop_id ${env.SHOP_ID?'WHERE inventory.shop_id=excluded.shop_id':''}`}`,
    v.gearId,v.gearType,v.size,v.endOfLifeDate,v.status,b.notes===undefined?(old?.notes || ''):v.notes,new Date().toISOString(),shopId).run();
  return inventory(env,v.gearId);
}
function integer(v,fallback,max) { const n=v==null?fallback:Number(v); if(!Number.isInteger(n)||n<0||n>max) throw new ApiError('Invalid pagination.'); return n; }
async function api(req,env,path,b) {
  if(path==='/api/health') { if(req.headers.has('authorization')) await auth(req,env); return {ok:true}; }
  if(path==='/api/locations') return {resorts:await rows(env,'SELECT resort_id AS id,name FROM resorts'),shops:await rows(env,'SELECT shop_id AS id,resort_id AS resortId,name FROM shops ORDER BY name DESC')};
  await auth(req,env);
  if(path.startsWith('/api/admin/')) await auth(req,env,true);
  if(!path.startsWith('/api/admin/') && !path.startsWith('/api/export')) {
    const shopId=req.headers.get('x-shop-id');
    if(!shopId || !await first(env,'SELECT 1 FROM shops WHERE shop_id=?',shopId)) throw new ApiError('Select your resort and shop before continuing.');
    env={...env,SHOP_ID:shopId};
  }
  const post=()=>{if(req.method!=='POST') throw new ApiError('POST required.',405);};
  if(path==='/api/stats') {
    const counts=await first(env,`SELECT (SELECT COUNT(*) FROM rental_items i JOIN rentals r ON r.rental_id=i.rental_id WHERE i.status='OUT' AND r.shop_id=?) AS totalOut,(SELECT COUNT(*) FROM rentals WHERE status='OUT' AND shop_id=?) AS openRentals,(SELECT value FROM meta WHERE key=?) AS lastAction`,env.SHOP_ID,env.SHOP_ID,'last_action:'+env.SHOP_ID);
    return {...counts,recentOut:(await rows(env,itemSelect+" WHERE i.status='OUT' AND r.shop_id=? ORDER BY i.out_time DESC LIMIT 10",env.SHOP_ID)).map(r=>overdue(r,env))};
  }
  if(['/api/export.json','/api/export/json','/api/export.csv','/api/export'].includes(path)) {
    await auth(req,env,true);
    const result=await env.DB.batch([statement(env,rentalSelect),statement(env,itemSelect),statement(env,inventorySelect),statement(env,'SELECT key,value FROM meta')]);
    return {exportedAt:new Date().toISOString(),rentals:result[0].results,items:result[1].results,inventory:result[2].results,meta:result[3].results};
  }
  if(path==='/api/admin/records') {
    const table=new URL(req.url).searchParams.get('table');
    const queries={inventory:inventorySelect,rentals:rentalSelect,items:itemSelect,meta:'SELECT key,value FROM meta'};
    if(!queries[table]) throw new ApiError('Unknown table.');
    const url=new URL(req.url); const offset=integer(url.searchParams.get('offset'),0,10000000); const limit=integer(url.searchParams.get('limit'),50,200)||50;
    const records=await rows(env,queries[table]+` ORDER BY 1 LIMIT ? OFFSET ?`,limit+1,offset);
    return {records:records.slice(0,limit).map(r=>overdue(r,env)),hasMore:records.length>limit,offset};
  }
  if(path==='/api/admin/update') {
    post(); const table=b.table;
    if(table==='inventory') return {record:await saveInventory(env,b.record)};
    const id=str(b.id,'id'); const notes=str(b.record?.notes,'notes',4000,false);
    if(table==='rentals') {
      const r=await rental(env,id); const dueDate=date(b.record?.dueDate,'dueDate');
      // Assignment identity and status are changed only through checkout/return operations.
      await statement(env,'UPDATE rentals SET due_date=?,notes=? WHERE rental_id=?',dueDate,notes,r.id).run();
      return {record:await rental(env,id)};
    }
    if(table==='items') {
      const i=await first(env,itemSelect+' WHERE i.item_id=?',id); if(!i) throw new ApiError('Item not found.',404);
      await statement(env,'UPDATE rental_items SET notes=? WHERE item_id=?',notes,id).run();
      return {ok:true};
    }
    if(table==='meta') { if(!['last_action','last_action:mountain-village','last_action:canyons-village'].includes(id)) throw new ApiError('Unknown metadata key.'); await statement(env,'UPDATE meta SET value=? WHERE key=?',str(b.record?.value,'value',500,false),id).run(); return {ok:true}; }
    throw new ApiError('Unknown table.');
  }
  if(path==='/api/admin/delete') {
    post(); const id=str(b.id,'id');
    const queries={
      inventory:"DELETE FROM inventory WHERE gear_id=? AND NOT EXISTS(SELECT 1 FROM rental_items WHERE gear_id=inventory.gear_id AND status='OUT') RETURNING gear_id",
      items:"DELETE FROM rental_items WHERE item_id=? AND status='RETURNED' RETURNING item_id",
      rentals:"DELETE FROM rentals WHERE rental_id=? AND NOT EXISTS(SELECT 1 FROM rental_items WHERE rental_id=rentals.rental_id AND status='OUT') RETURNING rental_id"
    };
    if(!Object.hasOwn(queries,b.table)) throw new ApiError('This record type cannot be deleted.');
    const result=await env.DB.batch([statement(env,queries[b.table],id)]);
    if(!result[0].results.length) throw new ApiError('Record was not found or still has equipment checked out. Return outstanding equipment before deleting.',409);
    return {ok:true,deleted:1};
  }
  if(path==='/api/admin/returnItem') {
    post(); const id=str(b.id,'id'); const now=new Date().toISOString();
    const result=await env.DB.batch([statement(env,"UPDATE rental_items SET status='RETURNED',return_time=? WHERE item_id=? AND status='OUT' RETURNING item_id",now,id),action(env,'Administrator returned item '+id)]);
    return {returned:result[0].results.length};
  }
  if(path==='/api/admin/closeRental') {
    post(); const id=str(b.id,'id'); await rental(env,id);
    await statement(env,"UPDATE rentals SET status='CLOSED',closed_time=? WHERE rental_id=? AND status='OUT'",new Date().toISOString(),id).run(); return {rental:await rental(env,id)};
  }
  if(path==='/api/inventory/search') {
    post(); const q='%'+str(b.q,'query',120,false)+'%'; const limit=integer(b.limit,50,200)||50; const offset=integer(b.offset,0,10000000);
    const result=await rows(env,inventorySelect+' WHERE shop_id=? AND (gear_id LIKE ? OR gear_type LIKE ? OR size LIKE ?) ORDER BY gear_id LIMIT ? OFFSET ?',env.SHOP_ID,q,q,q,limit+1,offset);
    return {items:result.slice(0,limit),hasMore:result.length>limit};
  }
  if(['/api/inventory/gear','/api/inventory/get'].includes(path)) { post(); const gearId=str(b.gearId,'gearId'); const v=await inventory(env,gearId); return {inventory:v,item:v}; }
  if(['/api/inventory/upsert','/api/inventory/create'].includes(path)) { post(); const v=await saveInventory(env,b,path.endsWith('/create')); return {ok:true,...v,item:v,inventory:v}; }
  if(['/api/rentals/ensureOpen','/api/rentals/new'].includes(path)) {
    post(); const passId=str(b.passId,'passId');
    if(path.endsWith('ensureOpen')) { const r=await first(env,rentalSelect+" WHERE pass_id=? AND shop_id=? AND status='OUT' ORDER BY out_time DESC LIMIT 1",passId,env.SHOP_ID); if(r) return {rental:overdue(r,env)}; }
    const id='r_'+crypto.randomUUID(); const now=new Date().toISOString();
    await env.DB.batch([statement(env,"INSERT INTO rentals(rental_id,pass_id,out_time,status,due_date,shop_id) VALUES(?,?,?,'OUT',?,?)",id,passId,now,tomorrow(env),env.SHOP_ID),action(env,'Opened rental for pass '+passId)]);
    return {rental:await rental(env,id)};
  }
  if(path==='/api/rentals/open') { post(); const result=await rows(env,rentalSelect+" WHERE pass_id=? AND shop_id=? AND status='OUT' ORDER BY out_time DESC",str(b.passId,'passId'),env.SHOP_ID); return {rentals:result.map(r=>overdue(r,env))}; }
  if(path==='/api/rentals/detail') { post(); const r=await rental(env,str(b.rentalId,'rentalId')); return {rental:r,items:await items(env,'i.rental_id=?',r.id)}; }
  if(path==='/api/rentals/finish') {
    post(); const id=str(b.rentalId,'rentalId'); await rental(env,id); const dueDate=date(b.dueDate,'dueDate',true); if(dueDate<today(env)) throw new ApiError('Due date cannot be before today.');
    const result=await statement(env,"UPDATE rentals SET due_date=? WHERE rental_id=? AND status='OUT' AND EXISTS(SELECT 1 FROM rental_items WHERE rental_id=? AND status='OUT')",dueDate,id,id).run();
    if(!result.meta.changes) throw new ApiError('Rental must be open with at least one outstanding item.',409);
    return {rental:await rental(env,id)};
  }
  if(path==='/api/items/outByRental') { post(); await rental(env,str(b.rentalId,'rentalId')); return {items:await items(env,"i.rental_id=? AND i.status='OUT'",str(b.rentalId,'rentalId'))}; }
  if(path==='/api/items/add') {
    post(); const id=str(b.rentalId,'rentalId'),passId=str(b.passId,'passId'),gearId=str(b.gearId,'gearId');
    const r=await rental(env,id); if(r.status!=='OUT'||r.passId!==passId) throw new ApiError('Rental is closed or pass does not match.',409);
    const inv=await inventory(env,gearId); if(!inv) throw new ApiError('Register this equipment in inventory before checkout.',404);
    if(inv.status!=='ACTIVE') throw new ApiError(`Equipment is ${inv.status}.`,409);
    const existing=await first(env,itemSelect+" WHERE i.gear_id=? AND i.status='OUT'",gearId);
    if(existing) { if(existing.rentalId===id) return {ok:true,note:'duplicate_ignored',item:existing,inventory:inv}; throw new ApiError('Equipment is already assigned. Return it before checking it out again.',409); }
    const itemId='i_'+crypto.randomUUID();
    await env.DB.batch([statement(env,"INSERT INTO rental_items(item_id,rental_id,pass_id,gear_id,gear_type,out_time,status) VALUES(?,?,?,?,?,?,'OUT')",itemId,id,passId,gearId,inv.gearType,new Date().toISOString()),action(env,'Checked OUT '+gearId+' to pass '+passId)]);
    return {ok:true,inventory:inv,item:(await items(env,'i.item_id=?',itemId))[0]};
  }
  if(path==='/api/lookup/gear') { post(); const id=str(b.gearId,'gearId'); return {item:(await items(env,"i.gear_id=? AND i.status='OUT'",id))[0]||null,inventory:await inventory(env,id)}; }
  if(path==='/api/lookup/pass') { post(); return {items:await items(env,"i.pass_id=? AND i.status='OUT'",str(b.passId,'passId'))}; }
  if(path==='/api/return/scan') {
    post(); const code=str(b.code,'code'); await inventory(env,code); const i=(await items(env,"i.gear_id=? AND i.status='OUT'",code))[0];
    if(i) {
      const now=new Date().toISOString(); const result=await env.DB.batch([statement(env,"UPDATE rental_items SET status='RETURNED',return_time=? WHERE item_id=? AND status='OUT'",now,i.id),action(env,'Returned '+code)]);
      if(!result[0].meta.changes) return {kind:'none',message:'already_returned'};
      return {kind:'gear',message:'returned',item:{...i,status:'RETURNED',returnTime:now,overdue:false}};
    }
    const found=await items(env,"i.pass_id=? AND i.status='OUT'",code);
    if(found.length || await first(env,'SELECT 1 FROM rentals WHERE pass_id=? AND shop_id=?',code,env.SHOP_ID)) return {kind:'pass',passId:code,items:found};
    return {kind:'none',message:'not_found'};
  }
  if(path==='/api/return/pass') {
    post(); const passId=str(b.passId,'passId'),now=new Date().toISOString();
    const result=await env.DB.batch([statement(env,"UPDATE rental_items SET status='RETURNED',return_time=? WHERE pass_id=? AND status='OUT' AND rental_id IN (SELECT rental_id FROM rentals WHERE shop_id=?) RETURNING item_id",now,passId,env.SHOP_ID),statement(env,"UPDATE rentals SET status='CLOSED',closed_time=? WHERE pass_id=? AND shop_id=? AND status='OUT' AND NOT EXISTS(SELECT 1 FROM rental_items i WHERE i.rental_id=rentals.rental_id AND i.status='OUT')",now,passId,env.SHOP_ID),action(env,'Returned all items for pass '+passId)]);
    return {ok:true,returned:result[0].results.length};
  }
  throw new ApiError('Not found.',404);
}
function csvCell(v) { let s=String(v??''); if(/^[=+@\-\t\r]/.test(s)) s="'"+s; return '"'+s.replaceAll('"','""')+'"'; }
export default {
  async fetch(req,env) {
    const url=new URL(req.url);
    if(!url.pathname.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Not found',{status:404});
    const origin=req.headers.get('origin');
    const allowed=(env.ALLOWED_ORIGINS || 'https://rentals.jd2012.work').split(',').map(s=>s.trim());
    const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','vary':'Origin'};
    if(origin && (origin===url.origin || allowed.includes(origin))) Object.assign(headers,{'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization,x-admin-token,x-shop-id'});
    if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
    try {
      if(!['GET','POST'].includes(req.method)) throw new ApiError('Method not allowed.',405);
      let b={};
      if(req.method==='POST') {
        const raw=await req.text(); if(raw.length>32768) throw new ApiError('Request too large.',413);
        try { b=JSON.parse(raw); } catch { throw new ApiError('Invalid JSON.'); }
        if(!b || Array.isArray(b) || typeof b!=='object') throw new ApiError('JSON object required.');
      }
      const data=await api(req,env,url.pathname,b);
      if(['/api/export.csv','/api/export'].includes(url.pathname)) {
        const cols=['itemId','rentalId','passId','gearId','gearType','outTime','returnTime','status','dueDate','shopId','shopName','notes'];
        headers['content-type']='text/csv; charset=utf-8'; headers['content-disposition']='attachment; filename="rental-items.csv"';
        return new Response([cols.join(','),...data.items.map(r=>cols.map(c=>csvCell(r[c])).join(','))].join('\r\n'),{headers});
      }
      return new Response(JSON.stringify(data),{headers});
    } catch(e) {
      const conflict=/Equipment belongs to another shop|UNIQUE constraint|Rental is closed|Equipment is not active|Return equipment|Return outstanding/.test(e.message);
      const status=e instanceof ApiError?e.status:conflict?409:500;
      if(status===500) console.error(JSON.stringify({event:'api_failure',path:url.pathname}));
      return new Response(JSON.stringify({error:status===500?'The operation could not be completed.':conflict?'Record conflict: refresh and verify equipment assignment.':e.message}),{status,headers});
    }
  }
};
