import assert from 'node:assert/strict';
import test from 'node:test';
import { lastValueFrom, of, throwError, toArray, delay } from 'rxjs';
import { pollCommand } from './command-status.ts';

test('unchanged status and total failure both finish at the deadline', async () => {
  assert.deepEqual(await lastValueFrom(pollCommand(() => of({ status: 'Pending' }), 2, 25).pipe(toArray())), [{ status: 'Pending' }]);
  assert.deepEqual(await lastValueFrom(pollCommand(() => throwError(() => new Error('offline')), 2, 25).pipe(toArray())), []);
});
test('slow responses survive faster poll ticks and terminal results are emitted once', async () => {
  let reads = 0;
  const results = await lastValueFrom(pollCommand(() => { reads++; return of({ status: 'Completed' }).pipe(delay(15)); }, 2, 100).pipe(toArray()));
  assert.deepEqual(results, [{ status: 'Completed' }]); assert.equal(reads, 1);
});
