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
  INFECTED,
  Builder,
  type BuildEvent,
} from "./colony/index.ts";
import BuilderTray, { ToolDemo } from "./ui/BuilderTray.tsx";
import { markSeen, seenTools, trayItems, type TrayItem, type TrayTool } from "./ui/build.ts";
import { play, say, setSoundOn, soundOn } from "./ui/sounds.ts";
import { sunChip } from "./ui/sun.ts";
import { USD_PER_INPUT_TOKEN } from "../shared/jev.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import AntCard from "./ui/AntCard.tsx";
import ColonyField, { type FieldApi, type FieldBuild, type FieldPen } from "./ui/ColonyField.tsx";
import { BareCards, Colonies, SavedGames, type LabProps } from "./ui/LabCards.tsx";
import LabBench from "./ui/LabBench.tsx";
import { History, sampleOf } from "./ui/history.ts";
import { Button, Drawer, FLOAT, Icon, IconButton, SectionHead } from "./ui/kit.tsx";
import type { Followed } from "./ui/follow.ts";
import { Bar } from "./ui/widgets.tsx";
import { seg } from "./ui/styles.ts";
import { buildGame, MAX_SPEED, useColony, type ColonyStats, type EvolutionStats, type View } from "./ui/useColony.ts";
import StartScreen from "./ui/StartScreen.tsx";
import TutorialCard from "./ui/Tutorial.tsx";
import AimBar from "./ui/AimBar.tsx";
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
import { GUIDE, guideFor, REPO } from "./ui/guide.ts";
import { MOD_K, pageKey } from "./ui/keys.ts";
import LensLayer from "./ui/LensLayer.tsx";
import { clock } from "./ui/clock.ts";
import Specimens from "./ui/Specimens.tsx";
import { living, pin, sameAnt, type Specimen, specimenLabel, unpin } from "./ui/specimens.ts";
import { useCodex, useCodexWatch } from "./ui/useCodex.ts";
import { clearProbe, offerProbe } from "./ui/lensStore.ts";
import Palette, { type Runnable } from "./ui/Palette.tsx";
import Shortcuts from "./ui/Shortcuts.tsx";
import { openLearn } from "./ui/learn.ts";
import Toasts from "./ui/Toasts.tsx";
import Notices from "./ui/Notices.tsx";
import { pushToast } from "./ui/toasts.ts";
import { AntTraces } from "./ui/trace.ts";
import QueenPen, { type Landing } from "./ui/QueenPen.tsx";
import { flightCircle, penGate, penGround, penSettle, withinFlight } from "./ui/pen.ts";
import type { DoctrineChoice } from "./ui/useColonyJev.ts";
import { nextCrossing, REHEARSE_DT } from "./ui/rehearse.ts";

// The game's main screen (ja-lo8.2; laid out by PRD §69): the map fills the screen; a HUD over its top (play, speed, view,
// clock, the goal); a rail of drawers at its left (the fungus and its aim, mutations, the colonies, saves, the Codex,
// settings; a tab bar on a phone); the followed ant or the queen's pen in an inspector at its right. The fungus is the
// player: you shape its policy in words (its aim); Jev reads them and decides what the fungus does in each host it
// lives in. Each colony's doctrine is its nature, out of the player's reach (docs/new-queens.md). The lab and the full
// numbers are Lab mode's (the key l, the palette, Settings): a workbench under the map (PRD §69.7).

const usd = (v: number) => `$${v.toFixed(4)}`;

/** The drawers the rail opens. */
type DrawerId = "fungus" | "evolve" | "colonies" | "saves" | "settings";

/** The speeds the HUD offers (4× is the game's default; PRD §50); the Lab's World tab has the slider for the rest. */
const SPEEDS = [1, 2, 4, MAX_SPEED] as const;

/** A dialog that has the page: the game's keys wait while one is open (the palette's key still works). */
const BLOCKING = ['[aria-modal="true"]', ...["Codex", "Start", "The queen's pen"].map((l) => `[role="dialog"][aria-label="${l}"]`)].join(
  ", ",
);

export default function ColonyApp() {
  const { game, controls, update, stats, fps, onFrame, restart, newWorld, start, loadSave, settings, evolve, journal, step } = useColony();
  const backend = useBackend();
  const jev = useColonyJev(game.colonies, game.fungus, backend, journal, game.params.species);
  // Lab mode (PRD §69.7): the map shares the screen with a workbench of the game's numbers, levers, history and steps.
  const [lab, setLab] = useState(false);
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
  // Specimens (PRD §69.5): up to three pinned ants, compared in the inspector; like the follow, they belong to their game.
  const [pinned, setPinned] = useState<{ token: object; list: Specimen[] }>({ token: gameToken, list: [] });
  const specimens = useMemo(() => (pinned.token === gameToken ? pinned.list : []), [pinned, gameToken]);
  const setSpecimens = useCallback((list: Specimen[]) => setPinned({ token: gameToken, list }), [gameToken]);
  // The dev hook reads the follow as it is now (the e2e's carried-follow check), not as it was when the hook was set.
  const followedNow = useRef<Followed | null>(followed);
  useEffect(() => {
    followedNow.current = followed;
  }, [followed]);
  useNotices(stats, jev.lock, jev.state.phase, controls.menu);
  // The Lab's history (PRD §69.7): the game sampled once a game second from its start, whether or not the Lab is open.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a fresh history for each game: `game` is the key, not an input
  const history = useMemo(() => new History(), [game]);
  useEffect(
    () =>
      onFrame(() =>
        history.offer(game.time, () =>
          sampleOf(game.time, game.colonies, game.fungus, game.unity().gap, Math.floor(game.fungus.evolution?.mutations ?? 0)),
        ),
      ),
    [onFrame, game, history],
  );
  // The Codex (PRD §69.4): guide entries open as the game first shows what they are about; the rail's Codex says how many are new.
  useCodexWatch(game, onFrame, stats);
  const codex = useCodex();
  // One world's two views (docs/one-world.md §5): a camera switch, the key `v` too (the page's key handler, below).
  const oneWorld = game.world;
  const setView = useCallback((view: View) => update({ view }), [update]);
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
  // The species' own guide entry, if it has one (the HUD's sun chip links to it).
  const ownEntry = GUIDE.find((e) => e.species === game.params.species.id)?.id;
  const pointsAt = tut.card?.highlight;
  // The builder (docs/builder.md, PRD §73, ja-kjj8): a child's tools over the world, on or off at any point in a game. Its
  // builds go into the game itself, so a save keeps them; its undo is this page's, per game.
  const builder = useMemo(() => new Builder(game), [game]);
  /** each moved ant's way home, drawn on the top view (ja-cwjp) */
  const traces = useMemo(() => new AntTraces(builder), [builder]);
  const [building, setBuilding] = useState(false);
  const [toolKey, setToolKey] = useState<string>("move");
  const [little, setLittle] = useState(false);
  const [smell, setSmell] = useState(true);
  const [demo, setDemo] = useState<{ tool: TrayTool; at: number } | null>(null);
  const [, setBuilt] = useState(0);
  const lastSound = useRef(0);
  // Colonies founded mid-game join the same array (Game.addColony): its length is what changes.
  const colonyCount = game.colonies.length;
  const trails = game.player.ph.has("food");
  const tray = useMemo(
    () =>
      trayItems(
        little,
        Array.from({ length: colonyCount }, (_, k) => colonyName(k)),
        trails,
      ),
    [little, colonyCount, trails],
  );
  const picked: TrayItem = tray.find((it) => it.key === toolKey) ?? tray[0]!;
  const pickTool = useCallback((it: TrayItem) => {
    setToolKey(it.key);
    play(it.tool);
    say(it.label);
    if (!seenTools().has(it.tool)) {
      markSeen(it.tool);
      setDemo({ tool: it.tool, at: Date.now() });
    }
  }, []);
  useEffect(() => {
    if (!demo) return;
    const t = setTimeout(() => setDemo(null), 1700);
    return () => clearTimeout(t);
  }, [demo]);
  const toggleBuilding = useCallback(() => {
    setBuilding((on) => {
      play(on ? "off" : "on");
      if (!on) {
        // Zoomed out, a finger's stroke spans hundreds of cells: the builder opens close in (LINK_ZOOM's ≥ 8 px a cell),
        // on the colony the fungus landed by, unless the view is close already.
        const v = controls.view === "above" ? PLANE : CURTAIN;
        const cam = field.current?.camera(v);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (!cam || cam.zoom < 6 * dpr) {
          const nest = game.colonies[game.landed?.colony ?? 0]?.layers[v]?.nest ?? game.colonies[0]?.nest;
          if (nest) field.current?.centreOn(v, nest.x, nest.y, { close: true });
        }
      }
      return !on;
    });
    setDrawer(null);
  }, [controls.view, game]);
  const undoBuild = useCallback(() => {
    if (builder.undo()) {
      play("undo");
      setBuilt((n) => n + 1);
    }
  }, [builder]);
  const build: FieldBuild | null = useMemo(
    () =>
      building
        ? {
            tool: picked.tool === "move" ? null : picked.tool,
            smell: smell && !little,
            onTweeze: (k, i, x, y, first) => {
              // The first touch only lifts it (it stays where it is); each move after carries it on, as one undo.
              if (first) {
                builder.begin();
                play("tweezers");
                return;
              }
              if (builder.moveAnt(k, i, x, y, true)) setBuilt((n) => n + 1);
            },
            onStroke: (layer, points, first) => {
              if (picked.tool === "move" || picked.tool === "tweezers") return;
              if (first) builder.begin();
              const n = builder.apply({ tool: picked.tool, layer, points, colony: picked.colony ?? 0 }, true);
              // A sound for the first touch, and now and then while a drag changes the ground.
              const now = performance.now();
              if (first || (n > 0 && now - lastSound.current > 220)) {
                lastSound.current = now;
                play(picked.tool);
              }
              if (first || n > 0) setBuilt((k) => k + 1);
            },
          }
        : null,
    [building, picked, smell, little, builder],
  );
  // What the ants did with the builds (docs/builder.md "Slice 2"): read once a second, said as notices for the bell.
  // Builds stay in the game after the builder closes, so this runs whether or not it is open.
  useEffect(() => {
    const timer = setInterval(() => {
      for (const e of builder.watch()) pushToast(buildNotice(e), e.kind === "antLost" ? "info" : "good");
    }, 1000);
    return () => clearInterval(timer);
  }, [builder]);
  // Ctrl/⌘+Z undoes a stroke while building; Escape leaves the builder.
  useEffect(() => {
    if (!building) return;
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoBuild();
      } else if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) toggleBuilding();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [building, undoBuild, toggleBuilding]);
  useEffect(() => {
    if (pointsAt === "evolution") setDrawer("evolve");
    // From lg (1024 px) the aim is the bar under the map, outlined where it is; narrower it is in The fungus drawer, opened
    // for it (PRD §69.2; checked by hand at 1280 and 900 in the review of #189).
    else if (pointsAt === "aim" && !window.matchMedia("(min-width: 1024px)").matches) setDrawer("fungus");
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
  // S2b (PRD §69.3): the command palette, the shortcuts sheet and the lens, and the keys that open them.
  const [palette, setPalette] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [lensOn, setLensOn] = useState(false);
  // Where the lens looks lives in a store (ui/lensStore.ts) the map reports to and LensLayer reads: the page doesn't
  // re-render as the pointer moves (review of #196, N3).
  const toggleLens = useCallback(() => {
    setLensOn((on) => !on);
    clearProbe();
  }, []);
  /** Follow ant f, the camera taken to whichever view it is in. */
  const goTo = useCallback(
    (f: Followed) => {
      const c = game.colonies[f.k];
      if (!c) return;
      if (oneWorld) showAt(c.layer[f.i] === CURTAIN ? CURTAIN : PLANE, c.x[f.i]!, c.y[f.i]!);
      setFollowed(f);
    },
    [game, oneWorld, showAt, setFollowed],
  );
  /** Follow the next host of yours (the key f): each press the next infected ant, in whichever view it is. */
  const hostTurn = useRef(0);
  const followHost = useCallback(() => {
    const hosts: Followed[] = [];
    game.colonies.forEach((c, k) => {
      for (let i = 0; i < c.n; i++) if (c.alive[i] && c.load[i]! >= INFECTED) hosts.push({ k, i, gen: c.gen[i]! });
    });
    if (!hosts.length) {
      pushToast("No host yet: the fungus is in no ant.", "info");
      return;
    }
    goTo(hosts[hostTurn.current++ % hosts.length]!);
  }, [game, goTo]);
  /** Pin the followed ant as a specimen, or unpin it; a fourth replaces the oldest, and a notice says so. */
  const togglePin = useCallback(
    (f: Followed) => {
      if (specimens.some((s) => sameAnt(s, f))) return setSpecimens(unpin(specimens, f));
      // The living ones only: one that died within the second the watch waits doesn't count toward the three (review of #218).
      // It is said here: the watch won't see it again.
      const { kept, gone } = living(specimens, game.colonies);
      for (const g of gone)
        pushToast(`${specimenLabel(g.no)}, ant #${g.i} of ${colonyName(g.k)}, has died: it leaves your specimens.`, "info");
      const r = pin(kept, f);
      setSpecimens(r.list);
      if (r.dropped)
        pushToast(
          `Three specimens at most: ${specimenLabel(r.dropped.no)}, ant #${r.dropped.i} of ${colonyName(r.dropped.k)}, is unpinned.`,
          "info",
        );
    },
    [specimens, setSpecimens, game],
  );
  // A specimen that dies leaves the list, with a notice (checked once a second: the rows show nothing once it is gone).
  useEffect(() => {
    if (!specimens.length) return;
    const t = setInterval(() => {
      const { kept, gone } = living(specimens, game.colonies);
      if (!gone.length) return;
      setSpecimens(kept);
      for (const f of gone)
        pushToast(`${specimenLabel(f.no)}, ant #${f.i} of ${colonyName(f.k)}, has died: it leaves your specimens.`, "info");
    }, 1000);
    return () => clearInterval(t);
  }, [specimens, game, setSpecimens]);
  // The page's keys (ui/keys.ts): one handler, one table, which the shortcuts sheet reads.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target instanceof HTMLElement ? e.target : null;
      const a = pageKey(
        {
          key: e.key,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
          alt: e.altKey,
          typing: !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)),
          control: !!t?.closest("button, a[href], summary, [role='button'], [role='option'], [role='tab'], [role='menuitem']"),
        },
        SPEEDS,
      );
      if (!a) return;
      // Over a dialog that has the page (the palette, the sheet, the Codex, the start, the queen's pen) only the
      // palette's key works: the game's keys wait.
      if (a.kind !== "palette" && document.querySelector(BLOCKING)) return;
      e.preventDefault();
      if (a.kind === "palette") {
        setSheet(false);
        setPalette((o) => !o);
      } else if (a.kind === "shortcuts") setSheet(true);
      else if (a.kind === "lens") toggleLens();
      else if (a.kind === "lab") setLab((on) => !on);
      else if (a.kind === "play") update({ playing: !controls.playing });
      else if (a.kind === "speed") update({ speed: a.speed });
      else if (a.kind === "view") {
        if (oneWorld) setView(controls.view === "above" ? "below" : "above");
      } else followHost();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [controls.playing, controls.view, update, oneWorld, setView, followHost, toggleLens]);
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
      notify: (text: string, tone?: "info" | "warn" | "good") => pushToast(text, tone),
      /** each moved ant's way home as drawn (ja-cwjp): its colony and slot, how many points, and how it ended */
      traces: () => traces.traces.map((t) => ({ k: t.colony, i: t.i, points: t.xs.length, end: t.end })),
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
      goNest: (k: number) => field.current?.goNest(k),
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
  }, [game, controls.view, setFollowed, sensed, traces]);
  const retune = stats ? stats.situationsSeen * TOKENS_PER_SITUATION : 0;
  // The page (PRD §69, ja-mvo9.1): the map fills the screen; a HUD over its top; a rail of drawers at its left (a tab bar
  // on a phone); the followed ant in an inspector at its right (a sheet on a phone).
  const labProps: LabProps = {
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
    onLoad: (r) => (continueFrom(r), setDrawer(null)),
  };
  const ev = stats?.evolution;
  const affordable = ev
    ? UPGRADES.some((u) => !idle(u, controls.menu) && (u.costs[ev.levels[u.id] ?? 0] ?? Infinity) <= ev.mutations)
    : false;
  const penCard = flight && gate?.open && oneWorld && circle;
  // The machine can't step the sim at the speed asked: the HUD says how fast it really runs.
  const slow = !!stats && controls.playing && stats.pace > 0 && stats.pace < controls.speed * 0.85;
  const shownLayer = oneWorld ? (controls.view === "above" ? PLANE : CURTAIN) : -1;
  // The palette's commands (ui/commands.ts ranks them): everything the HUD, the rail, the map's menu and the keys do,
  // and every guide entry. Built only while the palette is open (review of #196, N3); running one closes a pinned lens
  // card, which would otherwise stay over what the command opens (N4).
  const paletteCommands = (): Runnable[] =>
    [
      {
        id: "play",
        label: controls.playing ? "Pause" : "Play",
        group: "Game",
        key: "Space",
        words: "pause play stop go",
        run: () => update({ playing: !controls.playing }),
      },
      ...SPEEDS.map((v, j) => ({
        id: `speed-${v}`,
        label: `Speed ${v}×`,
        group: "Game",
        key: String(j + 1),
        words: "fast slow",
        ...(controls.speed === v ? { off: "now" } : {}),
        run: () => update({ speed: v }),
      })),
      ...(oneWorld
        ? (["above", "below"] as const).map((v) => ({
            id: `view-${v}`,
            label: `View ${v}`,
            group: "Game",
            key: "v",
            words: v === "above" ? "surface top" : "underground nest side",
            ...(controls.view === v ? { off: "shown" } : {}),
            run: () => setView(v),
          }))
        : []),
      { id: "host", label: "Follow a host of yours", group: "Game", key: "f", words: "infected ant", run: followHost },
      { id: "whole", label: "Whole map", group: "Map", key: "0", words: "zoom out fit", run: () => field.current?.showAll() },
      ...game.colonies.map((_, k) => ({
        id: `nest-${k}`,
        label: `Go to ${colonyName(k)}'s nest`,
        group: "Map",
        words: "colony hole",
        run: () => field.current?.goNest(k),
      })),
      ...(
        [
          ["fungus", "The fungus", "infection aim"],
          ["evolve", "Mutations", "evolve body upgrades"],
          ["colonies", "Colonies", "numbers"],
          ["saves", "Saved games", "save load continue"],
          ["settings", "Settings", "trails passphrase"],
        ] as const
      ).map(([d, label, words]) => ({ id: `drawer-${d}`, label, group: "Panels", words, run: () => setDrawer(d) })),
      { id: "learn", label: "Codex: the field guide", group: "Panels", words: "help guide learn", run: () => openLearn({ tab: "guide" }) },
      {
        id: "lab",
        label: lab ? "Close the Lab" : "Lab mode: history, world, Jev, levers, steps",
        group: "Panels",
        key: "l",
        words: "details debug seed world jev spend history charts step numbers journal",
        run: () => setLab((on) => !on),
      },
      {
        id: "lens",
        label: lensOn ? "Lens off" : "Lens: say what is under the pointer",
        group: "Help",
        key: "i",
        words: "explain inspect what",
        run: toggleLens,
      },
      { id: "shortcuts", label: "Keyboard shortcuts", group: "Help", key: "?", words: "keys", run: () => setSheet(true) },
      ...guideFor((c) => game.player.ph.has(c), game.params.species.id).map((e) => ({
        id: `learn-${e.id}`,
        label: `Codex: ${e.title}`,
        group: "Codex",
        words: "learn guide",
        run: () => openLearn({ tab: "guide", id: e.id }),
      })),
    ].map((c) => ({ ...c, run: () => (clearProbe(), c.run()) }));
  return (
    <main className="fixed inset-0 overflow-hidden bg-ground text-fg">
      {/* The stage: the map and all over it. In Lab mode it gives the workbench the bottom of the screen (PRD §69.7). */}
      <div className={`absolute inset-x-0 top-0 ${lab ? "bottom-[42dvh]" : "bottom-0"}`}>
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
            specimens={specimens}
            pen={pen}
            lens={lensOn}
            onProbe={offerProbe}
            toolsAt="top-[7.25rem] left-1/2 -translate-x-1/2 items-center sm:top-[4.5rem]"
            build={build}
            traces={traces}
          />
          {demo && <ToolDemo key={demo.at} tool={demo.tool} />}
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
                  className={`${seg(controls.speed === v)} max-sm:px-1.5 max-sm:text-[13px]`}
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
                    className={`${seg(controls.view === v)} max-sm:px-1.5 max-sm:text-[13px]`}
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
            <IconButton icon="lens" label="Lens: say what is under the pointer (i)" active={lensOn} onClick={toggleLens} className="ml-1" />
            <IconButton icon="search" label={`Commands (${MOD_K})`} onClick={() => setPalette(true)} className="max-sm:hidden" />
            <span className="px-2 font-mono text-[13px] text-fg-2 tabular-nums max-sm:hidden" title="sim time">
              {clock(stats?.time ?? 0)}
            </span>
            {/* A species with a day (the desert ant, ja-rf5.8): the sun as its ants see it, and the ground's heat now. */}
            {game.player.params.heatDay > 0 && (
              <>
                <span
                  className="flex items-center gap-1 px-2 font-mono text-[13px] text-fg-2 tabular-nums max-sm:hidden"
                  aria-label="sun"
                  title="The sun as the desert ants see it (out under a high sun, in when it is low or down), and the ground's heat"
                >
                  {sunChip(game.player.params, stats?.time ?? 0)}
                  {/* Only where the species has its own guide entry (review of #194, N2). */}
                  {ownEntry && <Help to={{ tab: "guide", id: ownEntry }} label={game.params.species.name.toLowerCase()} />}
                </span>
                {/* On a phone, short (owner, review of #194 D1). */}
                <span className="px-1.5 font-mono text-[12px] text-fg-2 tabular-nums sm:hidden" aria-label="sun, short">
                  {sunChip(game.player.params, stats?.time ?? 0, true)}
                </span>
              </>
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
          {/* The goal, and the bell at the top right: on a phone they share the second row. */}
          <div className="flex min-w-0 basis-full items-stretch gap-2 sm:flex-1 sm:basis-0">
            <div
              className={`pointer-events-auto flex min-w-0 flex-1 items-center px-3 py-2 text-[13px] text-fg-2 ${FLOAT}`}
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
            <Notices />
          </div>
        </div>

        {/* The rail: each drawer, the Codex, Settings. A tab bar along the bottom on a phone. The builder's tray takes its place. */}
        {building && (
          <BuilderTray
            items={tray}
            picked={picked.key}
            little={little}
            smell={smell}
            canUndo={builder.canUndo}
            odours={game.colonies.map((c) => c.nestOdour)}
            onPick={pickTool}
            onUndo={undoBuild}
            onLittle={() => {
              setLittle((l) => !l);
              setToolKey("move");
            }}
            onSmell={() => setSmell((v) => !v)}
            onExit={toggleBuilding}
          />
        )}
        <nav
          aria-label="panels"
          hidden={building}
          className={`pointer-events-auto absolute inset-x-2 bottom-2 z-10 flex justify-around p-1 sm:inset-x-auto sm:top-[4.5rem] sm:bottom-auto sm:left-3 sm:flex-col sm:gap-1 ${FLOAT}`}
        >
          <IconButton icon="build" label="Builder" onClick={toggleBuilding} />
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
          <IconButton
            icon="learn"
            label="Codex"
            badge={codex.fresh.length || undefined}
            badgeLabel={`${codex.fresh.length} new in the field guide`}
            onClick={() => openLearn({ tab: "guide" })}
          />
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
            {jev.lock && <p className="mt-4 hidden text-xs text-warn lg:block">The aim is locked: {jev.lock}</p>}
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
              <Colonies {...labProps} />
            </BareCards>
          </Drawer>
        )}
        {drawer === "saves" && (
          <Drawer label="saves" title="Saved games" onClose={closeDrawer}>
            <BareCards>
              <SavedGames {...labProps} />
            </BareCards>
          </Drawer>
        )}
        {drawer === "settings" && (
          <Drawer label="settings" title="Settings" onClose={closeDrawer}>
            <Settings
              controls={controls}
              update={update}
              openLab={() => (clearProbe(), setDrawer(null), setLab(true))}
              openShortcuts={() => setSheet(true)}
              pass={backend?.needsPass ? <PassNote onSaved={recheckBackend} wrong={passphrase() !== null} /> : null}
            />
          </Drawer>
        )}

        {/* The inspector: the queen's pen while she flies, else the specimens and the followed ant. A sheet on a phone; below
          1024 px it waits while a drawer is open, so the two never overlap. */}
        {!building && (penCard || followed || specimens.length > 0) && (
          <div
            className={`pointer-events-auto absolute inset-x-2 bottom-16 z-10 max-h-[min(55dvh,calc(100%-9rem))] overflow-y-auto rounded-lg shadow-lg sm:inset-x-auto sm:top-[4.5rem] sm:right-3 sm:bottom-auto sm:max-h-[calc(100%-6rem)] sm:w-[26rem] lg:max-h-[calc(100%-12rem)] ${drawer ? "max-lg:hidden" : ""}`}
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
            ) : followed || specimens.length ? (
              <>
                {specimens.length > 0 && (
                  <Specimens
                    list={specimens}
                    colonies={game.colonies}
                    followed={followed}
                    onFollow={goTo}
                    onUnpin={(f) => setSpecimens(unpin(specimens, f))}
                  />
                )}
                {followed && (
                  <AntCard
                    followed={followed}
                    colonies={game.colonies}
                    fungus={game.fungus}
                    explain={jev.explain}
                    explainFungus={jev.explainFungus}
                    onClose={() => setFollowed(null)}
                    fields={game.params.species.lanes.mode?.schema?.fields.map((f) => String(f.name))}
                    pinned={specimens.some((s) => sameAnt(s, followed))}
                    onPin={() => togglePin(followed)}
                  />
                )}
              </>
            ) : null}
          </div>
        )}

        {!building && (
          <AimBar
            aim={jev.aim}
            setAim={jev.setAim}
            draftAim={jev.draftAim}
            lock={jev.lock}
            tokens={TOKENS_PER_FUNGAL_SITUATION}
            leftOpen={drawer !== null}
          />
        )}

        {!building && tut.tutorial && tut.card && (
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
        <LensLayer
          on={lensOn}
          colonies={game.colonies}
          fungus={game.fungus}
          world={oneWorld}
          sensed={sensed}
          layer={shownLayer}
          trails={{ food: controls.showFoodTrail, home: controls.showHomeTrail }}
          onFollow={setFollowed}
        />
        {palette && <Palette commands={paletteCommands()} onClose={() => setPalette(false)} />}
        {sheet && <Shortcuts speeds={SPEEDS} onClose={() => setSheet(false)} />}
        <Toasts place={building ? "top" : lab ? "lab" : "bottom"} />
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
      </div>
      {lab && <LabBench {...labProps} history={history} step={step} onClose={() => setLab(false)} />}
    </main>
  );
}

/** Settings: what the field draws, the fine speed, the links out, and the way into the lab and the numbers (PRD §69). */
function Settings({
  controls,
  update,
  openLab,
  openShortcuts,
  pass,
}: {
  controls: { showFoodTrail: boolean; showHomeTrail: boolean; speed: number };
  update: (patch: { showFoodTrail?: boolean; showHomeTrail?: boolean; speed?: number }) => void;
  openLab: () => void;
  openShortcuts: () => void;
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
      <SoundSetting />
      <div>
        <SectionHead>Keys</SectionHead>
        <Button className="mt-2 w-full" onClick={openShortcuts}>
          Keyboard shortcuts
        </Button>
        <p className="mt-1.5 text-xs text-fg-3">Or press ?. ⌘K (Ctrl+K) opens the command palette: every action, by name.</p>
      </div>
      <div>
        <SectionHead>Deeper</SectionHead>
        <Button className="mt-2 w-full" onClick={openLab}>
          Lab mode
        </Button>
        <p className="mt-1.5 text-xs text-fg-3">
          A workbench under the map: the game&apos;s history in charts, a step control, the world&apos;s seed and size, Jev&apos;s spend,
          the lever menu and the lab&apos;s foundings, the full numbers. Or press l.
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

/** A builder event (Builder.watch) as a notice, in words a child can follow. */
function buildNotice(e: BuildEvent): string {
  const food = (t: "sugar" | "crumb") => (t === "sugar" ? "sugar 🍬" : "crumbs 🍪");
  switch (e.kind) {
    case "foodFound":
      return `An ant found your ${food(e.tool)}!`;
    case "foodGone":
      return `Your ${food(e.tool)} ${e.tool === "sugar" ? "is" : "are"} all gone: the ants carried it home.`;
    case "lineFollowed":
      return `${e.ants} ${colonyName(e.colony)} ants are following your crayon line! 🖍️`;
    case "antHome":
      return `The ${colonyName(e.colony)} ant you moved found its way home in ${Math.round(e.seconds)} s! 🏠`;
    case "antLost":
      return `The ${colonyName(e.colony)} ant you moved didn't make it home.`;
  }
}

/** The builder's sounds and spoken tool names (PRD §73): on unless turned off, per browser. */
function SoundSetting() {
  const [on, setOn] = useState(soundOn);
  return (
    <div>
      <SectionHead>Sounds</SectionHead>
      <div className="mt-2 flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="sounds">
        {([true, false] as const).map((v) => (
          <button
            key={String(v)}
            type="button"
            className={`flex-1 ${seg(on === v)}`}
            aria-pressed={on === v}
            onClick={() => (setSoundOn(v), setOn(v))}
          >
            {v ? "on" : "off"}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fg-3">The builder&apos;s tool sounds, and each tool&apos;s name said aloud.</p>
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
    <div className="mt-5 lg:hidden" aria-label="fungus aim">
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
