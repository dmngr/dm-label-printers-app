/** Refresh only while visible, serialize reads, and retain failures as data.
 * Callers keep the last good snapshot and their drafts. Unsubscribe on route
 * changes/destruction. A stuck read times out so later refreshes can recover.
 * The default cadence adds one snapshot per 30 seconds per visible page;
 * returning to the page or requesting a manual refresh loads immediately.
 */
import { EMPTY, Observable, asyncScheduler, catchError, concat, defer, distinctUntilChanged, exhaustMap, map, merge, of, switchMap, timeout, timer } from 'rxjs';
import type { SchedulerLike } from 'rxjs';

export type PageRefresh<T> =
  | { state: 'refreshing' }
  | { state: 'ready'; value: T }
  | { state: 'error'; error: unknown };

export function refreshVisiblePage<T>(
  load: () => Observable<T>,
  visible: Observable<boolean>,
  requested: Observable<unknown>,
  intervalMs = 30_000,
  timeoutMs = 20_000,
  scheduler: SchedulerLike = asyncScheduler,
): Observable<PageRefresh<T>> {
  return visible.pipe(
    distinctUntilChanged(),
    switchMap(shown => shown ? merge(timer(0, intervalMs, scheduler), requested).pipe(
      exhaustMap(() => concat(
        of<PageRefresh<T>>({ state: 'refreshing' }),
        defer(load).pipe(
          timeout({ first: timeoutMs, scheduler }),
          map(value => ({ state: 'ready' as const, value })),
          catchError(error => of<PageRefresh<T>>({ state: 'error', error })),
        ),
      )),
    ) : EMPTY),
  );
}
