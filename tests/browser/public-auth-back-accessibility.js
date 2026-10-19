/** Anonymous phone auth Back semantic+navigation regression. Strict synthetic GET only. */
const tables=['careconditions','caredays','carespecials','certifications','clienttypes','commutes','contents','countries','experiences','genders','issuetypes','languageskills','reasons','roles','shifts','subjects','worktypes'];
const cache={tsCache:10,tables:Object.fromEntries(tables.map(k=>[k,[{id:1,code:'synthetic',translations:[]}]])),extras:Object.fromEntries(['states','media','faqs','faq_categories'].map(k=>[k,[]])),languages:[{id:1,code:'en',name:'English',is_default:true,is_rtl:false}]};
export async function runPublicAuthBackAccessibility(browser,{engine,width,route,origin='http://localhost:4419',api='https://new.carezaar.com',onUpdate=()=>{},onScreenshot}={}){
 let context,page;const records=[],r={engine,version:browser.version(),width,route,status:'IN PROGRESS',checks:[],baseGET:0,unknownRequests:0,unexpectedMutations:0,callbackErrors:0,pageErrors:0,consoleErrors:0,realApiForwarded:0,navigationExecuted:false,contextClosed:false,browserClosed:false,screenshots:[]};records.push(r);
 const save=()=>onUpdate(records),need=(v,code)=>{if(!v){const e=Error(code);e.qaCode=code;throw e;}},add=(name,predicates)=>{r.checks.push({case:name,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});save();};save();
 try{
  context=await browser.newContext({viewport:{width,height:1000},storageState:{cookies:[],origins:[{origin,localStorage:[{name:'carezaar.baseData.v3',value:JSON.stringify(cache)},{name:'carezaar.languageCode',value:'en'},{name:'carezaar.languageId',value:'1'}]}]}});
  await context.route('**/*',async handler=>{try{
   const q=handler.request(),u=new URL(q.url()),method=q.method();
   if(u.origin===origin&&!u.pathname.startsWith('/api/')&&['GET','HEAD'].includes(method))return handler.continue();
   if(u.origin===api&&u.pathname==='/api/base/info'&&method==='OPTIONS')return handler.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'accept,accept-language,content-type'}});
   if(method!=='GET'){r.unexpectedMutations++;save();return handler.abort('blockedbyclient');}
   if(u.origin===api&&u.pathname==='/api/base/info'&&!q.headers().authorization&&u.searchParams.get('ts_cache')==='0'&&[...u.searchParams.keys()].length===1&&r.baseGET===0){r.baseGET++;save();return handler.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({result:{ts_cache:10},message:'Synthetic metadata',errors:null})});}
   r.unknownRequests++;save();return handler.abort('blockedbyclient');
  }catch{r.callbackErrors++;save();try{await handler.abort('failed');}catch{/* no raw errors */}}});
  page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',()=>{r.pageErrors++;save();});page.on('console',m=>{if(m.type()==='error'){r.consoleErrors++;save();}});
  await page.goto(origin+route,{waitUntil:'domcontentloaded'});await page.locator('input[type=email]').waitFor();await page.locator('.busy-scrim').waitFor({state:'hidden'});
  const back=page.getByRole('button',{name:'Back',exact:true}),count=await back.count();r.accessibleBackCount=count;
  const before=await page.evaluate(()=>({idx:history.state?.idx,length:history.length,authAbsent:localStorage.getItem('carezaar.accessToken')===null&&localStorage.getItem('carezaar.refreshToken')===null}));
  add('Phone auth exposes one visible enabled accessible Back action',{uniqueAccessibleBack:count===1,visibleAccessibleBack:count===1&&await back.isVisible(),enabledAccessibleBack:count===1&&await back.isEnabled(),directHistoryZero:before.idx===0,anonymous:before.authAbsent,actualWidth:await page.evaluate(()=>innerWidth)===width});
  if(onScreenshot)r.screenshots.push(await onScreenshot(page,{engine,width,route,tag:'back-label'}));
  if(count===1&&await back.isVisible()&&await back.isEnabled()){
   await back.click();r.navigationExecuted=true;await page.waitForURL('**/intro');await page.locator('.intro-signin').waitFor();
   const after=await page.evaluate(()=>({origin:location.origin,path:location.pathname,idx:history.state?.idx,length:history.length}));await page.waitForTimeout(750);const stable=await page.evaluate(()=>({idx:history.state?.idx,length:history.length}));
   add('Real accessible Back click reaches internal Intro with replacement history',{internalIntro:after.origin===origin&&after.path==='/intro',idxZero:after.idx===0&&stable.idx===0,historyReplaced:after.length===before.length&&stable.length===after.length});
  }else{r.navigationNotExecutedReason='ACCESSIBLE_BACK_ABSENT_OR_UNUSABLE';}
  add('Strict anonymous synthetic runtime guards',{oneBaseInfo:r.baseGET===1,noUnknown:r.unknownRequests===0,noMutation:r.unexpectedMutations===0,noCallbackPageConsoleError:r.callbackErrors===0&&r.pageErrors===0&&r.consoleErrors===0,noForward:r.realApiForwarded===0});
  r.status=r.checks.every(c=>c.status==='PASS')?'PASS':'FAIL';save();
 }catch(e){r.errorName=['Error','TimeoutError','TypeError'].includes(e?.name)?e.name:'OtherError';r.interruptionCode=/^[A-Z0-9_]+$/.test(e?.qaCode||'')?e.qaCode:'SANITIZED_HARNESS_INTERRUPTION';save();}
 finally{if(context){try{await context.close();r.contextClosed=true;}catch{r.cleanupInterrupted=true;}}if(r.unknownRequests||r.unexpectedMutations)r.status='FAIL';else if(r.callbackErrors||r.cleanupInterrupted)r.status='IN PROGRESS';save();}
 return records;
}
