import { chromium } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto('https://rentals.jd2012.work/',{waitUntil:'domcontentloaded',timeout:45000});
 console.log('Website',response.status(),await page.title());
 await page.getByRole('button',{name:'Park City',exact:true}).click();
 await page.getByRole('button',{name:'Canyons Village',exact:true}).click();
 await page.locator('#pinInput').waitFor({timeout:15000});
 const checks=await page.evaluate(async()=>{
  const result=[];
  for(const path of ['/api/health','/api/stats']){const r=await fetch(path);result.push({path,status:r.status,body:await r.text()});}
  return result;
 });console.log(JSON.stringify(checks));
 for(const [url,file] of [['/app.js?v=12','site/app.js'],['/labels.js','site/labels.js'],['/vendor/JsBarcode.all.min.js','site/vendor/JsBarcode.all.min.js']]){
  const content=await page.evaluate(async p=>await (await fetch(p)).text(),url);
  const match=createHash('sha256').update(content).digest('hex')===createHash('sha256').update(await readFile(file)).digest('hex');
  console.log('Asset',url,'matches release',match);if(!match)throw new Error('Asset mismatch');
 }
 await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/live-login.png',fullPage:true});
 console.log('Browser errors',JSON.stringify(errors));
 if(checks[0].status!==200 || checks[1].status!==401 || errors.length)throw new Error('Live checks failed');
}finally{await browser.close();}
