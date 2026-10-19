async (page) => {
  const owned={}, results=[], created=new Set();
  const marker='Synthetic extension parity '+Date.now();
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  // Playwright request failures can include Authorization in their call log.
  const safeRequest=async(work)=>{try{return await work();}catch(error){throw Error(String(error).split('\nCall log:')[0]);}};
  for(const p of page.context().pages()){
    if(!['http://127.0.0.1:4419/','http://127.0.0.1:4422/'].some(o=>p.url().startsWith(o)))continue;
    const m=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('qa.final.extension')||'null'));
    if(m)owned[m.role]={p,...m,origin:new URL(p.url()).origin};
  }
  assert(owned.client&&owned.caregiver,'Both authorized owned sessions required');
  const api='https://new.carezaar.com/api/';
  const peer=role=>role==='client'?'caregiver':'client';
  const endpoint=role=>(role==='client'?'clients/caregivers/':'caregivers/clients/')+owned[peer(role)].id;
  const headers=async role=>({Authorization:'Bearer '+await owned[role].p.evaluate(()=>localStorage.getItem('carezaar.accessToken'))});
  const profile=async role=>{const auth=await headers(role);const r=await safeRequest(()=>owned[role].p.request.get(api+endpoint(role),{headers:auth}));assert(r.ok(),'Profile preflight failed');const body=await r.json();const data=body.result??body;assert(data.user?.id===owned[peer(role)].id,'Unexpected fixture identity');return data;};
  const load=async role=>{const p=owned[role].p;await p.bringToFront();const answer=p.waitForResponse(r=>r.request().method()==='GET'&&r.url().includes('/api/'+endpoint(role)),{timeout:20000});await p.goto(owned[role].origin+'/'+(role==='client'?'caregivers/':'clients/')+owned[peer(role)].id);await answer;await p.locator('.busy-scrim').waitFor({state:'hidden',timeout:30000});};
  const pass=description=>results.push({case:description,status:'PASS'});
  let failure, watchRequest;
  try{
    assert((await profile('client')).match_status==='none'&&(await profile('caregiver')).match_status==='none','Owned pair must initially be NONE');
    await load('client');await load('caregiver');
    const client=owned.client.p, caregiver=owned.caregiver.p;
    let posts=0;
    watchRequest=r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/users/matches')posts++;};
    client.on('request',watchRequest);
    await client.bringToFront();
    await client.getByRole('button',{name:'Request a Match',exact:true}).click();
    await client.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    assert(posts===0&&(await profile('client')).match_status==='none','Cancel changed match state');pass('Cancel request without POST');
    const request=async()=>{
      await load('client');await client.getByRole('button',{name:'Request a Match',exact:true}).click();
      await client.getByRole('dialog').getByRole('textbox').fill(marker);
      const before=posts;
      const answer=client.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/users/matches',{timeout:20000});
      await client.getByRole('dialog').getByRole('button',{name:'Match',exact:true}).click();
      const response=await answer;assert(response.ok(),'Request refused');const body=await response.json();created.add((body.result??body).id);
      await client.getByRole('button',{name:'Cancel',exact:true}).waitFor({timeout:20000});
      assert(posts===before+1&&(await profile('client')).match_status==='sent','Request not settled exactly once');
      await load('caregiver');await caregiver.getByRole('button',{name:'Accept',exact:true}).waitFor();
      assert((await profile('caregiver')).match_status==='received','Other role did not receive request');
    };
    await request();pass('Single request POST and opposite-role received state');
    await caregiver.getByRole('button',{name:'Reject',exact:true}).click();
    assert((await caregiver.getByRole('dialog').innerText()).includes(marker),'Incoming introduction missing');
    await caregiver.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();
    assert((await profile('caregiver')).match_status==='received','Reject cancellation lost pending request');pass('Reject confirmation cancellation preserves request');
    await caregiver.getByRole('button',{name:'Reject',exact:true}).click();
    await caregiver.getByRole('dialog').getByRole('button',{name:'Reject',exact:true}).click();
    await caregiver.getByRole('button',{name:'Request a Match',exact:true}).waitFor({timeout:20000});
    assert((await profile('client')).match_status==='none'&&(await profile('caregiver')).match_status==='none','Reject did not settle both roles');pass('Rejection updates both roles');
    await request();
    await client.bringToFront();
    await client.getByRole('button',{name:'Cancel',exact:true}).click();
    await client.getByRole('dialog').locator('button.btn-danger').click();
    await client.getByRole('button',{name:'Request a Match',exact:true}).waitFor({timeout:20000});
    assert((await profile('client')).match_status==='none'&&(await profile('caregiver')).match_status==='none','Withdrawal did not settle both roles');pass('Withdrawal updates both roles');
    await request();
    await caregiver.getByRole('button',{name:'Accept',exact:true}).click();
    await caregiver.getByRole('dialog').getByRole('button',{name:'Accept',exact:true}).click();
    await caregiver.waitForURL('**/matched/**',{timeout:20000});
    await caregiver.getByText("It's a Match!",{exact:true}).first().waitFor();
    assert((await profile('client')).match_status==='active'&&(await profile('caregiver')).match_status==='active','Acceptance did not settle both roles');pass('Acceptance opens match screen and updates both roles');
    await load('client');await load('caregiver');
    await client.bringToFront();
    await client.getByRole('button',{name:'Unmatch',exact:true}).click();
    await client.getByRole('dialog').getByRole('button',{name:'Unmatch',exact:true}).click();
    await client.getByRole('button',{name:'Request a Match',exact:true}).waitFor({timeout:20000});
    assert((await profile('client')).match_status==='none'&&(await profile('caregiver')).match_status==='none','Unmatch did not settle both roles');pass('Unmatch restores both roles to NONE');
  }catch(error){failure=String(error);}
  finally{
    if(watchRequest)owned.client.p.off('request',watchRequest);
    // Cleanup is restricted to an edge created by this invocation after NONE preflight.
    const state=await profile('client');
    if(state.match_status!=='none'){
      assert(created.has(state.match_id),'Refusing cleanup of an unowned match edge');
      const ending=state.match_status==='active'?'':state.match_status==='sent'?'/withdraw':'/reject';
      const auth=await headers('client');
      const response=await safeRequest(()=>owned.client.p.request.delete(api+'users/matches/'+state.match_id+ending,{headers:auth}));
      assert(response.ok(),'Owned edge cleanup failed');
    }
  }
  return {browser:'approved Chrome extension',backend:'live',results,failure,finalPairState:(await profile('client')).match_status};
}
