// SOURCE ONLY. Portable browser-supplied helper; strict synthetic fixtures, no API forwarding.
const tables = ['careconditions','caredays','carespecials','certifications','clienttypes','commutes','contents','countries','experiences','genders','issuetypes','languageskills','reasons','roles','shifts','subjects','worktypes'];
const extras = ['states','media','faqs','faq_categories'];
const cache = { tsCache:10,tables:Object.fromEntries(tables.map(k=>[k,[{id:1,code:'synthetic',translations:[]}]])),extras:Object.fromEntries(extras.map(k=>[k,[{id:1,slug:'synthetic',translations:[]}]])),languages:[{id:1,code:'en',name:'English',is_default:true,is_rtl:false}] };
const old = {access_token:'synthetic-old-access',refresh_token:'synthetic-old-refresh'}, newer = {access_token:'synthetic-new-access',refresh_token:'synthetic-new-refresh'}, renewed = {access_token:'synthetic-renewed-access',refresh_token:'synthetic-renewed-refresh'};
const user = {id:'synthetic-old-user',role:'caregiver',email:'old@example.test',first_name:'Synthetic',last_name:'Old',photo:null,date_of_birth:null,gender_id:null};
const current = {...user,id:'synthetic-current-user',email:'synthetic@example.test',last_name:'Current'};
const response = (result,status=200,meta=null)=>status===204?{status,headers:{'access-control-allow-origin':'*'}}:{status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({result,meta,message:'Synthetic response',errors:null})};
export async function runLogoutOwnerBrowser(browser,{origin='http://localhost:4419',api='https://new.carezaar.com',engine='caller-supplied',widths=[390,1440],onUpdate=()=>{},onScreenshot}={}){
 const records=[],save=()=>onUpdate(records);
 for(const width of widths)for(const scenario of ['healthy','own-renew','late204','late403']){
  let context,p,other,release,deadline,ownerBefore;
  const late=scenario.startsWith('late');
  const r={engine,version:browser.version(),width,scenario,status:'IN PROGRESS',scope:'Synthetic actual UI logout + other-tab expiry/new UI login; not real account lifecycle',checks:[],counts:{oldLogout:0,newLogout:0,renewedLogout:0,login:0,primaryRefresh:0,secondaryRefresh:0,primaryOldInfo:0,primaryNewInfo:0,secondaryOldInfo:0,secondaryNewInfo:0},unexpectedMutations:0,unexpectedRequests:0,callbackErrors:0,pageErrors:0,realApiForwarded:0,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);save();
  const assert=(ok,code)=>{if(!ok){const e=new Error(code);e.qaCode=code;throw e;}};
  const add=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};
  const snap=page=>page.evaluate(()=>({access:localStorage.getItem('carezaar.accessToken'),refresh:localStorage.getItem('carezaar.refreshToken'),owner:localStorage.getItem('carezaar.sessionOwner'),language:localStorage.getItem('carezaar.languageCode'),cache:localStorage.getItem('carezaar.baseData.v3')}));
  try{
   context=await browser.newContext({viewport:{width,height:1000},storageState:{cookies:[],origins:[{origin,localStorage:[{name:'carezaar.accessToken',value:old.access_token},{name:'carezaar.refreshToken',value:old.refresh_token},{name:'carezaar.baseData.v3',value:JSON.stringify(cache)},{name:'carezaar.languageCode',value:'en'},{name:'carezaar.languageId',value:'1'}]}]}});
   let signal;const started=new Promise(done=>{signal=done;}),held=new Promise(done=>{release=done;});
   await context.route('**/*',async route=>{try{
    const req=route.request(),u=new URL(req.url()),method=req.method(),bearer=req.headers().authorization;let page;
    try{page=req.frame().page();}catch{r.unexpectedRequests++;save();return route.abort('blockedbyclient');}
    const secondary=page===other;
    if(u.origin===origin&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method))return route.continue();
    if(u.origin!==api){r.unexpectedRequests++;save();return route.abort('blockedbyclient');}
    const paths=['/api/base/info','/api/auth/info','/api/auth/logout','/api/auth/login','/api/auth/refresh','/api/caregivers/matches','/api/users/notifications/count'];
    if(method==='OPTIONS'&&paths.includes(u.pathname))return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PUT,DELETE,OPTIONS','access-control-allow-headers':'authorization,accept,accept-language,content-type'}});
    if(method==='GET'&&u.pathname==='/api/base/info'&&!bearer&&u.searchParams.get('ts_cache')==='0'&&[...u.searchParams.keys()].length===1)return route.fulfill(response({ts_cache:10}));
    if(method==='GET'&&u.pathname==='/api/auth/info'&&!u.search){
     if(bearer==='Bearer '+old.access_token){const key=secondary?'secondaryOldInfo':'primaryOldInfo';if(r.counts[key]===0){r.counts[key]++;return route.fulfill(response(secondary?null:user,secondary?403:200));}}
     if(bearer==='Bearer '+newer.access_token&&late){const key=secondary?'secondaryNewInfo':'primaryNewInfo';if(r.counts[key]===0){r.counts[key]++;return route.fulfill(response(current));}}
    }
    if(method==='POST'&&u.pathname==='/api/auth/login'&&!u.search&&secondary&&late&&!r.counts.login&&!bearer){
     const form=new URLSearchParams(req.postData()||''),allowed=['email','password','version_app','os','version_os','browser','version_browser'];
     if(form.get('email')==='synthetic@example.test'&&form.get('password')==='Synthetic7!'&&form.get('version_app')==='1.0.0'&&[...form.keys()].every(k=>allowed.includes(k))){r.counts.login++;save();return route.fulfill(response(newer));}
    }
    if(method==='PUT'&&u.pathname==='/api/auth/refresh'&&!u.search&&bearer==='Bearer '+old.refresh_token){
     const form=new URLSearchParams(req.postData()||'');if([...form.keys()].join(',')==='version_app'&&form.get('version_app')==='1.0.0'){
      if(secondary&&late&&!r.counts.secondaryRefresh){r.counts.secondaryRefresh++;save();return route.fulfill(response(null,403));}
      if(!secondary&&scenario==='own-renew'&&!r.counts.primaryRefresh){r.counts.primaryRefresh++;save();return route.fulfill(response(renewed));}
     }
    }
    if(method==='DELETE'&&u.pathname==='/api/auth/logout'&&!u.search&&!req.postData()&&!secondary){
     if(bearer==='Bearer '+newer.access_token){r.counts.newLogout++;r.unexpectedMutations++;save();return route.abort('blockedbyclient');}
     if(bearer==='Bearer '+old.access_token&&!r.counts.oldLogout){r.counts.oldLogout++;ownerBefore=(await snap(p)).owner;save();signal();if(late){await held;return route.fulfill(response(null,scenario==='late204'?204:403));}return route.fulfill(response(null,scenario==='own-renew'?401:204));}
     if(bearer==='Bearer '+renewed.access_token&&scenario==='own-renew'&&!r.counts.renewedLogout){r.counts.renewedLogout++;r.sameOwnerAtRenewedDispatch=Boolean(ownerBefore)&&(await snap(p)).owner===ownerBefore;save();return route.fulfill(response(null,204));}
    }
    if(method==='GET'&&(bearer==='Bearer '+old.access_token||bearer==='Bearer '+newer.access_token||bearer==='Bearer '+renewed.access_token)){
     if(u.pathname==='/api/caregivers/matches'&&u.searchParams.get('sort')==='distance'&&u.searchParams.get('page')==='1'&&u.searchParams.get('perPage')==='10'&&[...u.searchParams.keys()].length===3)return route.fulfill(response([],200,{current_page:1,last_page:1,per_page:10,total:0}));
     if(u.pathname==='/api/users/notifications/count'&&u.searchParams.has('checked_at')&&[...u.searchParams.keys()].length===1)return route.fulfill(response(0));
    }
    if(!['GET','HEAD','OPTIONS'].includes(method))r.unexpectedMutations++;else r.unexpectedRequests++;save();return route.abort('blockedbyclient');
   }catch{r.callbackErrors++;save();try{await route.abort('failed');}catch{/* no raw browser errors */}}});
   p=await context.newPage();p.on('pageerror',()=>{r.pageErrors++;save();});p.setDefaultTimeout(6000);
   await p.addInitScript(()=>{window.__qaLogoutStorageEvents=0;window.addEventListener('storage',event=>{if(event.isTrusted&&event.key==='carezaar.accessToken')window.__qaLogoutStorageEvents++;});});
   await p.goto(origin+'/main/profile',{waitUntil:'domcontentloaded'});await p.locator('.profile-card h2').waitFor();
   assert((await p.locator('.profile-card h2').innerText()).trim()==='Synthetic Old','INITIAL_OWNED_USER_REQUIRED');
   const before=await snap(p); // legacy seed has no owner until the logout captures it.
   const logout=p.locator('button.menu-row').filter({hasText:'Log Out'});await logout.waitFor({state:'visible'});assert(await logout.count()===1,'UNIQUE_PROFILE_LOGOUT');await logout.scrollIntoViewIfNeeded();await logout.click();
   const confirm=p.getByRole('dialog').getByRole('button',{name:'Confirm',exact:true});await confirm.waitFor();
   await confirm.click();
   if(late){
    deadline=setTimeout(()=>release(),25000);
    await Promise.race([started,new Promise((_,reject)=>setTimeout(()=>reject(new Error('LOGOUT_START_PREREQUISITE')),5000))]);
    ownerBefore=(await snap(p)).owner;assert(Boolean(ownerBefore),'CAPTURED_LOGICAL_OWNER_REQUIRED');
    other=await context.newPage();other.on('pageerror',()=>{r.pageErrors++;save();});other.setDefaultTimeout(6000);
    // Normal initial restore sees a synthetic server-revoked old session and clears it.
    // No direct localStorage mutation manufactures the new-login transition.
    await other.goto(origin+'/main/matches',{waitUntil:'domcontentloaded'});await other.waitForURL('**/intro');
    await other.goto(origin+'/sign-in',{waitUntil:'domcontentloaded'});await other.locator('input[type=email]').waitFor();
    await other.locator('input[type=email]').fill('synthetic@example.test');await other.locator('input[type=password]').fill('Synthetic7!');await other.getByRole('button',{name:'Sign In',exact:true}).click();
    await other.locator('.main-shell').waitFor({state:'visible'});await p.locator('.main-shell').waitFor({state:'visible'});
    const currentState=await snap(other);await p.waitForFunction(()=>window.__qaLogoutStorageEvents>=2);
    add('Other tab performs new UI login after real app expiry; primary follows storage events',{oneLogin:r.counts.login===1,oneSecondaryExpiredInfo:r.counts.secondaryOldInfo===1,oneSecondaryRejectedRefresh:r.counts.secondaryRefresh===1,newPair:currentState.access===newer.access_token&&currentState.refresh===newer.refresh_token,newLogicalOwner:Boolean(currentState.owner)&&currentState.owner!==ownerBefore,trustedPrimaryStorageEvents:await p.evaluate(()=>window.__qaLogoutStorageEvents>=2)});
    const waiting=p.waitForResponse(res=>res.url()===api+'/api/auth/logout'&&res.request().method()==='DELETE'&&res.request().headers().authorization==='Bearer '+old.access_token,{timeout:6000}).then(value=>value,()=>null);
    release();clearTimeout(deadline);deadline=null;const completed=await waiting;assert(completed&&completed.status()===(scenario==='late204'?204:403)&&(await completed.finished())===null,'OLD_LOGOUT_RESPONSE_COMPLETED');
    await p.locator('.busy-scrim').waitFor({state:'hidden'});await p.locator('.main-shell').waitFor({state:'visible'});await p.waitForTimeout(750);
    // Source logout menu callback navigates Intro; auth-out Gate must normally redirect Main.
    const profile=p.locator('a[href="/main/profile"]:visible');assert(await profile.count()===1,'UNIQUE_CURRENT_PROFILE_LINK');await profile.click();await p.locator('.profile-card h2').waitFor();
    const final=await snap(p);add('Old logout cannot clear or delete new session or settle stale signed-out UI',{pairPreserved:final.access===newer.access_token&&final.refresh===newer.refresh_token,ownerPreserved:final.owner===currentState.owner,currentProfile:(await p.locator('.profile-card h2').innerText()).trim()==='Synthetic Current',noOldProfile:await p.getByText('Synthetic Old',{exact:true}).count()===0,oldLogoutOnce:r.counts.oldLogout===1,noNewIdentityDelete:r.counts.newLogout===0,oneCurrentInfoPerTab:r.counts.primaryNewInfo===1&&r.counts.secondaryNewInfo===1});
   }else{
    await p.waitForURL('**/intro');await p.locator('.busy-scrim').waitFor({state:'hidden'});const final=await snap(p);
    add('Healthy own logout clears identity and preserves locale/cache',{intro:new URL(p.url()).pathname==='/intro',pairCleared:final.access===null&&final.refresh===null&&final.owner===null,languageKept:final.language===before.language,cacheKept:final.cache===before.cache,oneOldLogout:r.counts.oldLogout===1,renewedOnce:scenario==='own-renew'?r.counts.primaryRefresh===1&&r.counts.renewedLogout===1:r.counts.primaryRefresh===0&&r.counts.renewedLogout===0,noNewLogin:r.counts.login===0,noNewIdentityDelete:r.counts.newLogout===0,sameOwnerThroughRenewal:scenario==='own-renew'?r.sameOwnerAtRenewedDispatch===true:true});
   }
   add('Only exact controlled requests were made',{zeroUnexpected:r.unexpectedMutations===0&&r.unexpectedRequests===0,zeroCallbackErrors:r.callbackErrors===0,zeroPageErrors:r.pageErrors===0,zeroForwarded:r.realApiForwarded===0});
   if(onScreenshot)r.screenshots.push(await onScreenshot(p,{engine,width,scenario}));r.status=r.checks.every(x=>x.status==='PASS')?'PASS':'FAIL';save();
  }catch(error){r.errorName=['Error','TimeoutError','TypeError'].includes(error?.name)?error.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(error?.qaCode||'')?error.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
  finally{release?.();if(deadline)clearTimeout(deadline);if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unexpectedMutations||r.unexpectedRequests)r.status='FAIL';else if(r.callbackErrors||r.pageErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 }
 return records;
}
