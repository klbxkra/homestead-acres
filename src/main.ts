import { render, h } from 'preact';
import { createGame } from './game/createGame';
import { App } from './ui/App';
import { suppressBrowserGestures, whenViewportReady } from './platform/device';

suppressBrowserGestures();

const gameRoot = document.getElementById('game');
const uiRoot = document.getElementById('ui');
if (!gameRoot || !uiRoot) throw new Error('index.html is missing #game or #ui');

render(h(App, {}), uiRoot);
void whenViewportReady().then(() => createGame(gameRoot));
