/** Real-timer built-app ChatList polling ownership regression.
 * Caller supplies an isolated Playwright browser; this helper creates/closes its contexts.
 * No actual API call, account login or mutation is forwarded. */
const tables=['careconditions','caredays','carespecials','certifications','clienttypes','commutes','contents','countries','experiences','genders','issuetypes','languageskills','reasons','roles','shifts','subjects','worktypes'],extras=['states','media','faqs','faq_categories'];
const cache={tsCache:10,tables:Object.fromEntries(tables.map(k=>[k,[{id:1,code:'synthetic',translations:[]}]])),extras:Object.fromEntries(extras.map(k=>[k,[]])),languages:[{id:1,code:'en',name:'English',is_default:true,is_rtl:false}]};

export async function runChatPollingOwnership(browser,{origin='http://localhost:4419',api='https://new.carezaar.com',engine='caller-supplied',roles=['client','caregiver'],widths=[390,1440],consumers=['chats'],onUpdate=()=>{},onScreenshot}={}){
 const records=[],save=()=>onUpdate(records);
 for(const consumer of consumers)for(const role of roles)for(const width of widths){
  let context,p,mode='polling',retryRelease,retryTimer;const counts={};
  const pair={access_token:`synthetic-${role}-access`,refresh_token:`synthetic-${role}-refresh`};
  const config={chats:{route:'/main/messages',endpoint:'/api/users/chats',selector:'.chat-row-top > b'},favorites:{route:'/favorites',endpoint:'/api/users/bookmarks',selector:'.fav-card h2'},notifications:{route:'/notifications',endpoint:'/api/users/notifications',selector:'.notif-text > b'},manage:{route:'/profile/matches',endpoint:'/api/users/matches',selector:'.match-row h2'}}[consumer];
  const endpoint=config.endpoint;
  const r={engine,version:browser.version(),consumer,role,width,status:'IN PROGRESS',scope:'Synthetic visible ChatList quiet poll versus pending page; real timers, no backend forwarding',checks:[],requests:[],unexpectedRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:[],consoleErrorCount:0,realApiForwarded:0,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);save();
  const assert=(ok,code)=>{if(!ok){const e=Error(code);e.qaCode=code;throw e;}};
  const row=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};
  const labels=()=>p.locator(config.selector).allInnerTexts();
  const cards=(prefix,from=1,to=10)=>Array.from({length:to-from+1},(_,index)=>{
   const i=from+index,id=1000+i,name=prefix+String(i).padStart(2,'0');
   const makeUser=kind=>({id:`peer-${kind}-${i}`,role:kind,first_name:'Synthetic',last_name:name,photo:null,email:null,date_of_birth:null,bio:'Synthetic list fixture',is_favorite:true});
   const client={id:`client-${i}`,user:makeUser('client'),salary_min:20,salary_max:40,distance:i,is_match:true,clienttype_id:1};
   const caregiver={id:`caregiver-${i}`,user:makeUser('caregiver'),salary_min:20,salary_max:40,distance:i,is_match:true};
   if(consumer==='favorites')return makeUser(role==='client'?'caregiver':'client');
   if(consumer==='notifications')return{id,partner:makeUser(role==='client'?'caregiver':'client'),user:null,chat:null,subject_id:1,created_at:'2026-10-19 10:00:00',seen_at:'2026-10-19 10:00:00'};
   if(consumer==='chats')return{id,client,caregiver,updated_at:'2026-10-19 10:00:00',last_message:'Synthetic message',new_message_count:0,is_seen:true};
   return{id,client,caregiver,created_at:'2026-10-19 10:00:00',finished_at:null,is_client_accepted:true,is_caregiver_accepted:true,is_active:true,introduction:null,review_client:null,review_caregiver:null};
  });
  const expected=(prefix,from=1,to=10)=>Array.from({length:to-from+1},(_,i)=>`Synthetic ${prefix}${String(i+from).padStart(2,'0')}`);
  const screenshot=async tag=>{if(onScreenshot)r.screenshots.push(await onScreenshot(p,{engine,consumer,role,width,tag}));};
  const scrollFor=async predicate=>{for(let i=0;i<15&&!predicate();i++){const list=p.locator('.messages-list');if(consumer==='chats'&&await list.count()){const box=await list.boundingBox();await p.mouse.move(box.x+box.width/2,Math.min(750,box.y+box.height/2));}else await p.mouse.move(width/2,700);await p.mouse.wheel(0,1000);await p.waitForTimeout(100);}assert(predicate(),'SCROLL_REQUEST_PREREQUISITE');};
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
     if(u.pathname===endpoint&&/^\d+$/.test(u.searchParams.get('page')||'')&&u.searchParams.get('perPage')==='10'&&(consumer==='manage'?u.searchParams.get('type')==='matches'&&[...u.searchParams.keys()].length===3:[...u.searchParams.keys()].length===2)){
      const sort='list',page=Number(u.searchParams.get('page')),key=`${mode}/${sort}/${page}`,n=counts[key]=(counts[key]||0)+1;r.requests.push({mode,sort,page,perPage:10,ordinal:n});save();const meta={current_page:page,last_page:2,per_page:10,total:14};
      if(mode==='polling'&&sort==='list'){
       if(page===1)return fulfill(route,cards('E'),200,meta);
       if(page===2&&n===1){let done;const held=new Promise(resolve=>{done=resolve;});retryRelease=done;retryTimer=setTimeout(()=>{r.holdAutoReleased=true;done();},30000);await held;r.heldResponseReleasedAt=Date.now();return fulfill(route,cards('E',11,14),200,meta);}
       if(page===2)return fulfill(route,cards('E',11,14),200,meta);
       if(page===3&&n===1)return fulfill(route,[],200,meta);
      }
     }
    }
    r.unexpectedRequests++;save();return route.abort('blockedbyclient');
   }catch{r.callbackErrors++;save();try{await route.abort('failed');}catch{/* no raw request logs */}}});
   p=await context.newPage();p.setDefaultTimeout(6000);p.on('console',msg=>{if(msg.type()==='error'){r.consoleErrorCount++;save();}});p.on('pageerror',error=>{r.pageErrors.push({name:error?.name||'OtherError',details:String(error?.message||'').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').replace(/synthetic-(client|caregiver)-(access|refresh)/g,'[SYNTHETIC_REDACTED]').slice(0,500),stack:String(error?.stack||'').replace(/Bearer\s+\S+/gi,'Bearer [REDACTED]').slice(0,1200),route:new URL(p.url()).pathname});save();});
   await p.goto(origin+config.route,{waitUntil:'domcontentloaded'});await p.locator(config.selector).first().waitFor();await p.locator('.busy-scrim').waitFor({state:'hidden'});
   assert(JSON.stringify(await labels())===JSON.stringify(expected('E')),'FIRST_PAGE_EXACT');
   await scrollFor(()=>counts['polling/list/2']===1);const heldStarted=performance.now();r.pendingPage2ObservedAt=Date.now();
   for(let i=0;i<4;i++){await p.mouse.wheel(0,-1600);await p.waitForTimeout(50);}
   r.documentVisible=await p.evaluate(()=>document.visibilityState==='visible');
   await p.waitForTimeout(Math.max(0,11100-(performance.now()-heldStarted)));
   r.holdElapsedMs=performance.now()-heldStarted;r.page1CountWhileHeld=counts['polling/list/1']||0;
   row('Quiet polling waits for explicit page load',{visibleDocument:r.documentVisible,heldAtLeastElevenSeconds:r.holdElapsedMs>=11000,noPeriodicPage1DuringHold:r.page1CountWhileHeld===1,page2StillHeld:!r.heldResponseReleasedAt&&!r.holdAutoReleased,retainedTenRows:JSON.stringify(await labels())===JSON.stringify(expected('E'))});await screenshot('held-page2-after-eleven-seconds');
   const response=p.waitForResponse(res=>{const u=new URL(res.url());return u.origin===api&&u.pathname===endpoint&&u.searchParams.get('page')==='2';}).catch(()=>null);
   retryRelease();clearTimeout(retryTimer);retryTimer=null;const answer=await response;r.page2ResponseStatus=answer?.status()??null;r.page2ResponseCompleted=answer?await answer.finished()===null:false;await p.waitForTimeout(750);
   row('Released successful page appends once',{page2Successful:r.page2ResponseStatus===200,bodyCompleted:r.page2ResponseCompleted,exactFourteenRows:JSON.stringify(await labels())===JSON.stringify(expected('E',1,14)),onePage2Attempt:counts['polling/list/2']===1});await screenshot('after-held-page2-completion');
   const pollCountBeforeIdle=counts['polling/list/1']||0,idleStarted=performance.now();
   for(let i=0;i<240&&(counts['polling/list/1']||0)===pollCountBeforeIdle;i++)await p.waitForTimeout(50);
   r.idlePollWaitMs=performance.now()-idleStarted;r.page1CountAfterIdle=counts['polling/list/1']||0;await p.waitForTimeout(500);r.finalLabels=await labels();
   row('Actual next idle quiet poll resumes without losing loaded rows',{nextQuietPollObserved:r.page1CountAfterIdle===pollCountBeforeIdle+1,exactFourteenRows:JSON.stringify(r.finalLabels)===JSON.stringify(expected('E',1,14)),onePage2Attempt:counts['polling/list/2']===1});await screenshot('after-next-idle-poll');
   row('Strict fixture and runtime guards',{zeroUnexpected:r.unexpectedRequests===0&&r.unexpectedMutations===0,zeroCallbacks:r.callbackErrors===0,zeroPageErrors:r.pageErrors.length===0,noApiForward:r.realApiForwarded===0});r.status=r.checks.some(x=>x.status==='FAIL')?'FAIL':'PASS';save();
  }catch(error){r.errorName=['Error','TimeoutError','TypeError'].includes(error?.name)?error.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(error?.qaCode||'')?error.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
  finally{retryRelease?.();if(retryTimer)clearTimeout(retryTimer);if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unexpectedRequests||r.unexpectedMutations)r.status='FAIL';else if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 }
 return records;
}
