async(page) => {
  // PRIVATE PREPARED ONLY. Run separately after native releases foreground.
  const SYMBOL_MATRIX_ONLY = false;
  const origin='http://localhost:4419',api='https://new.carezaar.com';
  const probeURL=origin+'/__qa_recovery_storage_probe__';
  const started=Date.now(),deadline=started+65000,results=[],requests=[],unexpected=[],callbackErrors=[];
  const p=await page.context().newPage(); p.setDefaultTimeout(1800);
  let language=null,changed=false,active=null,releaseHeld=null,timer=null,restoration='NOT_NEEDED',pageErrors=0;
  p.on('pageerror',()=>{pageErrors+=1;});
  const assert=(ok,code)=>{if(!ok){const e=new Error(code);e.qaCode=code;throw e;}};
  const budget=()=>assert(Date.now()<deadline,'HARNESS_TIME_BUDGET');
  const add=(width,screen,id,predicates)=>results.push({width,screen,case:id,status:Object.values(predicates).every(Boolean)?'PASS':'FAIL',predicates});
  const responseWait=(path)=>p.waitForResponse(r=>{try{const u=new URL(r.url());return u.origin===api&&u.pathname===path&&r.request().method()==='POST';}catch{return false;}},{timeout:5000}).then(()=>true,()=>false);
  async function prime(path,recovery){
    budget();await p.goto(probeURL,{waitUntil:'domcontentloaded',timeout:5000});
    await p.evaluate(({recovery})=>sessionStorage.setItem('carezaar.signup',JSON.stringify({
      role:'client',email:'synthetic-recovery@example.test',password:'',userId:null,entityCreated:false,isPasswordRecovery:recovery
    })),{recovery});
    await p.goto(origin+path,{waitUntil:'domcontentloaded',timeout:10000});
    await p.locator('.otp-boxes input').first().waitFor({timeout:10000});
    assert(new URL(p.url()).pathname===path,'SEEDED_FLOW_ROUTE_NOT_REACHED');
  }
  async function clearCode(){const boxes=p.locator('.otp-boxes input');for(let i=4;i>=0;i--)await boxes.nth(i).fill('');}
  async function code(){return (await p.locator('.otp-boxes input').evaluateAll(es=>es.map(e=>e.value))).join('');}
  async function fillCode(value){await clearCode();await p.locator('.otp-boxes input').first().fill(value);}
  const fields=()=>p.locator('.field').filter({has:p.locator('input[autocomplete="new-password"]')});
  const pass=()=>fields().nth(0).locator('input');
  const confirm=()=>fields().nth(1).locator('input');
  const next=()=>p.getByRole('button',{name:'Continue',exact:true});
  async function validPasswords(){await pass().fill('Synthetic7!');await confirm().fill('Synthetic7!');}
  async function flags(){return p.locator('.rule-chip').evaluateAll(es=>es.map(e=>e.classList.contains('on')));}
  try{
    await p.route(probeURL,async r=>{try{await r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Private recovery probe</title>'});}catch{callbackErrors.push('PROBE_FAILED');}});
    await p.route('**/api/**',async r=>{
      try{
        const req=r.request(),u=new URL(req.url()),method=req.method();
        if(method==='OPTIONS'){await r.continue();return;}
        if(['GET','HEAD'].includes(method)&&u.origin===api&&u.pathname.startsWith('/api/base/')){await r.continue();return;}
        if(method!=='POST'||u.origin!==api||!['/api/users/otp/verify','/api/users/password/reset'].includes(u.pathname)){
          unexpected.push({method,code:'UNEXPECTED_API_REQUEST_ABORTED'});await r.abort('blockedbyclient');return;
        }
        const form=new URLSearchParams(req.postData()||''),isReset=u.pathname==='/api/users/password/reset';
        const allowed=isReset?['email','otp','password']:['email','otp'],keys=[...form.keys()].sort();
        requests.push({case:active?active.id:'UNPLANNED',reset:isReset,
          expectedEndpoint:Boolean(active)&&active.path===u.pathname,
          emailExact:form.get('email')==='synthetic-recovery@example.test',
          codeExact:Boolean(active)&&form.get('otp')===active.code,
          passwordExact:!isReset||(Boolean(active)&&form.get('password')===active.password),
          exactKeys:keys.length===allowed.length&&keys.every((k,i)=>k===allowed[i]),
          formEncoding:(req.headers()['content-type']||'').toLowerCase().startsWith('application/x-www-form-urlencoded'),
          languageEnglish:req.headers()['accept-language']==='en',noAuthorization:!req.headers()['authorization']});
        if(active&&active.hold)await active.hold;
        await r.fulfill({status:422,contentType:'application/json',body:JSON.stringify({result:null,message:'Synthetic OTP boundary rejection.',errors:{otp:['Synthetic OTP boundary rejection.']}})});
      }catch{callbackErrors.push('CONTROLLED_ROUTE_FAILED');try{await r.abort('failed');}catch{}}
    });
    await p.bringToFront();await p.goto(probeURL,{waitUntil:'domcontentloaded',timeout:6000});
    const probe=await p.evaluate(()=>({auth:localStorage.getItem('carezaar.accessToken')!==null||localStorage.getItem('carezaar.refreshToken')!==null,
      language:['carezaar.languageCode','carezaar.languageId'].map(k=>[k,localStorage.getItem(k)])}));
    language=probe.language;assert(!probe.auth,'PREEXISTING_LOCALHOST_SESSION_LEAVE_UNTOUCHED');
    await p.evaluate(()=>{localStorage.setItem('carezaar.languageCode','en');localStorage.setItem('carezaar.languageId','1');});changed=true;
    for(const width of[390,1440]){
      budget();await p.setViewportSize({width,height:1000});
      if(SYMBOL_MATRIX_ONLY){
        await prime('/setup-password',true);await fillCode('12345');
        const allowed=[...'!@#$%^&*()_+[]{}|-;:,.<>?'],unsupported=['=','/','\\','`','~','€','🙂',"'",'"',' '];
        for(const[expected,symbols]of[[true,allowed],[false,unsupported]])for(let i=0;i<symbols.length;i++){
          budget();const value='Abcdef1'+symbols[i];await pass().fill(value);await confirm().fill(value);
          const f=await flags();add(width,'recovery','symbol-'+(expected?'allowed':'unsupported')+'-'+i,{
            otherRulesRemainMet:f.length===5&&f.slice(0,4).every(Boolean),specialRuleCorrect:f[4]===expected,
            resetGateCorrect:(await next().isEnabled())===expected,exactSyntheticDelivery:await pass().inputValue()===value&&await confirm().inputValue()===value,
            zeroRequests:requests.length===0});
        }
        continue;
      }
      for(const[path,recovery]of[['/otp',false],['/setup-password',true]]){
        budget();await prime(path,recovery);if(recovery)await validPasswords();
        const boxes=p.locator('.otp-boxes input'),before=requests.length;
        add(width,path,'initial-empty-gate-and-countdown',{fiveActualBoxes:await boxes.count()===5,disabled:await next().isDisabled(),noEarlyResend:await p.getByRole('button',{name:'Re-send',exact:true}).count()===0});
        await boxes.first().fill('1');
        add(width,path,'single-digit-focus',{secondBoxFocused:await boxes.nth(1).evaluate(e=>document.activeElement===e),incompleteDisabled:await next().isDisabled(),noRequest:requests.length===before});
        await fillCode('123456');
        add(width,path,'multi-character-fill-spread-not-clipboard',{firstFiveOnly:await code()==='12345',lastBoxFocused:await boxes.nth(4).evaluate(e=>document.activeElement===e),enabled:await next().isEnabled(),noRequest:requests.length===before});
        await boxes.nth(2).fill('9');
        add(width,path,'replace-one-digit',{replacementExact:await code()==='12945',nextBoxFocused:await boxes.nth(3).evaluate(e=>document.activeElement===e)});
        await boxes.nth(2).fill('');
        const afterExplicitDelete=await code();
        add(width,path,'explicit-delete-index2-compacts',{exactFourDigits:afterExplicitDelete==='1245',fourDigitsOnly:afterExplicitDelete.length===4,disabled:await next().isDisabled(),noRequest:requests.length===before});
        await boxes.nth(4).focus();await boxes.nth(4).press('Backspace');
        const afterEmptyBackspace=await code();
        // Approved observed web keyboard baseline, NOT Android Backspace parity.
        // Original four-digit-after-Backspace expectation/four FAILs remain preserved.
        add(width,path,'empty-backspace-observed-web-baseline',{exactThreeDigits:afterEmptyBackspace==='124',threeDigitsOnly:afterEmptyBackspace.length===3,unchangedExactPrefix:afterExplicitDelete.slice(0,-1)===afterEmptyBackspace,disabled:await next().isDisabled(),previousBoxFocused:await boxes.nth(3).evaluate(e=>document.activeElement===e),noRequest:requests.length===before});
        await fillCode('12a٣🙂3456');
        add(width,path,'non-ASCII-and-nondigit-filter',{asciiFiveOnly:await code()==='12345',enabled:await next().isEnabled(),noRequest:requests.length===before});
        if(recovery){
          for(const[id,value,expected]of[
            ['too-short','Aa1!',[false,true,true,true,true]],['no-uppercase','abcdef1!',[true,false,true,true,true]],
            ['no-lowercase','ABCDEF1!',[true,true,false,true,true]],['no-number','Abcdefg!',[true,true,true,false,true]],
            ['no-special','Abcdef12',[true,true,true,true,false]],['empty','',[false,false,false,false,false]]]){
            budget();await pass().fill(value);await confirm().fill(value);const f=await flags();
            add(width,path,id,{actualRuleVector:f.length===5&&f.every((v,i)=>v===expected[i]),resetBlocked:await next().isDisabled(),noRequest:requests.length===before});
          }
          await validPasswords();await confirm().fill('Synthetic8!');
          add(width,path,'confirmation-mismatch',{invalidMetadata:await confirm().getAttribute('aria-invalid')==='true',resetBlocked:await next().isDisabled()});
          await validPasswords();
          for(let i=0;i<2;i++){
            const own=fields().nth(i),other=fields().nth(i===0?1:0).locator('input');
            const initial=await own.locator('input').getAttribute('type')==='password';
            await own.getByRole('button',{name:'Show password',exact:true}).click();
            const revealed=await own.locator('input').getAttribute('type')==='text'&&await own.locator('input').inputValue()==='Synthetic7!';
            const independent=await other.getAttribute('type')==='password';
            await own.getByRole('button',{name:'Hide password',exact:true}).click();
            add(width,path,'reveal-hide-field-'+i,{initialSecure:initial,revealedExact:revealed,otherRemainedSecure:independent,resecured:await own.locator('input').getAttribute('type')==='password',valueRetained:await own.locator('input').inputValue()==='Synthetic7!'});
          }
        }
        budget();await fillCode('12345');
        active={id:recovery?'controlled-reset-rejection':'controlled-verify-rejection',path:recovery?'/api/users/password/reset':'/api/users/otp/verify',code:'12345',password:'Synthetic7!'};
        const start=requests.length,response=responseWait(active.path);await next().click();const observed=await response;
        await p.locator('.busy-scrim').waitFor({state:'hidden',timeout:5000});const sent=requests.slice(start);
        add(width,path,active.id,{controlledResponseObserved:observed,oneRequest:sent.length===1,payloadPredicates:sent.length===1&&Object.entries(sent[0]).filter(([k])=>!['case','reset'].includes(k)).every(([,v])=>v===true),sameRoute:new URL(p.url()).pathname===path,codeRetained:await code()==='12345',passwordRetained:!recovery||await pass().inputValue()==='Synthetic7!'});
        if(recovery){
          let release;const hold=new Promise(resolve=>{release=resolve;});releaseHeld=release;timer=setTimeout(release,3000);
          active={id:'held-reset-focused-Enter',path:'/api/users/password/reset',code:'12345',password:'Synthetic7!',hold};
          const start=requests.length,response=responseWait(active.path);await next().click();await p.locator('.busy-scrim').waitFor({state:'visible'});
          const focused=await next().evaluate(e=>document.activeElement===e);
          if(focused)for(let i=0;i<3;i++)await p.keyboard.press('Enter');
          const onePending=requests.length-start===1;release();clearTimeout(timer);timer=null;releaseHeld=null;
          const observed=await response;await p.locator('.busy-scrim').waitFor({state:'hidden',timeout:5000});
          if(!focused)results.push({width,screen:path,case:active.id,status:'IN PROGRESS',code:'SUBMIT_NOT_FOCUSED_NO_DUPLICATE_ENTER_CLAIM'});
          else add(width,path,active.id,{onePending,controlledResponseObserved:observed,oneTotal:requests.length-start===1,valuesRetained:await code()==='12345'&&await pass().inputValue()==='Synthetic7!'});
        }
      }
    }
  }catch(error){results.push({case:'HARNESS_INTERRUPTION',status:'IN PROGRESS',code:error&&error.qaCode||'SANITIZED_UI_OR_TRANSPORT_INTERRUPTION'});}
  finally{
    if(releaseHeld)releaseHeld();if(timer)clearTimeout(timer);
    try{
      await p.goto(probeURL,{waitUntil:'domcontentloaded',timeout:3000});
      const restored=await p.evaluate(saved=>{
        sessionStorage.removeItem('carezaar.signup');
        if(localStorage.getItem('carezaar.accessToken')!==null||localStorage.getItem('carezaar.refreshToken')!==null)return false;
        if(saved)for(const[k,v]of saved){if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v);}return true;
      },changed?language:null);
      restoration=restored?'TASK_SEED_CLEARED_LANGUAGE_ONLY_RESTORED_CACHE_RETAINED':'SEED_CLEARED_CONCURRENT_AUTH_LANGUAGE_UNTOUCHED';
    }catch{restoration='CLEANUP_FAILED_OWNER_REVIEW';}
    try{await p.close({runBeforeUnload:false});}catch{restoration+='_PAGE_CLOSE_FAILED';}
  }
  return{harness:SYMBOL_MATRIX_ONLY?'recovery-password-symbols':'recovery-otp-boundaries',browser:'approved Chrome Default extension required',scope:'Seeded task-page recovery/signup context,390/1440,nonforwarding verify/reset fixtures',results,requestCount:requests.length,payloadPredicates:requests,forwardedRequests:0,unexpected,callbackErrors,pageErrors,restoration,elapsedMs:Date.now()-started,clipboardPaste:'NOT EXECUTED — fill invokes multi-character onChange,not clipboard/onPaste',resendCountdown:'Initial120secondgate only;fullcountdown/resendnotexecuted',realAccountReset:false,keyboardBaselineCaveat:'Explicit1245→124 observedwebkeyboardbaseline only;noAndroidBackspaceparity/no productionfix. Original4FAIL+per-actiondiagnosticpreserved.'};
}
