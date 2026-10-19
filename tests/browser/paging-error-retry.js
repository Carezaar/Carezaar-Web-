/** Actual built-app loaded-page failure/Retry and page10 dedup boundary.
 * Caller supplies an isolated Playwright browser; this helper creates/closes its contexts.
 * No actual API call, account login or mutation is forwarded. */
const tables=['careconditions','caredays','carespecials','certifications','clienttypes','commutes','contents','countries','experiences','genders','issuetypes','languageskills','reasons','roles','shifts','subjects','worktypes'],extras=['states','media','faqs','faq_categories'];
const cache={tsCache:10,tables:Object.fromEntries(tables.map(k=>[k,[{id:1,code:'synthetic',translations:[]}]])),extras:Object.fromEntries(extras.map(k=>[k,[]])),languages:[{id:1,code:'en',name:'English',is_default:true,is_rtl:false}]};

export async function runPagingErrorBoundary(browser,{origin='http://localhost:4419',api='https://new.carezaar.com',engine='caller-supplied',roles=['client','caregiver'],widths=[390,1440],onUpdate=()=>{},onScreenshot}={}){
 const records=[],save=()=>onUpdate(records);
 for(const role of roles)for(const width of widths){
  let context,p,mode='error',retryRelease,retryTimer;const counts={};
  const pair={access_token:`synthetic-${role}-access`,refresh_token:`synthetic-${role}-refresh`},endpoint=role==='client'?'/api/clients/matches':'/api/caregivers/matches';
  const r={engine,version:browser.version(),role,width,status:'IN PROGRESS',scope:'SyntheticactualMyMatchespage10partialfailureRetry+dedup;notbackend25/50',checks:[],requests:[],unexpectedRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:[],consoleErrorCount:0,realApiForwarded:0,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);save();
  const assert=(ok,code)=>{if(!ok){const e=Error(code);e.qaCode=code;throw e;}};
  const row=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};
  const labels=()=>p.locator('.match-card h2').allInnerTexts();
  const cards=(prefix,from=1,to=10)=>Array.from({length:to-from+1},(_,i)=>{const id=`${prefix}${String(i+from).padStart(2,'0')}`;return{id,user:{id:'user-'+id,role:role==='client'?'caregiver':'client',first_name:'Synthetic',last_name:id,photo:null,email:null,date_of_birth:null,is_favorite:false},salary_min:20,salary_max:40,distance:i+1,is_match:false,clienttype_id:1};});
  const expected=(prefix,from=1,to=10)=>Array.from({length:to-from+1},(_,i)=>`Synthetic ${prefix}${String(i+from).padStart(2,'0')}`);
  const screenshot=async tag=>{if(onScreenshot)r.screenshots.push(await onScreenshot(p,{engine,role,width,tag}));};
  const scrollFor=async predicate=>{for(let i=0;i<12&&!predicate();i++){await p.mouse.move(width>768?width-100:width/2,700);await p.mouse.wheel(0,1200);await p.waitForTimeout(100);}assert(predicate(),'SCROLL_REQUEST_PREREQUISITE');};
  try{
   context=await browser.newContext({viewport:{width,height:900},storageState:{cookies:[],origins:[{origin,localStorage:[{name:'carezaar.accessToken',value:pair.access_token},{name:'carezaar.refreshToken',value:pair.refresh_token},{name:'carezaar.baseData.v3',value:JSON.stringify(cache)},{name:'carezaar.languageCode',value:'en'},{name:'carezaar.languageId',value:'1'}]}]}});
   const fulfill=(route,result,status=200,meta=null)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({result,message:'Synthetic response',errors:null,meta})});
   await context.route('**/*',async route=>{try{
    const req=route.request(),u=new URL(req.url()),method=req.method(),bearer=req.headers().authorization;
    if(u.origin===origin&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method))return route.continue();
    if(u.origin!==api){r.unexpectedRequests++;save();return route.abort('blockedbyclient');}
    if(method==='OPTIONS'&&['/api/auth/info','/api/base/info',endpoint,'/api/users/notifications/count'].includes(u.pathname))return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'authorization,accept,accept-language,content-type'}});
    if(method!=='GET'){r.unexpectedMutations++;save();return route.abort('blockedbyclient');}
    if(u.pathname==='/api/base/info'&&!bearer&&u.searchParams.get('ts_cache')==='0'&&[...u.searchParams.keys()].length===1)return fulfill(route,{ts_cache:10});
    if(bearer==='Bearer '+pair.access_token){
     if(u.pathname==='/api/auth/info'&&!u.search)return fulfill(route,{id:`synthetic-${role}`,role,email:`${role}@example.test`,first_name:'Synthetic',last_name:'Fixture',photo:null,date_of_birth:null});
     if(u.pathname==='/api/users/notifications/count'&&u.searchParams.has('checked_at')&&[...u.searchParams.keys()].length===1)return fulfill(route,0);
     if(u.pathname===endpoint&&['distance','pay'].includes(u.searchParams.get('sort'))&&/^\d+$/.test(u.searchParams.get('page')||'')&&u.searchParams.get('perPage')==='10'&&[...u.searchParams.keys()].length===3){
      const sort=u.searchParams.get('sort'),page=Number(u.searchParams.get('page')),key=`${mode}/${sort}/${page}`,n=counts[key]=(counts[key]||0)+1;r.requests.push({mode,sort,page,perPage:10,ordinal:n});save();const meta={current_page:page,last_page:2,per_page:10,total:14};
      if(mode==='error'&&sort==='distance'){
       if(page===1&&n===1)return fulfill(route,cards('E'),200,meta);
       if(page===2&&n===1)return route.fulfill({status:500,contentType:'text/html',headers:{'access-control-allow-origin':'*'},body:'<!doctype html><title>Synthetic page failure</title>'});
       if(page===2&&n===2){let done;const held=new Promise(resolve=>{done=resolve;});retryRelease=done;retryTimer=setTimeout(()=>{r.retryAutoReleased=true;done();},6000);await held;return fulfill(route,cards('E',11,14),200,meta);}
       if(page===3&&n===1)return fulfill(route,[],200,meta);
      }
      if(mode==='paging'&&sort==='distance'){
       if(page===1&&n===1)return fulfill(route,cards('P'),200,meta);
       if(page===2&&n===1)return fulfill(route,cards('P',9,14),200,meta);
       if(page===3&&n===1)return fulfill(route,[],200,meta);
      }
     }
    }
    r.unexpectedRequests++;save();return route.abort('blockedbyclient');
   }catch{r.callbackErrors++;save();try{await route.abort('failed');}catch{/* no raw request logs */}}});
   p=await context.newPage();p.setDefaultTimeout(6000);p.on('console',msg=>{if(msg.type()==='error'){r.consoleErrorCount++;save();}});p.on('pageerror',error=>{r.pageErrors.push({name:error?.name||'OtherError',details:String(error?.message||'').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/synthetic-(client|caregiver)-(access|refresh)/g,'[SYNTHETIC_REDACTED]').slice(0,500),stack:String(error?.stack||'').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').slice(0,1200),route:new URL(p.url()).pathname});save();});
   await p.goto(origin+'/main/matches',{waitUntil:'domcontentloaded'});await p.locator('.match-card h2').first().waitFor();await p.locator('.busy-scrim').waitFor({state:'hidden'});
   assert(JSON.stringify(await labels())===JSON.stringify(expected('E')),'FIRST_PAGE_EXACT');
   await scrollFor(()=>counts['error/distance/2']===1);await p.waitForTimeout(350);
   const retry=p.getByRole('button',{name:/Try Again|Retry/i}),hasRetry=await retry.count()>0&&await retry.first().isVisible();
   row('Failed page2 preserves rows and offers usable retry',{oldRowsRetained:JSON.stringify(await labels())===JSON.stringify(expected('E')),failedPageAskedOnce:counts['error/distance/2']===1,visibleRetry:hasRetry});await screenshot('page2-failure');
   if(hasRetry){
    await retry.first().evaluate(el=>{window.__qaTrustedRetryClicks=0;el.addEventListener('click',event=>{if(event.isTrusted)window.__qaTrustedRetryClicks++;});});
    await retry.first().click();
    for(let i=0;i<30&&counts['error/distance/2']!==2;i++)await p.waitForTimeout(50);
    assert(counts['error/distance/2']===2,'RETRY_REQUEST_STARTED');
    const retryDuring=p.getByRole('button',{name:/Try Again|Retry/i});r.retryControlWhilePending=await retryDuring.count()===0?'removed':await retryDuring.first().isDisabled()?'disabled':'enabled';
    for(let i=0;i<3;i++){await p.mouse.wheel(0,600);await p.keyboard.press('Enter');await p.waitForTimeout(40);}
    const onePending=counts['error/distance/2']===2&&counts['error/distance/1']===1&&!r.retryAutoReleased;
    row('Retry duplicate activation remains one pending same-page request',{onePending,noSecondEnabledRetry:r.retryControlWhilePending!=='enabled',firstPageNotReset:counts['error/distance/1']===1,trustedRetryClick:await p.evaluate(()=>window.__qaTrustedRetryClicks)>=1,loadedRowsRetained:JSON.stringify(await labels())===JSON.stringify(expected('E'))});
    retryRelease();clearTimeout(retryTimer);retryTimer=null;await p.waitForFunction(()=>document.querySelectorAll('.match-card h2').length===14);
    row('Actual Retry asks same failed page and appends once',{samePageRetried:counts['error/distance/2']===2,firstPageNeverReset:counts['error/distance/1']===1,exactRows:JSON.stringify(await labels())===JSON.stringify(expected('E',1,14))});
   }
   mode='paging';await p.goto(origin+'/main/matches',{waitUntil:'domcontentloaded'});await p.locator('.match-card h2').first().waitFor();await p.locator('.busy-scrim').waitFor({state:'hidden'});await scrollFor(()=>counts['paging/distance/2']===1);await p.waitForFunction(()=>document.querySelectorAll('.match-card h2').length===14);await scrollFor(()=>counts['paging/distance/3']===1);await p.waitForTimeout(150);for(let i=0;i<3;i++){await p.mouse.wheel(0,1000);await p.waitForTimeout(80);}
   row('Actual paging deduplicates and stops on empty page',{exactUniqueRows:JSON.stringify(await labels())===JSON.stringify(expected('P',1,14)),onePage1:counts['paging/distance/1']===1,onePage2:counts['paging/distance/2']===1,oneTerminalPage:counts['paging/distance/3']===1,noPage4:!counts['paging/distance/4']});
   row('Strict fixture and runtime guards',{zeroUnexpected:r.unexpectedRequests===0&&r.unexpectedMutations===0,zeroCallbacks:r.callbackErrors===0,zeroPageErrors:r.pageErrors.length===0,noApiForward:r.realApiForwarded===0});r.status=r.checks.some(x=>x.status==='FAIL')?'FAIL':'PASS';save();
  }catch(error){r.errorName=['Error','TimeoutError','TypeError'].includes(error?.name)?error.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(error?.qaCode||'')?error.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
  finally{retryRelease?.();if(retryTimer)clearTimeout(retryTimer);if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unexpectedRequests||r.unexpectedMutations)r.status='FAIL';else if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 }
 return records;
}
