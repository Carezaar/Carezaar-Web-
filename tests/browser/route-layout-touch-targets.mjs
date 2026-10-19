/** SOURCE ONLY Phase5 supplement. No runner execution before root review.
 * Each case is an actual new tab/direct idx0. Synthetic saved session is not login. */
const WIDTHS=[320,375,390,414,768,1024,1280,1440,1920];
export async function runFullRouteLayout(browser,{engine,role,width,origin='http://localhost:4419',api='https://new.carezaar.com',language='en',baseData,onUpdate=()=>{},onScreenshot}={}){
 const base=structuredClone(baseData);base.tsCache=10;
 const peerRole=role==='client'?'caregiver':'client',peerKind=peerRole==='caregiver'?'caregivers':'clients',ownKind=role==='client'?'clients':'caregivers';
 const authenticated=[['/main/matches','.list-head',''],['/main/messages','.empty-card',''],['/main/profile','.profile-card',''],['/favorites','.empty-card',''],['/help','a[href="mailto:support@carezaar.com"]',''],['/faq','.faq',''],['/change-language','.language-list-title',''],['/profile/edit','input[autocomplete="given-name"], input[type=text]','/main/matches'],['/profile/matches','.segmented[role=tablist]','/main/matches'],[role==='client'?'/preferences':'/skills','.stepper','/main/matches'],['/'+peerKind+'/synthetic-peer','.detail-facts h1','/main/matches'],['/matched/'+peerKind+'/synthetic-peer','[data-testid=matched-screen]','/main/matches'],['/notifications','.empty-card','/main/matches'],['/report-issue','.empty-card','/main/matches'],['/change-password','input[type=password]','/main/matches'],['/delete-account','select','/help'],['/chat/101','.chat-partner','/main/matches']];
 const anonymous=[['/intro','.intro-signin',''],['/sign-in','input[type=email]','/intro'],['/sign-up/'+role,'input[type=email]','/intro'],['/forgot-password','input[type=email]','/intro'],['/otp','.otp-boxes input','/intro'],['/setup-password','input[type=password]','/intro']];
 const records=[];
 for(const [signedIn,cases] of [[true,authenticated],[false,anonymous]])for(const [route,selector,landing] of cases){
  const r={engine,version:browser.version(),role,width,route,language,signedInSyntheticFixture:signedIn,status:'IN PROGRESS',checks:[],counts:{base:0,info:0,profile:0,detail:0,chat:0,list:0},unknownRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:0,consoleErrors:0,realApiForwarded:0,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);const save=()=>onUpdate(records),need=(v,code)=>{if(!v){const e=Error(code);e.qaCode=code;throw e;}},add=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};save();
  let context,p;
  const pair={access_token:'synthetic-back-access',refresh_token:'synthetic-back-refresh'};
  const person=(kind,id,name)=>({id,role:kind,country_id:1,gender_id:1,email:kind+'@example.test',first_name:'Synthetic',last_name:name,photo:null,bio:'Synthetic navigation fixture',date_of_birth:'01/15/1990',is_favorite:false});
  const owner=person(role,'synthetic-owner','Owner'),peer=person(peerRole,'synthetic-peer','Peer');
  const full=(kind,user,active=false)=>({id:'synthetic-entity-'+kind,user,lat:39.8,lng:-98.5,clienttype_id:1,commute_id:1,experience_id:1,role_id:1,worktype_id:1,salary_min:20,salary_max:40,distance:1,is_match:active,match_status:active?'active':'none',match_id:active?301:null,carecondition_ids:[1],careday_ids:[1],carespecial_ids:[1],certification_ids:[],clienttype_ids:[1],commute_ids:[1],experience_ids:[1],gender_ids:[1],languageskill_ids:[1],role_ids:[1],shift_ids:[1],worktype_ids:[1]});
  const detail=full(peerRole,peer,route.startsWith('/matched/'));
  try{
   const storage=[{name:'carezaar.baseData.v3',value:JSON.stringify(base)},{name:'carezaar.languageCode',value:language},{name:'carezaar.languageId',value:language==='ar'?'3':'1'},...(signedIn?[{name:'carezaar.accessToken',value:pair.access_token},{name:'carezaar.refreshToken',value:pair.refresh_token}]:[])];
   context=await browser.newContext({viewport:{width,height:1000},storageState:{cookies:[],origins:[{origin,localStorage:storage}]}});
   if(!signedIn&&['/otp','/setup-password'].includes(route))await context.addInitScript(({role,recovery})=>{sessionStorage.setItem('carezaar.signup',JSON.stringify({role,email:'synthetic-nav@example.test',password:'Synthetic-QA-Only1!',userId:null,entityCreated:false,isPasswordRecovery:recovery}));},{role,recovery:route==='/setup-password'});
   const fulfill=(handler,result,meta=null)=>handler.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({result,message:'Synthetic response',errors:null,meta})});
   const paths=['/api/base/info','/api/auth/info','/api/'+ownKind+'/profile','/api/'+ownKind+'/'+peerKind+'/synthetic-peer','/api/'+ownKind+'/matches','/api/users/matches','/api/users/notifications','/api/users/notifications/count','/api/users/issues','/api/users/chats','/api/users/bookmarks','/api/users/chats/101'];
   await context.route('**/*',async handler=>{try{
    const q=handler.request(),u=new URL(q.url()),method=q.method(),bearer=q.headers().authorization;
    if(u.origin===origin&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method))return handler.continue();
    if(u.origin!==api||!paths.includes(u.pathname)){r.unknownRequests++;save();return handler.abort('blockedbyclient');}
    if(method==='OPTIONS')return handler.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'authorization,accept,accept-language,content-type'}});
    if(method!=='GET'){r.unexpectedMutations++;save();return handler.abort('blockedbyclient');}
    if(u.pathname==='/api/base/info'&&!bearer&&u.searchParams.get('ts_cache')==='0'&&[...u.searchParams.keys()].length===1&&r.counts.base===0){r.counts.base++;return fulfill(handler,{ts_cache:10});}
    if(signedIn&&bearer==='Bearer '+pair.access_token){
     if(u.pathname==='/api/auth/info'&&!u.search&&r.counts.info<2){r.counts.info++;return fulfill(handler,owner);}
     if(u.pathname==='/api/'+ownKind+'/profile'&&!u.search&&r.counts.profile===0){r.counts.profile++;return fulfill(handler,full(role,owner));}
     if(u.pathname==='/api/'+ownKind+'/'+peerKind+'/synthetic-peer'&&!u.search&&r.counts.detail===0){r.counts.detail++;return fulfill(handler,detail);}
     if(u.pathname==='/api/users/notifications/count'&&u.searchParams.has('checked_at')&&[...u.searchParams.keys()].length===1)return fulfill(handler,0);
     if(u.pathname==='/api/users/issues'&&!u.search){r.counts.list++;return fulfill(handler,[]);}
     const matchList=u.pathname==='/api/'+ownKind+'/matches'&&u.searchParams.get('sort')==='distance'&&[...u.searchParams.keys()].sort().join(',')==='page,perPage,sort';
     const ownMatches=u.pathname==='/api/users/matches'&&u.searchParams.get('type')==='matches'&&[...u.searchParams.keys()].sort().join(',')==='page,perPage,type';
     const notifications=['/api/users/notifications','/api/users/chats','/api/users/bookmarks'].includes(u.pathname)&&[...u.searchParams.keys()].sort().join(',')==='page,perPage';
     if((matchList||ownMatches||notifications)&&u.searchParams.get('page')==='1'&&u.searchParams.get('perPage')==='10'&&r.counts.list<32){r.counts.list++;return fulfill(handler,[],{current_page:1,last_page:1,per_page:10,total:0});}
     if(u.pathname==='/api/users/chats/101'&&!u.search&&r.counts.chat<12){r.counts.chat++;return fulfill(handler,{id:101,client:full('client',role==='client'?owner:peer,true),caregiver:full('caregiver',role==='caregiver'?owner:peer,true),messages:[],new_message_count:0,last_message:null,updated_at:null});}
    }
    r.unknownRequests++;save();return handler.abort('blockedbyclient');
   }catch{r.callbackErrors++;save();try{await handler.abort('failed');}catch{/* sanitized counters only */}}});
   p=await context.newPage();p.setDefaultTimeout(6000);p.on('pageerror',()=>{r.pageErrors++;save();});p.on('console',m=>{if(m.type()==='error'){r.consoleErrors++;save();}});
   await p.goto(origin+route,{waitUntil:'domcontentloaded'});await p.locator(selector).first().waitFor({state:'visible'});await p.locator('.busy-scrim').waitFor({state:'hidden'});
   need(new URL(p.url()).pathname===route,'EXACT_ROUTE_READY_REQUIRED');
   r.layouts=[];
   for(const viewportWidth of WIDTHS){
     await p.setViewportSize({width:viewportWidth,height:1000});
     await p.locator('.busy-scrim').waitFor({state:'hidden'});
     await p.waitForTimeout(90);
     const metrics=await p.evaluate(()=>{
       const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
       const small=[...document.querySelectorAll('button,a[href],summary,[role="button"],[role="radio"]')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return{label:(e.getAttribute('aria-label')||e.textContent||'').trim().slice(0,90),class:e.className,width:r.width,height:r.height};}).filter(r=>r.width<43.5||r.height<43.5);
       const dialogs=[...document.querySelectorAll('[role="dialog"]')].filter(visible).map(e=>{const r=e.getBoundingClientRect();return r.left>=-1&&r.top>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;});
       const clipping=[...document.querySelectorAll('h1,h2,h3,p,label,button,summary')].filter(visible).filter(e=>e.scrollWidth>e.clientWidth+2||e.scrollHeight>e.clientHeight+2).map(e=>({tag:e.tagName,class:e.className,text:(e.textContent||'').trim().slice(0,90),overflow:getComputedStyle(e).overflow,textOverflow:getComputedStyle(e).textOverflow}));
       return{width:innerWidth,documentWidth:document.documentElement.scrollWidth,dir:document.documentElement.dir,smallTargets:small,dialogsFit:dialogs.every(Boolean),textClippingDiagnostics:clipping};
     });
     r.layouts.push(metrics);
     add('Settled route layout '+viewportWidth,{actualWidth:metrics.width===viewportWidth,noHorizontalScroll:metrics.documentWidth<=viewportWidth+1,direction:metrics.dir===(language==='ar'?'rtl':'ltr'),dialogsFit:metrics.dialogsFit,phoneTargets:viewportWidth>=768||metrics.smallTargets.length===0});
     if(onScreenshot&&(viewportWidth===320||viewportWidth===1440))r.screenshots.push(await onScreenshot(p,{engine,role,width:viewportWidth,route,language,tag:'layout'}));
   }
   add('Strict synthetic anonymous/restored-session guards',{oneMetadata:r.counts.base===1,expectedIdentity:signedIn?r.counts.info>=1:r.counts.info===0,noUnknown:r.unknownRequests===0,noMutation:r.unexpectedMutations===0,noCallbackPageConsoleError:r.callbackErrors===0&&r.pageErrors===0&&r.consoleErrors===0,noForward:r.realApiForwarded===0});r.status=r.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';save();
  }catch(e){r.errorName=['Error','TimeoutError','TypeError'].includes(e?.name)?e.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(e?.qaCode||'')?e.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
  finally{if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unknownRequests||r.unexpectedMutations)r.status='FAIL';else if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 }
 return records;
}
