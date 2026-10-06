import { EMPTY, Observable, catchError, distinctUntilChanged, exhaustMap, takeUntil, takeWhile, timer } from 'rxjs';

/** Poll without cancelling slow requests. A wall-clock deadline also terminates
 * when every request fails or when the server keeps returning the same status.
 */
export function pollCommand<T extends { status: string }>(read: () => Observable<T>, intervalMs: number, maxDurationMs: number): Observable<T> {
  return timer(0, intervalMs).pipe(
    exhaustMap(() => read().pipe(catchError(() => EMPTY))),
    distinctUntilChanged((a, b) => a.status === b.status),
    takeWhile(value => !['completed', 'failed'].includes(value.status.toLowerCase()), true),
    takeUntil(timer(maxDurationMs))
  );
}
