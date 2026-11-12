import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Exercise the actual action wrapper with minimal DOM controls. Browser
// acceptance remains a separate check in the owner's connected Chrome.
const source=fs.readFileSync(new URL('../apps/workspace/app.js',import.meta.url),'utf8');
const actionSource=source.slice(source.indexOf('async function action('),source.indexOf('async function enablePush('));
function setup(buttons){
  const state={busy:false},feedback={textContent:''};
  const document={querySelectorAll:()=>buttons};
  const action=vm.runInNewContext(actionSource+'; action',{state,document,$:()=>feedback});
  return {state,feedback,action,replace(next){buttons=next;}};
}

test('refreshing a form never enables a new blocked checkout or an already disabled control',async()=>{
  const oldSubmit={disabled:false,isConnected:true},blocked={disabled:true,isConnected:true};
  const app=setup([oldSubmit,blocked]);
  const newSubmit={disabled:true,isConnected:true};
  await app.action(async()=>{
    assert.equal(oldSubmit.disabled,true);
    oldSubmit.isConnected=false;
    app.replace([newSubmit]);
  });
  assert.equal(newSubmit.disabled,true);
  assert.equal(blocked.disabled,true);
  assert.equal(app.state.busy,false);
});

test('a failed action restores its own connected submit control and prevents concurrent work',async()=>{
  const submit={disabled:false,isConnected:true},app=setup([submit]);
  let concurrent=false;
  await app.action(async()=>{
    await app.action(async()=>{concurrent=true;});
    throw new Error('Connection unavailable');
  });
  assert.equal(concurrent,false);
  assert.equal(submit.disabled,false);
  assert.equal(app.feedback.textContent,'Connection unavailable');
  assert.equal(app.state.busy,false);
});
