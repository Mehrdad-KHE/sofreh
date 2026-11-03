import { parentPort, workerData } from 'node:worker_threads';
import {
  openSofrehDatabase,
  authenticateByToken,
  createOrderTransactional
} from '../packages/backend/src/index.mjs';

const gate = new Int32Array(workerData.gate);
const db = openSofrehDatabase(workerData.dbPath);
try {
  const customer = authenticateByToken(db, workerData.token);
  parentPort.postMessage({ type: 'ready' });
  if (Atomics.wait(gate, 0, 0, 10000) === 'timed-out') {
    throw new Error('Checkout start barrier timed out');
  }
  // Both independent connections enter checkout before either proceeds.
  Atomics.add(gate, 1, 1);
  Atomics.notify(gate, 1);
  while (Atomics.load(gate, 1) < 2) {
    if (Atomics.wait(gate, 1, 1, 10000) === 'timed-out') {
      throw new Error('Competing checkout did not arrive');
    }
  }
  try {
    const order = createOrderTransactional(db, customer, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'pickup',
      idempotencyKey: workerData.key,
      items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
    });
    parentPort.postMessage({ type: 'result', ok: true, orderId: order.id });
  } catch (error) {
    parentPort.postMessage({ type: 'result', ok: false, code: error.code, status: error.httpStatus });
  }
} finally {
  db.close();
  parentPort.close();
}
