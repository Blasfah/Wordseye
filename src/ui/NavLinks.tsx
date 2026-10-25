import { hrefFor, type Route } from './route';
import { route } from './state';

/**
 * Quiet links to the other places in the game, depending on where you are.
 * Practice is only linked in development: it uses puzzles of its own, but it's
 * a testing tool rather than part of the game.
 */
export function NavLinks() {
  const links: [Route, string][] = [];
  switch (route.value.view) {
    case 'practice':
      links.push([{ view: 'today' }, "Today's puzzle"]);
      break;
    case 'day':
      links.push(
        [{ view: 'calendar' }, 'Back to the calendar'],
        [{ view: 'today' }, "Today's puzzle"],
      );
      break;
    case 'calendar':
      if (import.meta.env.DEV) links.push([{ view: 'practice' }, 'Practice mode']);
      break;
    case 'today':
      links.push([{ view: 'calendar' }, 'Past puzzles']);
      if (import.meta.env.DEV) links.push([{ view: 'practice' }, 'Practice mode']);
      break;
  }
  if (links.length === 0) return null;
  return (
    <nav class="nav-links" aria-label="More puzzles">
      {links.map(([target, label]) => (
        <a key={label} class="nav-link" href={hrefFor(target, location.pathname)}>
          {label}
        </a>
      ))}
    </nav>
  );
}
