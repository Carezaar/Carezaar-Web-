import { build } from '../../../node_modules/esbuild/lib/main.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
await build({entryPoints:[path.join(here,'entry.tsx')],outfile:path.join(here,'fixture.js'),bundle:true,format:'iife',jsx:'automatic',nodePaths:[path.resolve(here,'../../../node_modules')],define:{'process.env.NODE_ENV':'"development"','import.meta.env.DEV':'false'},plugins:[{name:'fixture-context',setup(b){b.onResolve({filter:/^\.\/i18n$/},a=>a.importer.endsWith('/src/app/feedback.tsx')?{path:'i18n',namespace:'fixture'}:undefined);b.onResolve({filter:/^\.\.\/ui\/Icon$/},a=>a.importer.endsWith('/src/app/feedback.tsx')?{path:'icon',namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='i18n'?'const t=(_key,fallback)=>fallback;export function useI18n(){return {t}}':'export function Icon(){return null}',loader:'js'}));}}]});
