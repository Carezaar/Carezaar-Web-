async(page)=>{
 const rows=[];for(const p of page.context().pages()){
 if(!/^http:\/\/127\.0\.0\.1:(4419|4422)\//.test(p.url()))continue;
 const m=await p.evaluate(()=>JSON.parse(sessionStorage.getItem('qa.final.extension')||'null'));if(!m)continue;
 await p.bringToFront();const old=p.viewportSize();for(const width of [320,390,480,1440]){await p.setViewportSize({width,height:900});await p.goto(new URL(p.url()).origin+'/main/profile');await p.locator('.profile-card-text').waitFor();
 const data=await p.locator('.profile-card-text').evaluate(e=>({textWidth:e.getBoundingClientRect().width,rows:[...e.querySelectorAll('p')].map(p=>({height:p.getBoundingClientRect().height,lineHeight:parseFloat(getComputedStyle(p).lineHeight),iconWidth:p.querySelector('.icon')?.getBoundingClientRect().width}))}));
 rows.push({role:m.role,width,...data,status:data.textWidth>=Math.min(width-110,210)&&data.rows.every(r=>r.iconWidth>=19)&&data.rows[0].height<=25&&data.rows.at(-1).height<=25?'PASS':'FAIL'});
 await p.screenshot({path:'test-evidence/final-parity-20261018/extension-profile-measure-'+m.role+'-'+width+'-after.png'});}if(old)await p.setViewportSize(old);
 }
 return{browser:'approved Chrome Default extension',case:'Profile personal details readable full-width on320px screen; icons retain intended20px width',results:rows};
}
