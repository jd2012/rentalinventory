
/* Kids Rental Tracker — Multi-device Website (Static UI + Backend API)
   - Frontend: plain HTML/CSS/JS
   - Backend: /api/* (Cloudflare Worker + D1 or any REST backend)
   - Auth: shared PIN/token (stored in browser localStorage)
*/

(function(){
  function $(id){ return document.getElementById(id); }

  function fmt(ts){
    if(!ts) return "—";
    try { return new Date(ts).toLocaleString(); } catch(e){ return String(ts); }
  }
  function escapeHtml(s){
    s = String(s);
    return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  }

  var TOKEN_KEY = "krt_auth_token_v1";
  var API_BASE = (window && window.KRT_API_BASE) ? String(window.KRT_API_BASE) : "";
  if(API_BASE && API_BASE.endsWith("/")) API_BASE = API_BASE.slice(0, -1);

  var token = null;

  var state = {
    activePassId: null,
    activeRentalId: null,
    returnContextPassId: null,
    lastAction: "—"
  };

  // ----- Modal confirm -----
  var confirmationOpen=false;
  function confirmModal(title, bodyHtml){
    if(confirmationOpen) return Promise.resolve(false);
    confirmationOpen=true;
    return new Promise(function(resolve){
      var modal = $("modal");
      $("modalTitle").textContent = title;
      $("modalBody").innerHTML = bodyHtml;

      function cleanup(){
        confirmationOpen=false;
        modal.classList.remove("show");
        $("modalYes").onclick = null;
        $("modalNo").onclick = null;
      }
      $("modalYes").onclick = function(){ cleanup(); resolve(true); };
      $("modalNo").onclick  = function(){ cleanup(); resolve(false); };
      modal.classList.add("show");
    });
  }

  function setStatus(msg){ $("dbStatus").textContent = msg; }

  function getToken(){
    if(token) return token;
    try { token = localStorage.getItem(TOKEN_KEY) || null; } catch(e){ token = null; }
    return token;
  }
  function setToken(t){
    token = t;
    try { localStorage.setItem(TOKEN_KEY, t); } catch(e){}
  }
  function clearToken(){
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch(e){}
  }

  
        function normalizeBase(b){
          b = (b || "").trim();
          if(b.endsWith("/")) b = b.slice(0, -1);
          return b;
        }

        function getConfiguredBases(){
          var forced = (window && window.KRT_API_BASE) ? String(window.KRT_API_BASE) : "";
          forced = normalizeBase(forced);
          if(forced) return [forced];

          var fallbacks = (window && window.KRT_API_FALLBACKS && window.KRT_API_FALLBACKS.length) ? window.KRT_API_FALLBACKS : [];
          var bases = [location.origin];
          for(var i=0;i<fallbacks.length;i++){
            var b = normalizeBase(String(fallbacks[i] || ""));
            if(b && bases.indexOf(b) === -1) bases.push(b);
          }
          // default if none provided
          if(bases.length === 0) bases = ["https://rentals.jd2012.work", "https://kids-rentals-api.codingjoe14.workers.dev"];
          return bases;
        }

        function probeBase(base){
          // We expect 401 Unauthorized when no token is provided (that's OK and proves routing works)
          return fetch(base + "/api/health", { method: "GET", signal: AbortSignal.timeout(5000) })
            .then(function(res){
              if(res.status === 401) return true;
              if(res.status === 200 && (res.headers.get("content-type") || "").includes("application/json")) return res.json().then(function(data){ return data.ok === true; });
              return false;
            })
            .catch(function(){ return false; });
        }

        function detectApiBase(){
          var bases = getConfiguredBases();
          // If we're NOT inside rentals.jd2012.work origin (e.g. RBI wrapper), prefer absolute bases.
          setStatus("Detecting API…");
          var i = 0;
          function next(){
            if(i >= bases.length) return Promise.reject(new Error("No working API base found"));
            var base = bases[i++];
            return probeBase(base).then(function(ok){
              if(ok){
                API_BASE = base;
                setStatus("Ready");
                return base;
              }
              return next();
            });
          }
          return next();
        }
var shopId='', locations=null;
function api(path, body){
    var headers = { "content-type": "application/json", "x-shop-id": shopId };
    var t = getToken();
    if(t) headers["authorization"] = "Bearer " + t;

    return fetch((API_BASE || "") + path, body ? { method:"POST", headers: headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) } : { method:"GET", headers: headers, signal: AbortSignal.timeout(10000) })
      .then(function(res){
        if(res.ok) return res.json();
        return res.text().then(function(txt){
          var msg = txt || ("HTTP " + res.status);
          try { msg = JSON.parse(txt).error || msg; } catch (_) {}
          var err = new Error(msg);
          err.status = res.status;
          throw err;
        });
      });
  }

  // ----- Rendering -----
  function renderItemRow(title, sub, badgeText, badgeClass){
    var div = document.createElement("div");
    div.className = "item";
    div.innerHTML =
      '<div class="left">' +
        '<div class="title">' + escapeHtml(title) + '</div>' +
        '<div class="sub">' + escapeHtml(sub) + '</div>' +
      '</div>' +
      '<div class="badge ' + badgeClass + '">' + escapeHtml(badgeText) + '</div>';
    return div;
  }

  function setTab(name){
    var btns = document.querySelectorAll(".tab");
    for(var i=0;i<btns.length;i++){
      btns[i].classList.remove("active");
      if(btns[i].getAttribute("data-tab") === name) btns[i].classList.add("active");
    }
    var panels = document.querySelectorAll(".panel");
    for(var j=0;j<panels.length;j++) panels[j].classList.remove("active");
    $("tab-" + name).classList.add("active");

    if(name === "checkout") $("coPass").focus();
    if(name === "return") $("reScan").focus();
    if(name === "lookup") $("luGear").focus();
    if(name === "inventory") loadInventory().catch(showError);
  }

  function refreshStats(){
    return api("/api/stats")
      .then(function(s){
        $("stTotalOut").textContent = String(s.totalOut || 0);
        $("stOpenRentals").textContent = String(s.openRentals || 0);
        $("stLastAction").textContent = String(s.lastAction || "—");
        state.lastAction = String(s.lastAction || state.lastAction);
      })
      .catch(function(){
        // non-fatal
      });
  }

  function loadOpenRentals(passId){
    return api("/api/rentals/open", { passId: passId }).then(function(r){ return r.rentals || []; });
  }

  function loadItemsForRental(rentalId){
    return api("/api/items/outByRental", { rentalId: rentalId }).then(function(r){ return r.items || []; });
  }

  var openingWebsiteRental=false;
  async function checkoutPass(passId){
    if(openingWebsiteRental) return;
    openingWebsiteRental=true;
    $('coPass').disabled=true;
    $('coGear').disabled=true;
    setStatus("Working…");
    return api("/api/rentals/ensureOpen", { passId: passId }).then(function(r){
      state.activePassId = passId;
      state.activeRentalId = r.rental.id || r.rental.rentalId || r.rentalId || r.id;
      return Promise.all([loadOpenRentals(passId), loadItemsForRental(state.activeRentalId)]);
    }).then(function(results){
      renderCheckout(passId, results[0], results[1]);
      setStatus("Ready");
      refreshStats();
      $("coGear").focus();
    }).catch(function(e){
      setStatus("Error");
      alert("Checkout error: " + (e.message || e));
    }).finally(function(){openingWebsiteRental=false;$("coPass").disabled=false;$("coGear").disabled=!state.activeRentalId;});
  }

  function newRentalSamePass(){
  if(!state.activePassId){
    alert("Scan a pass first.");
    try{ $("coPass").focus(); }catch(e){}
    return;
  }
  setStatus("Working…");
  return api("/api/rentals/new", { passId: state.activePassId }).then(function(r){
    // Support multiple possible response shapes
    var rent = (r && r.rental) ? r.rental : r;
    var rid = (rent && (rent.id || rent.rentalId || rent.rental_id)) || r.rentalId || r.rental_id || r.id;
    if(!rid) throw new Error("Backend did not return a rental id");
    state.activeRentalId = rid;

    // Refresh open rentals + items for the new rental
    return Promise.all([
      loadOpenRentals(state.activePassId),
      loadItemsForRental(state.activeRentalId)
    ]);
  }).then(function(results){
    renderCheckout(state.activePassId, results[0], results[1]);
    setStatus("Ready");
    refreshStats();
    // Put cursor in gear scan box
    try{ $("coGear").focus(); }catch(e){}
  }).catch(function(e){
    setStatus("Error");
    alert("New rental error: " + (e && e.message ? e.message : e));
  });
}

  async function addGear(gearId){
    if(!await confirmModal("Confirm equipment", "Add " + escapeHtml(gearId) + " to this rental?")) return;
    if(!state.activePassId || !state.activeRentalId){
      alert("Scan a pass first.");
      $("coPass").focus();
      return Promise.resolve();
    }
    setStatus("Working…");
    return api("/api/items/add", { rentalId: state.activeRentalId, passId: state.activePassId, gearId: gearId })
      .then(function(resp){
        if(resp && resp.note === "transfer_confirm"){
          // optional server-driven confirm (not used in this backend)
        }
        return loadItemsForRental(state.activeRentalId).then(function(items){
          renderItems(items);
          $("addedGear").textContent = gearId; setTab("added");
          setStatus("Ready");
          refreshStats();
          $("coGear").focus();
        });
      })
      .catch(function(e){
        setStatus("Error");
        alert("Add gear error: " + (e.message || e));
      });
  }

  function returnScan(code){
    setStatus("Working…");
    return api("/api/return/scan", { code: code }).then(function(r){
      $("reResult").innerHTML = "";
      if(r.kind === "gear"){
        $("reResult").appendChild(renderItemRow(code, "Returned successfully" + (r.item ? " • Pass " + r.item.passId + " • " + (r.item.gearType || "") + " " + (r.item.size || "") : ""), "RETURNED", "good"));
        $("reReturnAll").disabled = true;
        state.returnContextPassId = null;
        setTab("returnResult");
      } else if(r.kind === "pass"){
        $("reReturnAll").parentElement.after($("reResult"));
        var passId = r.passId;
        var items = r.items || [];
        if(items.length === 0){
          $("reResult").appendChild(renderItemRow("Pass " + passId, "No items OUT", "OK", "good"));
          $("reReturnAll").disabled = true;
          state.returnContextPassId = null;
        } else {
          $("reResult").appendChild(renderItemRow("Pass " + passId, items.length + " item(s) OUT", "PASS", "warn"));
          for(var i=0;i<items.length;i++){
            var it = items[i];
            $("reResult").appendChild(renderItemRow(it.gearId, "OUT at " + fmt(it.outTime) + " • Rental " + it.rentalId + " • Due " + (it.dueDate || "Not set") + (it.overdue ? " • OVERDUE" : ""), "OUT", "warn"));
          }
          $("reReturnAll").disabled = false;
          state.returnContextPassId = passId;
        }
      } else {
        $("reResult").appendChild(renderItemRow(code, "Not found as OUT gear or pass", "NONE", "bad"));
        $("reReturnAll").disabled = true;
        state.returnContextPassId = null;
      }
      if(r.kind !== "pass") { $("tab-returnResult").querySelector("h2").after($("reResult")); setTab("returnResult"); }
      setStatus("Ready");
      refreshStats();
    }).catch(function(e){
      setStatus("Error");
      $("reResult").replaceChildren(renderItemRow("Could not return",e.message,"ERROR","bad"));
      setTab("returnResult");
    });
  }

  function returnAllForPass(passId){
    setStatus("Working…");
    return api("/api/return/pass", { passId: passId }).then(function(r){
      $("reResult").innerHTML = "";
      $("reResult").appendChild(renderItemRow("Pass " + passId, "Returned " + (r.returned || 0) + " item(s)", "DONE", "good"));
      $("reReturnAll").disabled = true;
      state.returnContextPassId = null;
      $("tab-returnResult").querySelector("h2").after($("reResult")); setTab("returnResult");
      setStatus("Ready");
      refreshStats();
    }).catch(function(e){
      setStatus("Error");
      alert("Return all error: " + (e.message || e));
    });
  }

  function lookupGear(gearId){
    setStatus("Working…");
    return api("/api/lookup/gear", { gearId: gearId }).then(function(r){
      $("luResult").innerHTML = "";
      if(!r.item){
        $("luResult").appendChild(renderItemRow(gearId, r.inventory ? [r.inventory.gearType,r.inventory.size].filter(Boolean).join(" • ") : "Not registered in inventory", r.inventory ? r.inventory.status : "UNKNOWN", r.inventory && r.inventory.status === "ACTIVE" ? "good" : "warn"));
      } else {
        var it = r.item;
        $("luResult").appendChild(renderItemRow(it.gearId, "OUT to Pass " + it.passId + " • Rental " + it.rentalId + " • Due " + (it.dueDate || "Not set") + (it.overdue ? " • OVERDUE" : "") + " • Since " + fmt(it.outTime) + " • Due " + (it.dueDate || "Not set") + (it.overdue ? " • OVERDUE" : ""), "OUT", "warn"));
      }
      setStatus("Ready");
    }).catch(function(e){
      setStatus("Error");
      alert("Lookup gear error: " + (e.message || e));
    });
  }

  function lookupPass(passId){
    setStatus("Working…");
    return api("/api/lookup/pass", { passId: passId }).then(function(r){
      $("luPassResult").innerHTML = "";
      var items = r.items || [];
      if(items.length === 0){
        $("luPassResult").appendChild(renderItemRow("Pass " + passId, "No items OUT", "OK", "good"));
        $("luReturnAll").disabled = true;
      } else {
        $("luPassResult").appendChild(renderItemRow("Pass " + passId, items.length + " item(s) OUT", "PASS", "warn"));
        for(var i=0;i<items.length;i++){
          var it = items[i];
          $("luPassResult").appendChild(renderItemRow(it.gearId, "OUT at " + fmt(it.outTime) + " • Rental " + it.rentalId + " • Due " + (it.dueDate || "Not set") + (it.overdue ? " • OVERDUE" : ""), "OUT", "warn"));
        }
        $("luReturnAll").disabled = false;
        // store for button
        $("luReturnAll").setAttribute("data-pass", passId);
      }
      setStatus("Ready");
    }).catch(function(e){
      setStatus("Error");
      alert("Lookup pass error: " + (e.message || e));
    });
  }

  function renderCheckout(passId, openRentals, items){
    $("coActivePass").textContent = passId || "—";
    $("coActiveRental").textContent = state.activeRentalId || "—";

    $("coNewRental").disabled = !passId;
    $("coGear").disabled = !(passId && state.activeRentalId);
    $("coClearGear").disabled = !(passId && state.activeRentalId);
    $("coDone").disabled = !passId;

    var list = $("coOpenRentals");
    list.innerHTML = "";
    if(!passId){
      list.appendChild(renderItemRow("Scan a pass", "Open rentals will appear here", "WAITING", "warn"));
    } else if(!openRentals || openRentals.length === 0){
      list.appendChild(renderItemRow("No open rentals", "Use New Rental to start", "NONE", "warn"));
    } else {
      for(var i=0;i<openRentals.length;i++){
        (function(r){
          var rid = r.id || r.rentalId;
          var isActive = (rid === state.activeRentalId);
          var row = renderItemRow("Rental " + rid, "OUT since " + fmt(r.outTime) + " • Due " + (r.dueDate || "Not set"), isActive ? "ACTIVE" : "OPEN", isActive ? "good" : "warn");
          row.style.cursor = "pointer";
          row.onclick = function(){
            state.activeRentalId = rid;
            $("coActiveRental").textContent = rid;
            setStatus("Working…");
            loadItemsForRental(rid).then(function(items2){
              renderItems(items2);
              setStatus("Ready");
              refreshStats();
              $("coGear").focus();
            });
          };
          list.appendChild(row);
        })(openRentals[i]);
      }
    }

    renderItems(items || []);
  }

  function renderItems(items){
    $("coOutCount").textContent = String((items && items.length) ? items.length : 0);
    var itemsEl = $("coItems");
    itemsEl.innerHTML = "";
    if(!state.activeRentalId){
      itemsEl.appendChild(renderItemRow("No active rental", "Scan a pass to start", "WAITING", "warn"));
      return;
    }
    if(!items || items.length === 0){
      itemsEl.appendChild(renderItemRow("No items scanned yet", "Scan gear to add it", "EMPTY", "warn"));
      return;
    }
    for(var i=0;i<items.length;i++){
      var it = items[i];
      itemsEl.appendChild(renderItemRow(it.gearId, "OUT at " + fmt(it.outTime) + " • Pass " + it.passId, "OUT", "good"));
    }
  }

  function bindTabs(){
    var btns = document.querySelectorAll(".tab");
    for(var i=0;i<btns.length;i++){
      (function(btn){
        btn.addEventListener("click", function(){
          setTab(btn.getAttribute("data-tab"));
        });
      })(btns[i]);
    }
  }

  function onEnter(inputEl, handler){
    inputEl.addEventListener("keydown", function(e){
      if(e.key === "Enter"){
        e.preventDefault();
        var value = inputEl.value.trim();
        if(!value) return;
        handler(value);
      }
    });
  }

  

function showPinModal() {
  return new Promise(function(resolve){
    var m = $("pinModal");
    var input = $("pinInput");
    var btn = $("pinGo");
    var err = $("pinErr");

    function showError(msg){
      err.style.display = "block";
      err.textContent = msg;
    }
    function hideError(){
      err.style.display = "none";
      err.textContent = "";
    }

    function cleanup(){
      btn.onclick = null;
      input.onkeydown = null;
      m.classList.remove("show");
    }

    function attempt(){
      hideError();
      var pin = (input.value || "").trim();
      if(!pin){ showError("Enter a PIN."); return; }
      setToken(pin);
      setStatus("Verifying PIN…");
      api("/api/health").then(function(){
        cleanup();
        setStatus("Ready");
        resolve(true);
      }).catch(function(e){
        clearToken();
        setStatus("Locked");
        showError("PIN rejected or API unreachable. " + (e && e.message ? e.message : ""));

      });
    }

    btn.onclick = attempt;
    input.onkeydown = function(e){
      if(e.key === "Enter"){ e.preventDefault(); attempt(); }
    };

    input.value = "";
    hideError();
    m.classList.add("show");
    setTimeout(function(){ try{ input.focus(); }catch(e){} }, 50);
  });
}

function ensureLoggedIn() {
  // A location change always starts a new sign-in, even when shops share a PIN.
  clearToken();
  return showPinModal();
}


async function selectLocation(){
  locations=await api('/api/locations');
  return new Promise(resolve=>{
    function resorts(){
      $('locationTitle').textContent='Select a resort';$('locationChoices').replaceChildren();
      locations.resorts.forEach(resort=>{
        var b=document.createElement('button');b.textContent=resort.name;b.className='primary';
        b.onclick=()=>{
          $('locationTitle').textContent=resort.name+' — Select a shop';$('locationChoices').replaceChildren();
          locations.shops.filter(s=>s.resortId===resort.id).forEach(shop=>{
            var c=document.createElement('button');c.textContent=shop.name;c.className='primary';
            c.onclick=()=>{shopId=shop.id;$('selectedLocation').textContent=resort.name+' · '+shop.name;$('locationModal').classList.remove('show');document.querySelectorAll('body > header, body > nav, body > main').forEach(e=>e.inert=false);resolve();};
            $('locationChoices').appendChild(c);
          });
          var back=document.createElement('button');back.textContent='Back to resorts';back.onclick=resorts;$('locationChoices').appendChild(back);
        };
        $('locationChoices').appendChild(b);
      });
    }
    document.querySelectorAll('body > header, body > nav, body > main').forEach(e=>e.inert=true);resorts();
  });
}
function init(){
    $('changeShop').onclick=()=>{clearToken();window.location.reload();};
    setStatus("Connecting…");
    bindTabs();
    detectApiBase()
      .then(function(){
        return selectLocation().then(ensureLoggedIn);
      })
      .then(function(ok){
        if(!ok){
          setStatus("Locked");
          return;
        }
        return refreshStats();
      })
      .then(function(){
        try { $("coPass").focus(); } catch(e) {}
      })
      .catch(function(e){
        setStatus("API Error");
        alert("Backend not reachable: " + (e && e.message ? e.message : e));
      });

    
    onEnter($("coPass"), function(passId){
      $("coPass").value = "";
      checkoutPass(passId);
    });
    $("coClearPass").onclick = function(){ $("coPass").value=""; $("coPass").focus(); };

    $("coNewRental").onclick = function(){ newRentalSamePass(); };

    onEnter($("coGear"), function(gearId){
      $("coGear").value = "";
      addGear(gearId);
    });
    $("coClearGear").onclick = function(){ $("coGear").value=""; $("coGear").focus(); };
    $("coDone").onclick = reviewOrder;

    onEnter($("reScan"), function(code){
      $("reScan").value = "";
      returnScan(code);
    });
    $("reClear").onclick = function(){ $("reScan").value=""; $("reScan").focus(); };

    $("reReturnAll").onclick = function(){
      if(!state.returnContextPassId){ alert("Scan a pass first."); return; }
      var passId = state.returnContextPassId;
      confirmModal("Return ALL?", "Return all OUT items for pass <b>" + escapeHtml(passId) + "</b>?")
        .then(function(ok){ if(ok) returnAllForPass(passId); });
    };

    onEnter($("luGear"), function(gearId){
      $("luGear").value = "";
      lookupGear(gearId);
      $("luGear").focus();
    });
    $("luClear").onclick = function(){ $("luGear").value=""; $("luGear").focus(); };

    onEnter($("luPass"), function(passId){
      $("luPass").value = "";
      lookupPass(passId);
      $("luPass").focus();
    });
    $("luPassClear").onclick = function(){ $("luPass").value=""; $("luPass").focus(); };

    $("luReturnAll").onclick = function(){
      var passId = $("luReturnAll").getAttribute("data-pass");
      if(!passId){ alert("Scan a pass first."); return; }
      confirmModal("Return ALL?", "Return all OUT items for pass <b>" + escapeHtml(passId) + "</b>?")
        .then(function(ok){ if(ok) returnAllForPass(passId).then(function(){ lookupPass(passId); }); });
    };

    initManagement();
  }


  var adminToken = '', adminOffset=0, inventoryOffset=0, inventoryPage=[], selected=new Map(), editing=null;
  function showError(e){ setStatus(e.message || String(e)); }
  function tomorrowDate(){ var d=new Date(); d.setDate(d.getDate()+1); return localDate(d); }
  function localDate(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  async function reviewOrder(){
    try {
      var result=await api('/api/rentals/detail',{rentalId:state.activeRentalId});
      $('reviewSummary').textContent='Pass '+result.rental.passId+' • Rental '+result.rental.id;
      $('reviewDue').value=result.rental.dueDate || tomorrowDate();
      $('reviewDue').min=localDate(new Date());
      $('reviewItems').replaceChildren();
      result.items.forEach(function(i){ $('reviewItems').appendChild(renderItemRow(i.gearId,[i.gearType,i.size].filter(Boolean).join(' • '),i.status,i.status==='OUT'?'warn':'good')); });
      $('finishRental').disabled=!result.items.some(i=>i.status==='OUT');
      setTab('review');
    } catch(e){showError(e);}
  }
  async function adminApi(path,body){
    var res=await fetch((API_BASE || '')+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+getToken(),'x-admin-token':adminToken,'x-shop-id':shopId,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
    if(!res.ok){ var err=await res.json(); if(res.status===403){adminToken='';$('adminContent').hidden=true;} throw new Error(err.error || 'Request failed'); }
    return res;
  }
  function button(label,fn){ var b=document.createElement('button'); b.type='button'; b.textContent=label; b.onclick=()=>Promise.resolve().then(fn).catch(showError); return b; }
  var inventoryRequest=0, inventorySearchTimer;
  async function loadInventory(){
    var request=++inventoryRequest,query=$('inventoryQuery').value.trim();
    $('inventoryFeedback').textContent='Searching…';
    $('inventoryPrev').disabled=true;$('inventoryNext').disabled=true;
    var r;
    try { r=await api('/api/inventory/search',{q:query,offset:inventoryOffset,limit:50}); }
    catch(e){if(request!==inventoryRequest)return;inventoryPage=[];$('inventoryRows').replaceChildren();$('inventoryFeedback').textContent='Search failed: '+(e.message||String(e))+'. Try Search again.';throw e;}
    if(request!==inventoryRequest)return;
    inventoryPage=r.items;
    var location=$('selectedLocation').textContent;
    $('inventoryFeedback').textContent=r.items.length?'Showing '+r.items.length+' items in '+location+(query?' matching “'+query+'”':'')+'.':query?'No matches in '+location+'. Try another barcode, type, or size, or clear the search.':'No equipment is assigned to '+location+'. Add inventory here or change shops.';
    $('inventoryRows').replaceChildren();
    r.items.forEach(function(i){
      var row=renderItemRow(i.gearId,[i.gearType,i.size].filter(Boolean).join(' • '),i.status,i.status==='ACTIVE'?'good':'warn');
      var check=document.createElement('input'); check.type='checkbox';check.checked=selected.has(i.gearId);check.setAttribute('aria-label','Select '+i.gearId);
      check.onchange=()=>{if(check.checked) selected.set(i.gearId,i); else selected.delete(i.gearId); selectionCount();}; row.prepend(check);
      row.appendChild(button('Print label',()=>printLabels([i],'single')));
      row.appendChild(button('Add to sheet',()=>{selected.set(i.gearId,i);check.checked=true;selectionCount();}));
      $('inventoryRows').appendChild(row);
    });
    if(!r.items.length) $('inventoryRows').textContent='No inventory matches.';
    $('inventoryPrev').disabled=inventoryOffset===0;$('inventoryNext').disabled=!r.hasMore;
  }
  function selectionCount(){ $('selectedCount').textContent=selected.size+' selected'; }
  async function printLabels(records,mode){
    if(!records.length) throw new Error('Select at least one item.');
    var offset=Number($('labelOffset').value);
    if(!Number.isInteger(offset)||offset<0||offset>29) throw new Error('Check skipped positions.');
    window.RentalLabels.preview(Array.from(new Map(records.map(i=>[i.gearId,i])).values()),{mode,copies:1,offset:mode==='single'?0:offset});
  }
  async function loadRecords(){
    var table=$('adminTable').value;
    var r=await (await adminApi('/api/admin/records?table='+table+'&offset='+adminOffset)).json();
    $('adminRecords').replaceChildren();
    var cols=r.records.length?Object.keys(r.records[0]).filter(k=>!['rentalId','itemId','gearSize','eolDate'].includes(k)):[];
    var head=document.createElement('tr'); cols.concat('Actions').forEach(c=>{var th=document.createElement('th');th.textContent=({id:'Record ID',passId:'Guest pass',outTime:'Checked out',closedTime:'Closed',dueDate:'Due date',gearId:'Barcode',gearType:'Type',endOfLifeDate:'End of life',updatedAt:'Updated',returnTime:'Returned',equipmentStatus:'Service status'})[c] || c.charAt(0).toUpperCase()+c.slice(1);head.appendChild(th);});$('adminRecords').appendChild(head);
    r.records.forEach(function(row){
      var tr=document.createElement('tr');cols.forEach(c=>{var td=document.createElement('td');td.textContent=row[c]==null?'—':String(row[c]);tr.appendChild(td);});
      var actions=document.createElement('td');actions.appendChild(button('Edit',()=>editRecord(table,row)));
      if(table==='items'&&row.status==='OUT') actions.appendChild(button('Return item',async()=>{if(await confirmModal('Return item',escapeHtml(row.gearId)+' will be returned.')){await adminApi('/api/admin/returnItem',{id:row.id});await loadRecords();await refreshStats();}}));
      if(table==='rentals'&&row.status==='OUT') actions.appendChild(button('Close empty rental',async()=>{await adminApi('/api/admin/closeRental',{id:row.id});await loadRecords();await refreshStats();}));
      if(['inventory','items','rentals'].includes(table)) actions.appendChild(button('Delete',async()=>{
        var id=row.gearId&&table==='inventory'?row.gearId:row.id;
        var detail=table==='rentals'?'This also deletes its returned item history.':table==='inventory'?'Existing rental history will be kept.':'This removes this returned item from rental history.';
        if(!await confirmModal('Delete record?',escapeHtml(id)+'<br>'+detail+' This cannot be undone.')) return;
        await adminApi('/api/admin/delete',{table,id});selected.delete(row.gearId);selectionCount();$('recordEditor').hidden=true;editing=null;adminOffset=0;await loadRecords();await refreshStats();setStatus('Record deleted');
      }));
      tr.appendChild(actions);$('adminRecords').appendChild(tr);
    });
    $('adminPrev').disabled=adminOffset===0;$('adminNext').disabled=!r.hasMore;$('adminPage').textContent=' Page '+(adminOffset/50+1)+' ';
    $('adminContent').hidden=false;
  }
  function editRecord(table,row){
    editing={table,row};$('recordFields').replaceChildren();
    var names=table==='inventory'?['gearId','gearType','size','endOfLifeDate','status','shopId','notes']:table==='rentals'?['dueDate','notes']:table==='items'?['notes']:['value'];
    names.forEach(function(name){
      var label=document.createElement('label');label.textContent=name;
      var choices=name==='shopId'?locations.shops.map(s=>s.id):name==='gearType'?['Ski','Snowboard','Boot','Pole','Helmet','Other']:name==='status'?['ACTIVE','REPAIR','RETIRED','LOST']:null;
      var input=document.createElement(choices?'select':name==='notes'?'textarea':'input');input.name=name;
      if(choices)choices.forEach(v=>{var o=document.createElement('option');o.value=v;o.textContent=name==='shopId'?locations.shops.find(s=>s.id===v).name:v;input.appendChild(o);});
      if(name==='dueDate'||name==='endOfLifeDate') input.type='date';
      input.value=row[name] || '';if(name==='gearId') input.readOnly=true;label.appendChild(input);$('recordFields').appendChild(label);
    });
    $('recordEditor').hidden=false;$('recordEditor').scrollIntoView({block:'nearest'});
  }
  async function download(path,filename){
    var res=await adminApi(path);var blob=await res.blob(),url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function initManagement(){
    $("returnAgain").onclick=()=>setTab("return"); $("returnDone").onclick=()=>setTab("checkout");
    $('scanMore').onclick=()=>setTab('checkout');$('addedDone').onclick=reviewOrder;$('reviewBack').onclick=()=>setTab('checkout');
    $('finishRental').onclick=async function(){
      this.disabled=true;
      try{await api('/api/rentals/finish',{rentalId:state.activeRentalId,dueDate:$('reviewDue').value});state.activePassId=null;state.activeRentalId=null;renderCheckout(null,[],[]);setTab('checkout');setStatus('Rental saved');await refreshStats();}catch(e){showError(e);}finally{this.disabled=false;}
    };
    $('inventoryForm').onsubmit=async function(e){e.preventDefault();var b=this.querySelector('button');b.disabled=true;try{var values=Object.fromEntries(new FormData(this));await api('/api/inventory/create',values);setStatus('Created '+values.gearId);this.reset();await loadInventory();}catch(e){showError(e);}finally{b.disabled=false;}};
    function searchInventory(){clearTimeout(inventorySearchTimer);inventoryOffset=0;loadInventory().catch(showError);}
    $('inventorySearch').onclick=searchInventory;
    $('inventoryQuery').oninput=()=>{++inventoryRequest;clearTimeout(inventorySearchTimer);inventorySearchTimer=setTimeout(searchInventory,250);};
    $('inventoryQuery').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();searchInventory();}};
    $('clearInventorySearch').onclick=()=>{$('inventoryQuery').value='';searchInventory();};
    $('inventoryPrev').onclick=()=>{inventoryOffset-=50;loadInventory().catch(showError);};$('inventoryNext').onclick=()=>{inventoryOffset+=50;loadInventory().catch(showError);};
    $('selectPage').onclick=()=>{inventoryPage.forEach(i=>selected.set(i.gearId,i));selectionCount();loadInventory().catch(showError);};
    $('clearSelection').onclick=()=>{selected.clear();selectionCount();loadInventory().catch(showError);};
    $('printSelected').onclick=()=>printLabels(Array.from(selected.values()),'sheet').catch(showError);
    $('printAll').onclick=async()=>{try{var all=[],offset=0,r;do{r=await api('/api/inventory/search',{q:$('inventoryQuery').value,offset,limit:200});all.push(...r.items);offset+=200;if(all.length>3000)throw new Error('Narrow the search to 3,000 items or fewer.');}while(r.hasMore);await printLabels(all,'sheet');}catch(e){showError(e);}};
    $('adminLogin').onsubmit=async e=>{e.preventDefault();adminToken=$('adminKey').value;$('adminKey').value='';adminOffset=0;try{await loadRecords();setStatus('Database unlocked');}catch(e){showError(e);}};
    $('adminLock').onclick=()=>{adminToken='';$('adminContent').hidden=true;$('adminRecords').replaceChildren();$('recordEditor').hidden=true;editing=null;setStatus('Database locked');};
    $('adminTable').onchange=()=>{adminOffset=0;$('recordEditor').hidden=true;loadRecords().catch(showError);};
    $('adminRefresh').onclick=()=>loadRecords().catch(showError);$('adminPrev').onclick=()=>{adminOffset-=50;loadRecords().catch(showError);};$('adminNext').onclick=()=>{adminOffset+=50;loadRecords().catch(showError);};
    $('recordEditor').onsubmit=async e=>{e.preventDefault();try{await adminApi('/api/admin/update',{table:editing.table,id:editing.row.id||editing.row.key,record:Object.fromEntries(new FormData(e.target))});$('recordEditor').hidden=true;await loadRecords();setStatus('Changes saved');}catch(e){showError(e);}};
    $('cancelEdit').onclick=()=>{$('recordEditor').hidden=true;};
    $('exJson').onclick=()=>download('/api/export.json','rental-backup.json').catch(showError);$('exCsv').onclick=()=>download('/api/export.csv','rental-items.csv').catch(showError);
  }

  window.addEventListener("load", init);
})();
