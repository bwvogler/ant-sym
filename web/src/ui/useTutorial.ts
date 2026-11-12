import { useCallback, useEffect, useRef, useState } from "react";
import { PLANE, type Game } from "../colony/index.ts";
import type { Followed } from "./follow.ts";
import {
  begin,
  cardFor,
  faster as fasterOf,
  finish,
  isLive,
  markTutorialDone,
  next as nextOf,
  observe,
  seenOf,
  tutorialDone,
  type Effect,
  type Tutorial,
} from "./tutorial.ts";
import type { ColonyControls } from "./useColony.ts";

// The tutorial on the page (ja-7x4, PRD §61): the machine (tutorial.ts) read every frame, its effects applied through
// the page's own controls, follow and camera; the Learn-style highlight set on the root (index.css `data-tutorial`).

const store = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** Whether a first Start should run the tutorial: never finished or skipped in this browser. */
export const firstGame = (): boolean => !tutorialDone(store());
/** The start screen's "without the tutorial" on a first game: as good as skipped. */
export const skipTutorial = (): void => markTutorialDone(store());

export function useTutorial({
  game,
  onFrame,
  update,
  setFollowed,
  showAt,
}: {
  game: Game;
  onFrame: (fn: () => void) => () => void;
  update: (patch: Partial<ColonyControls>) => void;
  setFollowed: (f: Followed | null) => void;
  /** centre view `view` (PLANE or CURTAIN) on (x, y), close, and show that view */
  showAt: (view: number, x: number, y: number, close?: boolean) => void;
}) {
  const [t, setT] = useState<Tutorial | null>(null);
  const live = useRef<Tutorial | null>(null);
  const gameAt = useRef(game);
  const centred = useRef(false);

  const apply = useCallback(
    (e: Effect) => {
      const patch: Partial<ColonyControls> = {};
      if (e.playing !== undefined) patch.playing = e.playing;
      if (e.speed !== undefined) patch.speed = e.speed;
      if (Object.keys(patch).length) update(patch);
      if (e.follow) {
        const c = game.colonies[e.follow.k];
        setFollowed(e.follow);
        if (c) showAt(c.layer[e.follow.i] ?? PLANE, c.x[e.follow.i], c.y[e.follow.i], true);
      }
      if (e.done) {
        markTutorialDone(store());
        live.current = null;
        setT(null);
      }
    },
    [game, update, setFollowed, showAt],
  );

  /** A tutorial game: the start screen's Start on a first game, or its Tutorial link. */
  const run = useCallback(() => {
    centred.current = false;
    gameAt.current = game;
    live.current = begin();
    setT(live.current);
  }, [game]);

  // A new game mid-tutorial (Restart, New world, a loaded save) ends it: its host is another game's ant. On the first card
  // nothing has happened yet, so it carries on in the new game (Start with another seed builds one after `run`).
  useEffect(() => {
    if (gameAt.current === game) return;
    gameAt.current = game;
    if (live.current?.step === "landing") centred.current = false;
    else if (live.current) apply(finish);
  }, [game, apply]);

  useEffect(
    () =>
      onFrame(() => {
        const cur = live.current;
        if (!cur) return;
        if (cur.step === "landing" && !centred.current && game.landed) {
          centred.current = true;
          showAt(PLANE, game.landed.x, game.landed.y, true);
        }
        if (!isLive(cur)) return;
        const r = observe(cur, seenOf(game, cur));
        if (r.t === cur) return;
        live.current = r.t;
        setT(r.t);
        if (r.effect) apply(r.effect);
      }),
    [onFrame, game, apply, showAt],
  );

  // The highlight: one attribute on the root, styled in index.css.
  const card = t ? cardFor(t, game.landed?.colony ?? 0) : null;
  const highlight = card?.highlight ?? "";
  useEffect(() => {
    document.documentElement.dataset.tutorial = highlight;
    return () => void delete document.documentElement.dataset.tutorial;
  }, [highlight]);

  const step = (r: { t: Tutorial; effect: Effect }) => {
    live.current = r.t;
    setT(r.t.step === "done" ? null : r.t);
    apply(r.effect);
  };
  return {
    tutorial: t,
    card,
    run,
    next: () => t && step(nextOf(t, game.time)),
    faster: () => t && step(fasterOf(t)),
    skip: () => apply(finish),
  };
}
