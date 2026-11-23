import {
  CURTAIN,
  PLANE,
  UPGRADES,
  type Pool,
  type Upgrade,
  LETHAL_LEVERS,
  canKeep,
  keptLevels,
  nextCost,
  poolOf,
  price,
  MET,
  type Game,
  AIMS,
  GENERIC_ANT,
  INFECTED,
  type ColonyParams,
} from "./colony/index.ts";
import BuilderTray, { ToolDemo } from "./ui/BuilderTray.tsx";
import { setSoundOn, soundOn } from "./ui/sounds.ts";
import { setTheme, THEME_LABEL, THEMES, useTheme } from "./ui/theme.ts";
import { sunChip } from "./ui/sun.ts";
import type { GameLoop } from "./ui/gameLoop.ts";
import { SessionContext, useLoopStats, useStats } from "./ui/session.ts";
import { chapterNameOf, evolutionOf, outcomeOf, simTime, slowPace, wholeStats } from "./ui/statSelect.ts";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import AntCard from "./ui/AntCard.tsx";
import ColonyField, { type FieldApi } from "./ui/ColonyField.tsx";
import { BareCards, Colonies, SavedGames, type LabProps } from "./ui/LabCards.tsx";
import LabBench from "./ui/LabBench.tsx";
import { History, sampleOf } from "./ui/history.ts";
import { Button, Drawer, FLOAT, Icon, IconButton, SectionHead } from "./ui/kit.tsx";
import type { Followed } from "./ui/follow.ts";
import { Bar } from "./ui/widgets.tsx";
import { seg } from "./ui/styles.ts";
import { MAX_SPEED, useColony, type ColonyStats, type EvolutionStats, type View } from "./ui/useColony.ts";
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
import { passphrase } from "./ui/backend.ts";
import PassNote from "./ui/PassNote.tsx";
import Tip from "./ui/Tip.tsx";
import UpgradeTree from "./ui/UpgradeTree.tsx";
import { useWideTree } from "./ui/upgradeBranches.ts";
import { ANTS_TIP, BODY_TIP, FREE_TIP, MUTATION_TIP } from "./ui/upgradeText.ts";
import { recheckBackend, useBackend } from "./ui/useBackend.ts";
import { TOKENS_PER_FUNGAL_SITUATION, useColonyJev } from "./ui/useColonyJev.ts";
import { JevContext, useJev, useJevSession } from "./ui/jevContext.tsx";
import LearnDrawer from "./ui/LearnDrawer.tsx";
import Help from "./ui/Help.tsx";
import { GUIDE, REPO } from "./ui/guide.ts";
import { MOD_K } from "./ui/keys.ts";
import { useKeys } from "./ui/useKeys.ts";
import { paletteCommands as buildPaletteCommands } from "./ui/paletteCommands.ts";
import LensLayer from "./ui/LensLayer.tsx";
import { clock } from "./ui/clock.ts";
import Specimens from "./ui/Specimens.tsx";
import { sameAnt, unpin } from "./ui/specimens.ts";
import { useSpecimens } from "./ui/useSpecimens.ts";
import { useCodex, useCodexWatch } from "./ui/useCodex.ts";
import { clearProbe, offerProbe } from "./ui/lensStore.ts";
import Palette, { type Runnable } from "./ui/Palette.tsx";
import Shortcuts from "./ui/Shortcuts.tsx";
import { openLearn } from "./ui/learn.ts";
import { openLab, toggleLab, useLab } from "./ui/labStore.ts";
import Toasts from "./ui/Toasts.tsx";
import Notices from "./ui/Notices.tsx";
import { pushToast, toastPlace, useNoticeLevel } from "./ui/toasts.ts";
import { useBuilder } from "./ui/useBuilder.ts";
import QueenPen from "./ui/QueenPen.tsx";
import { useFlight } from "./ui/useFlight.ts";
import { installDevHook } from "./dev/hook.ts";

// The game's main screen (ja-lo8.2; laid out by PRD §69): the map fills the screen; a HUD over its top (play, speed, view,
// clock, the goal); a rail of drawers at its left (the fungus and its aim, mutations, the colonies, saves, the Codex,
// settings; a tab bar on a phone); the followed ant or the queen's pen in an inspector at its right. The fungus is the
// player: you shape its policy in words (its aim); Jev reads them and decides what the fungus does in each host it
// lives in. Each colony's doctrine is its nature, out of the player's reach (docs/new-queens.md). The lab and the full
// numbers are Lab mode's (the key l, the palette, Settings): a workbench under the map (PRD §69.7).

/** The drawers the rail opens. */
type DrawerId = "fungus" | "evolve" | "colonies" | "saves" | "settings";

/** The speeds the HUD offers (4× is the game's default; PRD §50); the Lab's World tab has the slider for the rest. */
const SPEEDS = [1, 2, 4, MAX_SPEED] as const;

export default function ColonyApp() {
  const colony = useColony();
  const { game, journal } = colony;
  // The Jev session (ui/useColonyJev.ts, jevSession.ts): built here, above the page, and given to it through a context, so each component reads its
  // own slice of it (ui/jevContext.tsx) and nothing here draws again when the lock or the aim changes.
  const jevSession = useColonyJev(game.colonies, game.fungus, useBackend(), journal, game.params.species);
  // The loop reaches the components below through a context, so each reads its own slice of the stats (ui/session.ts).
  return (
    <SessionContext.Provider value={colony.loop}>
      <JevContext.Provider value={jevSession}>
        <Page colony={colony} />
      </JevContext.Provider>
    </SessionContext.Provider>
  );
}

/** The queen's pen on her mother's doctrine: read here, so the page does not draw again as the doctrines change. */
function MotherPen(props: Omit<ComponentProps<typeof QueenPen>, "doctrine">) {
  const doctrines = useJev((s) => s.doctrines);
  return <QueenPen {...props} doctrine={doctrines[props.flight.mother] ?? doctrines[0]!} />;
}

function Page({ colony }: { colony: ReturnType<typeof useColony> }) {
  const { game, loop, controls, update, onFrame, restart, newWorld, start, loadSave, settings, evolve, journal, step } = colony;
  const backend = useBackend();
  // The page reads no Jev value that changes as the player types: the session for its commands and call-time reads (a save, the pen), and the two
  // values that change rarely (the lock and the run's phase) for the notices. The leaves take theirs from the context (ui/jevContext.tsx).
  const jev = useJevSession();
  const jevLock = useJev((s) => s.lock);
  const jevPhase = useJev((s) => s.phase);
  // Lab mode (PRD §69.7–69.8): the map shares the screen with a workbench of the game's history, policy, numbers, levers
  // and steps. Open at a tab, from the Lab store (a "?" on the policy opens it too).
  const lab = useLab() !== null;
  const theme = useTheme();
  const noticeLevel = useNoticeLevel();
  // One drawer open at a time, beside the map (PRD §69).
  const [drawer, setDrawer] = useState<DrawerId | null>(null);
  const wideTree = useWideTree();
  const toggle = useCallback((d: DrawerId) => setDrawer((cur) => (cur === d ? null : d)), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  // The followed ant belongs to the game it was picked in: a new game has new ants, so nothing is followed.
  // Keyed by a token per game rather than the game itself, so an old game is not kept alive by this state.
  const gameToken = useMemo(() => ({ game: game.map.seed }), [game]);
  const [follow, setFollow] = useState<{ token: object; f: Followed } | null>(null);
  const followed = follow && follow.token === gameToken ? follow.f : null;
  const setFollowed = useCallback((f: Followed | null) => setFollow(f ? { token: gameToken, f } : null), [gameToken]);
  // Specimens (PRD §69.5): up to three pinned ants, compared in the inspector; like the follow, they belong to their game (ui/useSpecimens.ts).
  const { specimens, setSpecimens, togglePin } = useSpecimens(game, gameToken);
  // The dev hook reads the follow as it is now (the e2e's carried-follow check), not as it was when the hook was set.
  const followedNow = useRef<Followed | null>(followed);
  useEffect(() => {
    followedNow.current = followed;
  }, [followed]);
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
  useCodexWatch(game, onFrame, loop.stats);
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
  // The builder (docs/builder.md, PRD §73, ja-kjj8): a child's tools over the world, on or off at any point in a game (ui/useBuilder.ts).
  const {
    builder,
    traces,
    aphidsNow,
    building,
    toggleBuilding,
    undoBuild,
    picked,
    pickTool,
    tray,
    little,
    toggleLittle,
    smell,
    toggleSmell,
    demo,
    build,
  } = useBuilder({ game, view: controls.view, field, closeDrawer });
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
  // S2b (PRD §69.3): the command palette, the shortcuts sheet and the lens, and the keys that open them (ui/useKeys.ts).
  const { palette, setPalette, sheet, setSheet, lensOn, toggleLens } = useKeys({
    playing: controls.playing,
    view: controls.view,
    speeds: SPEEDS,
    update,
    oneWorld: !!oneWorld,
    setView,
    followHost,
  });
  const games = useSaves(
    game,
    settings,
    () => {
      const { aim, doctrines } = jev.snapshot();
      return { aim, doctrines: [...doctrines], menu: controls.menu, hide: controls.hide, cull: controls.cull };
    },
    loop.stats,
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
  // A new queen has flown (ja-lo8.9): the game is paused for her; the pen, or her mother's doctrine at once (ui/useFlight.ts).
  const { flight, gate, circle, pen, penCard, foundHers, onFly, onWords, openDevPen } = useFlight({
    game,
    loop,
    jev,
    update,
    setFollowed,
    setView,
    field,
    oneWorld,
  });
  // The dev hook (dev/hook.ts): the game and the page's views on window, for the Playwright guard. Dev builds only, not in the Pages build.
  useEffect(() => {
    if (!(import.meta as { env?: { DEV?: boolean } }).env?.DEV) return;
    installDevHook({
      game,
      settings,
      notify: (text, tone) => pushToast(text, tone),
      traces,
      view: controls.view,
      followed: followedNow,
      setFollowed,
      sensed,
      field,
      openPen: openDevPen,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, controls.view, setFollowed, sensed, traces]);
  // The page (PRD §69, ja-mvo9.1): the map fills the screen; a HUD over its top; a rail of drawers at its left (a tab bar
  // on a phone); the followed ant in an inspector at its right (a sheet on a phone).
  const labProps: LabProps = {
    game,
    controls,
    update,
    restart,
    newWorld,
    journal,
    saves: games,
    onLoad: (r) => (continueFrom(r), setDrawer(null)),
  };
  // A mutation the fungus can keep: the rail's badge (the page draws again only when that changes) and a notice (useNotices).
  const affordable = useLoopStats(loop, (s) => affordableIn(s, controls.menu));
  useNotices(loop, affordable, jevLock, jevPhase);
  const shownLayer = oneWorld ? (controls.view === "above" ? PLANE : CURTAIN) : -1;
  // The palette's commands (ui/paletteCommands.ts; commands.ts ranks them): built only while the palette is open (review of #196, N3).
  const paletteCommands = (): Runnable[] =>
    buildPaletteCommands({
      game,
      controls,
      speeds: SPEEDS,
      oneWorld: !!oneWorld,
      lab,
      lensOn,
      noticeLevel,
      theme,
      field,
      update,
      setView,
      setDrawer,
      followHost,
      toggleLab,
      toggleLens,
      openSheet: () => setSheet(true),
    });
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
            apiRef={field}
            specimens={specimens}
            pen={pen}
            lens={lensOn}
            onProbe={offerProbe}
            toolsAt="top-[7.25rem] left-1/2 -translate-x-1/2 items-center sm:top-[4.5rem]"
            build={build}
            traces={traces}
            aphids={aphidsNow}
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
                    className={`${seg(controls.view === v)} flex items-center justify-center gap-1 max-sm:px-1.5`}
                    onClick={() => setView(v)}
                    aria-pressed={controls.view === v}
                    title={
                      v === "above"
                        ? "The surface from above: foraging, trails, the mound and the line through the holes (v)"
                        : "Underground: the curtain under the line, unrolled, with every nest (v)"
                    }
                  >
                    <Icon name={v} className="size-5" />
                    <span className="max-sm:sr-only">{v}</span>
                  </button>
                ))}
              </div>
            )}
            <IconButton icon="lens" label="Lens: say what is under the pointer (i)" active={lensOn} onClick={toggleLens} className="ml-1" />
            <IconButton icon="search" label={`Commands (${MOD_K})`} onClick={() => setPalette(true)} className="max-sm:hidden" />
            <SimClock className="px-2 font-mono text-[13px] text-fg-2 tabular-nums max-sm:hidden" />
            {/* A species with a day (the desert ant, ja-rf5.8): the sun as its ants see it, and the ground's heat now. */}
            {game.colonies[0]!.params.heatDay > 0 && (
              <>
                <span
                  className="flex items-center gap-1 px-2 font-mono text-[13px] text-fg-2 tabular-nums max-sm:hidden"
                  aria-label="sun"
                  title="The sun as the desert ants see it (out under a high sun, in when it is low or down), and the ground's heat"
                >
                  <Sun params={game.colonies[0]!.params} />
                  {/* Only where the species has its own guide entry (review of #194, N2). */}
                  {ownEntry && <Help to={{ tab: "guide", id: ownEntry }} label={game.params.species.name.toLowerCase()} />}
                </span>
                {/* On a phone, short (owner, review of #194 D1). */}
                <span className="px-1.5 font-mono text-[12px] text-fg-2 tabular-nums sm:hidden" aria-label="sun, short">
                  <Sun params={game.colonies[0]!.params} short />
                </span>
              </>
            )}
            <SlowBadge playing={controls.playing} speed={controls.speed} wide />
          </div>
          {/* The goal, and the bell at the top right: on a phone they share the second row. */}
          <div className="flex min-w-0 basis-full items-stretch gap-2 sm:flex-1 sm:basis-0">
            <div
              className={`pointer-events-auto flex min-w-0 flex-1 items-center px-3 py-2 text-[13px] text-fg-2 ${FLOAT}`}
              aria-label="goal"
            >
              <SimClock className="mr-2 font-mono text-fg-3 tabular-nums sm:hidden" />
              <SlowBadge playing={controls.playing} speed={controls.speed} />
              <GoalLine />
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
            onLittle={toggleLittle}
            onSmell={toggleSmell}
            onExit={toggleBuilding}
          />
        )}
        <nav
          aria-label="panels"
          hidden={building}
          className={`pointer-events-auto absolute inset-x-2 bottom-2 z-10 flex justify-around p-1 sm:inset-x-auto sm:top-[4.5rem] sm:bottom-auto sm:left-3 sm:max-h-[calc(100%-5.5rem)] sm:flex-col sm:gap-1 sm:overflow-y-auto sm:overscroll-contain ${FLOAT}`}
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
            <FungusStatus />
            <Aim />
            <AimLockNote />
          </Drawer>
        )}
        {drawer === "evolve" && (
          <Drawer label="mutations" title="Body and mutations" onClose={closeDrawer} wide={wideTree}>
            <EvolvePanel evolve={evolve} menu={controls.menu} wide={wideTree} />
          </Drawer>
        )}
        {drawer === "colonies" && (
          <Drawer label="colonies" title="Colonies" onClose={closeDrawer}>
            <BareCards>
              <Colonies />
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
              openLab={() => (clearProbe(), setDrawer(null), openLab())}
              openShortcuts={() => setSheet(true)}
              pass={backend?.needsPass ? <PassNote onSaved={recheckBackend} wrong={passphrase() !== null} /> : null}
            />
          </Drawer>
        )}

        {/* The inspector: the queen's pen while she flies, else the specimens and the followed ant. A sheet on a phone; below
          1024 px it waits while a drawer is open, so the two never overlap. */}
        {!building && (penCard || followed || specimens.length > 0) && (
          <div
            className={`panel-in pointer-events-auto absolute inset-x-2 bottom-16 z-10 max-h-[min(55dvh,calc(100%-9rem))] overflow-y-auto rounded-lg shadow-lg sm:inset-x-auto sm:top-[4.5rem] sm:right-3 sm:bottom-auto sm:max-h-[calc(100%-6rem)] sm:w-[26rem] lg:max-h-[calc(100%-12rem)] ${drawer ? "max-lg:hidden" : ""}`}
          >
            {penCard ? (
              <MotherPen
                key={penCard.flight.at}
                flight={penCard.flight}
                mother={colonyName(penCard.flight.mother)}
                daughter={colonyName(game.colonies.length)}
                onFound={foundHers}
                place={{ radius: penCard.circle.r, onWords, onFly }}
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

        {!building && <AimBar tokens={TOKENS_PER_FUNGAL_SITUATION} leftOpen={drawer !== null} />}

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

        <LearnDrawer colonies={game.colonies} game={game} />
        <LensLayer
          on={lensOn}
          colonies={game.colonies}
          fungus={game.fungus}
          world={oneWorld}
          sensed={sensed}
          layer={shownLayer}
          trails={{ food: controls.showFoodTrail, home: controls.showHomeTrail }}
          onFollow={setFollowed}
          aphids={aphidsNow}
          onFrame={onFrame}
        />
        {palette && <Palette commands={paletteCommands()} onClose={() => setPalette(false)} />}
        {sheet && <Shortcuts speeds={SPEEDS} onClose={() => setSheet(false)} />}
        <Toasts place={toastPlace({ building, drawer: drawer !== null, lab })} />
        {/* The pen over the field, were her mother to have no hole: she lands by herself. */}
        {flight && gate?.open && !circle && (
          <MotherPen
            key={flight.at}
            flight={flight}
            mother={colonyName(flight.mother)}
            daughter={colonyName(game.colonies.length)}
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
      {lab && (
        <LabBench
          {...labProps}
          history={history}
          step={step}
          policy={{
            colonies: game.colonies,
            followed,
            game,
            menu: controls.menu,
          }}
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
      <ThemeSetting />
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

/** Light or dark (PRD §69.9): the system's by default, or the player's choice, per browser. */
function ThemeSetting() {
  const theme = useTheme();
  return (
    <div>
      <SectionHead>Appearance</SectionHead>
      <div className="mt-2 flex overflow-hidden rounded-md border border-line text-sm" role="group" aria-label="appearance">
        {THEMES.map((t) => (
          <button key={t} type="button" className={`flex-1 ${seg(theme === t)}`} aria-pressed={theme === t} onClick={() => setTheme(t)}>
            {THEME_LABEL[t]}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-fg-3">System follows the device&apos;s light or dark setting.</p>
    </div>
  );
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

/** The sim clock: a leaf, so it draws on every stats tick (about seven a second) and the page does not. */
function SimClock({ className }: { className: string }) {
  const t = useStats(simTime);
  return (
    <span className={className} title="sim time">
      {clock(t)}
    </span>
  );
}

/** The sun as the species' ants see it (the desert ant's day), and the ground's heat now. */
function Sun({ params, short = false }: { params: ColonyParams; short?: boolean }) {
  return <>{sunChip(params, useStats(simTime), short)}</>;
}

/** Says how fast the sim really runs when the machine can't keep up with the speed asked (`wide`: the HUD's, else the goal line's, on a phone). */
function SlowBadge({ playing, speed, wide = false }: { playing: boolean; speed: number; wide?: boolean }) {
  const pace = useStats((s) => slowPace(s, playing, speed));
  if (pace === null) return null;
  return wide ? (
    <span
      className="mr-1 rounded-md bg-warn-soft px-2 py-0.5 text-xs text-warn max-sm:hidden"
      title="This machine can't step the sim that fast: it runs as fast as it can"
    >
      running at {pace.toFixed(1)}×
    </span>
  ) : (
    <span className="mr-2 shrink-0 rounded-md bg-warn-soft px-1.5 py-0.5 text-[11px] text-warn sm:hidden">{pace.toFixed(1)}×</span>
  );
}

/** The top bar's line of where the game stands. */
function GoalLine() {
  return <span className="truncate">{useStats(goalLine)}</span>;
}

/** The fungus's body and its mutations, or that it has not landed. */
function EvolvePanel({ evolve, menu, wide }: { evolve: (id: string) => boolean; menu: readonly string[]; wide: boolean }) {
  const e = useStats(evolutionOf);
  return e ? <Evolve e={e} evolve={evolve} menu={menu} wide={wide} /> : <p className="text-fg-3">The fungus has not landed yet.</p>;
}

/** Whether the fungus has a mutation it can keep: only upgrades the panel shows, and that would do something now (a lethal lever off the menu would not). */
function affordableIn(s: ColonyStats | null, menu: readonly string[]): boolean {
  const ev = s?.evolution;
  return ev ? UPGRADES.some((u) => !idle(u, menu) && canKeep(ev.levels, ev.pools, u.id)) : false;
}

/** Where the fungus is, and how far the colonies have come together. */
function FungusStatus() {
  const stats = useStats(wholeStats);
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
function Aim() {
  const session = useJevSession();
  const lock = useJev((s) => s.lock);
  const aim = useJev((s) => s.aim);
  const locked = lock !== null;
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
              className={seg(aim.id === a.id)}
              disabled={locked}
              onClick={() => session.setAim({ id: a.id, text: a.text })}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>
      <textarea
        className="mt-2 w-full resize-none rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-fg outline-none focus:border-accent disabled:opacity-60"
        rows={4}
        value={aim.text}
        disabled={locked}
        onChange={(e) => session.draftAim({ id: "custom", text: e.target.value })}
        onBlur={(e) => session.setAim({ id: aim.id, text: e.target.value })}
        aria-label="aim"
      />
      {locked ? (
        <p className="mt-1 text-xs text-warn">{lock}</p>
      ) : (
        <p className="mt-1 text-xs text-fg-3">
          What the fungus wants, in your words. Jev reads it and decides what the fungus does inside each ant it lives in: what that ant
          perceives, and what it gives off. ≈ {TOKENS_PER_FUNGAL_SITUATION} tokens per situation asked.
        </p>
      )}
    </div>
  );
}

/** Why the aim can't change now, under the fungus drawer's aim (from 1024 px the aim bar says it itself). */
function AimLockNote() {
  const lock = useJev((s) => s.lock);
  return lock ? <p className="mt-4 hidden text-xs text-warn lg:block">The aim is locked: {lock}</p> : null;
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

function Evolve({ e, evolve, menu, wide }: { e: EvolutionStats; evolve: (id: string) => boolean; menu: readonly string[]; wide: boolean }) {
  // Two pools, each with one price that rises with each level kept in it (PRD §80, §85 M3): shown here, by the mutations in hand in each, not on each level.
  const nextIn = (pool: Pool): number | null =>
    UPGRADES.some((u) => poolOf(u.id) === pool && nextCost(e.levels, u.id) !== null) ? price(keptLevels(e.levels, pool)) : null;
  const meter = (pool: Pool, label: string, tip: string) => {
    const n = e.pools[pool];
    const next = nextIn(pool);
    return (
      <div className="mt-2 flex items-baseline justify-between text-xs" data-pool={pool}>
        <Tip tip={tip}>{label}</Tip>
        <span className="font-mono tabular-nums">
          <span className={n > 0 ? "text-spore" : "text-fg-3"}>{n.toLocaleString()}</span>
          {next !== null && <span className="text-fg-2"> · next {next.toLocaleString()}</span>}
        </span>
      </div>
    );
  };
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
      {meter("ants", "Mutations from ants", ANTS_TIP)}
      {meter("free", "Mutations from the ground", FREE_TIP)}
      <p className="mt-1 text-[11px] text-fg-3">
        <Tip tip={MUTATION_TIP}>Every bit of new fungus can mutate</Tip>: fungus made in ants pays for the levels that act on ants; fungus
        made on the ground and in corpses pays for the fungus's own (mycelium, knots, stalks, fruiting). You choose which to keep. Each pool
        has its own price, which rises with each level you keep from it. +
        {e.perMinute < 10 ? e.perMinute.toFixed(1) : Math.round(e.perMinute).toLocaleString()}/min in all.
      </p>
      <UpgradeTree levels={e.levels} pools={e.pools} evolve={evolve} idle={(u) => idle(u, menu)} wide={wide} />
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
function useNotices(loop: GameLoop, affordable: boolean, lock: string | null, phase: string): void {
  // The page draws again when the outcome or the chapter changes, not on every tick: the text is read from the stats then.
  const outcome = useLoopStats(loop, outcomeOf);
  const seenOutcome = useRef(outcome);
  useEffect(() => {
    if (outcome === seenOutcome.current) return;
    seenOutcome.current = outcome;
    // The game's end shows even when the player has asked for important notices only.
    if (outcome !== "playing") pushToast(goalLine(loop.stats()), outcome === "unified" ? "good" : "warn", { important: true });
  }, [outcome, loop]);
  // A new chapter is worth a notice.
  const chapter = useLoopStats(loop, chapterNameOf);
  const seenChapter = useRef(chapter);
  useEffect(() => {
    if (chapter === seenChapter.current) return;
    const first = seenChapter.current === undefined;
    seenChapter.current = chapter;
    if (!first && loop.stats() && chapter !== "land") pushToast(goalLine(loop.stats()), "good");
  }, [chapter, loop]);
  // A mutation it can keep is worth a notice, once each time there was none it could afford (ja-lo8.12).
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
function useSaves(game: Game, settings: GameSettings, player: () => PlayerState, stats: () => ColonyStats | null, started: boolean): Saves {
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
  const now = useRef({ game, settings, playerState: player, stats, started });
  useEffect(() => {
    now.current = { game, settings, playerState: player, stats, started };
  });
  const save = useCallback(
    async (slot: number) => {
      const n = now.current;
      if (!n.started) return;
      try {
        await store.put(record(slot, n.settings, n.playerState(), n.game.save(), n.stats()?.chapter.goal ?? ""));
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
