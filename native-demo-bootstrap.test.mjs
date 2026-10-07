import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('./adcelerate/demo/index.html',import.meta.url),'utf8');
const bootstrap=html.match(/<script id="admira-tv-native-demo-bootstrap">([\s\S]*?)<\/script>/)?.[1];
assert.ok(bootstrap,'TV native bootstrap must exist');
function page(href,existing=false){
  const tags=existing?[{attributes:{'data-admira-demo-engine':''}}]:[];
  const document={
    querySelector(selector){assert.equal(selector,'script[data-admira-demo-engine]');return tags.find(s=>'data-admira-demo-engine' in s.attributes)||null;},
    createElement(name){assert.equal(name,'script');return{attributes:{},setAttribute(k,v){this.attributes[k]=v;}};},
    head:{appendChild(script){tags.push(script);}}
  };
  const context=vm.createContext({location:{href},URL,document});
  return{tags,run(){vm.runInContext(bootstrap,context);}};
}

test('explicit TV launch loads the marked shared engine once on both canonical hosts',()=>{
  for(const host of ['admira.tv','www.admira.tv']){
    const p=page(`https://${host}/adcelerate/demo/?view=human&site=starbucks&ax_demo=tv`);
    p.run();p.run();assert.equal(p.tags.length,1);
    assert.equal(p.tags[0].src,'https://www.admiranext.com/suite/experto.js?v=20261007-native-demo-control-1');
    assert.equal(p.tags[0].attributes['data-pata'],'tv');
    assert.equal(p.tags[0].attributes['data-admira-demo-engine'],'');
    assert.equal(p.tags[0].defer,true);
  }
});

test('ordinary and invalid launches never load an engine',()=>{
  for(const query of ['','?tour=dooh','?ax_demo=','?ax_demo=store','?ax_demo=TV','?ax_demo=tv&ax_demo=tv','?ax_demo=tv&ax_demo=biz']){
    const p=page('https://admira.tv/adcelerate/demo/'+query);p.run();assert.equal(p.tags.length,0,query);
  }
});

test('other origins and physical player routes cannot bootstrap TV demo',()=>{
  for(const href of [
    'http://admira.tv/adcelerate/demo/?ax_demo=tv',
    'https://evil.example/adcelerate/demo/?ax_demo=tv',
    'https://admira.tv.evil.example/adcelerate/demo/?ax_demo=tv',
    'https://admira.tv:8443/adcelerate/demo/?ax_demo=tv',
    'https://admira.tv/canal.html?ax_demo=tv',
    'https://admira.tv/adcelerate/demo/best/?ax_demo=tv'
  ]){const p=page(href);p.run();assert.equal(p.tags.length,0,href);}
});

test('index.html and native tour parameters remain compatible; existing engine is reused',()=>{
  const p=page('https://admira.tv/adcelerate/demo/index.html?tour=dooh&ax_demo=tv');p.run();assert.equal(p.tags.length,1);
  const existing=page('https://admira.tv/adcelerate/demo/?ax_demo=tv',true);existing.run();assert.equal(existing.tags.length,1);
});

test('bootstrap follows native module and keeps view/map/tour controls in the native layout',()=>{
  assert.ok(html.indexOf('src="js/main.js')<html.indexOf('id="admira-tv-native-demo-bootstrap"'));
  for(const id of ['human-hud','photo-view','scene','human-inspect','human-inspect-close','human-exit','universe-human','human-tour-start','dooh-tour-pause','dooh-tour-end','dooh-tour-step','dooh-tour-progress']){
    assert.equal(html.match(new RegExp(`id="${id}"`,'g'))?.length,1,id);
  }
  assert.doesNotMatch(bootstrap,/\bfetch\(|postMessage\(|\.click\(|locations\/cmd|canal\.html|best\//);
  const main=readFileSync(new URL('./adcelerate/demo/js/main.js',import.meta.url),'utf8');
  assert.match(main,/entry\.get\('tour'\)==='dooh'\)startDoohTour\(\)/);
});
