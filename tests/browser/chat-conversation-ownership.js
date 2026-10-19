/** Built-app conversation ownership regression. Caller supplies isolated browser; strict synthetic API GETs and actual quiet-poll timers only. */
const tables=['careconditions','caredays','carespecials','certifications','clienttypes','commutes','contents','countries','experiences','genders','issuetypes','languageskills','reasons','roles','shifts','subjects','worktypes'],extras=['states','media','faqs','faq_categories'];
const cache={tsCache:10,tables:Object.fromEntries(tables.map(k=>[k,[{id:1,code:'synthetic',translations:[]}]])),extras:Object.fromEntries(extras.map(k=>[k,[]])),languages:[{id:1,code:'en',name:'English',is_default:true,is_rtl:false}]};
export async function runChatConversationOwnership(browser,{origin='http://localhost:4419',api='https://new.carezaar.com',engine='firefox',role='client',width=1440,mode='core',outcomes=['healthy','server503'],onUpdate=()=>{},onScreenshot}={}){
 const records=[],save=()=>onUpdate(records);
 for(const outcome of outcomes){let context,p,release,holdTimer,firstADetailAt;const counts={A:0,B:0,list:0};
  const pair={access_token:'synthetic-conversation-access',refresh_token:'synthetic-conversation-refresh'};
  const r={engine,version:browser.version(),role,width,outcome,status:'IN PROGRESS',checks:[],requests:[],unexpectedRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:0,consoleErrorCount:0,realApiForwarded:0,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);save();
  const assert=(ok,code)=>{if(!ok){const e=Error(code);e.qaCode=code;throw e;}};
  const add=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};
  const user=(kind,label)=>({id:'synthetic-'+kind+'-'+label,role:kind,first_name:'Synthetic',last_name:label,email:null,photo:null,date_of_birth:null});
  const entity=(kind,label)=>({id:'synthetic-entity-'+kind+'-'+label,user:user(kind,label),is_match:true,salary_min:20,salary_max:40});
  const chat=(id,label,late=false)=>({id,client:entity('client',label),caregiver:entity('caregiver',label),updated_at:'2026-10-19 10:00:00',last_message:label+' original message',new_message_count:0,is_seen:true,messages:[{id:id*10+1,message:label+' original message',created_at:'2026-10-19 10:00:00',seen_at:null,is_from_caregiver:true,parent:null},...(late?[{id:id*10+2,message:'Alpha stale quiet-poll message',created_at:'2026-10-19 10:01:00',seen_at:null,is_from_caregiver:true,parent:null}]:[])]});
  const screenshot=async tag=>{if(onScreenshot)r.screenshots.push(await onScreenshot(p,{engine,role,width,outcome,tag}));};
  try{
   context=await browser.newContext({viewport:{width,height:1000},storageState:{cookies:[],origins:[{origin,localStorage:[{name:'carezaar.accessToken',value:pair.access_token},{name:'carezaar.refreshToken',value:pair.refresh_token},{name:'carezaar.baseData.v3',value:JSON.stringify(cache)},{name:'carezaar.languageCode',value:'en'},{name:'carezaar.languageId',value:'1'}]}]}});
   const fulfill=(route,result,status=200,meta=null)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({result,message:status===503?'Synthetic service unavailable':'Synthetic response',errors:null,meta})});
   await context.route('**/*',async route=>{try{const req=route.request(),u=new URL(req.url()),method=req.method(),bearer=req.headers().authorization;
    if(u.origin===origin&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method))return route.continue();
    if(u.origin!==api){r.unexpectedRequests++;save();return route.abort('blockedbyclient');}
    const paths=['/api/base/info','/api/auth/info','/api/users/chats','/api/users/chats/101','/api/users/chats/202','/api/users/notifications/count'];
    if(method==='OPTIONS'&&paths.includes(u.pathname))return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'authorization,accept,accept-language,content-type'}});
    if(method!=='GET'){r.unexpectedMutations++;save();return route.abort('blockedbyclient');}
    if(u.pathname==='/api/base/info'&&!bearer&&u.searchParams.get('ts_cache')==='0'&&[...u.searchParams.keys()].length===1)return fulfill(route,{ts_cache:10});
    if(bearer==='Bearer '+pair.access_token){
     if(u.pathname==='/api/auth/info'&&!u.search)return fulfill(route,{...user(role,'Fixture'),email:role+'@example.test'});
     if(u.pathname==='/api/users/notifications/count'&&u.searchParams.has('checked_at')&&[...u.searchParams.keys()].length===1)return fulfill(route,0);
     if(u.pathname==='/api/users/chats'&&u.searchParams.get('perPage')==='10'&&['1','2'].includes(u.searchParams.get('page'))&&[...u.searchParams.keys()].length===2){counts.list++;if(counts.list>8){r.unexpectedRequests++;return route.abort('blockedbyclient');}return fulfill(route,u.searchParams.get('page')==='1'?[chat(101,'Alpha'),chat(202,'Beta')]:[],200,{current_page:Number(u.searchParams.get('page')),last_page:1,per_page:10,total:2});}
     if(u.pathname==='/api/users/chats/101'&&!u.search){counts.A++;r.requests.push({conversation:'A',ordinal:counts.A});save();if(counts.A===1){firstADetailAt=performance.now();return fulfill(route,chat(101,'Alpha'));}if(counts.A===2){r.realPollObserved=true;const held=new Promise(resolve=>{release=resolve;});holdTimer=setTimeout(()=>{r.safetyRelease=true;release();},30000);await held;return fulfill(route,chat(101,'Alpha',true));}}
     if(u.pathname==='/api/users/chats/202'&&!u.search){if(mode==='resize'){r.unexpectedRequests++;save();return route.abort('blockedbyclient');}counts.B++;r.requests.push({conversation:'B',ordinal:counts.B});save();if(counts.B===1)return fulfill(route,outcome==='healthy'?chat(202,'Beta'):null,outcome==='healthy'?200:503);}
    }
    r.unexpectedRequests++;save();return route.abort('blockedbyclient');
   }catch{r.callbackErrors++;save();try{await route.abort('failed');}catch{/* sanitized only */}}});
   p=await context.newPage();p.setDefaultTimeout(6000);p.on('console',m=>{if(m.type()==='error'){r.consoleErrorCount++;save();}});p.on('pageerror',()=>{r.pageErrors++;save();});
   await p.goto(origin+'/main/messages',{waitUntil:'domcontentloaded'});await p.locator('.chat-row').filter({hasText:'Synthetic Alpha'}).waitFor();await p.locator('.busy-scrim').waitFor({state:'hidden'});
   await p.locator('.chat-row').filter({hasText:'Synthetic Alpha'}).click();await p.waitForURL('**/chat/101');await p.locator('.transcript .bubble > p').filter({hasText:'Alpha original message'}).waitFor();await p.locator('.busy-scrim').waitFor({state:'hidden'});
   await p.getByRole('button',{name:'Message options',exact:true}).click();await p.getByRole('menuitem',{name:'Reply',exact:true}).click();await p.getByRole('textbox',{name:'Type a message...',exact:true}).fill('Synthetic Alpha draft — 🙂');
   assert((await p.locator('.reply-bar').innerText()).includes('Alpha original message'),'ALPHA_REPLY_PREREQUISITE');
   if(mode==='resize'){
    r.scope='Same conversation actual1440→768→1440 resize;notBack/unmount';
    const draft='Synthetic Alpha draft — 🙂';
    for(const targetWidth of[768,1440]){
     await p.setViewportSize({width:targetWidth,height:1000});await p.getByRole('textbox',{name:'Type a message...',exact:true}).waitFor();
     r.resizeWindowElapsedMs=performance.now()-firstADetailAt;assert(r.resizeWindowElapsedMs<9000,'RESIZE_TIMER_WINDOW_PREREQUISITE');
     add('Same conversation resize to '+targetWidth,{actualWidth:await p.evaluate(()=>innerWidth)===targetWidth,sameURL:new URL(p.url()).pathname==='/chat/101',sameSessionPair:await p.evaluate(pair=>localStorage.getItem('carezaar.accessToken')===pair.access_token&&localStorage.getItem('carezaar.refreshToken')===pair.refresh_token,pair),draftPreserved:await p.getByRole('textbox',{name:'Type a message...',exact:true}).inputValue()===draft,replyPreserved:(await p.locator('.reply-bar').innerText()).includes('Alpha original message'),samePartner:(await p.locator('.chat-partner > b').innerText()).trim()==='Synthetic Alpha',sameTranscript:await p.locator('.transcript').getByText('Alpha original message',{exact:true}).count()===1,noExtraDetailGET:counts.A===1&&counts.B===0});await screenshot('same-chat-resize-'+targetWidth);
    }
    add('Strict synthetic runtime guards',{noUnknown:r.unexpectedRequests===0,noMutations:r.unexpectedMutations===0,noCallbackPageError:r.callbackErrors===0&&r.pageErrors===0,noForward:r.realApiForwarded===0});r.status=r.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';save();continue;
   }
   assert(width>=1024,'DESKTOP_WIDTH_REQUIRED');
   const waitStarted=performance.now();for(let i=0;i<250&&!release;i++)await p.waitForTimeout(50);assert(typeof release==='function'&&counts.A===2,'REAL_ALPHA_QUIET_POLL_REQUIRED');r.waitForRealPollMs=performance.now()-waitStarted;
   await p.locator('.busy-scrim').waitFor({state:'hidden'});
   r.navigationPath='desktop-sibling-list';
   await p.locator('.chat-row').filter({hasText:'Synthetic Beta'}).click();await p.waitForURL('**/chat/202');
   if(outcome==='healthy')await p.locator('.transcript .bubble > p').filter({hasText:'Beta original message'}).waitFor();else await p.locator('.state[role=alert]').waitFor();await p.locator('.busy-scrim').waitFor({state:'hidden'});
   const inspect=async()=>({draftEmpty:await p.getByRole('textbox',{name:'Type a message...',exact:true}).inputValue()==='',noAlphaReply:await p.locator('.reply-bar').count()===0,noAlphaPartner:!(await p.locator('.chat-partner > b').innerText()).includes('Alpha'),noAlphaTranscript:await p.locator('.transcript').getByText(/Alpha/).count()===0,correctBetaOrError:outcome==='healthy'?(await p.locator('.chat-partner > b').innerText()).trim()==='Synthetic Beta'&&await p.locator('.transcript').getByText('Beta original message',{exact:true}).count()===1:await p.locator('.state[role=alert]').count()===1,composerHonest:outcome==='healthy'?await p.getByRole('button',{name:'Send',exact:true}).isEnabled():await p.getByRole('button',{name:'Send',exact:true}).isDisabled()&&await p.getByRole('textbox',{name:'Type a message...',exact:true}).isDisabled()});
   add('Switching actual conversation isolates draft reply and render',await inspect());await screenshot('beta-before-old-poll-release');
   const response=p.waitForResponse(res=>res.url()===api+'/api/users/chats/101'&&res.request().method()==='GET',{timeout:6000}).catch(()=>null);release();clearTimeout(holdTimer);holdTimer=null;const answer=await response;r.oldPollHTTP=answer?.status()??null;r.oldPollBodyCompleted=answer?await answer.finished()===null:false;await p.waitForTimeout(750);
   add('Old completed quiet poll cannot replace current conversation',{...await inspect(),old200Completed:r.oldPollHTTP===200&&r.oldPollBodyCompleted,routeStillBeta:new URL(p.url()).pathname==='/chat/202',oneRealOldPoll:counts.A===2,oneBetaLoad:counts.B===1,noSafetyRelease:!r.safetyRelease});await screenshot('beta-after-old-poll-release');
   add('Strict synthetic runtime guards',{noUnknown:r.unexpectedRequests===0,noMutations:r.unexpectedMutations===0,noCallbackPageError:r.callbackErrors===0&&r.pageErrors===0,noForward:r.realApiForwarded===0});r.status=r.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';save();
  }catch(error){r.errorName=['Error','TypeError','TimeoutError'].includes(error?.name)?error.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(error?.qaCode||'')?error.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
  finally{release?.();if(holdTimer)clearTimeout(holdTimer);if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unexpectedRequests||r.unexpectedMutations)r.status='FAIL';else if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 }
 return records;
}
