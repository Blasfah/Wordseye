import { render } from 'preact';
import { App } from './ui/App';
import { connectEffects } from './ui/state';
import './styles/tokens.css';
import './styles/global.css';
import './styles/screens.css';
import './styles/round.css';
import './styles/dialog.css';

connectEffects();
render(<App />, document.getElementById('app')!);
