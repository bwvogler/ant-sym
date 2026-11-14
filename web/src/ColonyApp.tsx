import {
  CURTAIN,
  PLANE,
  UPGRADES,
  type Upgrade,
  LETHAL_LEVERS,
  FOUNDING_RESERVE,
  MAX_COLONIES,
  MET,
  type Game,
  AIMS,
  type Flight,
  CELL,
  cellOf,
  GENERIC_ANT,
  groundHeat,
  sunSeen,
} from "./colony/index.ts";
import { USD_PER_INPUT_TOKEN } from "../shared/jev.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AntCard from "./ui/AntCard.tsx";
import ColonyField, { type FieldApi, type FieldPen } from "./ui/ColonyField.tsx";
import DetailsScreen, { BareCards, Colonies, SavedGames, type DetailsProps } from "./ui/DetailsScreen.tsx";
import { Button, Drawer, FLOAT, Icon, IconButton, SectionHead } from "./ui/kit.tsx";
import type { Followed } from "./ui/follow.ts";
import { Bar } from "./ui/widgets.tsx";
import { seg } from "./ui/styles.ts";
import { buildGame, MAX_SPEED, useColony, type ColonyStats, type EvolutionStats, type View } from "./ui/useColony.ts";
import StartScreen from "./ui/StartScreen.tsx";
import TutorialCard from "./ui/Tutorial.tsx";
import { SensedMap } from "./ui/fungusSight.ts";
import { firstGame, skipTutorial, useTutorial } from "./ui/useTutorial.ts";
import {
  AUTOSAVE,
  AUTOSAVE_MS,
  browserSaves,
  describe,
  newestReadable,
  readable,
  record,
  type GameSettings,
  type PlayerState,
  type SaveRecord,
} from "./ui/saves.ts";
import { colonyName, colonyTone } from "./ui/names.ts";
import { isDemo, passphrase } from "./ui/backend.ts";
import PassNote from "./ui/PassNote.tsx";
import Tip from "./ui/Tip.tsx";
import { NextBody, UpgradeBody } from "./ui/UpgradeTips.tsx";
import { BODY_TIP, MUTATION_TIP } from "./ui/upgradeText.ts";
import { recheckBackend, useBackend } from "./ui/useBackend.ts";
import { TOKENS_PER_FUNGAL_SITUATION, TOKENS_PER_SITUATION, useColonyJev } from "./ui/useColonyJev.ts";
import LearnDrawer from "./ui/LearnDrawer.tsx";
import Help from "./ui/Help.tsx";
import { REPO } from "./ui/guide.ts";
import { openLearn } from "./ui/learn.ts";
import Toasts from "./ui/Toasts.tsx";
import { pushToast } from "./ui/toasts.ts";
import QueenPen, { type Landing } from "./ui/QueenPen.tsx";
import { flightCircle, penGate, penGround, penSettle, withinFlight } from "./ui/pen.ts";
import type { DoctrineChoice } from "./ui/useColonyJev.ts";
import { nextCrossing, REHEARSE_DT } from "./ui/rehearse.ts";

// The game's main screen (ja-lo8.2; laid out by PRD §69): the map fills the screen; a HUD over its top (play, speed, view,
// clock, the goal); a rail of drawers at its left (the fungus and its aim, mutations, the colonies, saves, Learn,
// settings; a tab bar on a phone); the followed ant or the queen's pen in an inspector at its right. The fungus is the
// player: you shape its policy in words (its aim); Jev reads them and decides what the fungus does in each host it
// lives in. Each colony's doctrine is its nature, out of the player's reach (docs/new-queens.md). The lab and the full
// numbers are behind Settings → Lab and numbers.

const usd = (v: number) => `$${v.toFixed(4)}`;

/** The drawers the rail opens. */
type DrawerId = "fungus" | "evolve" | "colonies" | "saves" | "settings";

/** The speeds the HUD offers (4× is the game's default; PRD §50); the Details screen's slider has the rest. */
const SPEEDS = [1, 2, 4, MAX_SPEED] as const;

export default function ColonyApp() {
  const { game, controls, update, stats, fps, onFrame, restart, newWorld, start, loadSave, settings, evolve, journal } = useColony();
  const backend = useBackend();
  const jev = useColonyJev(game.colonies, game.fungus, backend, journal, game.params.species);
  const [details, setDetails] = useState(false);
  const closeDetails = useCallback(() => setDetails(false), []);
  // One drawer open at a time, beside the map (PRD §69).
  const [drawer, setDrawer] = useState<DrawerId | null>(null);
  const toggle = useCallback((d: DrawerId) => setDrawer((cur) => (cur === d ? null : d)), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  // The followed ant belongs to the game it was picked in: a new game has new ants, so nothing is followed.
  // Keyed by a token per game rather than the game itself, so an old game is not kept alive by this state.
  const gameToken = useMemo(() => ({ game: game.map.seed }), [game]);
  const [follow, setFollow] = useState<{ token: object; f: Followed } | null>(null);
  const followed = follow && follow.token === gameToken ? follow.f : null;
  const setFollowed = useCallback((f: Followed | null) => setFollow(f ? { token: gameToken, f } : null), [gameToken]);
  // The dev hook reads the follow as it is now (the e2e's carried-follow check), not as it was when the hook was set.
  const followedNow = useRef<Followed | null>(followed);
  useEffect(() => {
    followedNow.current = followed;
  }, [followed]);
  useNotices(stats, jev.lock, jev.state.phase, controls.menu);
  // One world's two views (docs/one-world.md §5): a camera switch, the key `v` too. The game is the same either way.
  const oneWorld = game.world;
  const setView = useCallback((view: View) => update({ view }), [update]);
  useEffect(() => {
    if (!oneWorld) return;
    const key = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "v" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      setView(controls.view === "above" ? "below" : "above");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [oneWorld, controls.view, setView]);
  // The views linked (one-world §5, U5.2): the field's cameras, a click across, and an ant followed through a hole.
  const field = useRef<FieldApi | null>(null);
  /** Show `view` (PLANE or CURTAIN) centred on (x, y) there; `close`: near enough to see the place (a linked click). */
  const showAt = useCallback(
    (view: number, x: number, y: number, close = false) => {
      field.current?.centreOn(view, x, y, { close });
      setView(view === PLANE ? "above" : "below");
    },
    [setView],
  );
  // The first game's tutorial (ja-7x4, PRD §61). A card that points at a drawer's panel opens that drawer.
  const tut = useTutorial({ game, onFrame, update, setFollowed, showAt });
  const pointsAt = tut.card?.highlight;
  useEffect(() => {
    if (pointsAt === "evolution") setDrawer("evolve");
    else if (pointsAt === "aim") setDrawer("fungus");
  }, [pointsAt]);
  // What the fungus's hosts have sensed (PRD §65): one map per game, marked every frame; the field shows scent only there.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh map for each game: `game` is the key, not an input
  const sensed = useMemo(() => new SensedMap(), [game]);
  useEffect(() => onFrame(() => sensed.stamp(game.colonies, game.time)), [onFrame, game, sensed]);
  const onStart = useCallback(
    (seed: number, withTutorial: boolean, species?: string) => {
      start(seed, withTutorial, species);
      if (withTutorial) tut.run();
      // The tutorial is the generic ant's: only a generic start without it marks it done (review of #142, S1).
      else if ((species ?? GENERIC_ANT.id) === GENERIC_ANT.id) skipTutorial();
    },
    [start, tut],
  );
  const onLink = useCallback((view: number, x: number, y: number) => showAt(view, x, y, true), [showAt]);
  /** A followed ant that goes through a hole takes the camera with it, to the other view (always: owner, 2026-11-12). */
  const onCross = useCallback(
    (view: number, x: number, y: number) => {
      field.current?.centreOn(view, x, y, { keepFollow: true });
      setView(view === PLANE ? "above" : "below");
    },
    [setView],
  );
  const games = useSaves(
    game,
    settings,
    { aim: jev.aim, doctrines: jev.doctrines, menu: controls.menu, hide: controls.hide, cull: controls.cull },
    stats,
    controls.started,
  );
  const continueFrom = useCallback(
    (r: SaveRecord) => {
      if (!readable(r)) {
        pushToast(`That save is from another version of the game and can't be loaded: ${describe(r)}.`, "warn");
        return;
      }
      loadSave(r);
      jev.restore(r.player.aim, r.player.doctrines);
      update({ menu: r.player.menu, hide: r.player.hide, cull: r.player.cull });
      pushToast(`Back where you were: ${describe(r)}.`, "good");
    },
    [loadSave, jev, update],
  );
  // A new queen has flown (ja-lo8.9): the game is paused for her. The pen opens if the fungus is in her, her mother's
  // queen was reached and Jev can read new words; else she founds on her mother's doctrine at once, and a notice says why.
  const flight: Flight | null = stats && stats.flights > 0 ? (game.flights[0] ?? null) : null;
  // `devPen` (dev builds only, set by the dev hook's fly(): the Playwright guard) opens the pen without Jev.
  const [devPen, setDevPen] = useState(false);
  const gate = flight ? penGate(flight, game.revealed, devPen ? null : jev.lock, colonyName(flight.mother)) : null;
  const settle = useCallback(
    (f: Flight, k: number) => {
      // Lost: the game says why (Game.lastLoss; one world's founding rule, docs/one-world.md §3).
      const why = k < 0 && game.lastLoss?.flight === f ? game.lastLoss.reason : null;
      if (k < 0)
        pushToast(
          game.colonies.length >= MAX_COLONIES
            ? `A new queen from ${colonyName(f.mother)} flew, but the map already holds ${MAX_COLONIES} colonies: she was lost.`
            : why
              ? `A new queen from ${colonyName(f.mother)} was lost: ${why}.`
              : `A new queen from ${colonyName(f.mother)} found no room to land, and was lost.`,
          "warn",
        );
      if (!game.flights.length) {
        update({ playing: true });
        setDevPen(false); // the dev hook's pen was for that flight only
      }
    },
    [game, update],
  );
  useEffect(() => {
    if (!flight || !gate || gate.open) return;
    const k = game.found(flight);
    if (k >= 0) {
      jev.foundWith(k, jev.doctrines[flight.mother] ?? jev.doctrines[0]!);
      pushToast(`${gate.reason} Her colony is ${colonyName(k)}.`, "info");
    }
    settle(flight, k);
  }, [flight, gate, game, jev, settle]);
  /** Found flight f's colony at `at` on the player's words `d` (the queen's pen). */
  const foundOn = useCallback(
    (f: Flight, d: DoctrineChoice, at: { x: number; y: number } | null) => {
      const k = game.found(f, at);
      if (k >= 0) {
        jev.foundWith(k, d);
        pushToast(`${colonyName(k)} is founded, on your words.`, "good");
      }
      settle(f, k);
    },
    [game, jev, settle],
  );
  const foundHers = useCallback(
    (d: DoctrineChoice, at: Landing) => {
      if (flight) foundOn(flight, d, game.landingAt(flight.mother, at.side, at.distance) ?? game.landing(flight.mother));
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
  // Dev builds only: the game and the page's views on window, for the Playwright guard (scripts/e2e-one-world.mjs); not
  // in the Pages build. follow(k, i) follows an ant; view() and camera(view) read where each view looks; fly(mother)
  // sends a new queen from that colony with the fungus in her and opens her pen, Jev or not. With the game paused,
  // nextCrossing(maxSeconds, minTicks) rehearses on a copy which curtain ant comes up next, and on which fixed step (rehearse.ts),
  // and step(n) takes the game itself n of those steps: the guard follows that ant through its hole for certain.
  // Keyless only: the copy shares the game's policies, so with JEV_API_KEY set a miss in the copy would ask Jev (a run, real
  // spend, skewed hit counts). npm run e2e starts Vite without the key (PR #65 review N6).
  useEffect(() => {
    if (!(import.meta as { env?: { DEV?: boolean } }).env?.DEV) return;
    (window as unknown as { jevAnts?: unknown }).jevAnts = {
      game,
      follow: (k: number, i: number) => {
        const c = game.colonies[k];
        if (!c || !c.alive[i]) return false;
        setFollowed({ k, i, gen: c.gen[i] });
        return true;
      },
      view: () => controls.view,
      followed: () => followedNow.current,
      sensed: (v: View, x: number, y: number) => {
        cellOf(x, y);
        return sensed.sight(v === "above" ? PLANE : CURTAIN, CELL[0], CELL[1]);
      },
      nextCrossing: (maxSeconds = 20, minTicks = 1) => nextCrossing(game, buildGame(settings), maxSeconds, minTicks),
      step: (n = 1) => {
        for (let t = 0; t < n; t++) game.tick(REHEARSE_DT);
      },
      camera: (v: View) => field.current?.camera(v === "above" ? PLANE : CURTAIN) ?? null,
      fly: (mother = 0) => {
        const m = game.colonies[mother];
        if (!m) return false;
        setDevPen(true);
        game.revealed[mother] = true;
        game.flights.push({
          mother,
          x: m.nest.x,
          y: m.nest.y,
          load: 1,
          strain: game.fungus.evolution?.strain ?? 0,
          at: game.time,
          food: FOUNDING_RESERVE,
        });
        return true;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, controls.view, setFollowed, sensed]);
  const retune = stats ? stats.situationsSeen * TOKENS_PER_SITUATION : 0;
  // The page (PRD §69, ja-mvo9.1): the map fills the screen; a HUD over its top; a rail of drawers at its left (a tab bar
  // on a phone); the followed ant in an inspector at its right (a sheet on a phone).
  const detailsProps: DetailsProps = {
    open: details,
    onClose: closeDetails,
    game,
    controls,
    update,
    stats,
    fps,
    restart,
    newWorld,
    jev,
    journal,
    saves: games,
    onLoad: (r) => (continueFrom(r), closeDetails(), setDrawer(null)),
  };
  const ev = stats?.evolution;
  const affordable = ev
    ? UPGRADES.some((u) => !idle(u, controls.menu) && (u.costs[ev.levels[u.id] ?? 0] ?? Infinity) <= ev.mutations)
    : false;
  const penCard = flight && gate?.open && oneWorld && circle;
  // The machine can't step the sim at the speed asked: the HUD says how fast it really runs.
  const slow = !!stats && controls.playing && stats.pace > 0 && stats.pace < controls.speed * 0.85;
  return (
    <main className="fixed inset-0 overflow-hidden bg-ground text-fg">
      <div className="absolute inset-0">
        <ColonyField
          colonies={game.colonies}
          fungus={game.fungus}
          sensed={sensed}
          onFrame={onFrame}
          showFoodTrail={controls.showFoodTrail}
          showHomeTrail={controls.showHomeTrail}
          followed={followed}
          onFollow={setFollowed}
          onChamber={(k, id) => openLearn({ tab: "nest", id: `chamber-${k}-${id}` })}
          world={oneWorld}
          view={controls.view === "above" ? PLANE : CURTAIN}
          onLink={onLink}
          onCross={onCross}
          api={field}
          pen={pen}
          toolsAt="top-[7.25rem] left-1/2 -translate-x-1/2 items-center sm:top-[4.5rem]"
        />
      </div>

      {/* The HUD: time and the goal, over the map's top edge. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-stretch gap-2">
        <div className={`pointer-events-auto flex items-center gap-1 px-1.5 py-1 ${FLOAT}`} aria-label="game bar">
          <span className="hidden items-center gap-1.5 pr-2 pl-1.5 text-[15px] font-semibold tracking-tight md:flex">
            <Icon name="fungus" className="size-5 text-spore" />
            Jev Ants
          </span>
          <IconButton
            icon={controls.playing ? "pause" : "play"}
            label={controls.playing ? "Pause" : "Play"}
            onClick={() => update({ playing: !controls.playing })}
          />
          <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="speed">
            {SPEEDS.map((v) => (
              <button
                key={v}
                type="button"
                className={`${seg(controls.speed === v)} max-sm:px-2.5 max-sm:text-[13px]`}
                onClick={() => update({ speed: v })}
                aria-pressed={controls.speed === v}
              >
                {v}×
              </button>
            ))}
          </div>
          {oneWorld && (
            <div className="ml-1 flex overflow-hidden rounded-md border border-line" role="group" aria-label="view">
              {(["above", "below"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`${seg(controls.view === v)} max-sm:px-2.5 max-sm:text-[13px]`}
                  onClick={() => setView(v)}
                  aria-pressed={controls.view === v}
                  title={
                    v === "above"
                      ? "The surface from above: foraging, trails, the mound and the line through the holes (v)"
                      : "Underground: the curtain under the line, unrolled, with every nest (v)"
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <span className="px-2 font-mono text-[13px] text-fg-2 tabular-nums max-sm:hidden" title="sim time">
            {clock(stats?.time ?? 0)}
          </span>
          {/* A species with a day (the desert ant, ja-rf5.8): the sun as its ants see it, and the ground's heat now. */}
          {game.player.params.heatDay > 0 && (
            <span
              className="flex items-center gap-1 px-2 font-mono text-[13px] text-fg-2 tabular-nums max-sm:hidden"
              aria-label="sun"
              title="The sun as the desert ants see it (out under a high sun, in when it is low or down), and the ground's heat"
            >
              sun {sunSeen(game.player.params, stats?.time ?? 0)} · {groundHeat(game.player.params, stats?.time ?? 0).toFixed(0)} °C
              <Help to={{ tab: "guide", id: "desert-ant" }} label="the desert ant" />
            </span>
          )}
          {slow && stats && (
            <span
              className="mr-1 rounded-md bg-warn-soft px-2 py-0.5 text-xs text-warn max-sm:hidden"
              title="This machine can't step the sim that fast: it runs as fast as it can"
            >
              running at {stats.pace.toFixed(1)}×
            </span>
          )}
        </div>
        <div
          className={`pointer-events-auto flex min-w-0 basis-full items-center px-3 py-2 text-[13px] text-fg-2 sm:flex-1 sm:basis-0 ${FLOAT}`}
          aria-label="goal"
        >
          <span className="mr-2 font-mono text-fg-3 tabular-nums sm:hidden" title="sim time">
            {clock(stats?.time ?? 0)}
          </span>
          {slow && (
            <span className="mr-2 shrink-0 rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn sm:hidden">
              {stats!.pace.toFixed(1)}×
            </span>
          )}
          <span className="truncate">{goalLine(stats)}</span>
        </div>
      </div>

      {/* The rail: each drawer, Learn, Settings. A tab bar along the bottom on a phone. */}
      <nav
        aria-label="panels"
        className={`pointer-events-auto absolute inset-x-2 bottom-2 z-10 flex justify-around p-1 sm:inset-x-auto sm:top-[4.5rem] sm:bottom-auto sm:left-3 sm:flex-col sm:gap-1 ${FLOAT}`}
      >
        <IconButton icon="fungus" label="The fungus" active={drawer === "fungus"} onClick={() => toggle("fungus")} />
        <IconButton
          icon="evolve"
          label="Mutations"
          active={drawer === "evolve"}
          badge={affordable ? "!" : undefined}
          badgeLabel="mutations to keep"
          onClick={() => toggle("evolve")}
        />
        <IconButton icon="colonies" label="Colonies" active={drawer === "colonies"} onClick={() => toggle("colonies")} />
        <IconButton icon="saves" label="Saved games" active={drawer === "saves"} onClick={() => toggle("saves")} />
        <IconButton icon="learn" label="Learn" onClick={() => openLearn({ tab: "guide" })} />
        <IconButton
          icon="settings"
          label="Settings"
          active={drawer === "settings"}
          badge={backend?.needsPass ? "!" : undefined}
          badgeLabel="Jev needs the passphrase"
          onClick={() => toggle("settings")}
        />
      </nav>

      {drawer === "fungus" && (
        <Drawer label="the fungus" title="The fungus" onClose={closeDrawer}>
          <FungusStatus stats={stats} />
          <Aim jev={jev} />
        </Drawer>
      )}
      {drawer === "evolve" && (
        <Drawer label="mutations" title="Body and mutations" onClose={closeDrawer}>
          {ev ? <Evolve e={ev} evolve={evolve} menu={controls.menu} /> : <p className="text-fg-3">The fungus has not landed yet.</p>}
        </Drawer>
      )}
      {drawer === "colonies" && (
        <Drawer label="colonies" title="Colonies" onClose={closeDrawer}>
          <BareCards>
            <Colonies {...detailsProps} />
          </BareCards>
        </Drawer>
      )}
      {drawer === "saves" && (
        <Drawer label="saves" title="Saved games" onClose={closeDrawer}>
          <BareCards>
            <SavedGames {...detailsProps} />
          </BareCards>
        </Drawer>
      )}
      {drawer === "settings" && (
        <Drawer label="settings" title="Settings" onClose={closeDrawer}>
          <Settings
            controls={controls}
            update={update}
            openLab={() => (setDrawer(null), setDetails(true))}
            pass={backend?.needsPass ? <PassNote onSaved={recheckBackend} wrong={passphrase() !== null} /> : null}
          />
        </Drawer>
      )}

      {/* The inspector: the queen's pen while she flies, else the followed ant. A sheet on a phone; below 1024 px it waits
          while a drawer is open, so the two never overlap. */}
      {(penCard || followed) && (
        <div
          className={`pointer-events-auto absolute inset-x-2 bottom-16 z-10 max-h-[55dvh] overflow-y-auto rounded-lg shadow-lg sm:inset-x-auto sm:top-[4.5rem] sm:right-3 sm:bottom-auto sm:max-h-[calc(100dvh-6rem)] sm:w-[26rem] ${drawer ? "max-lg:hidden" : ""}`}
        >
          {penCard ? (
            <QueenPen
              key={flight.at}
              flight={flight}
              mother={colonyName(flight.mother)}
              daughter={colonyName(game.colonies.length)}
              doctrine={jev.doctrines[flight.mother] ?? jev.doctrines[0]!}
              onFound={foundHers}
              place={{ radius: circle.r, onWords, onFly }}
            />
          ) : followed ? (
            <AntCard
              followed={followed}
              colonies={game.colonies}
              fungus={game.fungus}
              explain={jev.explain}
              explainFungus={jev.explainFungus}
              onClose={() => setFollowed(null)}
              fields={game.params.species.lanes.mode?.schema?.fields.map((f) => String(f.name))}
            />
          ) : null}
        </div>
      )}

      {tut.tutorial && tut.card && (
        <TutorialCard
          step={tut.tutorial.step}
          card={tut.card}
          fast={tut.tutorial.fast}
          onNext={tut.next}
          onFaster={tut.faster}
          onSkip={tut.skip}
          high={drawer !== null}
        />
      )}

      <LearnDrawer
        colonies={game.colonies}
        followed={followed}
        doctrines={jev.doctrines}
        aim={jev.aim}
        setAim={jev.setAim}
        draftAim={jev.draftAim}
        lock={jev.lock}
        game={game}
        fungusAnswers={jev.fungusAnswers}
        menu={controls.menu}
        setMenu={(menu) => update({ menu })}
        hide={controls.hide}
        cull={controls.cull}
        setRule={(r) => update(r)}
        retune={`A new doctrine re-asks the situations a colony meets: about ${stats ? stats.situationsSeen : "—"} so far, ≈ ${retune.toLocaleString()} tokens ≈ ${usd(retune * USD_PER_INPUT_TOKEN)}.`}
        demo={isDemo(backend)}
      />
      <DetailsScreen {...detailsProps} />
      <Toasts />
      {/* The pen over the field, were her mother to have no hole: she lands by herself. */}
      {flight && gate?.open && !circle && (
        <QueenPen
          key={flight.at}
          flight={flight}
          mother={colonyName(flight.mother)}
          daughter={colonyName(game.colonies.length)}
          doctrine={jev.doctrines[flight.mother] ?? jev.doctrines[0]!}
          onFound={foundHers}
        />
      )}
      {!controls.started && (
        <StartScreen
          seed={controls.seed}
          onStart={onStart}
          firstGame={firstGame()}
          colonies={game.colonies.length}
          latest={newestReadable(games.list)}
          onContinue={continueFrom}
        />
      )}
    </main>
  );
}

/** Settings: what the field draws, the fine speed, the links out, and the way into the lab and the numbers (PRD §69). */
function Settings({
  controls,
  update,
  openLab,
  pass,
}: {
  controls: { showFoodTrail: boolean; showHomeTrail: boolean; speed: number };
  update: (patch: { showFoodTrail?: boolean; showHomeTrail?: boolean; speed?: number }) => void;
  openLab: () => void;
  /** the hosted page's passphrase note, while Jev wants one (the Settings tab carries a badge till then) */
  pass: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      {pass && (
        <div>
          <SectionHead>Jev</SectionHead>
          <div className="mt-2">{pass}</div>
        </div>
      )}
      <div>
        <SectionHead>Trails drawn</SectionHead>
        <div className="mt-2 flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="trails drawn">
          <button
            type="button"
            className={`flex-1 ${seg(controls.showFoodTrail)}`}
            aria-pressed={controls.showFoodTrail}
            onClick={() => update({ showFoodTrail: !controls.showFoodTrail })}
            title="Laid by ants carrying food home: it leads to food"
          >
            to food
          </button>
          <button
            type="button"
            className={`flex-1 ${seg(controls.showHomeTrail)}`}
            aria-pressed={controls.showHomeTrail}
            onClick={() => update({ showHomeTrail: !controls.showHomeTrail })}
            title="Laid by ants walking out: it leads home"
          >
            to home
          </button>
        </div>
        <p className="mt-1.5 text-xs text-fg-3">Only where your hosts have smelled them lately.</p>
      </div>
      <div>
        <SectionHead>Deeper</SectionHead>
        <Button className="mt-2 w-full" onClick={openLab}>
          Lab and numbers
        </Button>
        <p className="mt-1.5 text-xs text-fg-3">
          The colonies&apos; full numbers, Jev&apos;s spend, the world&apos;s seed and size, the lever menu and the lab&apos;s foundings.
        </p>
      </div>
      <a
        href={REPO}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-accent underline-offset-2 hover:underline"
      >
        The source and the research notes, on GitHub <Icon name="external" className="size-3.5" />
      </a>
    </div>
  );
}

/** Where the fungus is, and how far the colonies have come together. */
function FungusStatus({ stats }: { stats: ColonyStats | null }) {
  if (!stats) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="infection">
      <SectionHead>
        In the colonies <Help to={{ tab: "guide", id: "fungus" }} label="the fungus" />
      </SectionHead>
      {stats.sides.map((s, k) => (
        <div key={k}>
          <div className="flex items-baseline justify-between text-xs">
            <span className={colonyTone(k)}>in the {colonyName(k)} colony</span>
            <span className="font-mono text-spore tabular-nums">{Math.round(100 * s.infected)}%</span>
          </div>
          <Bar value={s.infected} thin />
          {s.queen !== null && (
            <p className="mt-0.5 text-[11px] text-fg-3">
              {s.queen === "lost" ? (
                "its queen is dead"
              ) : s.queenLoad >= 0.05 ? (
                <span className="text-spore">in its queen: {Math.round(100 * s.queenLoad)}%</span>
              ) : (
                "its queen is clean"
              )}
            </p>
          )}
        </div>
      ))}
      {stats.sides.length > 1 && (
        <div aria-label="unity">
          <div className="flex items-baseline justify-between text-xs">
            <span className="flex items-center gap-1.5">
              one colony <Help to={{ tab: "guide", id: "unity" }} label="one colony" />
            </span>
            <span className="font-mono text-fg tabular-nums">{Math.round(100 * stats.unity.score)}%</span>
          </div>
          <Bar value={stats.unity.score} thin />
          {stats.unity.alike && stats.unity.met < MET && (
            <p className="mt-1 text-xs text-fg-3">The nests smell alike, but the colonies have not met yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** The fungus's aim: the player's words, which Jev reads to decide what the fungus does in each host. */
function Aim({ jev }: { jev: ReturnType<typeof useColonyJev> }) {
  const locked = jev.lock !== null;
  return (
    <div className="mt-5" aria-label="fungus aim">
      <div className="flex items-center justify-between">
        <SectionHead>
          Aim <Help to={{ tab: "policy", id: "fungus" }} label="how the fungus decides" />
        </SectionHead>
        <div className="flex overflow-hidden rounded-md border border-line text-sm">
          {AIMS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={seg(jev.aim.id === a.id)}
              disabled={locked}
              onClick={() => jev.setAim({ id: a.id, text: a.text })}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="mt-2 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-accent disabled:opacity-60"
        rows={4}
        value={jev.aim.text}
        disabled={locked}
        onChange={(e) => jev.draftAim({ id: "custom", text: e.target.value })}
        onBlur={(e) => jev.setAim({ id: jev.aim.id, text: e.target.value })}
        aria-label="aim"
      />
      {locked ? (
        <p className="mt-1 text-xs text-warn">{jev.lock}</p>
      ) : (
        <p className="mt-1 text-xs text-fg-3">
          What the fungus wants, in your words. Jev reads it and decides what the fungus does inside each ant it lives in: what that ant
          perceives, and what it gives off. ≈ {TOKENS_PER_FUNGAL_SITUATION} tokens per situation asked.
        </p>
      )}
    </div>
  );
}

/** Sim time as m:ss (h:mm:ss past an hour). */
/**
 * The fungus's body and its mutations (ja-lo8.12): its mycelium and the fungus in its hosts, mutations to keep and how
 * fast they come, and each upgrade's next level. Spread upgrades are the fungus's body; reach upgrades how far its
 * levers may go.
 */
/** A lethal upgrade whose levers are all off the menu: keeping it would free nothing until the player turns one on (ja-lo8.16). */
function idle(u: Upgrade, menu: readonly string[]): boolean {
  return !!u.levers?.every((id) => LETHAL_LEVERS.has(id) && !menu.includes(id));
}

function Evolve({ e, evolve, menu }: { e: EvolutionStats; evolve: (id: string) => boolean; menu: readonly string[] }) {
  return (
    <div className="mt-4" aria-label="evolution">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5">
          Body <Help to={{ tab: "guide", id: "evolution" }} label="the fungus's body and mutations" />
        </span>
        <Tip tip={BODY_TIP} className="font-mono text-fg-2 tabular-nums">
          mycelium {e.mass.toFixed(0)} · in ants {e.inHosts.toFixed(0)}
        </Tip>
      </div>
      <div className="mt-2 flex items-baseline justify-between text-xs">
        <Tip tip={MUTATION_TIP}>Mutations</Tip>
        <span className="font-mono tabular-nums">
          <span className={e.mutations > 0 ? "text-spore" : "text-fg-3"}>{e.mutations.toLocaleString()}</span>
          <span className="text-fg-3"> · +{e.perMinute < 10 ? e.perMinute.toFixed(1) : Math.round(e.perMinute).toLocaleString()}/min</span>
        </span>
      </div>
      <p className="mt-1 text-[11px] text-fg-3">
        Every bit of new fungus can mutate, so the faster it grows the faster mutations come. You choose which to keep; each level asks
        more.
      </p>
      <ul className="mt-2 flex flex-col gap-1" aria-label="upgrades">
        {UPGRADES.map((u) => {
          const level = e.levels[u.id] ?? 0;
          const cost = u.costs[level];
          const next = u.steps[level + 1];
          return (
            <li key={u.id} className="flex items-center justify-between gap-2 text-xs">
              <Tip tip={<UpgradeBody u={u} level={level} />} className="min-w-0 truncate">
                <span
                  className={
                    u.kind === "spread" ? "text-spore" : u.levers?.every((id) => LETHAL_LEVERS.has(id)) ? "text-err" : "text-accent"
                  }
                >
                  {u.name}
                </span>{" "}
                <span className="text-fg-3">{u.steps[level]}</span>
                {idle(u, menu) && <span className="text-fg-3"> (not on the menu)</span>}
              </Tip>
              {cost === undefined ? (
                <span className="shrink-0 text-fg-3">at its most</span>
              ) : (
                <Tip tip={<NextBody u={u} level={level} />} className="shrink-0" dotted={false} tapToOpen={false} tabStop={false}>
                  <button
                    type="button"
                    className="rounded-md border border-line px-2 py-0.5 text-fg hover:bg-raised disabled:pointer-events-none disabled:opacity-40"
                    disabled={cost > e.mutations}
                    onClick={() => evolve(u.id)}
                  >
                    {next} · {cost.toLocaleString()}
                  </button>
                </Tip>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function clock(t: number): string {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The top bar's one line: where the game stands. Goals proper come with the game's chapters (ja-lo8.5). */
function goalLine(stats: ColonyStats | null): string {
  if (!stats) return "";
  if (stats.outcome === "fallen") return `The ${colonyName(stats.fallen)} colony is gone: there is no one left to unite it with.`;
  if (stats.outcome === "unified")
    return "One colony: the nests smell alike, their ants have met, and nobody has died fighting for a minute.";
  const c = stats.chapter;
  return `${c.step < 7 ? `${c.step}. ` : ""}${c.goal}${c.progress > 0 && c.progress < 1 ? ` (${Math.round(100 * c.progress)}%)` : ""}`;
}

/** Notices for what changed: the game's outcome, and Jev's state where it locks the policies. */
function useNotices(stats: ColonyStats | null, lock: string | null, phase: string, menu: readonly string[]): void {
  const outcome = stats?.outcome ?? "playing";
  const seenOutcome = useRef(outcome);
  useEffect(() => {
    if (outcome === seenOutcome.current) return;
    seenOutcome.current = outcome;
    if (outcome !== "playing") pushToast(goalLine(stats), outcome === "unified" ? "good" : "warn");
  }, [outcome, stats]);
  // A new chapter is worth a notice.
  const chapter = stats?.chapter.chapter;
  const seenChapter = useRef(chapter);
  useEffect(() => {
    if (chapter === seenChapter.current) return;
    const first = seenChapter.current === undefined;
    seenChapter.current = chapter;
    if (!first && stats && chapter !== "land") pushToast(goalLine(stats), "good");
  }, [chapter, stats]);
  // A mutation it can keep is worth a notice, once each time there was none it could afford (ja-lo8.12).
  // Only upgrades the panel shows, and that would do something now (a lethal lever off the menu would not).
  const affordable = stats?.evolution
    ? UPGRADES.some((u) => !idle(u, menu) && (u.costs[stats.evolution!.levels[u.id] ?? 0] ?? Infinity) <= stats.evolution!.mutations)
    : false;
  const couldAfford = useRef(affordable);
  useEffect(() => {
    if (affordable && !couldAfford.current)
      pushToast("The fungus has mutations to keep: choose where they go, in the Mutations drawer.", "good");
    couldAfford.current = affordable;
  }, [affordable]);
  // Losing Jev mid-game (the cap, a stop) is worth a notice; the lock at page load is in the panel already.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (phase === "running") wasRunning.current = true;
    else if (wasRunning.current && lock) {
      wasRunning.current = false;
      pushToast(lock, "warn");
    }
  }, [phase, lock]);
}

/** What the page knows of saved games, and how to save one now. */
export interface Saves {
  list: SaveRecord[];
  save: (slot: number) => Promise<void>;
}

/**
 * Saved games (ja-lo8.6): the list (newest first), saving to a slot, and the autosave: every AUTOSAVE_MS while a game
 * is under way, and when the tab is hidden (the player may not come back to this tab).
 */
function useSaves(game: Game, settings: GameSettings, player: PlayerState, stats: ColonyStats | null, started: boolean): Saves {
  const store = useMemo(() => browserSaves(), []);
  const [list, setList] = useState<SaveRecord[]>([]);
  const refresh = useCallback(
    () =>
      void store
        .list()
        .then(setList)
        .catch(() => setList([])),
    [store],
  );
  useEffect(refresh, [refresh]);
  // The latest of everything, for the timer and the hidden-tab handler (they outlive renders).
  const now = useRef({ game, settings, player, stats, started });
  useEffect(() => {
    now.current = { game, settings, player, stats, started };
  });
  const save = useCallback(
    async (slot: number) => {
      const n = now.current;
      if (!n.started) return;
      try {
        await store.put(record(slot, n.settings, n.player, n.game.save(), n.stats?.chapter.goal ?? ""));
        refresh();
      } catch (e) {
        pushToast(`Couldn't save: ${String(e)}`, "warn");
      }
    },
    [store, refresh],
  );
  useEffect(() => {
    if (!started) return;
    const timer = setInterval(() => void save(AUTOSAVE), AUTOSAVE_MS);
    const hidden = () => document.visibilityState === "hidden" && void save(AUTOSAVE);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [started, save]);
  return { list, save };
}
