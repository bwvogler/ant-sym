import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Flight, MAX_COLONIES, PLANE, type Game, type OneWorld } from "../colony/index.ts";
import type { FieldApi, FieldPen } from "./ColonyField.tsx";
import { type Founded, foundOnMothers, foundOnWords } from "./flight.ts";
import type { GameLoop } from "./gameLoop.ts";
import { colonyName } from "./names.ts";
import { flightCircle, penGate, penGround, penSettle, withinFlight } from "./pen.ts";
import type { Landing } from "./QueenPen.tsx";
import { useLoopStats } from "./session.ts";
import { flightInAir } from "./statSelect.ts";
import { pushToast } from "./toasts.ts";
import { useJev } from "./jevContext.tsx";
import type { JevSession } from "./jevSession.ts";
import type { DoctrineChoice } from "./useColonyJev.ts";
import type { ColonyControls } from "./useColony.ts";

// The queen's flight and her pen, as the page runs them (ja-fnd.6.2, docs/refactor.md S5.2): what ColonyApp's Page did inline. A new queen has
// flown and the game is paused for her; if the fungus is in her, her mother's queen was reached and Jev can read new words, the pen opens (a
// circle on the top view, a preview of where she would settle under the pointer, a click to found there); else she founds on her mother's
// doctrine at once and a notice says why. The founding rules themselves are flight.ts's and pen.ts's: this is the page's side of them.

export interface FlightPen {
  /** the queen in the air, or null */
  flight: Flight | null;
  /** whether her flight opens the pen, or why not (null: none in the air) */
  gate: ReturnType<typeof penGate> | null;
  /** the pen's circle on the top view (one world), or null */
  circle: ReturnType<typeof flightCircle> | null;
  /** what the field shows for the pen: the circle, the settle preview, the click that founds */
  pen: FieldPen | null;
  /** the pen's card is up (a flight, its pen open, its circle on the map): the flight and the circle, else null */
  penCard: { flight: Flight; circle: NonNullable<ReturnType<typeof flightCircle>> } | null;
  /** "found her" from the card (the pen's side chooser is the side view's: she flies as the game says) */
  foundHers: (d: DoctrineChoice, at: Landing) => void;
  /** "Let her fly": her own flight from her mother's hole, on the pen's words */
  onFly: (d: DoctrineChoice) => void;
  /** the pen's words, as written (read by a click on the map) */
  onWords: (d: DoctrineChoice) => void;
  /** dev builds: open the pen without Jev (the dev hook's fly(); the Playwright guard) */
  openDevPen: () => void;
}

export function useFlight({
  game,
  loop,
  jev,
  update,
  setFollowed,
  setView,
  field,
  oneWorld,
}: {
  game: Game;
  loop: GameLoop;
  jev: JevSession;
  update: (patch: Partial<ColonyControls>) => void;
  setFollowed: (f: null) => void;
  setView: (view: "above" | "below") => void;
  field: RefObject<FieldApi | null>;
  oneWorld: OneWorld;
}): FlightPen {
  const inAir = useLoopStats(loop, flightInAir);
  const flight: Flight | null = inAir ? (game.flights[0] ?? null) : null;
  // `devPen` (dev builds only, set by the dev hook's fly(): the Playwright guard) opens the pen without Jev.
  const [devPen, setDevPen] = useState(false);
  const lock = useJev((s) => s.lock);
  const gate = flight ? penGate(flight, game.revealed, devPen ? null : lock, colonyName(flight.mother)) : null;
  // The founding rules are ui/flight.ts's (ja-fnd.6.2); the page shows what they return and resumes once no queen is in the air.
  const apply = useCallback(
    (r: Founded) => {
      if (r.notice) pushToast(r.notice.text, r.notice.tone);
      if (r.resume) {
        update({ playing: true });
        setDevPen(false); // the dev hook's pen was for that flight only
      }
    },
    [update],
  );
  useEffect(() => {
    if (!flight || !gate || gate.open) return;
    apply(foundOnMothers(game, jev, jev.snapshot().doctrines, flight, gate.reason));
  }, [flight, gate, game, jev, apply]);
  /** Found flight f's colony at `at` on the player's words `d` (the queen's pen). */
  const foundOn = useCallback(
    (f: Flight, d: DoctrineChoice, at: { x: number; y: number } | null) => apply(foundOnWords(game, jev, f, d, at)),
    [game, jev, apply],
  );
  // The pen's side and distance chooser is the side view's: it goes with the page's view code (S2.3e); she flies as the game says.
  const foundHers = useCallback(
    (d: DoctrineChoice, _at: Landing) => {
      if (flight) foundOn(flight, d, game.landing(flight.mother));
    },
    [flight, game, foundOn],
  );
  // One world's pen (owner, 2026-11-10): she flies where the player clicks on the top view, within her flight of her
  // mother's hole. The page shows the top view, round her circle; the field previews where she would settle
  // (Game.settleAt, on the ground kept while the line is the same: penGround) and a click there founds her colony.
  const penOpen = flight !== null && gate?.open === true;
  const circle = penOpen && oneWorld && flight ? flightCircle(game, flight) : null;
  const penWords = useRef<DoctrineChoice>({ id: "", text: "" });
  /** "Let her fly": her own flight from her mother's hole (Game.landing), on the pen's words: no pointer needed. */
  const onFly = useCallback(
    (d: DoctrineChoice) => {
      if (flight) foundOn(flight, d, game.landing(flight.mother));
    },
    [flight, game, foundOn],
  );
  const onWords = useCallback((d: DoctrineChoice) => {
    penWords.current = d;
  }, []);
  const penFor = circle ? `${circle.x},${circle.y},${flight?.at}` : null;
  useEffect(() => {
    if (!circle) return;
    setFollowed(null); // the pen's circle, not an ant, is what the top view shows
    field.current?.centreOn(PLANE, circle.x, circle.y, { span: 2.6 * circle.r });
    setView("above");
    // Once as the pen opens (its circle's place and the flight say which).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penFor, setView, setFollowed]);
  const pen: FieldPen | null = useMemo(() => {
    if (!circle || !flight || !oneWorld) return null;
    const mother = colonyName(flight.mother);
    return {
      ...circle,
      preview: (p) =>
        penSettle(circle, p, mother, (q) =>
          game.colonies.length >= MAX_COLONIES
            ? { ok: false, reason: `the map already holds ${MAX_COLONIES} colonies` }
            : game.settleAt(q, penGround(oneWorld)),
        ),
      onPick: (p) => {
        if (!withinFlight(circle, p)) return pushToast(`She can't fly that far: click within ${circle.r} of ${mother}'s hole.`, "warn");
        if (!penWords.current.text) return pushToast("Write her doctrine first.", "warn");
        foundOn(flight, penWords.current, p);
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [penFor, flight, oneWorld, game, foundOn]);
  const penCard = flight && gate?.open && oneWorld && circle ? { flight, circle } : null;
  return { flight, gate, circle, pen, penCard, foundHers, onFly, onWords, openDevPen: () => setDevPen(true) };
}
