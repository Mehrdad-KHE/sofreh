import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowWorkspaceNavigation} from '../apps/native/src/navigation.mjs';

test('native workspace navigation contains redirects and schemes within its HTTPS origin',()=>{
  const origin='https://sofreh-v2.vercel.app';
  for(const url of [origin+'/account?role=COOK',origin+'/app/customer?locale=fa-IR','about:blank'])
    assert.equal(allowWorkspaceNavigation({url},origin),true,url);
  for(const url of ['https://vercel.com/login','https://sofreh-v2.vercel.app.evil.example/app/customer',
    'http://sofreh-v2.vercel.app/account','javascript:alert(1)','mailto:user@example.test','intent://test',
    'https://secret@sofreh-v2.vercel.app/account','invalid'])
    assert.equal(allowWorkspaceNavigation({url},origin),false,url);
});
