import { parseJsonl } from '../services/jsonlParser.js';

self.onmessage = (event) => {
  const { id, payload } = event.data;
  try {
    self.postMessage({
      id,
      ok: true,
      result: parseJsonl(payload.content),
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'JSONL parsing failed',
    });
  }
};
