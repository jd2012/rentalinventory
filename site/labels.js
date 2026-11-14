/* Code 128 labels use the same gearId scanned by both clients. No remote rendering. */
(function(){
  function preview(records,options){
    if(!window.JsBarcode) throw new Error('Barcode renderer did not load.');
    const labels=[];
    records.forEach(item=>{for(let n=0;n<options.copies;n++)labels.push(item);});
    if(labels.length>3000) throw new Error('Print at most 3,000 labels at a time.');
    // Validate all codes before opening the print view; never silently truncate or change case.
    const svgs=labels.map(item=>{
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      if(!/^[\x20-\x7E]+$/.test(item.gearId)) throw new Error('Code 128 labels require printable ASCII: '+item.gearId);
      window.JsBarcode(svg,item.gearId,{format:'CODE128',width:2,height:45,fontSize:13,margin:20,displayValue:false});
      // Keep narrow bars >= 0.19 mm at the selected label width.
      const units=Number(svg.getAttribute('width'))/2;
      if((options.mode==='single'?71:61)/units<0.19) throw new Error('Barcode too long for this label size: '+item.gearId);
      return svg;
    });
    const old=document.getElementById('labelPreview');if(old)old.remove();
    const frame=document.createElement('iframe');frame.id='labelPreview';frame.title='Barcode print preview';document.body.appendChild(frame);
    const doc=frame.contentDocument;
    doc.open();doc.write('<!doctype html><html><head><title>Inventory labels</title></head><body></body></html>');doc.close();
    const single=options.mode==='single';
    const style=doc.createElement('style');style.textContent=`
      *{box-sizing:border-box}body{margin:0;background:#ddd;color:#000;font-family:Arial,sans-serif}
      .toolbar{padding:12px;background:white;position:sticky;top:0;z-index:1}.toolbar button{padding:10px;margin-right:12px}
      .sheet{background:white;width:8.5in;height:11in;padding:.5in .1875in;display:grid;grid-template-columns:repeat(3,2.625in);grid-template-rows:repeat(10,1in);column-gap:.125in;margin:16px auto;break-after:page}
      .sheet:last-child{break-after:auto}.label{overflow:hidden;text-align:center;padding:.04in .08in;display:flex;flex-direction:column;align-items:center;justify-content:center;break-inside:avoid}
      svg{width:100%;height:.57in;flex-shrink:0}strong{font-size:9pt;line-height:12pt}small{font-size:8pt;max-width:100%;white-space:nowrap;overflow:hidden}
      ${single?'.sheet{width:3in;height:1in;padding:0;display:block}.label{height:1in}':''}
      @page{size:${single?'3in 1in':'letter'};margin:0}
      @media print{body{background:white}.toolbar{display:none}.sheet{margin:0}}
    `;doc.head.appendChild(style);
    const toolbar=doc.createElement('div');toolbar.className='toolbar';
    const print=doc.createElement('button');print.textContent='Print labels';print.onclick=()=>frame.contentWindow.print();toolbar.appendChild(print);
    const close=doc.createElement('button');close.textContent='Close preview';close.onclick=()=>frame.remove();toolbar.appendChild(close);
    const hint=doc.createElement('span');hint.textContent=labels.length+' labels • Print at 100%, headers/footers off';toolbar.appendChild(hint);doc.body.appendChild(toolbar);
    const capacity=single?1:30;let page;
    const total=options.offset+labels.length;
    for(let n=0;n<Math.ceil(total/capacity)*capacity;n++){
      if(n%capacity===0){page=doc.createElement('div');page.className='sheet';doc.body.appendChild(page);}
      const label=doc.createElement('div');label.className='label';page.appendChild(label);
      const i=n-options.offset;
      if(i>=0&&i<labels.length){label.appendChild(doc.importNode(svgs[i],true));const code=doc.createElement('strong');code.textContent=labels[i].gearId;label.appendChild(code);const detail=doc.createElement('small');detail.textContent=[labels[i].gearType,labels[i].size].filter(Boolean).join(' • ');label.appendChild(detail);}
    }
  }
  window.RentalLabels={preview};
})();
