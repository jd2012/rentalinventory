import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const pins=JSON.parse(await readFile('backups/shop-pins.json','utf8'));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 for(const [id,name,key] of [['mountain-village','Mountain Village','MOUNTAIN_VILLAGE_PIN'],['canyons-village','Canyons Village','CANYONS_VILLAGE_PIN']]) {
  const context=await browser.newContext();const page=await context.newPage();
  await page.goto('https://rentals.jd2012.work/');
  await page.getByRole('button',{name:'Park City',exact:true}).click();
  await page.getByRole('button',{name,exact:true}).click();
  await page.locator('#pinInput').fill(pins[key]);await page.locator('#pinGo').click();
  await page.locator('#pinModal').waitFor({state:'hidden'});
  const result=await page.evaluate(async({id,pin})=>{
   const good=await fetch('/api/stats',{headers:{authorization:'Bearer '+pin,'x-shop-id':id}});
   const bad=await fetch('/api/health',{headers:{authorization:'Bearer incorrect-pin','x-shop-id':id}});
   return {good:good.status,bad:bad.status};
  },{id,pin:pins[key]});
  if(result.good!==200||result.bad!==401)throw Error('Shop authentication failed');
  console.log(name+': sign-in passed; wrong PIN rejected');await context.close();
 }
} finally {await browser.close();}
