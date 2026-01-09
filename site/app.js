
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
  function confirmModal(title, bodyHtml){
    return new Promise(function(resolve){
      var modal = $("modal");
      $("modalTitle").textContent = title;
      $("modalBody").innerHTML = bodyHtml;

      function cleanup(){
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
          var bases = [];
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
          return fetch(base + "/api/health", { method: "GET" })
            .then(function(res){
              if(res.status === 401 || res.status === 200) return true;
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
function api(path, body){
    var headers = { "content-type": "application/json" };
    var t = getToken();
    if(t) headers["authorization"] = "Bearer " + t;

    return fetch((API_BASE || "") + path, body ? { method:"POST", headers: headers, body: JSON.stringify(body) } : { method:"GET", headers: headers })
      .then(function(res){
        if(res.ok) return res.json();
        return res.text().then(function(txt){
          var msg = txt || ("HTTP " + res.status);
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

  function checkoutPass(passId){
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
    });
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

  function addGear(gearId){
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
        $("reResult").appendChild(renderItemRow(code, "Returned successfully", "RETURNED", "good"));
        $("reReturnAll").disabled = true;
        state.returnContextPassId = null;
      } else if(r.kind === "pass"){
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
            $("reResult").appendChild(renderItemRow(it.gearId, "OUT at " + fmt(it.outTime) + " • Rental " + it.rentalId, "OUT", "warn"));
          }
          $("reReturnAll").disabled = false;
          state.returnContextPassId = passId;
        }
      } else {
        $("reResult").appendChild(renderItemRow(code, "Not found as OUT gear or pass", "NONE", "bad"));
        $("reReturnAll").disabled = true;
        state.returnContextPassId = null;
      }
      setStatus("Ready");
      refreshStats();
    }).catch(function(e){
      setStatus("Error");
      alert("Return scan error: " + (e.message || e));
    });
  }

  function returnAllForPass(passId){
    setStatus("Working…");
    return api("/api/return/pass", { passId: passId }).then(function(r){
      $("reResult").innerHTML = "";
      $("reResult").appendChild(renderItemRow("Pass " + passId, "Returned " + (r.returned || 0) + " item(s)", "DONE", "good"));
      $("reReturnAll").disabled = true;
      state.returnContextPassId = null;
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
        $("luResult").appendChild(renderItemRow(gearId, "Not currently OUT", "AVAILABLE", "good"));
      } else {
        var it = r.item;
        $("luResult").appendChild(renderItemRow(it.gearId, "OUT to Pass " + it.passId + " • Rental " + it.rentalId + " • Since " + fmt(it.outTime), "OUT", "warn"));
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
          $("luPassResult").appendChild(renderItemRow(it.gearId, "OUT at " + fmt(it.outTime) + " • Rental " + it.rentalId, "OUT", "warn"));
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
          var row = renderItemRow("Rental " + rid, "OUT since " + fmt(r.outTime), isActive ? "ACTIVE" : "OPEN", isActive ? "good" : "warn");
          row.style.cursor = "pointer";
          row.onclick = function(){
            state.activeRentalId = rid;
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
        resolve(false);
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
  var t = getToken();
  if(t) {
    return api("/api/health").then(function(){ return true; }).catch(function(){ clearToken(); return showPinModal(); });
  }
  return showPinModal();
}


function init(){
    setStatus("Connecting…");
    bindTabs();
    detectApiBase()
      .then(function(){
        return ensureLoggedIn();
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
    $("coDone").onclick = function(){ $("coGear").focus(); };

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

    // Admin tab: token and basic controls
    $("exJson").onclick = function(){
      alert("Export/Import are backend features in the multi-device version.\nIf you want daily exports, we can add /api/export for CSV/JSON.");
    };
    $("imJson").onclick = function(){
      alert("Import is a backend feature in the multi-device version.\nWe can add /api/import for JSON.");
    };
    $("wipe").onclick = function(){
      alert("Wipe is disabled client-side for safety.\nIf you need a wipe endpoint, we can add an admin-only /api/admin/wipe.");
    };
  }

  window.addEventListener("load", init);
})();
