import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSofrehHttpServer } from '../packages/backend/src/server.mjs';
import { mountPreviewHtmlInVm } from './previewDomHarness.mjs';

test('public catalogue has accessible bilingual destinations and valid discovery metadata', async () => {
  const { server, db } = createSofrehHttpServer({ dbFilePath: ':memory:' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base, { redirect: 'manual' });
    assert.equal(home.status, 308);
    assert.equal(home.headers.get('location'), '/en');
    for (const [route, lang, dir] of [['en','en-CA','ltr'],['fa','fa','rtl']]) {
      const response = await fetch(`${base}/${route}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, new RegExp(`<html lang="${lang}" dir="${dir}">`));
      assert.match(html, new RegExp(`rel="canonical" href="https://sofreh-v2.vercel.app/${route}"`));
      assert.equal((html.match(/<h1>/g) || []).length, 1);
      const structured = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
      assert.equal(structured['@type'], 'Organization');
      assert.equal(structured.aggregateRating, undefined);
      assert.equal(structured.address, undefined);
      for (const link of html.matchAll(/(?:href|src)="(\/[^"#]*)"/g)) {
        const target = await fetch(base + link[1]);
        assert.equal(target.status, 200, link[1]);
      }
      assert.doesNotMatch(html, /PLACEHOLDER|TODO|test-token|SIMULATED_AUTHORIZED/);
    }
    const robots = await (await fetch(`${base}/robots.txt`)).text();
    assert.match(robots, /Disallow: \/api\//);
    assert.match(robots, /Disallow: \/preview\//);
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.equal((sitemap.match(/<loc>/g) || []).length, 2);
    assert.doesNotMatch(sitemap, /\/preview\/|\/api\/|private/i);
    assert.equal((await fetch(`${base}/showcase`, { redirect: 'manual' })).status, 308);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});

test('Persian catalogue entry opens the customer interface in Persian', async () => {
  const { server, db } = createSofrehHttpServer({ dbFilePath: ':memory:' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(`${apiBase}/preview/customer`)).text();
    const client = mountPreviewHtmlInVm(html, { apiBase, urlPath: '/preview/customer?locale=fa-IR' });
    await client.waitForNetworkIdle();
    assert.equal(client.document.documentElement.dir, 'rtl');
    assert.equal(client.getElementById('appTitle').textContent, 'سفره');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
