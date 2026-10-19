/** Loaded private state across real trusted cross-tab synthetic session changes. No login, Save, or API forwarding. */
const tables=['careconditions','caredays','carespecials','certifications','clienttypes','commutes','contents','countries','experiences','genders','issuetypes','languageskills','reasons','roles','shifts','subjects','worktypes'];
const base={tsCache:10,tables:Object.fromEntries(tables.map(n=>[n,[{id:1,code:'synthetic',translations:[]}]])),extras:Object.fromEntries(['states','media','faqs','faq_categories'].map(n=>[n,[]])),languages:[{id:1,code:'en',name:'English',is_default:true,is_rtl:false}]};
export async function runPrivateSessionBoundary(browser,{engine,role,width,view,transition,origin='http://localhost:4419',api='https://new.carezaar.com',onUpdate=()=>{},onScreenshot}={}){
 let context,p,originalPreview;const r={engine,version:browser.version(),role,width,view,transition,status:'IN PROGRESS',checks:[],counts:{base:0,oldInfo:0,newInfo:0,oldPage1:0,newPage1:0,page2:0,notifications:0},unexpectedRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:0,consoleErrors:0,realApiForwarded:0,contextClosed:false,browserClosed:false};
 const save=()=>onUpdate(r),need=(v,code)=>{if(!v){const e=Error(code);e.qaCode=code;throw e;}},add=(name,predicates)=>{r.checks.push({case:name,predicates,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL'});save();};save();
 const old={access:'synthetic-private-old',refresh:'synthetic-private-refresh-old',owner:'synthetic-private-old-owner'},newer={access:'synthetic-private-new',refresh:'synthetic-private-refresh-new',owner:transition==='renew'?'synthetic-private-old-owner':'synthetic-private-new-owner'};
 const ownKind=role==='client'?'clients':'caregivers',peerRole=role==='client'?'caregiver':'client',path=view==='cards'?'/main/matches':'/profile/edit',draft='Synthetic unsaved old-owner draft — 🙂';
 const user=who=>({id:who==='old'||transition!=='other-user'?'synthetic-private-old-user':'synthetic-private-new-user',role,email:who+'@example.test',first_name:'Synthetic',last_name:who==='old'?'Old':'New',bio:who==='old'?'Old saved profile':'New saved profile',photo:null,gender_id:1,country_id:1,date_of_birth:'01/15/1990'});
 const card=who=>({id:'synthetic-private-'+who+'-entity',user:{id:'synthetic-private-'+who+'-peer',role:peerRole,first_name:'Synthetic',last_name:who==='old'?'Alpha':'Beta',email:null,date_of_birth:null,photo:null,is_favorite:false},is_match:false,salary_min:20,salary_max:40,distance:1,clienttype_id:1});
 try{
  context=await browser.newContext({viewport:{width,height:1000},storageState:{cookies:[],origins:[{origin,localStorage:[{name:'carezaar.baseData.v3',value:JSON.stringify(base)},{name:'carezaar.languageCode',value:'en'},{name:'carezaar.languageId',value:'1'},{name:'carezaar.accessToken',value:old.access},{name:'carezaar.refreshToken',value:old.refresh},{name:'carezaar.sessionOwner',value:old.owner}]}]}});
  const fulfill=(route,result,meta=null)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({result,message:'Synthetic response',errors:null,meta})});
  const paths=['/api/base/info','/api/auth/info','/api/'+ownKind+'/matches','/api/users/notifications/count'];
  await context.route('**/*',async route=>{try{
   const q=route.request(),u=new URL(q.url()),method=q.method(),bearer=q.headers().authorization;
   if(u.origin===origin&&u.pathname==='/__qa_private_session_owner__'&&method==='GET')return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Synthetic private state session probe</title>'});
   if(u.origin===origin&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method))return route.continue();
   if(u.origin===api&&method==='OPTIONS'&&paths.includes(u.pathname))return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'authorization,accept,accept-language,content-type'}});
   if(method!=='GET'){r.unexpectedMutations++;save();return route.abort('blockedbyclient');}
   if(u.origin===api){
    if(u.pathname==='/api/base/info'&&!bearer&&u.search==='?ts_cache=0'&&r.counts.base===0){r.counts.base++;save();return fulfill(route,{ts_cache:10});}
    const who=bearer==='Bearer '+old.access?'old':bearer==='Bearer '+newer.access?'new':null;
    if(who){
     if(u.pathname==='/api/auth/info'&&!u.search&&r.counts[who+'Info']<4){r.counts[who+'Info']++;save();return fulfill(route,user(who));}
     if(u.pathname==='/api/'+ownKind+'/matches'&&u.searchParams.get('sort')==='distance'&&u.searchParams.get('perPage')==='10'&&[...u.searchParams.keys()].length===3){
      if(u.searchParams.get('page')==='1'&&r.counts[who+'Page1']<2){r.counts[who+'Page1']++;save();return fulfill(route,[card(who)],{current_page:1,last_page:1,per_page:10,total:1});}
      if(u.searchParams.get('page')==='2'&&r.counts.page2<4){r.counts.page2++;save();return fulfill(route,[],{current_page:2,last_page:2,per_page:10,total:1});}
     }
     if(u.pathname==='/api/users/notifications/count'&&[...u.searchParams.keys()].join(',')==='checked_at'&&r.counts.notifications<10){r.counts.notifications++;save();return fulfill(route,0);}
    }
   }
   r.unexpectedRequests++;save();return route.abort('blockedbyclient');
  }catch{r.callbackErrors++;save();try{await route.abort('failed');}catch{/* sanitized counts only */}}});
  p=await context.newPage();p.setDefaultTimeout(6000);p.on('pageerror',()=>{r.pageErrors++;save();});p.on('console',m=>{if(m.type()==='error'){r.consoleErrors++;save();}});
  await p.addInitScript(()=>{window.__qaPrivateStorageEvents=0;window.addEventListener('storage',e=>{if(e.isTrusted&&e.key==='carezaar.accessToken')window.__qaPrivateStorageEvents++;});});
  await p.goto(origin+path,{waitUntil:'domcontentloaded'});
  if(view==='cards')await p.locator('.match-card h2').filter({hasText:'Synthetic Alpha'}).waitFor();else{await p.getByRole('textbox',{name:'Bio (optional)',exact:true}).waitFor();await p.locator('.busy-scrim').waitFor({state:'hidden'});
   const png=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=80;const g=c.getContext('2d');g.fillStyle='#005a7b';g.fillRect(0,0,160,80);return c.toDataURL('image/png').split(',')[1];});
   await p.getByRole('button',{name:'Upload Photo',exact:true}).click();const dialog=p.getByRole('dialog',{name:'Upload Photo',exact:true});await dialog.waitFor();const chosen=p.waitForEvent('filechooser',{timeout:6000}).catch(()=>null);await dialog.getByRole('button',{name:'Gallery',exact:true}).click();const chooser=await chosen;need(chooser,'REAL_FILE_CHOOSER_EVENT_REQUIRED');await chooser.setFiles({name:'synthetic-private-rectangle.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
   const crop=p.locator('.cropper[role=dialog]');await crop.waitFor();await p.waitForFunction(()=>!document.querySelector('.cropper-bar button:last-child')?.disabled);await crop.getByRole('button',{name:'Confirm',exact:true}).click();await crop.waitFor({state:'hidden'});const preview=p.locator('.photo-row .avatar img');await preview.waitFor();await p.waitForFunction(()=>{const i=document.querySelector('.photo-row .avatar img');return i?.complete&&i.naturalWidth===800&&i.naturalHeight===800;},null,{timeout:6000});originalPreview=await preview.getAttribute('src');need(typeof originalPreview==='string'&&originalPreview.startsWith('blob:')&&await preview.evaluate(img=>img.naturalWidth===800&&img.naturalHeight===800),'DECODED_LOCAL_CROPPED_PREVIEW_REQUIRED');
  }
  await p.locator('.busy-scrim').waitFor({state:'hidden'});need(r.counts.oldInfo>=1&&(view!=='cards'||r.counts.oldPage1===1),'LOADED_OLD_PRIVATE_STATE_REQUIRED');
  const newAnswer=p.waitForResponse(res=>res.url()===api+'/api/auth/info'&&res.request().headers().authorization==='Bearer '+newer.access,{timeout:6000}).catch(()=>null);
  const other=await context.newPage();await other.goto(origin+'/__qa_private_session_owner__');
  await other.evaluate(newer=>{localStorage.setItem('carezaar.sessionOwner',newer.owner);localStorage.setItem('carezaar.refreshToken',newer.refresh);localStorage.setItem('carezaar.accessToken',newer.access);},newer);
  await p.waitForFunction(()=>window.__qaPrivateStorageEvents>=1);const answer=await newAnswer;r.currentUserBodyOutcome=answer?await Promise.race([answer.finished().then(v=>v===null?'completed':'finish-error').catch(()=>'rejected'),p.waitForTimeout(3000).then(()=>'bounded-timeout')]):'response-missing';need(answer&&answer.status()===200&&r.currentUserBodyOutcome==='completed','NEW_CURRENT_USER_RESPONSE_COMPLETED');await other.close();await p.waitForTimeout(750);await p.locator('.busy-scrim').waitFor({state:'hidden'});
  const pair=await p.evaluate(()=>({access:localStorage.getItem('carezaar.accessToken'),refresh:localStorage.getItem('carezaar.refreshToken'),owner:localStorage.getItem('carezaar.sessionOwner'),events:window.__qaPrivateStorageEvents,language:localStorage.getItem('carezaar.languageCode')}));
  if(view==='cards'){
   const labels=await p.locator('.match-card h2').allTextContents(),renew=transition==='renew';
   add('Loaded match list belongs to current logical login',{correctCard:labels.length===1&&labels[0].trim()===(renew?'Synthetic Alpha':'Synthetic Beta'),noOldAccountCard:renew||!labels.some(s=>s.includes('Alpha')),newOwnerListRead:renew?r.counts.newPage1===0:r.counts.newPage1===1,oldPageNotReloaded:r.counts.oldPage1===1});
  }else{
   const preview=p.locator('.photo-row .avatar img'),renew=transition==='renew';
   add('Unsaved local upload remains only within the same logical login',{correctPreview:renew?await preview.count()===1&&await preview.getAttribute('src')===originalPreview:await preview.count()===0,correctControls:renew?await p.getByRole('button',{name:'Remove Photo',exact:true}).isVisible():await p.getByRole('button',{name:'Upload Photo',exact:true}).isVisible(),sameOwnerImageDecoded:!renew||await preview.count()===1&&await preview.evaluate(img=>img.complete&&img.naturalWidth===800&&img.naturalHeight===800)});
  }
  add('Trusted session change preserves exact current pair and route',{trustedStorage:pair.events>=1,newIdentityCompleted:r.counts.newInfo>=1,access:pair.access===newer.access,refresh:pair.refresh===newer.refresh,owner:pair.owner===newer.owner,routePreserved:new URL(p.url()).pathname===path,languagePreserved:pair.language==='en'});
  add('Strict synthetic runtime guards',{noUnknown:r.unexpectedRequests===0,noMutation:r.unexpectedMutations===0,noErrors:r.callbackErrors===0&&r.pageErrors===0&&r.consoleErrors===0,noForward:r.realApiForwarded===0});
  if(onScreenshot)r.screenshot=await onScreenshot(p,{engine,role,width,view,transition});r.status=r.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';save();
 }catch(e){r.errorName=['Error','TimeoutError','TypeError'].includes(e?.name)?e.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(e?.qaCode||'')?e.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
 finally{if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unexpectedRequests||r.unexpectedMutations||r.pageErrors||r.consoleErrors)r.status='FAIL';if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}return r;
}
