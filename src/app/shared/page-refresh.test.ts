import assert from 'node:assert/strict';
import test from 'node:test';
import { BehaviorSubject, NEVER, Subject, Observable, of, switchMap, throwError } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
import { refreshVisiblePage } from './page-refresh.ts';

const clock = () => new TestScheduler((actual, expected) => assert.deepEqual(actual, expected));

test('serialized polls preserve a slow successful response', () => {
  const scheduler = clock();
  scheduler.run(({ cold, flush }) => {
    let reads = 0;
    const values: number[] = [];
    const subscription = refreshVisiblePage(() => { reads++; return cold('-----a|', { a: reads }); }, of(true), NEVER, 2, 20, scheduler)
      .subscribe(result => { if (result.state === 'ready') values.push(result.value); });
    scheduler.schedule(() => subscription.unsubscribe(), 9);
    flush();
    assert.equal(reads, 2);
    assert.deepEqual(values, [1]);
  });
});

test('hidden pages stop reads; return and manual refresh fetch immediately', () => {
  const scheduler = clock();
  scheduler.run(({ flush }) => {
    const visible = new BehaviorSubject(false);
    const requested = new Subject<void>();
    const times: number[] = [];
    const subscription = refreshVisiblePage(() => { times.push(scheduler.now()); return of('fresh'); }, visible, requested, 100, 20, scheduler).subscribe();
    scheduler.schedule(() => requested.next(), 1);
    scheduler.schedule(() => visible.next(true), 3);
    scheduler.schedule(() => requested.next(), 5);
    scheduler.schedule(() => visible.next(false), 7);
    scheduler.schedule(() => requested.next(), 9);
    scheduler.schedule(() => visible.next(true), 14);
    scheduler.schedule(() => subscription.unsubscribe(), 17);
    flush();
    assert.deepEqual(times, [3, 5, 14]);
  });
});

test('failure is distinguishable from an empty result and later success recovers', () => {
  const scheduler = clock();
  scheduler.run(({ flush }) => {
    let reads = 0;
    const results: unknown[] = [];
    const failure = new Error('offline');
    const subscription = refreshVisiblePage(() => ++reads === 1 ? throwError(() => failure) : of(reads === 2 ? [] : ['template']), of(true), NEVER, 5, 20, scheduler)
      .subscribe(result => { if (result.state !== 'refreshing') results.push(result); });
    scheduler.schedule(() => subscription.unsubscribe(), 12);
    flush();
    assert.deepEqual(results, [{ state: 'error', error: failure }, { state: 'ready', value: [] }, { state: 'ready', value: ['template'] }]);
  });
});

test('a hung request times out and does not lock out future refreshes', () => {
  const scheduler = clock();
  scheduler.run(({ flush }) => {
    let reads = 0;
    const states: string[] = [];
    const subscription = refreshVisiblePage(() => ++reads === 1 ? NEVER : of('recovered'), of(true), NEVER, 5, 3, scheduler)
      .subscribe(result => states.push(result.state));
    scheduler.schedule(() => subscription.unsubscribe(), 9);
    flush();
    assert.equal(reads, 2);
    assert.deepEqual(states, ['refreshing', 'error', 'refreshing', 'ready']);
  });
});

test('visibility and final teardown cancel in-flight reads and timers', () => {
  const scheduler = clock();
  scheduler.run(({ flush }) => {
    const visible = new BehaviorSubject(true);
    let starts = 0, stops = 0;
    const subscription = refreshVisiblePage(() => new Observable(() => { starts++; return () => { stops++; }; }), visible, NEVER, 5, 20, scheduler).subscribe();
    scheduler.schedule(() => visible.next(false), 2);
    scheduler.schedule(() => visible.next(true), 4);
    scheduler.schedule(() => subscription.unsubscribe(), 6);
    scheduler.schedule(() => visible.next(true), 10);
    flush();
    assert.equal(starts, 2); assert.equal(stops, 2);
  });
});

test('changing installation cancels an old response before it can replace the new one', () => {
  const scheduler = clock();
  scheduler.run(({ cold, flush }) => {
    const route = new BehaviorSubject('old');
    const values: string[] = [];
    const subscription = route.pipe(switchMap(code => refreshVisiblePage(() => cold(code === 'old' ? '-----a|' : '-a|', { a: code }), of(true), NEVER, 100, 20, scheduler)))
      .subscribe(result => { if (result.state === 'ready') values.push(result.value); });
    scheduler.schedule(() => route.next('new'), 2);
    scheduler.schedule(() => subscription.unsubscribe(), 9);
    flush();
    assert.deepEqual(values, ['new']);
  });
});
