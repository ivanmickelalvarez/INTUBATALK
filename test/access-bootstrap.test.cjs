const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');

test('bootstrap worker returns an empty 404 for every requested path', async () => {
  const workerUrl = pathToFileURL(`${process.cwd()}/access-bootstrap-worker.mjs`);
  const { default: worker } = await import(workerUrl.href);

  for (const path of ['/', '/api/poll', '/anything/else']) {
    const response = await worker.fetch(new Request(`https://intubatalk.example${path}`));
    assert.equal(response.status, 404, `${path} should not be served`);
    assert.equal(await response.text(), '', `${path} should have an empty body`);
  }
});
