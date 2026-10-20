import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('site/vendor',{recursive:true});
await copyFile('node_modules/jsbarcode/dist/JsBarcode.all.min.js','site/vendor/JsBarcode.all.min.js');
await copyFile('node_modules/jsbarcode/MIT-LICENSE.txt','site/vendor/JsBarcode-LICENSE.txt');
