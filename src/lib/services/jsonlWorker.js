import { parseJsonl } from './jsonlParser.js';
import { createPersistentWorker } from './persistentWorker.js';

const jsonlWorker = createPersistentWorker(
  () => new Worker(new URL('../workers/jsonl.worker.js', import.meta.url), {
    type: 'module',
  }),
);

/** @type {{ promise: Promise<unknown>; cancel: () => void } | null} */
let activeTask = null;

/**
 * Parse JSONL off the UI thread when Workers are available.
 * @param {string} content
 */
export function parseJsonlAsync(content) {
  if (typeof Worker === 'undefined') return Promise.resolve(parseJsonl(content));

  cancelJsonlParse();
  const task = jsonlWorker.run({ content });
  activeTask = task;
  return task.promise.finally(() => {
    if (activeTask === task) activeTask = null;
  });
}

export function cancelJsonlParse() {
  const task = activeTask;
  activeTask = null;
  task?.cancel();
}
