import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CONFIG } from '../config';
import { Calendar } from './Calendar';
import { Results } from './Results';
import { Round } from './Round';
import { Start } from './Start';
import { game, load, loadStatus, pending, route, stillEntrance } from './state';

export function App() {
  useEffect(() => {
    void load();
  }, []);

  const status = loadStatus.value;
  const current = route.value;
  // A new key is a new screen, which makes an entrance; switching levels keeps the key.
  const screenKey =
    current.view === 'calendar'
      ? 'calendar'
      : `${current.view}:${current.view === 'day' ? current.day : ''}:${game.value.status}`;
  return (
    <>
      {/* Stand-in that holds keyboard focus on phones between screens (see focusKeyboardProxy). */}
      <input id="keyboard-proxy" class="keyboard-proxy" tabIndex={-1} aria-hidden="true" />
      <main class="app" aria-busy={pending.value || undefined}>
        {status.kind === 'loading' && <Loading />}
        {status.kind === 'error' && <LoadError message={status.message} />}
        {status.kind === 'ready' && (
          <Entrance key={screenKey}>
            {current.view === 'calendar' ? <Calendar /> : <Screen />}
          </Entrance>
        )}
      </main>
    </>
  );
}

/**
 * Holds a screen. Whether it makes an entrance is settled when it appears: a
 * screen brought in by switching levels skips straight to the end of its
 * entrance animations, before it's painted. Later animations play as usual.
 */
function Entrance({ children }: { children: ComponentChildren }) {
  const [still] = useState(() => stillEntrance.peek());
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!still) return;
    for (const animation of box.current?.getAnimations?.({ subtree: true }) ?? []) {
      if (animation.effect?.getTiming().iterations !== Infinity) animation.finish();
    }
  }, [still]);
  return (
    <div class="entrance" ref={box}>
      {children}
    </div>
  );
}

function Screen() {
  switch (game.value.status) {
    case 'ready':
      return <Start />;
    case 'playing':
      return <Round />;
    case 'finished':
      return <Results />;
  }
}

function Loading() {
  return (
    <p class="screen loading" role="status">
      Fetching today's words…
    </p>
  );
}

function LoadError({ message }: { message: string }) {
  return (
    <section class="screen load-error" aria-labelledby="error-title">
      <h1 id="error-title" class="wordmark wordmark-small">
        {CONFIG.name}
      </h1>
      <p>We couldn't load today's puzzle. Check your connection and try again.</p>
      <p class="quiet">{message}</p>
      <button type="button" class="button button-primary" onClick={() => void load()}>
        Try again
      </button>
    </section>
  );
}
