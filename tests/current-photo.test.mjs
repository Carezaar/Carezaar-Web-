import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSync} from 'esbuild';
import {fileURLToPath} from 'node:url';

const repo=fileURLToPath(new URL('../',import.meta.url));
const built=buildSync({stdin:{contents:'export {userService} from "./src/api/services.ts";',resolveDir:repo,loader:'ts'},bundle:true,platform:'node',format:'esm',write:false});
const {userService}=await import('data:text/javascript;base64,'+Buffer.from(built.outputFiles[0].text).toString('base64'));

test('keeping an existing photo bounds a silent download to the Android 120-second deadline', {concurrency:false}, async()=>{
  const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
  let timer,delay,cleared=false,rejectDownload,pending;
  globalThis.window={setTimeout(fn,ms){timer=fn;delay=ms;return 81;},clearTimeout(id){assert.equal(id,81);cleared=true;}};
  globalThis.fetch=(_url,init)=>new Promise((_,reject)=>{
    rejectDownload=reject;
    init?.signal?.addEventListener('abort',()=>reject(new DOMException('Synthetic timeout','AbortError')),{once:true});
  });
  try{
    pending=userService.currentPhotoFile('https://new.carezaar.com/uploads/synthetic.png');
    const rejection=assert.rejects(pending); // Handle rejection immediately, including the red run cleanup.
    assert.equal(delay,120000,'a stalled existing photo must not leave Save waiting forever');
    timer();await rejection;assert.equal(cleared,true,'download deadline is cleaned up');
  }finally{
    rejectDownload?.(new Error('Synthetic cleanup'));await pending?.catch(()=>{});
    globalThis.fetch=previousFetch;
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  }
});

test('the photo deadline remains active until the response body completes', {concurrency:false}, async()=>{
  const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
  let timer,cleared=false,bodyController;
  globalThis.window={setTimeout(fn,ms){assert.equal(ms,120000);timer=fn;return 82;},clearTimeout(id){assert.equal(id,82);cleared=true;}};
  globalThis.fetch=async(_url,init)=>{
    const body=new ReadableStream({start(controller){bodyController=controller;}});
    init.signal.addEventListener('abort',()=>bodyController.error(new DOMException('Synthetic body timeout','AbortError')),{once:true});
    return new Response(body,{headers:{'content-type':'image/png'}});
  };
  try{
    const pending=userService.currentPhotoFile('https://new.carezaar.com/uploads/synthetic.png');
    const rejection=assert.rejects(pending);await Promise.resolve();
    assert.equal(cleared,false,'receiving headers must not remove the body deadline');
    timer();await rejection;assert.equal(cleared,true);
  }finally{
    globalThis.fetch=previousFetch;
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  }
});

test('a healthy current photo keeps its bytes and clears the deadline', {concurrency:false}, async()=>{
  const previousFetch=globalThis.fetch,previousWindow=globalThis.window;
  let cleared=false,calls=0;
  globalThis.window={setTimeout(_fn,ms){assert.equal(ms,120000);return 83;},clearTimeout(id){assert.equal(id,83);cleared=true;}};
  globalThis.fetch=async(url,init)=>{
    calls++;assert.equal(url,'/uploads/synthetic.png');assert.equal(init.credentials,'same-origin');
    assert.equal(init.signal.aborted,false);
    return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}});
  };
  try{
    const file=await userService.currentPhotoFile('https://new.carezaar.com/uploads/synthetic.png');
    assert.equal(file.name,'synthetic.png');assert.equal(file.type,'image/png');
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array([1,2,3]));
    assert.equal(calls,1);assert.equal(cleared,true);
    await assert.rejects(userService.currentPhotoFile('https://untrusted.example/uploads/synthetic.png'));
    assert.equal(calls,1,'untrusted locations must not be downloaded');
  }finally{
    globalThis.fetch=previousFetch;
    if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;
  }
});
