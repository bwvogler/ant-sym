import { type RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type BuildEvent, Builder, CURTAIN, type Game, PLANE } from "../colony/index.ts";
import type { FieldApi, FieldBuild } from "./ColonyField.tsx";
import { markSeen, seenTools, trayItems, type TrayItem, type TrayTool } from "./build.ts";
import { ESCAPE_LAYER, useEscape } from "./escape.ts";
import { colonyName } from "./names.ts";
import { play, say } from "./sounds.ts";
import { pushToast } from "./toasts.ts";
import { AntTraces } from "./trace.ts";
import type { ColonyControls } from "./useColony.ts";

// The builder as the page runs it (docs/builder.md, PRD §73, ja-kjj8; ja-fnd.6.2, docs/refactor.md S5.2): a child's tools over the world, on or off at any
// point in a game. Its builds go into the game itself, so a save keeps them; its undo is this page's, per game. What ColonyApp's Page did inline: the
// Builder and the traces of the ants the tweezers moved, the tool in hand and the tray's offer, the toggle that opens it close in, the strokes and the
// tweezers' lifts as the field's `build`, the undo (Ctrl/⌘+Z) and Escape, and the once-a-second watch of what the ants did with the builds.

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
    case "aphidsFound":
      return `The ${colonyName(e.colony)} ants found your aphids! 🐛`;
    case "aphidsEaten":
      return "The ants are eating some of your aphids, as real ants do.";
    case "aphidsGone":
      return "Your aphids are all gone: aphid families grow, then fade away.";
  }
}

/** Whether a key went to a field being typed in (the builder's keys are not for it). */
const typing = (target: EventTarget | null): boolean => {
  const t = target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};

export function useBuilder({
  game,
  view,
  field,
  closeDrawer,
}: {
  game: Game;
  view: ColonyControls["view"];
  field: RefObject<FieldApi | null>;
  closeDrawer: () => void;
}) {
  const builder = useMemo(() => new Builder(game), [game]);
  /** each moved ant's way home, drawn on the top view (ja-cwjp) */
  const traces = useMemo(() => new AntTraces(builder), [builder]);
  /** the builder's aphid clumps as they are now (the game replaces its list as clumps go) */
  const aphidsNow = useCallback(() => game.aphids, [game]);
  const [building, setBuilding] = useState(false);
  const [toolKey, setToolKey] = useState<string>("move");
  const [little, setLittle] = useState(false);
  const [smell, setSmell] = useState(true);
  const [demo, setDemo] = useState<{ tool: TrayTool; at: number } | null>(null);
  const [, setBuilt] = useState(0);
  const lastSound = useRef(0);
  // Colonies founded mid-game join the same array (Game.addColony): its length is what changes.
  const colonyCount = game.colonies.length;
  const trails = game.colonies[0]!.ph.has("food");
  const pp = game.colonies[0]!.params;
  const tends = pp.aphidPlume > 0 || pp.tendDefend > 0 || pp.aphidPrey > 0;
  // Some tools work in one view only (Dirt below, aphids above): the tray offers each where it can be placed.
  const tray = useMemo(
    () =>
      trayItems(
        little,
        Array.from({ length: colonyCount }, (_, k) => colonyName(k)),
        trails,
        tends,
        view,
      ),
    [little, colonyCount, trails, tends, view],
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
        const v = view === "above" ? PLANE : CURTAIN;
        const cam = field.current?.camera(v);
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (!cam || cam.zoom < 6 * dpr) {
          const nest = game.colonies[game.landed?.colony ?? 0]?.layers[v]?.nest ?? game.colonies[0]?.nest;
          if (nest) field.current?.centreOn(v, nest.x, nest.y, { close: true });
        }
      }
      return !on;
    });
    closeDrawer();
  }, [view, game, field, closeDrawer]);
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
      for (const e of builder.watch())
        pushToast(buildNotice(e), e.kind === "antLost" || e.kind === "aphidsEaten" || e.kind === "aphidsGone" ? "info" : "good", {
          // Each kind of event (of a tool, of a colony) counts up rather than stacking: "3 ants are following your line ×2".
          group: `build:${e.kind}:${"tool" in e ? e.tool : ""}:${"colony" in e ? e.colony : ""}`,
        });
    }, 1000);
    return () => clearInterval(timer);
  }, [builder]);
  // Escape leaves the builder (the bottom layer below the field, escape.ts: after a tooltip, the Codex, the Lab and a drawer), but not from a
  // field being typed in.
  useEscape(
    ESCAPE_LAYER.builder,
    (e) => {
      if (typing(e.target)) return false;
      toggleBuilding();
      return true;
    },
    building,
    "below",
  );
  // Ctrl/⌘+Z undoes a stroke while building.
  useEffect(() => {
    if (!building) return;
    const key = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoBuild();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [building, undoBuild]);
  /** The tray's "little" switch (a smaller set of tools): flipping it leaves the tool in hand for Move. */
  const toggleLittle = () => {
    setLittle((l) => !l);
    setToolKey("move");
  };
  const toggleSmell = () => setSmell((v) => !v);
  return {
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
  };
}
