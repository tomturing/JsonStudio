import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('registers JSON-family extensions with stable macOS content types', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
  const associations = config.bundle.fileAssociations;

  const jsonAssociation = associations.find((association) => association.ext.includes('json'));
  assert.deepEqual(jsonAssociation.ext, ['json']);
  assert.deepEqual(jsonAssociation.contentTypes, ['public.json']);

  const jsonFamilyAssociation = associations.find((association) => association.ext.includes('json5'));
  assert.deepEqual(jsonFamilyAssociation.ext, [
    'json5',
    'jsonc',
    'geojson',
    'topojson',
    'har',
    'webmanifest',
    'ipynb',
    'sarif',
  ]);
  assert.equal(jsonFamilyAssociation.rank, 'Owner');
  assert.deepEqual(jsonFamilyAssociation.exportedType, {
    identifier: 'com.jsonstudio.json-document',
    conformsTo: ['public.json'],
  });

  const jsonlAssociation = associations.find((association) => association.ext.includes('jsonl'));

  assert.deepEqual(jsonlAssociation.ext, ['jsonl', 'ndjson']);
  assert.equal(jsonlAssociation.name, 'JSON Lines Document');
  assert.equal(jsonlAssociation.role, 'Editor');
  assert.equal(jsonlAssociation.rank, 'Owner');
  assert.equal(jsonlAssociation.mimeType, 'application/x-ndjson');
  assert.deepEqual(jsonlAssociation.exportedType, {
    identifier: 'com.jsonstudio.json-lines',
    conformsTo: ['public.text'],
  });
});
