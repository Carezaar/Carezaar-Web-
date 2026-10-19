/** SOURCE-PREPARED synthetic send-path neighbors for REG028. No real API forwarding.
 * Caller supplies an isolated browser and owns output. Not evidence until executed. */
const tables=['careconditions','caredays','carespecials','certifications','clienttypes','commutes','contents','countries','experiences','genders','issuetypes','languageskills','reasons','roles','shifts','subjects','worktypes'];
const cache={tsCache:10,tables:Object.fromEntries(tables.map(k=>[k,[{id:1,code:'synthetic',translations:[]}]])),extras:Object.fromEntries(['states','media','faqs','faq_categories'].map(k=>[k,[]])),languages:[{id:1,code:'en',name:'English',is_default:true,is_rtl:false}]};
export async function runChatSendConversationOwnership(browser,{engine,role='client',width=390,origin='http://localhost:4419',api='https://new.carezaar.com',onUpdate=()=>{},onScreenshot}={}){
 let context,p,plan,sequence=3000;const holds=new Set(),records=[];
 const counts={posts:0,A:0,B:0,list:0},pair={access_token:'synthetic-send-access',refresh_token:'synthetic-send-refresh'};
 const r={engine,version:browser.version(),role,width,status:'IN PROGRESS',scope:'Synthetic normal send/abort/reconciliation/old-conversation settlement; no live account or clipboard',checks:[],counts,unexpectedRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:0,consoleErrorCount:0,realApiForwarded:0,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);
 const save=()=>onUpdate(records),assert=(v,code)=>{if(!v){const e=Error(code);e.qaCode=code;throw e;}},add=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};save();
 const user=(kind,label)=>({id:'synthetic-'+kind+'-'+label,role:kind,first_name:'Synthetic',last_name:label,email:null,photo:null,date_of_birth:null});
 const entity=(kind,label)=>({id:'synthetic-entity-'+kind+'-'+label,user:user(kind,label),is_match:true});
 const original=(id,label)=>({id:id*10+1,message:label+' original message',created_at:'2026-10-19 10:00:00',seen_at:null,is_from_caregiver:role!=='caregiver',parent:null});
 const chats=Object.fromEntries([[101,'Alpha'],[202,'Beta']].map(([id,label])=>[id,{id,client:entity('client',label),caregiver:entity('caregiver',label),updated_at:'2026-10-19 10:00:00',last_message:label+' original message',new_message_count:0,is_seen:true,messages:[original(id,label)]}]));
 const box=()=>p.getByRole('textbox',{name:'Type a message...',exact:true});
 const settle=async()=>{await p.locator('.busy-scrim').waitFor({state:'hidden'});};
 const waitUntil=async predicate=>{for(let i=0;i<120;i++){if(await predicate())return;await p.waitForTimeout(50);}assert(false,'BOUNDED_STATE_WAIT');};
 const changeCount=()=>p.evaluate(()=>window.__qaChatChanges);
 const screenshot=async tag=>{if(onScreenshot)r.screenshots.push(await onScreenshot(p,{engine,role,width,tag}));};
 const responseFor=id=>p.waitForResponse(res=>res.url()===api+'/api/users/chats/'+id&&res.request().method()==='POST',{timeout:6000}).catch(()=>null);
 const finish=async(id,entry)=>{const response=responseFor(id);entry.release();const answer=await response;return answer?.status()===200&&await answer.finished()===null;};
 const prepare=(id,text,kind,parent=null)=>{assert(!plan,'NO_OVERLAPPING_PLAN');const entry={id,text,kind,parent,entered:false,released:false};plan=entry;return entry;};
 const send=async entry=>{await box().fill(entry.text);await box().press('Enter');await waitUntil(()=>entry.entered);};
 const commit=entry=>{const parent=entry.parent===null?null:chats[entry.id].messages.find(m=>m.id===entry.parent);assert(entry.parent===null||parent,'EXACT_PARENT');const msg={id:++sequence,message:entry.text,created_at:'2026-10-19 10:01:00',seen_at:null,is_from_caregiver:role==='caregiver',parent};chats[entry.id]={...chats[entry.id],messages:[...chats[entry.id].messages,msg],last_message:entry.text};return chats[entry.id];};
 try{
  context=await browser.newContext({viewport:{width,height:1000},storageState:{cookies:[],origins:[{origin,localStorage:[{name:'carezaar.accessToken',value:pair.access_token},{name:'carezaar.refreshToken',value:pair.refresh_token},{name:'carezaar.baseData.v3',value:JSON.stringify(cache)},{name:'carezaar.languageCode',value:'en'},{name:'carezaar.languageId',value:'1'}]}]}});
  const fulfill=(route,result,meta=null)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({result,message:'Synthetic response',errors:null,meta})});
  await context.route('**/*',async route=>{try{
   const req=route.request(),u=new URL(req.url()),method=req.method(),bearer=req.headers().authorization;
   if(u.origin===origin&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method))return route.continue();
   const paths=['/api/base/info','/api/auth/info','/api/users/chats','/api/users/chats/101','/api/users/chats/202','/api/users/notifications/count'];
   if(u.origin!==api||!paths.includes(u.pathname)){r.unexpectedRequests++;save();return route.abort('blockedbyclient');}
   if(method==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,accept,accept-language,content-type'}});
   if(method==='GET'&&u.pathname==='/api/base/info'&&!bearer&&u.searchParams.get('ts_cache')==='0'&&[...u.searchParams.keys()].length===1)return fulfill(route,{ts_cache:10});
   if(bearer!=='Bearer '+pair.access_token){r.unexpectedRequests++;save();return route.abort('blockedbyclient');}
   if(method==='GET'){
    if(u.pathname==='/api/auth/info'&&!u.search)return fulfill(route,{...user(role,'Fixture'),email:role+'@example.test'});
    if(u.pathname==='/api/users/notifications/count'&&u.searchParams.has('checked_at')&&[...u.searchParams.keys()].length===1)return fulfill(route,0);
    if(u.pathname==='/api/users/chats'&&u.searchParams.get('perPage')==='10'&&['1','2'].includes(u.searchParams.get('page'))&&[...u.searchParams.keys()].length===2){if(++counts.list>30){r.unexpectedRequests++;return route.abort('blockedbyclient');}return fulfill(route,u.searchParams.get('page')==='1'?Object.values(chats):[],{current_page:Number(u.searchParams.get('page')),last_page:1,per_page:10,total:2});}
    const id=Number(u.pathname.split('/').at(-1));if(chats[id]&&!u.search){if(++counts[id===101?'A':'B']>20){r.unexpectedRequests++;return route.abort('blockedbyclient');}save();return fulfill(route,chats[id]);}
   }
   if(method==='POST'){
    const entry=plan,body=new URLSearchParams(req.postData()||''),keys=[...body.keys()].sort();
    const valid=entry&&!entry.entered&&!u.search&&u.pathname==='/api/users/chats/'+entry.id&&body.get('message')===entry.text&&JSON.stringify(keys)===JSON.stringify(entry.parent===null?['message']:['message','parent_id'])&&(entry.parent===null||body.get('parent_id')===String(entry.parent))&&counts.posts<6;
    if(!valid){r.unexpectedMutations++;save();return route.abort('blockedbyclient');}
    entry.entered=true;plan=null;counts.posts++;save();
    if(entry.kind==='preabort')return route.abort('failed');
    if(entry.kind==='lost'){commit(entry);return route.abort('failed');}
    const held=new Promise(resolve=>{entry.release=()=>{if(!entry.released){entry.released=true;resolve();}};});holds.add(entry);
    entry.timer=setTimeout(()=>{r.safetyRelease=true;entry.release();},20000);await held;clearTimeout(entry.timer);holds.delete(entry);return fulfill(route,commit(entry));
   }
   r.unexpectedMutations++;save();return route.abort('blockedbyclient');
  }catch{r.callbackErrors++;save();try{await route.abort('failed');}catch{/* no raw errors */}}});
  p=await context.newPage();p.setDefaultTimeout(6000);p.on('pageerror',()=>{r.pageErrors++;save();});p.on('console',m=>{if(m.type()==='error'){r.consoleErrorCount++;save();}});
  await p.goto(origin+'/main/messages',{waitUntil:'domcontentloaded'});await p.locator('.chat-row').filter({hasText:'Synthetic Alpha'}).waitFor();await settle();await p.locator('.chat-row').filter({hasText:'Synthetic Alpha'}).click();await p.waitForURL('**/chat/101');await p.locator('.transcript').getByText('Alpha original message',{exact:true}).waitFor();await settle();
  await p.evaluate(()=>{window.__qaChatChanges=0;window.addEventListener('carezaar:chats-changed',()=>window.__qaChatChanges++);});
  await p.getByRole('button',{name:'Send',exact:true}).click();await p.getByText('Please type a message first.',{exact:true}).waitFor();
  add('Healthy empty Send preserves K4 managed validation',{exactManagedToast:await p.getByText('Please type a message first.',{exact:true}).count()===1,zeroPOST:counts.posts===0,draftEmpty:await box().inputValue()==='',sendEnabled:await p.getByRole('button',{name:'Send',exact:true}).isEnabled()});
  await p.getByRole('button',{name:'Message options',exact:true}).click();await p.getByRole('menuitem',{name:'Reply',exact:true}).click();
  const normal=prepare(101,'Synthetic normal — 🙂 مرحبا\nsecond line','held',1011),beforeNormal=counts.posts;await send(normal);await waitUntil(()=>box().getAttribute('aria-busy').then(v=>v==='true'));for(let i=0;i<3;i++)await box().press('Enter');
  add('Normal held send locks repeated Enter',{onePOST:counts.posts===beforeNormal+1,actualBusy:await box().getAttribute('aria-busy')==='true',readOnly:await box().evaluate(el=>el.readOnly),textRetained:await box().inputValue()===normal.text});
  const normal200=await finish(101,normal);await waitUntil(async()=>await box().inputValue()===''&&await box().getAttribute('aria-busy')==='false');await settle();
  add('Normal send completes once with exact reply parent',{completed200:normal200,once:chats[101].messages.filter(m=>m.message===normal.text&&m.parent?.id===1011).length===1,composerEmpty:await box().inputValue()==='',replyReset:await p.locator('.reply-bar').count()===0,oneEvent:await changeCount()===1});
  const failed=prepare(101,'Synthetic pre-delivery retained','preabort'),beforeFailure=counts.posts,aReads=counts.A;await send(failed);await waitUntil(async()=>await box().getAttribute('aria-busy')==='false'&&counts.A>aReads);
  add('Pre-delivery failure retains draft without automatic replay',{onePOST:counts.posts===beforeFailure+1,reconciled:counts.A>aReads,draftRetained:await box().inputValue()===failed.text,notStored:!chats[101].messages.some(m=>m.message===failed.text)});
  const retry=prepare(101,failed.text,'held');await box().press('Enter');await waitUntil(()=>retry.entered);const retry200=await finish(101,retry);await waitUntil(async()=>await box().inputValue()==='');await settle();
  add('Explicit retry sends retained text once',{completed200:retry200,twoTotalAttempts:counts.posts===beforeFailure+2,storedOnce:chats[101].messages.filter(m=>m.message===failed.text).length===1});
  const lost=prepare(101,'Synthetic delivered lost response','lost'),beforeLost=counts.posts,beforeLostReads=counts.A;await send(lost);await waitUntil(async()=>await box().getAttribute('aria-busy')==='false'&&await box().inputValue()===''&&counts.A>beforeLostReads);await settle();
  add('Delivered lost response reconciles without POST replay',{onePOST:counts.posts===beforeLost+1,storedOnce:chats[101].messages.filter(m=>m.message===lost.text).length===1,actualGETReconcile:counts.A>beforeLostReads,composerCleared:await box().inputValue()===''});
  const old=prepare(101,'Synthetic old Alpha pending','held');await send(old);
  if(width>=1024){await p.locator('.chat-row').filter({hasText:'Synthetic Beta'}).click();}else{await p.getByRole('button',{name:'Back',exact:true}).click();await p.waitForURL('**/main/messages');await p.locator('.chat-row').filter({hasText:'Synthetic Beta'}).waitFor();await settle();await p.locator('.chat-row').filter({hasText:'Synthetic Beta'}).click();}
  await p.waitForURL('**/chat/202');await p.locator('.transcript').getByText('Beta original message',{exact:true}).waitFor();await settle();
  const beta=prepare(202,'Synthetic Beta pending retained','held');await send(beta);await waitUntil(()=>box().getAttribute('aria-busy').then(v=>v==='true'));const eventsBeforeOld=await changeCount(),beforeOldRelease=counts.posts;
  const old200=await finish(101,old);await p.waitForTimeout(350);for(let i=0;i<3;i++)await box().press('Enter');
  add('Old Alpha completion cannot clear or unlock pending Beta',{old200Completed:old200,routeBeta:new URL(p.url()).pathname==='/chat/202',partnerBeta:(await p.locator('.chat-partner > b').innerText()).trim()==='Synthetic Beta',betaDraftRetained:await box().inputValue()===beta.text,betaStillBusy:await box().getAttribute('aria-busy')==='true',betaReadOnly:await box().evaluate(el=>el.readOnly),noAdditionalPOST:counts.posts===beforeOldRelease,noOldGlobalDispatch:await changeCount()===eventsBeforeOld,noAlphaTranscript:await p.locator('.transcript').getByText(old.text,{exact:true}).count()===0});await screenshot('beta-pending-after-old-alpha-completion');
  const beta200=await finish(202,beta);await waitUntil(async()=>await box().inputValue()===''&&await box().getAttribute('aria-busy')==='false');await settle();
  add('Current Beta completion settles its own send',{completed200:beta200,storedOnce:chats[202].messages.filter(m=>m.message===beta.text).length===1,composerEmpty:await box().inputValue()==='',oneCurrentDispatch:await changeCount()===eventsBeforeOld+1,exactSixPOSTs:counts.posts===6});
  add('Strict synthetic guards',{noUnknown:r.unexpectedRequests===0,noUnexpectedMutation:r.unexpectedMutations===0,noCallbackPageError:r.callbackErrors===0&&r.pageErrors===0,noForward:r.realApiForwarded===0,noSafetyRelease:!r.safetyRelease});r.status=r.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';save();
 }catch(e){r.errorName=['Error','TypeError','TimeoutError'].includes(e?.name)?e.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(e?.qaCode||'')?e.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
 finally{for(const entry of holds){clearTimeout(entry.timer);entry.release();}if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unexpectedRequests||r.unexpectedMutations)r.status='FAIL';else if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 return records;
}
