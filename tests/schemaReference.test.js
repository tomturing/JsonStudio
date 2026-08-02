import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRemoteSchema, getRemoteSchemaUrl } from '../src/lib/services/schemaReference.js';

test('extracts only remote HTTPS schema references', () => {
  assert.equal(
    getRemoteSchemaUrl('{"$schema":"https://biomejs.dev/schemas/2.5.6/schema.json"}'),
    'https://biomejs.dev/schemas/2.5.6/schema.json',
  );
  assert.equal(getRemoteSchemaUrl('{"$schema":"./schema.json"}'), null);
  assert.equal(getRemoteSchemaUrl('{"$schema":"http://example.com/schema.json"}'), null);
  assert.equal(getRemoteSchemaUrl('{"$schema":"file:///tmp/schema.json"}'), null);
  assert.equal(
    getRemoteSchemaUrl('{"$schema":"  https://example.com/schema.json  "}'),
    'https://example.com/schema.json',
  );
  assert.equal(getRemoteSchemaUrl('{"$schema":"https://user:pass@example.com/schema.json"}'), null);
  assert.equal(getRemoteSchemaUrl('[]'), null);
});

test('fetches and formats a remote JSON Schema', async () => {
  const schema = await fetchRemoteSchema('https://example.com/schema.json', {
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://example.com/schema.json');
      assert.equal(options.headers.Accept, 'application/schema+json, application/json');
      return new Response('{"type":"object"}', { status: 200, statusText: 'OK' });
    },
  });

  assert.equal(schema, '{\n  "type": "object"\n}');
});

test('reports invalid remote schema responses', async () => {
  await assert.rejects(
    fetchRemoteSchema('https://example.com/schema.json', {
      fetchImpl: async () => new Response('Not found', { status: 404, statusText: 'Not Found' }),
    }),
    /404 Not Found/,
  );

  await assert.rejects(
    fetchRemoteSchema('https://example.com/schema.json', {
      fetchImpl: async () => new Response('null', { status: 200 }),
    }),
    /must be a JSON object or boolean/,
  );
});

test('rejects invalid schema URLs before making a request', async () => {
  await assert.rejects(
    fetchRemoteSchema('http://example.com/schema.json', {
      fetchImpl: async () => { throw new Error('request should not run'); },
    }),
    /Only HTTPS schema URLs/,
  );
});

test('rejects schema responses over the size limit', async () => {
  await assert.rejects(
    fetchRemoteSchema('https://example.com/schema.json', {
      fetchImpl: async () => new Response('', {
        status: 200,
        headers: { 'content-length': String(5 * 1024 * 1024 + 1) },
      }),
    }),
    /5 MiB limit/,
  );
});
