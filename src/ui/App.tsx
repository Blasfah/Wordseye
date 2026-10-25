import { useEffect } from 'preact/hooks';
import { CONFIG } from '../config';
import { Calendar } from './Calendar';
import { Results } from './Results';
import { Round } from './Round';
import { Start } from './Start';
import { game, load, loadStatus, route } from './state';

export function App() {
  useEffect(() => {
    void load();
  }, []);

  const status = loadStatus.value;
  return (
    <>
      {/* Stand-in that holds keyboard focus on phones between screens (see focusKeyboardProxy). */}
      <input id="keyboard-proxy" class="keyboard-proxy" tabIndex={-1} aria-hidden="true" />
      <main class="app">
        {status.kind === 'loading' && <Loading />}
        {status.kind === 'error' && <LoadError message={status.message} />}
        {status.kind === 'ready' && (route.value.view === 'calendar' ? <Calendar /> : <Screen />)}
      </main>
    </>
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
