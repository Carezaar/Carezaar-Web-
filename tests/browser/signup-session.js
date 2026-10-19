async(page)=>{
 const context=page.context(),origin='http://localhost:4419';let target=await context.newPage(),fresh;
 const assert=(v,m)=>{if(!v)throw Error(m);};let registrations=0;
 try{
  await target.bringToFront();await target.setViewportSize({width:390,height:900});
  await target.route('**/api/auth/register',r=>{registrations++;return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:{id:'fixture-session-boundary-only'}})});});
  await target.route('**/api/users/otp/send',r=>r.fulfill({status:500,contentType:'application/json',body:JSON.stringify({message:'Controlled initial send failure'})}));
  await target.goto(origin+'/sign-up/client');await target.getByRole('button',{name:'Continue',exact:true}).waitFor();
  await target.locator('input[type=email]').fill('fixture@example.com');await target.locator('input[type=password]').nth(0).fill('Abcdefg1!');await target.locator('input[type=password]').nth(1).fill('Abcdefg1!');await target.locator('label').filter({has:target.getByRole('checkbox')}).click({position:{x:8,y:8}});
  await target.getByRole('button',{name:'Continue',exact:true}).click();await target.getByRole('button',{name:'Confirm',exact:true}).click();await target.waitForURL('**/otp');
  const before=await target.evaluate(()=>({session:JSON.parse(sessionStorage.getItem('carezaar.signup')||'null'),durable:localStorage.getItem('carezaar.signup')}));assert(before.session?.email==='fixture@example.com'&&before.session?.role==='client'&&!!before.session?.password&&before.durable===null,'Flow not tab-session scoped');
  await target.reload();await target.getByText(/Wait for 0[12]:/).waitFor();assert(await target.evaluate(()=>JSON.parse(sessionStorage.getItem('carezaar.signup')||'null')?.email)==='fixture@example.com','Same-tab reload lost active flow');assert(registrations===1,'Reload registered twice');
  await target.close();fresh=await context.newPage();await fresh.bringToFront();await fresh.goto(origin+'/sign-up/client');await fresh.locator('input[type=email]').waitFor();assert(await fresh.locator('input[type=email]').inputValue()==='','Closed-tab email leaked into fresh flow');
  assert(await fresh.locator('input[type=password]').nth(0).inputValue()===''&&await fresh.locator('input[type=password]').nth(1).inputValue()==='','Closed-tab passwords leaked');assert(await fresh.evaluate(()=>sessionStorage.getItem('carezaar.signup'))===null,'Closed tab progress persisted into new tab');
  return{case:'WEB-V5-C1 accepted signup progress scope',status:'PASS',browser:'approved Chrome Default extension',sameTabReloadRetainsFlow:true,closingOwnedTabFreshTabLosesFlow:true,durableSignupStorageAbsent:true,registrationRequests:registrations,transport:'Page-scoped fixture registration+OTP500; no real account created',limit:'Owned signup tab closed; shared Chrome application was not quit'};
 }finally{if(!target.isClosed())await target.close();if(fresh&&!fresh.isClosed())await fresh.close();}
}
