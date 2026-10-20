import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Miniflare} from 'miniflare';
let mf,db;
const auth={authorization:'Bearer test-shop','x-shop-id':'mountain-village'};
const admin={...auth,'x-admin-token':'test-admin'};
async function call(path,body,headers=auth){
 const res=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers:{...headers,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:res.status,data:await res.json()};
}
async function ok(path,body,headers=auth){const r=await call(path,body,headers);assert.equal(r.status,200,JSON.stringify(r));return r.data;}
async function create(gearId,status='ACTIVE'){return ok('/api/inventory/create',{gearId,gearType:'Ski',size:'110',status});}
async function open(passId){return (await ok('/api/rentals/new',{passId})).rental;}
async function add(r,gearId){return call('/api/items/add',{rentalId:r.id,passId:r.passId,gearId});}
before(async()=>{
 mf=new Miniflare({modules:true,scriptPath:'worker/worker.js',compatibilityDate:'2026-08-06',d1Databases:['DB'],bindings:{MOUNTAIN_VILLAGE_PIN:'test-shop',CANYONS_VILLAGE_PIN:'test-canyon',ADMIN_TOKEN:'test-admin',SHOP_TIME_ZONE:'America/Denver'}});
 db=await mf.getD1Database('DB');
 // D1 exec expects each line to be a complete statement. Use prepared statements for triggers.
 const schema=await readFile('worker/schema.sql','utf8');
 for(const sql of schema.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim())) await db.prepare(sql).run();
 const migration=(await readFile('worker/migrations/0002_shared_workflows.sql','utf8'))+'\n'+(await readFile('worker/migrations/0003_resorts_shops.sql','utf8'));
 const parts=migration.replace(/--[^\n]*/g,'').match(/\s*(?:CREATE TRIGGER[\s\S]*?\nEND;|[^;]+;)/g);
 for(const sql of parts) await db.prepare(sql.trim()).run();
});
after(async()=>{if(mf)await mf.dispose();});
test('unauthorized clients cannot access records or mutate; shop PIN is not admin',async()=>{
 assert.equal((await call('/api/stats',undefined,{})).status,401);
 assert.equal((await call('/api/admin/records?table=rentals')).status,403);
 assert.equal((await call('/api/export.json')).status,403);
 assert.equal((await call('/api/inventory/create',{gearId:'UNAUTHORIZED'},{})).status,401);
});
test('inventory creation validates dates, types, duplicates, and exact barcode casing',async()=>{
 await create('Ski-001');
 assert.equal((await call('/api/inventory/create',{gearId:'Ski-001'})).status,409);
 assert.equal((await call('/api/inventory/create',{gearId:'BAD',endOfLifeDate:'2026-02-30'})).status,400);
 assert.equal((await call('/api/inventory/create',{gearId:'BAD',status:'OUT'})).status,400);
 assert.equal((await ok('/api/inventory/gear',{gearId:'Ski-001'})).inventory.gearId,'Ski-001');
});
test('mobile checkout, website review, shared due date, partial and final return',async()=>{
 await create('FLOW-A');await create('FLOW-B');const r=await open('PASS-FLOW');
 assert.ok(r.dueDate);assert.equal((await add(r,'FLOW-A')).status,200);assert.equal((await add(r,'FLOW-B')).status,200);
 const repeat=await add(r,'FLOW-A');assert.equal(repeat.data.note,'duplicate_ignored');
 await ok('/api/rentals/finish',{rentalId:r.id,dueDate:'2099-01-01'});
 let detail=await ok('/api/rentals/detail',{rentalId:r.id});assert.equal(detail.items.length,2);assert.equal(detail.rental.dueDate,'2099-01-01');
 assert.equal((await ok('/api/lookup/gear',{gearId:'FLOW-A'})).item.dueDate,'2099-01-01');
 const returned=await ok('/api/return/scan',{code:'FLOW-A'});assert.equal(returned.item.status,'RETURNED');assert.equal(returned.item.size,'110');
 detail=await ok('/api/rentals/detail',{rentalId:r.id});assert.equal(detail.rental.status,'OUT');
 assert.equal((await ok('/api/return/pass',{passId:r.passId})).returned,1);
 detail=await ok('/api/rentals/detail',{rentalId:r.id});assert.equal(detail.rental.status,'CLOSED');assert.ok(detail.rental.closedTime);
 assert.equal((await ok('/api/return/pass',{passId:r.passId})).returned,0);
 assert.equal((await add(r,'FLOW-A')).status,409);
});
test('assignment rejects mismatched pass, missing equipment, service issues and competing rental',async()=>{
 await create('BUSY');await create('REPAIR','REPAIR');const a=await open('A'),b=await open('B');
 assert.equal((await add(a,'BUSY')).status,200);assert.equal((await add(b,'BUSY')).status,409);
 assert.equal((await add(a,'REPAIR')).status,409);assert.equal((await add(a,'MISSING')).status,404);
 assert.equal((await call('/api/items/add',{rentalId:a.id,passId:b.passId,gearId:'Ski-001'})).status,409);
 assert.equal((await call('/api/inventory/upsert',{gearId:'BUSY',status:'REPAIR'})).status,409);
 assert.equal((await call('/api/admin/closeRental',{id:a.id},admin)).status,409);
});
test('concurrent assignment only has one winner and does not silently transfer',async()=>{
 await create('RACE');const a=await open('RACE-A'),b=await open('RACE-B');
 const result=await Promise.all([add(a,'RACE'),add(b,'RACE')]);assert.deepEqual(result.map(x=>x.status).sort(),[200,409]);
 const count=await db.prepare("SELECT COUNT(*) n FROM rental_items WHERE gear_id='RACE' AND status='OUT'").first();assert.equal(count.n,1);
});
test('admin edit and return retain history; overdue computed consistently',async()=>{
 await create('ADMIN');const r=await open('ADMIN-PASS');const added=await add(r,'ADMIN');
 await ok('/api/admin/update',{table:'rentals',id:r.id,record:{dueDate:'2020-01-01',notes:'Historical adjustment'}},admin);
 assert.equal((await ok('/api/rentals/detail',{rentalId:r.id})).rental.overdue,true);
 assert.equal((await ok('/api/lookup/gear',{gearId:'ADMIN'})).item.overdue,true);
 await ok('/api/admin/update',{table:'items',id:added.data.item.id,record:{notes:'Returned at desk'}},admin);
 await ok('/api/admin/returnItem',{id:added.data.item.id},admin);
 const d=await ok('/api/rentals/detail',{rentalId:r.id});assert.equal(d.rental.status,'CLOSED');assert.equal(d.items[0].notes,'Returned at desk');
 const backup=await ok('/api/export.json',undefined,admin);assert.ok(backup.items.some(i=>i.id===added.data.item.id));assert.ok(backup.meta.length);
});
test('pagination reaches records beyond the first page and invalid input is rejected',async()=>{
 for(let n=0;n<55;n++)await create('PAGE-'+String(n).padStart(3,'0'));
 const a=await ok('/api/inventory/search',{q:'PAGE-',limit:50,offset:0});const b=await ok('/api/inventory/search',{q:'PAGE-',limit:50,offset:50});
 assert.equal(a.items.length,50);assert.equal(a.hasMore,true);assert.equal(b.items.length,5);assert.equal(b.hasMore,false);
 assert.equal((await call('/api/inventory/search',{limit:-1})).status,400);
 assert.equal((await call('/api/admin/records?table=sql',undefined,admin)).status,400);
 assert.equal((await call('/api/rentals/new',null)).status,400);
});
test('migration preserves legacy history, fills missing inventory and closes completed rentals',async()=>{
 const legacy=new Miniflare({modules:true,script:'export default {fetch(){return new Response("ok")}}',compatibilityDate:'2026-08-06',d1Databases:['DB']});
 try{
  const old=await legacy.getD1Database('DB');
  const schema=await readFile('worker/schema.sql','utf8');for(const sql of schema.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await old.prepare(sql).run();
  await old.prepare("INSERT INTO rentals VALUES ('legacy','PASS','2025-01-01',NULL,'OUT')").run();
  await old.prepare("INSERT INTO rental_items VALUES ('old-item','legacy','PASS','OLD-SKI','Ski','2025-01-01','2025-01-02','RETURNED')").run();
  const migration=(await readFile('worker/migrations/0002_shared_workflows.sql','utf8'))+'\n'+(await readFile('worker/migrations/0003_resorts_shops.sql','utf8'));for(const sql of migration.replace(/--[^\n]*/g,'').match(/\s*(?:CREATE TRIGGER[\s\S]*?\nEND;|[^;]+;)/g))await old.prepare(sql.trim()).run();
  assert.equal((await old.prepare("SELECT status FROM rentals WHERE rental_id='legacy'").first()).status,'CLOSED');
  assert.equal((await old.prepare("SELECT due_date FROM rentals WHERE rental_id='legacy'").first()).due_date,null);
  assert.equal((await old.prepare("SELECT gear_id FROM inventory WHERE gear_id='OLD-SKI'").first()).gear_id,'OLD-SKI');
  assert.equal((await old.prepare('SELECT COUNT(*) n FROM rental_items').first()).n,1);
 }finally{await legacy.dispose();}
});
test('resort selection, isolated shops, shared pass IDs and controlled equipment transfers',async()=>{
 const canyon={...auth,authorization:'Bearer test-canyon','x-shop-id':'canyons-village'};
 const locations=await ok('/api/locations',undefined,{});
 assert.equal(locations.resorts[0].name,'Park City');assert.equal(locations.shops.length,2);
 assert.equal((await call('/api/stats',undefined,{authorization:'Bearer test-shop'})).status,400);
 assert.equal((await call('/api/stats',undefined,{...auth,'x-shop-id':'fake'})).status,400);
 await create('SHOP-M');
 await ok('/api/inventory/create',{gearId:'SHOP-C',gearType:'Ski'},canyon);
 const m=(await ok('/api/rentals/ensureOpen',{passId:'BOTH-SHOPS'})).rental;
 const c=(await ok('/api/rentals/ensureOpen',{passId:'BOTH-SHOPS'},canyon)).rental;
 assert.notEqual(m.id,c.id);assert.equal(c.shopId,'canyons-village');
 await add(m,'SHOP-M');await ok('/api/items/add',{rentalId:c.id,passId:c.passId,gearId:'SHOP-C'},canyon);
 assert.equal((await call('/api/items/add',{rentalId:m.id,passId:m.passId,gearId:'SHOP-C'})).status,409);
 assert.equal((await call('/api/rentals/detail',{rentalId:m.id},canyon)).status,409);
 assert.equal((await call('/api/rentals/finish',{rentalId:m.id,dueDate:'2099-01-01'},canyon)).status,409);
 assert.equal((await call('/api/return/scan',{code:'SHOP-M'},canyon)).status,409);
 assert.equal((await ok('/api/inventory/search',{q:'SHOP-'},canyon)).items.length,1);
 assert.equal((await ok('/api/stats',undefined,canyon)).totalOut,1);
 assert.equal((await call('/api/admin/update',{table:'inventory',record:{gearId:'SHOP-M',shopId:'canyons-village'}},admin)).status,409);
 assert.equal((await ok('/api/return/pass',{passId:'BOTH-SHOPS'},canyon)).returned,1);
 assert.equal((await ok('/api/rentals/detail',{rentalId:m.id})).rental.status,'OUT');
 assert.equal((await call('/api/inventory/upsert',{gearId:'SHOP-M',shopId:'canyons-village'})).status,403);
 await ok('/api/return/scan',{code:'SHOP-M'});
 const moved=await ok('/api/admin/update',{table:'inventory',record:{gearId:'SHOP-M',shopId:'canyons-village'}},admin);
 assert.equal(moved.record.shopName,'Canyons Village');
 assert.equal((await ok('/api/inventory/search',{q:'SHOP-'})).items.length,0);
 assert.equal((await ok('/api/inventory/search',{q:'SHOP-'},canyon)).items.length,2);
 assert.equal((await ok('/api/rentals/detail',{rentalId:m.id})).rental.shopId,'mountain-village');
});

test('each shop authenticates only its own PIN, including administrator requests',async()=>{
 assert.equal((await call('/api/health',undefined,{...auth,'x-shop-id':'canyons-village'})).status,401);
 assert.equal((await call('/api/health',undefined,{...auth,authorization:'Bearer test-canyon'})).status,401);
 assert.equal((await call('/api/health',undefined,{...auth,authorization:'Bearer test-canyon','x-shop-id':'canyons-village'})).status,200);
 assert.equal((await call('/api/admin/records?table=inventory',undefined,{...admin,'x-shop-id':'canyons-village'})).status,401);
 assert.equal((await call('/api/admin/records?table=inventory',undefined,{...admin,authorization:'Bearer test-canyon','x-shop-id':'canyons-village'})).status,200);
});
test('administrator deletion blocks outstanding equipment and preserves inventory rental history',async()=>{
 await create('DELETE-ME');const r=await open('DELETE-PASS');await add(r,'DELETE-ME');
 const item=(await ok('/api/rentals/detail',{rentalId:r.id})).items[0];
 assert.equal((await call('/api/admin/delete',{table:'inventory',id:'DELETE-ME'})).status,403);
 for(const [table,id] of [['inventory','DELETE-ME'],['items',item.id],['rentals',r.id]])assert.equal((await call('/api/admin/delete',{table,id},admin)).status,409);
 assert.equal((await call('/api/admin/delete',{table:'meta',id:'last_action'},admin)).status,400);
 await ok('/api/return/scan',{code:'DELETE-ME'});
 await ok('/api/admin/delete',{table:'inventory',id:'DELETE-ME'},admin);
 assert.equal((await ok('/api/rentals/detail',{rentalId:r.id})).items.length,1);
 await ok('/api/admin/delete',{table:'items',id:item.id},admin);
 await ok('/api/admin/delete',{table:'rentals',id:r.id},admin);
 assert.equal((await call('/api/rentals/detail',{rentalId:r.id})).status,404);
 assert.equal((await call('/api/admin/delete',{table:'inventory',id:'DELETE-ME'},admin)).status,409);
 await create('DELETE-CASCADE');const second=await open('DELETE-CASCADE-PASS');await add(second,'DELETE-CASCADE');await ok('/api/return/scan',{code:'DELETE-CASCADE'});
 await ok('/api/admin/delete',{table:'rentals',id:second.id},admin);
 assert.equal((await db.prepare('SELECT count(*) AS n FROM rental_items WHERE rental_id=?').bind(second.id).first()).n,0);
});
