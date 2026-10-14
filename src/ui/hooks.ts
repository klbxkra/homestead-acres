import { useEffect, useState } from 'preact/hooks';
import type { Store } from '../app/store';
import type { GameState } from '../core';
import type { Transport } from '../net/Transport';

export function useStore<T>(store: Store<T>): T {
  const [state, setState] = useState(store.get());
  useEffect(() => {
    setState(store.get());
    return store.subscribe((next) => setState(next));
  }, [store]);
  return state;
}

export function useGameState(transport: Transport): GameState {
  const [state, setState] = useState(transport.getState());
  useEffect(() => {
    setState(transport.getState());
    return transport.subscribe((next) => setState(next));
  }, [transport]);
  return state;
}
