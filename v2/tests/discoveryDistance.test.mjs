import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSofrehHttpServer } from '../packages/backend/src/server.mjs';
import { mountPreviewHtmlInVm } from './previewDomHarness.mjs';

async function withPreview(run) {
  const { server, db } = createSofrehHttpServer({ dbFilePath: ':memory:' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const apiBase = `http://127.0.0.1:${server.address().port}`;
  try {
    const html = await (await fetch(`${apiBase}/preview/customer`)).text();
    await run(html, apiBase);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
}

function distanceFor(client, cookId) {
  // This harness retains dynamic text in the owning element's HTML, not leaf nodes.
  const html = client.getElementById('cookCardsList').innerHTML;
  return html.match(new RegExp(`data-distance-cook-id="${cookId}"[^>]*>([^<]*)<`))?.[1];
}

test('manual area enables useful distance and nearest-first ordering without uploading location', async () => {
  await withPreview(async (html, apiBase) => {
    const client = mountPreviewHtmlInVm(html, { apiBase, geolocationMock: null });
    await client.waitForNetworkIdle();
    assert.match(distanceFor(client, 'cook-test-kambiz'), /Choose an origin/);
    client.getElementById('locateMeBtn').click();
    const requestsBefore = client.fetchHistory.length;
    const origin = client.getElementById('distanceOriginSelect');
    origin.value = 'willowdale';
    origin.dispatchEvent({ type: 'change', target: origin });
    assert.match(distanceFor(client, 'cook-test-kambiz'), /Approx\. 0 km/);
    assert.match(distanceFor(client, 'cook-test-pari'), /Approx\. 2\.1 km/);
    const sort = client.getElementById('discoverySortSelect');
    sort.value = 'nearest';
    sort.dispatchEvent({ type: 'change', target: sort });
    const cards = client.querySelectorAll('[data-cook-card-id]');
    assert.equal(cards[0].getAttribute('data-cook-card-id'), 'cook-test-kambiz');
    assert.equal(client.fetchHistory.length, requestsBefore);
    origin.value = '';
    origin.dispatchEvent({ type: 'change', target: origin });
    assert.match(distanceFor(client, 'cook-test-kambiz'), /Choose an origin/);
  });
});

test('device distance updates immediately, translates and clears after permission denial', async () => {
  await withPreview(async (html, apiBase) => {
    let granted = true;
    const client = mountPreviewHtmlInVm(html, {
      apiBase,
      geolocationMock: { getCurrentPosition(success, failure) {
        if (granted) success({ coords: { latitude: 43.7615, longitude: -79.4111 } });
        else failure({ code: 1 });
      } }
    });
    await client.waitForNetworkIdle();
    const count = client.fetchHistory.length;
    client.getElementById('locateMeBtn').click();
    assert.match(distanceFor(client, 'cook-test-kambiz'), /Approx\. 0 km/);
    assert.equal(client.fetchHistory.length, count);
    client.getElementById('localeToggleBtn').click();
    await client.waitForNetworkIdle();
    assert.match(distanceFor(client, 'cook-test-kambiz'), /کیلومتر/);
    granted = false;
    client.getElementById('locateMeBtn').click();
    assert.match(distanceFor(client, 'cook-test-kambiz'), /مبدأ را انتخاب/);
  });
});

test('invalid device coordinates cannot create a fabricated distance', async () => {
  await withPreview(async (html, apiBase) => {
    const client = mountPreviewHtmlInVm(html, {
      apiBase,
      geolocationMock: { getCurrentPosition(success) {
        success({ coords: { latitude: 100, longitude: -79.4111 } });
      } }
    });
    await client.waitForNetworkIdle();
    client.getElementById('locateMeBtn').click();
    assert.equal(client.getElementById('geolocationStatus').getAttribute('data-geo-state'), 'unavailable');
    assert.match(distanceFor(client, 'cook-test-kambiz'), /Choose an origin/);
  });
});
