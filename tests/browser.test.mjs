import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {chromium} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
test('browser checkout, persisted due date, return, inventory/admin, individual and multipage labels', {timeout:90000}, async()=>{
 let mf,browser,server;
 try{
 mf=new Miniflare({modules:true,scriptPath:'worker/worker.js',compatibilityDate:'2026-08-06',d1Databases:['DB'],bindings:{MOUNTAIN_VILLAGE_PIN:'browser-shop',CANYONS_VILLAGE_PIN:'browser-shop',ADMIN_TOKEN:'browser-admin'}});
 const db=await mf.getD1Database('DB');
 const schema=await readFile('worker/schema.sql','utf8');for(const sql of schema.replace(/--[^\n]*/g,'').split(';').filter(s=>s.trim()))await db.prepare(sql).run();
 const migration=(await readFile('worker/migrations/0002_shared_workflows.sql','utf8'))+'\n'+(await readFile('worker/migrations/0003_resorts_shops.sql','utf8'));for(const sql of migration.replace(/--[^\n]*/g,'').match(/\s*(?:CREATE TRIGGER[\s\S]*?\nEND;|[^;]+;)/g))await db.prepare(sql.trim()).run();
 server=createServer(async(req,res)=>{
  try{
   if(req.url.startsWith('/api/')){let body='';for await(const c of req)body+=c;const r=await mf.dispatchFetch('http://localhost'+req.url,{method:req.method,headers:req.headers,body:body||undefined});res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));}
   else {const path=resolve('site','.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(resolve('site')+'/'))throw new Error('Bad path');res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(path)]||'text/plain');res.end(await readFile(path));}
  }catch(e){res.writeHead(500);res.end(String(e));}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.getByRole('button',{name:'Park City',exact:true}).click();await page.getByRole('button',{name:'Mountain Village',exact:true}).click();await page.locator('#pinInput').fill('browser-shop');await page.locator('#pinGo').click();await page.locator('#pinModal').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Inventory & labels',exact:true}).click();
 await page.locator('#inventoryForm [name=gearId]').fill('SKI-TEST-001');await page.locator('#inventoryForm [name=size]').fill('110 cm');await page.getByRole('button',{name:'Create item',exact:true}).click();
 await page.locator('#inventoryRows .item').first().waitFor();
 await page.getByRole('button',{name:'Print label',exact:true}).click();
 const frame=page.frameLocator('#labelPreview');await frame.locator('svg').waitFor();assert.equal(await frame.locator('.sheet').count(),1);assert.equal(await frame.locator('.label strong').textContent(),'SKI-TEST-001');
 await frame.getByRole('button',{name:'Close preview'}).click();
 for(let n=2;n<=31;n++)await db.prepare("INSERT INTO inventory(gear_id,gear_type,status,shop_id) VALUES(?,'Ski','ACTIVE','mountain-village')").bind('SKI-TEST-'+String(n).padStart(3,'0')).run();
 await page.locator('#inventorySearch').click();await page.locator('#inventoryRows .item').nth(30).waitFor();
 await page.locator('#inventoryQuery').fill('SKI-TEST-015');await page.locator('#inventoryFeedback').getByText('Showing 1 items',{exact:false}).waitFor();assert.equal(await page.locator('#inventoryRows .item').count(),1);
 await page.locator('#inventoryQuery').fill('NOT-A-BARCODE');await page.locator('#inventoryFeedback').getByText('No matches',{exact:false}).waitFor();assert.equal(await page.locator('#inventoryRows .item').count(),0);
 await page.locator('#clearInventorySearch').click();await page.locator('#inventoryRows .item').nth(30).waitFor();
 await page.locator('#selectPage').click();await page.locator('#printSelected').click();
 assert.equal(await page.frameLocator('#labelPreview').locator('.sheet').count(),2);assert.equal(await page.frameLocator('#labelPreview').locator('svg').count(),31);
 const codes=await page.frameLocator('#labelPreview').locator('.label strong').allTextContents();assert.equal(new Set(codes).size,31);
 await mkdir('test-results',{recursive:true});await page.locator('#labelPreview').screenshot({path:'test-results/labels.png'});
 await page.frameLocator('#labelPreview').getByRole('button',{name:'Close preview'}).click();
 await page.getByRole('button',{name:'Check Out',exact:true}).click();await page.locator('#coPass').fill('PASS-BROWSER');await page.locator('#coPass').press('Enter');await page.locator('#coGear').waitFor({state:'visible'});await page.waitForFunction(()=>!document.getElementById('coGear').disabled);assert.equal(await page.locator('#modal').isVisible(),false);
 await page.locator('#coGear').fill('SKI-TEST-001');await page.locator('#coGear').press('Enter');await page.locator('#modalYes').click();await page.locator('#tab-added.active').waitFor();await page.locator('#addedDone').click();await page.locator('#reviewDue').fill('2099-02-01');await page.locator('#finishRental').click();await page.locator('#tab-checkout.active').waitFor();
 let row=await db.prepare("SELECT * FROM rentals WHERE pass_id='PASS-BROWSER'").first();assert.equal(row.due_date,'2099-02-01');
 await page.getByRole('button',{name:'Database',exact:true}).click();await page.locator('#adminKey').fill('browser-admin');await page.getByRole('button',{name:'Unlock database'}).click();await page.locator('#adminContent').waitFor({state:'visible'});
 await page.locator('#adminRecords').getByRole('button',{name:'Edit',exact:true}).first().click();await page.locator('#recordFields [name=notes]').fill('Checked in browser');await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.locator('#recordEditor').waitFor({state:'hidden'});
 assert.equal((await db.prepare("SELECT notes FROM inventory WHERE gear_id='SKI-TEST-001'").first()).notes,'Checked in browser');
 await page.locator('#adminTable').selectOption('rentals');await page.locator('#adminRecords').getByText('2099-02-01',{exact:true}).waitFor();await page.screenshot({path:'test-results/database.png',fullPage:true});
 await page.getByRole('button',{name:'Return',exact:true}).click();await page.locator('#reScan').fill('SKI-TEST-001');await page.locator('#reScan').press('Enter');await page.locator('#reResult').getByText('RETURNED',{exact:true}).waitFor();
 row=await db.prepare("SELECT * FROM rentals WHERE pass_id='PASS-BROWSER'").first();assert.equal(row.status,'CLOSED');
 await page.getByRole('button',{name:'Change shop',exact:true}).click();
 await page.getByRole('button',{name:'Park City',exact:true}).click();await page.getByRole('button',{name:'Canyons Village',exact:true}).click();
 await page.locator('#pinModal').waitFor({state:'visible'});assert.equal(await page.locator('#pinInput').inputValue(),'');
 await page.locator('#pinInput').fill('browser-shop');await page.locator('#pinGo').click();await page.locator('#pinModal').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Inventory & labels',exact:true}).click();
 await page.locator('#inventorySearch').click();await page.waitForTimeout(300);assert.equal(await page.locator('#inventoryRows .item').count(),0);
 await page.locator('#inventoryForm [name=gearId]').fill('CANYON-BROWSER');await page.getByRole('button',{name:'Create item',exact:true}).click();await page.locator('#inventoryRows .item').first().waitFor();
 assert.equal((await db.prepare("SELECT shop_id FROM inventory WHERE gear_id='CANYON-BROWSER'").first()).shop_id,'canyons-village');
 await page.getByRole('button',{name:'Database',exact:true}).click();await page.locator('#adminKey').fill('browser-admin');await page.getByRole('button',{name:'Unlock database'}).click();await page.locator('#adminContent').waitFor({state:'visible'});
 const deleteRow=page.locator('#adminRecords tr').filter({hasText:'CANYON-BROWSER'});
 await deleteRow.getByRole('button',{name:'Delete',exact:true}).click();await page.locator('#modalNo').click();assert.ok(await db.prepare("SELECT 1 FROM inventory WHERE gear_id='CANYON-BROWSER'").first());
 await deleteRow.getByRole('button',{name:'Delete',exact:true}).click();await page.locator('#modalYes').click();await deleteRow.waitFor({state:'detached'});
 assert.equal(await db.prepare("SELECT 1 FROM inventory WHERE gear_id='CANYON-BROWSER'").first(),null);
 assert.deepEqual(errors,[]);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Inventory & labels',exact:true}).click();await page.screenshot({path:'test-results/mobile-web.png',fullPage:true});
 }finally{if(browser)await browser.close();if(server)await new Promise(r=>server.close(r));if(mf)await mf.dispose();}
});
