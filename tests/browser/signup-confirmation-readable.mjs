/** Controlled signup readability, validation, legal keyboard and Edit regression. API writes are rejected. */
const WIDTHS=[320];
export async function runSharedConfirmation039(browser,{engine,role,width,origin='http://localhost:4419',api='https://new.carezaar.com',language='en',baseData,onUpdate=()=>{},onScreenshot}={}){
 if(!baseData)throw Error('PUBLIC_BASE_DATA_REQUIRED');const base={...baseData,tsCache:10};
 const peerRole=role==='client'?'caregiver':'client',peerKind=peerRole==='caregiver'?'caregivers':'clients',ownKind=role==='client'?'clients':'caregivers';
 const authenticated=[['/main/matches','.list-head',''],['/main/messages','.empty-card',''],['/main/profile','.profile-card',''],['/favorites','.empty-card',''],['/help','a[href="mailto:support@carezaar.com"]',''],['/faq','.faq',''],['/change-language','.language-list-title',''],['/profile/edit','input[autocomplete="given-name"], input[type=text]','/main/matches'],['/profile/matches','.segmented[role=tablist]','/main/matches'],[role==='client'?'/preferences':'/skills','.stepper','/main/matches'],['/'+peerKind+'/synthetic-peer','.detail-facts h1','/main/matches'],['/matched/'+peerKind+'/synthetic-peer','[data-testid=matched-screen]','/main/matches'],['/notifications','.empty-card','/main/matches'],['/report-issue','.empty-card','/main/matches'],['/change-password','input[type=password]','/main/matches'],['/delete-account','select','/help'],['/chat/101','.chat-partner','/main/matches']];
 const anonymous=[['/intro','.intro-signin',''],['/sign-in','input[type=email]','/intro'],['/sign-up/'+role,'input[type=email]','/intro'],['/forgot-password','input[type=email]','/intro'],['/otp','.otp-boxes input','/intro'],['/setup-password','input[type=password]','/intro']];
 const records=[];
 for(const [signedIn,cases] of [[true,authenticated],[false,anonymous]])for(const [route,selector,landing] of cases){
  if(route!=='/sign-in'&&!route.startsWith('/sign-up/'))continue;
  if(route==='/sign-in')continue;
  const r={engine,version:browser.version(),role,width,route,language,signedInSyntheticFixture:signedIn,status:'IN PROGRESS',checks:[],counts:{base:0,info:0,profile:0,detail:0,chat:0,list:0},unknownRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:0,consoleErrors:0,realApiForwarded:0,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);const save=()=>onUpdate(records),need=(v,code)=>{if(!v){const e=Error(code);e.qaCode=code;throw e;}},add=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};save();
  let context,p;
  const pair={access_token:'synthetic-back-access',refresh_token:'synthetic-back-refresh'};
  const person=(kind,id,name)=>({id,role:kind,country_id:1,gender_id:1,email:kind+'@example.test',first_name:'Synthetic',last_name:name,photo:null,bio:'Synthetic navigation fixture',date_of_birth:'01/15/1990',is_favorite:false});
  const owner=person(role,'synthetic-owner','Owner'),peer=person(peerRole,'synthetic-peer','Peer');
  const full=(kind,user,active=false)=>({id:'synthetic-entity-'+kind,user,lat:39.8,lng:-98.5,clienttype_id:1,commute_id:1,experience_id:1,role_id:1,worktype_id:1,salary_min:20,salary_max:40,distance:1,is_match:active,match_status:active?'active':'none',match_id:active?301:null,carecondition_ids:[1],careday_ids:[1],carespecial_ids:[1],certification_ids:[],clienttype_ids:[1],commute_ids:[1],experience_ids:[1],gender_ids:[1],languageskill_ids:[1],role_ids:[1],shift_ids:[1],worktype_ids:[1]});
  const detail=full(peerRole,peer,route.startsWith('/matched/'));
  try{
   const storage=[{name:'carezaar.baseData.v3',value:JSON.stringify(base)},{name:'carezaar.languageCode',value:language},{name:'carezaar.languageId',value:language==='ar'?'3':'1'},...(signedIn?[{name:'carezaar.accessToken',value:pair.access_token},{name:'carezaar.refreshToken',value:pair.refresh_token}]:[])];
   context=await browser.newContext({viewport:{width,height:844},storageState:{cookies:[],origins:[{origin,localStorage:storage}]}});
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
     await p.setViewportSize({width:viewportWidth,height:844});
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
   if(route.startsWith('/sign-up/')){
     const next=p.locator('button[data-source="56:84406"]');
     await next.waitFor({state:'visible'});await next.click();
     const errors=p.locator('.field-message');
     add('Empty signup exposes three errors without registration',{threeErrors:await errors.count()===3,errorsVisible:await errors.evaluateAll(es=>es.every(e=>e.getBoundingClientRect().height>0)),zeroWrites:r.unexpectedMutations===0});
     const email=p.locator('input[type=email]'),passwords=p.locator('input[type=password]');
     await email.fill('invalid');await passwords.nth(0).fill('Synthetic7!');await passwords.nth(1).fill('Synthetic7!');await next.click();
     add('Invalid email precedes confirmation',{oneEmailError:await errors.count()===1,noConfirmation:await p.locator('[role="dialog"][aria-labelledby="signup-confirm"]').count()===0,zeroWrites:r.unexpectedMutations===0});
     await email.fill('synthetic-control@example.invalid');await next.click();await p.locator('.toast').waitFor();
     add('Valid fields still require agreement',{unchecked:!await p.locator('input[type=checkbox]').isChecked(),noConfirmation:await p.locator('[role="dialog"][aria-labelledby="signup-confirm"]').count()===0});
     const links=p.locator('.legal-link');
     for(let i=0;i<2;i++){
       for(let tabs=0;tabs<16&&!await links.nth(i).evaluate(e=>e===document.activeElement);tabs++)await p.keyboard.press(engine==='webkit'?'Alt+Tab':'Tab');
       need(await links.nth(i).evaluate(e=>e===document.activeElement),'NATURAL_TAB_REACHES_LEGAL_LINK');await p.keyboard.press('Enter');const dialog=p.getByRole('dialog');await dialog.waitFor();
       const b=await dialog.boundingBox(),v=await p.evaluate(()=>({w:innerWidth,h:innerHeight}));
       await p.getByRole('button',{name:'Zoom in',exact:true}).click();
       add('Legal link opens fitted dialog without agreement '+i,{fitted:b&&b.x>=0&&b.y>=0&&b.x+b.width<=v.w+1&&b.y+b.height<=v.h+1,unchecked:!await p.locator('input[type=checkbox]').isChecked(),actualZoom:await p.locator('.legal-zoom').innerText().then(x=>x.includes('125%'))});
       await p.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
       add('Keyboard-opened legal escape returns focus and preserves unchecked state '+i,{returnedFocus:await links.nth(i).evaluate(e=>e===document.activeElement),unchecked:!await p.locator('input[type=checkbox]').isChecked()});
     }
     await p.locator('label.checkbox').click({position:{x:8,y:8}});await next.click();
     const confirmationDialog=p.locator('[role="dialog"][aria-labelledby="signup-confirm"]'),confirm=confirmationDialog.locator('.dialog-actions .btn-primary'),edit=confirmationDialog.locator('.dialog-actions .btn-outline');await confirm.waitFor();
     const b=await confirm.boundingBox();
     add('Phone confirmation controls remain reachable',{confirmVisible:await confirm.isVisible(),editVisible:await edit.isVisible(),confirm44:b&&b.width>=43.5&&b.height>=43.5,insideViewport:b&&b.x>=0&&b.y>=0&&b.x+b.width<=320+1&&b.y+b.height<=844+1,zeroWrites:r.unexpectedMutations===0});
     r.confirmationLayouts=[];
     for(const w of [320,375,390,414,768,1024,1280,1440,1920]){
       await p.setViewportSize({width:w,height:844});await confirmationDialog.waitFor();await p.waitForTimeout(100);
       const box=await confirmationDialog.boundingBox(),readable=await confirmationDialog.locator('p').first().evaluate(e=>{let scale=1;for(let n=e;n;n=n.parentElement){const t=getComputedStyle(n).transform;if(t!=='none'){const m=new DOMMatrixReadOnly(t);scale*=Math.hypot(m.a,m.b);}}return{font:parseFloat(getComputedStyle(e).fontSize)*scale,text:e.textContent};});
       const predicates={semanticDialog:await confirmationDialog.count()===1,atLeast12CSSPixels:readable.font>=12,descriptionPresent:readable.text.trim().length>10,wholeDialogFits:box&&box.x>=0&&box.y>=0&&box.x+box.width<=w+1&&box.y+box.height<=845,emailRetained:(await confirmationDialog.innerText()).includes('synthetic-control@example.invalid'),passwordAbsent:!(await confirmationDialog.innerText()).includes('Synthetic7!'),zeroRegistration:r.unexpectedMutations===0};
       r.confirmationLayouts.push({width:w,effectiveFont:readable.font,predicates});add('Semantic readable confirmation at '+w,predicates);
       if(onScreenshot&&(w===320||w===1440))r.screenshots.push(await onScreenshot(p,{engine,role,width:w,route,language,tag:'semantic-confirmation'}));
     }
     await p.setViewportSize({width:320,height:844});await confirmationDialog.waitFor();
     if(onScreenshot)r.screenshots.push(await onScreenshot(p,{engine,role,width:320,route,language,tag:'confirmation'}));
     await edit.click();await confirm.waitFor({state:'hidden'});await next.waitFor();
     add('Actual confirmation Edit retains all typed fields and agreement',{emailRetained:await email.inputValue()==='synthetic-control@example.invalid',passwordRetained:await passwords.nth(0).inputValue()==='Synthetic7!',confirmationRetained:await passwords.nth(1).inputValue()==='Synthetic7!',agreementRetained:await p.locator('input[type=checkbox]').isChecked(),zeroWrites:r.unexpectedMutations===0});
     const samples=[];for(let i=0;i<4;i++){samples.push(await next.boundingBox());await p.waitForTimeout(90);}
     add('Measured agreement does not oscillate form geometry',{stable:samples.every(b=>b&&Math.abs(b.y-samples[0].y)<1&&Math.abs(b.height-samples[0].height)<1)});
   }else{
     const signup=p.locator('.scene-overlay > .center-row .link');await signup.click();await p.waitForURL('**/intro');await p.locator('.intro-signin').waitFor();
     add('Enlarged nested SignUp target opens real Intro',{intro:new URL(p.url()).pathname==='/intro',zeroWrites:r.unexpectedMutations===0});
   }
   add('Strict synthetic anonymous/restored-session guards',{oneMetadata:r.counts.base===1,expectedIdentity:signedIn?r.counts.info>=1:r.counts.info===0,noUnknown:r.unknownRequests===0,noMutation:r.unexpectedMutations===0,noCallbackPageConsoleError:r.callbackErrors===0&&r.pageErrors===0&&r.consoleErrors===0,noForward:r.realApiForwarded===0});r.status=r.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';save();
  }catch(e){r.errorName=['Error','TimeoutError','TypeError'].includes(e?.name)?e.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(e?.qaCode||'')?e.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
  finally{if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unknownRequests||r.unexpectedMutations)r.status='FAIL';else if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 }
 return records;
}
