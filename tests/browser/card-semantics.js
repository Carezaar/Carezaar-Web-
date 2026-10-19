async(page)=>{
 const safeRequest=async(work)=>{try{return await work();}catch(error){throw Error(String(error).split('\nCall log:')[0]);}};
 const owned={};for(const p of page.context().pages()){if(!/^http:\/\/127\.0\.0\.1:(4419|4422)\//.test(p.url()))continue;const m=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('qa.final.extension')||'null'));if(m)owned[m.role]={p,...m};}
 if(!owned.client||!owned.caregiver)throw Error('Owned fixtures required');const results=[];
 const assert=(v,m)=>{if(!v)throw Error(m);};
 for(const role of ['client','caregiver']){
  const self=owned[role],peer=owned[role==='client'?'caregiver':'client'],p=self.p,origin=new URL(p.url()).origin,old=p.viewportSize(),script=origin+'/__qa_local_axe.js',bookmark='**/api/users/bookmarks**';
  const detailPath=(role==='client'?'/caregivers/':'/clients/')+peer.id;
  const token=await p.evaluate(()=>localStorage.getItem('carezaar.accessToken'));
  const response=await safeRequest(()=>p.request.get('https://new.carezaar.com/api/'+(role==='client'?'clients/caregivers/':'caregivers/clients/')+peer.id,{headers:{Authorization:'Bearer '+token}}));assert(response.ok(),'Owned profile read failed');const raw=await response.json(),user=(raw.result??raw).user;assert(user.id===peer.id,'Owned identity mismatch');
  let forbiddenWrites=0;
  await p.route(script,r=>r.fulfill({path:'web-qa/node_modules/axe-core/axe.min.js',contentType:'text/javascript'}));
  await p.route(bookmark,r=>{if(r.request().method()!=='GET'){forbiddenWrites++;return r.abort();}return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:[{...user,photo:null}],meta:{current_page:1,last_page:1,total:1,per_page:20}})});});
  const settle=async path=>{await p.goto(origin+path);await p.waitForLoadState('networkidle',{timeout:20000});await p.locator('.busy-scrim').waitFor({state:'hidden',timeout:20000});};
  const scan=async()=>{await p.addScriptTag({url:script});const r=await p.evaluate(async()=>{const a=await axe.run('.app-column',{runOnly:['aria-allowed-role','heading-order']});return a.violations.map(v=>({id:v.id,nodes:v.nodes.length}));});assert(r.length===0,'Focused semantic audit failed '+JSON.stringify(r));};
  const keyboard=async cls=>{const card=p.locator(cls).first();await card.waitFor();assert(await card.getAttribute('role')==='link','Card link role absent');assert(await card.getByRole('heading',{level:2}).count()===1,'Card must expose level2 title');await card.focus();await p.keyboard.press('Enter');await p.waitForURL(origin+detailPath,{timeout:20000});};
  try{
   await p.bringToFront();await p.setViewportSize({width:390,height:900});
   await settle('/favorites');await p.locator('.fav-card').waitFor();await scan();await keyboard('.fav-card');results.push({role,case:'Favorites permitted link role/h2/Enter opens exact owned profile',status:'PASS',data:'Controlled read-only bookmark GET containing the verified owned peer with faceless photo placeholder; no mutation'});
   await p.unroute(bookmark);
   await settle('/profile/matches');await p.getByRole('tab',{name:'History',exact:true}).click();await p.locator('.match-row').first().waitFor({timeout:20000});await scan();
   assert((await p.locator('.match-row h2').first().innerText()).trim()===peer.name,'History card is not the verified owned peer');await keyboard('.match-row');results.push({role,case:'Real match history permitted link role/h2/Enter opens exact owned profile',status:'PASS',data:'Live owned match history'});
   if(role==='caregiver'){await settle('/main/matches');await p.locator('.match-card').first().waitFor();await scan();assert(await p.locator('.hero').evaluate(e=>e.style.backgroundImage.includes('bg_matches.webp')),'People-free room header absent');results.push({role,case:'Real populated Matches list valid card semantics and room header',status:'PASS'});}
   assert(forbiddenWrites===0,'Unexpected bookmark mutation');
  }finally{await p.unroute(bookmark);await p.unroute(script);if(old)await p.setViewportSize(old);}
 }
 return{browser:'approved Chrome Default extension',results};
}
