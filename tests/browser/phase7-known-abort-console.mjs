/**
 * Reusable controlled-fixture regression retained from the executed current036 evidence.
 * Evidence limits: isolated Firefox/WebKit synthetic UI, no live backend/account writes;
 * no physical-device, all-browser, wire-delivery or full-phase certification.
 * Original source/results remain under test-evidence/final-parity-20261018.
 * This copy adds this header only, except the heart helper imports the identical
 * known-abort classifier extracted into its portable sibling module.
 */
export function classifyKnownAbortConsole(text,locationURL,api,abortedRequests){
 const known=(value)=>{try{const u=new URL(value);if(u.origin!==api||u.hash)return null;const witness=abortedRequests.find(q=>['GET','POST'].includes(q.method)&&q.url===u.href);return witness?{method:witness.method,path:u.pathname,exactAbortedURL:true}:null;}catch{return null;}};
 if(typeof locationURL==='string'&&locationURL.length>0){const request=known(locationURL);return request&&/failed|load|network|error|abort/i.test(text)?{kind:'EXACT_RESOURCE_LOCATION_ABORT',...request}:null;}
 const match=String(text).match(/^\[JavaScript Error: "Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource at (https:\/\/[^\s"<>]+)\. \(Reason: CORS request did not succeed\)\. Status code: \(null\)\."\]$/);
 const request=match?known(match[1]):null;
 return request?{kind:'EXACT_FIREFOX_CORS_KNOWN_ABORT',...request}:null;
}
