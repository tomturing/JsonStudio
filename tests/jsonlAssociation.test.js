import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('registers JSONL and NDJSON as owner-ranked desktop file associations', () => {
  const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)));
  const associations = config.bundle.fileAssociations;
  const jsonlAssociation = associations.find((association) => association.ext.includes('jsonl'));

  assert.deepEqual(jsonlAssociation.ext, ['jsonl', 'ndjson']);
  assert.equal(jsonlAssociation.name, 'JSON Lines Document');
  assert.equal(jsonlAssociation.role, 'Editor');
  assert.equal(jsonlAssociation.rank, 'Owner');
  assert.equal(jsonlAssociation.mimeType, 'application/x-ndjson');
  assert.deepEqual(jsonlAssociation.contentTypes, ['public.json']);
});
