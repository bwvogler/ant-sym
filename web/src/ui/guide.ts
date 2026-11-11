import { BROOD_RGB, css, HOME_RGB, ROLE_RGB } from "./palette.ts";

// The Learn drawer's field guide: one entry per thing on screen, in three
// parts. What you see, what real ants do (from the research notes in docs/,
// each claim the note's own), and how the game models it. Where a behaviour
// is still a script that reads something an ant can't sense, the entry says
// so and names the vision gap's bead. Sources link the notes on GitHub (the
// Pages build has no server to serve them). tests/guide.test.ts checks every
// cited note and heading exists and every gap bead is still open in
// docs/vision.md, so the guide fails loudly when the docs move on.

export const REPO = "https://github.com/bwvogler/ant-sym";
export const docUrl = (note: string, anchor = "") => `${REPO}/blob/main/docs/${note}.md${anchor ? `#${anchor}` : ""}`;

export interface Source {
  /** a note in docs/, without .md */
  note: string;
  /** a heading's GitHub anchor in it ("" for the top) */
  anchor: string;
  label: string;
}

export interface GuideEntry {
  id: string;
  title: string;
  /** CSS colours that stand for it on the field */
  swatch?: string[];
  onScreen: string;
  realAnts: string;
  inGame: string;
  /** still scripted: a vision gap (docs/vision.md "Where the code is today"), its bead and what the script reads */
  scripted?: { bead: string; reads: string };
  sources: Source[];
}

const HEAT = "rgb(var(--heat))";

export const GUIDE: GuideEntry[] = [
  {
    id: "food-trail",
    title: "Food trail",
    swatch: [HEAT],
    onScreen: "The green wash (Trails: “to food”). Ants carrying food home lay it, so it leads out to food.",
    realAnts:
      "Recruitment trails last minutes, about as long as a trip; long-lived “route memory” trails last hours to days. Black garden ants (Lasius niger) lay about 43 % more trail marks for rich sugar than for weak, and that alone lets a colony pick the richer of two sources.",
    inGame: "Laid by carriers on the way home, more for richer food. It fades in about 12 s, a short-lived recruitment trail: the game has no long-lived memory trail.",
    sources: [
      { note: "ant-communication", anchor: "2-distance-and-time-scales", label: "Distance and time scales" },
      { note: "trails", anchor: "trail-amount-follows-food-quality", label: "Trail amount follows food quality" },
    ],
  },
  {
    id: "home-trail",
    title: "Home trail and the way home",
    swatch: [css(HOME_RGB)],
    onScreen: "The orange wash (Trails: “to home”). Ants walking out lay it, so it leads carriers back.",
    realAnts:
      "Outside, home is a small hole. A forager keeps a running home vector from its steps and a sky compass, with an error of roughly 10 % of the distance walked; landmarks and an odour at the entrance correct it near home, and the vector resets only inside the nest.",
    inGame: "Ants walking out lay the home trail; on the surface a carrier follows the food trail where it agrees with its home vector, and the vector otherwise.",
    sources: [
      { note: "nest-and-home", anchor: "outside-home-is-the-hole", label: "Outside: home is the hole" },
      { note: "trails", anchor: "which-journeys-lay-trail", label: "Which journeys lay trail" },
    ],
  },
  {
    id: "food-quality",
    title: "Tasting food",
    swatch: ["var(--accent)"],
    onScreen: "A jade crumb at an ant's head: it is carrying food. Food on the map varies in how good it is.",
    realAnts: "An ant tastes the food in its jaws (sugar strength) when it picks it up: a contact sense. Richer food gets more trail.",
    inGame: "Each food cell has a quality (poor, fair or rich). The ant tastes it at pickup and lays its food trail 0.83×, 1× or 1.2× as strongly.",
    sources: [{ note: "trails", anchor: "trail-amount-follows-food-quality", label: "Trail amount follows food quality" }],
  },
  {
    id: "double-bridge",
    title: "Choosing a branch",
    onScreen: "Where trails fork, traffic piles onto one branch.",
    realAnts:
      "Argentine ants given a bridge with a short and a long branch end up almost all on the short one: the ants that took it come back first, so its trail grows first. Offered two equal food sources, a colony usually concentrates on one of them.",
    inGame: "A follower picks among the trails ahead by strength, more than in proportion to it (Deneubourg's choice), so a small lead grows. On the bridge assay the colony settles on the short branch.",
    sources: [{ note: "trails", anchor: "the-double-bridge", label: "The double bridge" }],
  },
  {
    id: "no-entry",
    title: "The “no entry” mark",
    onScreen: "Not drawn: the mark is built, but switched off.",
    realAnts:
      "Pharaoh's ants lay a repellent at forks leading to nothing: facing a marked branch, 71 % took the other one. It lasts about twice as long as the attractive trail. It helps a colony leave an emptied source sooner.",
    inGame: "An ant that follows a food trail to its end and finds no food can lay it. It ships switched off: the marks landed on live trails and cost the colony more than they saved (bead ja-4n1). Today only tiredness breaks a mill round emptied food.",
    sources: [{ note: "trails", anchor: "the-no-entry-mark", label: "The “no entry” mark" }],
  },
  {
    id: "alarm",
    title: "Alarm",
    swatch: ["var(--warn)"],
    onScreen: "Brown haze where ants fight.",
    realAnts: "Alarm is volatile: it reaches a few centimetres and fades fast, so it calls the nearby ants, not the colony. Its meaning depends on strength: faint attracts, strong triggers attack or digging.",
    inGame:
      "It fades in about 3 s and reaches about 5 cells, and its meaning is graded: a strong alarm repels every ant but fighters and diggers, and on the surface a faint one draws an explorer with empty jaws to look (underground the drawn explorers crowded the tunnels, so it doesn't there). Ants in a fight lay it, and so does an ant that meets a stranger. A colony that defends sends fighters to it.",
    sources: [
      { note: "ant-communication", anchor: "tldr", label: "Ant communication: TL;DR" },
      { note: "combat", anchor: "graded-alarm-a-little-draws-a-lot-repels-or-enrages", label: "Graded alarm" },
      { note: "fungus-policy", anchor: "a-perception-what-the-host-senses", label: "Fungus levers: perception" },
    ],
  },
  {
    id: "strangers",
    title: "Strangers and battles",
    swatch: ["var(--ink)", "var(--warn)"],
    onScreen: "Ants are coloured by their odour: Ink's start dark, Amber's in the warn tone. Fights break out where they meet.",
    realAnts:
      "Colony identity is a blend of cuticular hydrocarbons, read by touch: an ant knows a stranger only on contact. At food, the ant that didn't start an encounter usually retreats. Fire-ant battles follow a roughly linear law, not Lanchester's square law; narrow, cluttered ground lets a few strong defenders hold off many attackers, open ground favours numbers.",
    inGame:
      "An ant whose odour is far enough from its own is a stranger. Meeting one, an ant senses the odds by touch (outnumbered, even or outnumbering) and chooses to fight, flee, or drop its load and run. Without Jev: a carrier takes its load home, raiders and defenders fight, and foragers turn away. On the surface an ant defends only while it senses a threat near its own nest; far out it forages. Fights are settled by the odds in the cells around, so in a narrow pass only the front ranks meet.",
    scripted: { bead: "ja-k4k.6", reads: "on the side view (a lab map; the page plays one world, where each ant's stance is its own and a scout's trail leads the raiders) the colony's stance (forage, defend, raid) comes from colony totals and is broadcast to every ant, and raids aim at the rival's hole by its coordinates" },
    sources: [
      { note: "ant-communication", anchor: "3-rival-colonies", label: "Rival colonies" },
      { note: "combat", anchor: "meeting-a-stranger-fight-flee-or-drop-and-run", label: "Meeting a stranger" },
      { note: "combat", anchor: "terrain-narrow-ground-lets-the-few-hold-off-the-many", label: "Terrain" },
    ],
  },
  {
    id: "fatigue",
    title: "Tiredness and rest",
    onScreen: "On the follow card: fatigue against patience. A tired ant heads home.",
    realAnts:
      "A harvester forager's trip is set by how long it searched, not how far it went: it goes home as soon as it finds a seed. Foragers rest inside between trips, and 25–50 % of workers may be inactive at any moment, a reserve.",
    inGame: "Fatigue grows only while an ant searches outside with empty jaws, is cleared by finding food, and falls while it rests inside. Going home tired is what stops ants circling a trail to food that is gone.",
    sources: [
      { note: "tiredness", anchor: "what-ends-a-foraging-trip", label: "What ends a foraging trip" },
      { note: "tiredness", anchor: "rest-between-bouts", label: "Rest between bouts" },
    ],
  },
  {
    id: "chambers",
    title: "Chambers",
    swatch: (["royal", "brood", "store", "reception"] as const).map((r) => css(ROLE_RGB[r]!)),
    onScreen: "Below: tinted rooms off the shafts. Violet is the queen's, rose brood, gold store, teal reception (where food comes in). Turn on Labels on the field to name them.",
    realAnts:
      "A nest is shafts with chambers off them (Tschinkel's “shish-kebab”). Chambers are about 1 cm high whatever their area, largest near the top, with gaps that grow with depth; there is about 2 cm² of floor per worker. Brood, not CO₂, decides where ants dig.",
    inGame: "Ants dig chambers two rows high off the shafts. A new chamber's role comes from its depth against the queen's: reception above it, store below, brood otherwise.",
    scripted: { bead: "ja-k4k.3", reads: "the colony's total floor per ant, every chamber of every colony, and a role fixed at founding" },
    sources: [{ note: "nest-and-home", anchor: "nest-structure", label: "Nest structure" }],
  },
  {
    id: "inside",
    title: "Finding the way inside",
    onScreen: "Underground, the follow card's “home” chip names the chamber the ant stands in.",
    realAnts: "In the dark nest ants use gravity, memories of places, and chemical “road signs” laid on the floor at decision points. Each chamber's floor smells different, so its role can be read from its smell.",
    inGame: "An ant underground senses the role of the chamber it stands in (stand-in for floor smell). How it steers to the queen or the hole is still scripted.",
    scripted: { bead: "ja-k4k.2", reads: "the queen's exact position, a whole-nest distance field and the true way home" },
    sources: [{ note: "nest-and-home", anchor: "inside-gravity-memory-and-road-signs", label: "Inside: gravity, memory and road signs" }],
  },
  {
    id: "queen",
    title: "The queen",
    swatch: ["var(--ink)"],
    onScreen: "Below: the large oval in the royal chamber. Hollow and crossed out when dead.",
    realAnts:
      "Her pheromone draws workers to tend and rescue her; it says where she is, not where home is. In a single-queen species, losing her means no more workers are ever made: the colony is doomed, but not ended at once.",
    inGame: "She lays eggs while the colony has food. A colony that loses her is orphaned: no more eggs, and its workers age out.",
    sources: [
      { note: "nest-and-home", anchor: "the-queen", label: "The queen" },
      { note: "nest-and-home", anchor: "losing-the-queen", label: "Losing the queen" },
      { note: "queens-and-merging", anchor: "2-what-ants-do", label: "Queens and merging: what ants do" },
    ],
  },
  {
    id: "brood",
    title: "Brood",
    swatch: BROOD_RGB,
    onScreen: "Small squares in the chambers: eggs pale, larvae cream, pupae tan.",
    realAnts: "Workers move brood to the queen, and up and down the nest to the best temperature. Where brood lies is where ants dig.",
    inGame: "Eggs hatch into larvae; nurses feed larvae in brood chambers; pupae become workers.",
    scripted: { bead: "ja-k4k.4", reads: "the least-tended brood chamber colony-wide and every chamber's need" },
    sources: [{ note: "nest-and-home", anchor: "places-with-jobs", label: "Places with jobs" }],
  },
  {
    id: "jobs",
    title: "Jobs by age",
    onScreen: "Young ants stay below, middle-aged ones dig and carry, the old forage.",
    realAnts: "The youngest workers sit deep with the queen and brood and move up as they age; only the oldest forage, from the top chambers. Food goes in at the top and is stored deep.",
    inGame: "Each ant's age sets its work: nurse, dig and carry, or forage.",
    scripted: { bead: "ja-k4k.1", reads: "fixed age thresholds, not response thresholds over sensed signals" },
    sources: [{ note: "nest-and-home", anchor: "places-with-jobs", label: "Places with jobs" }],
  },
  {
    id: "midden",
    title: "Mound and midden",
    swatch: ["var(--mound)"],
    onScreen: "The ring of dug soil round each nest, and grey crosses: the dead, carried out to the midden.",
    realAnts: "Harvester ants put refuse at the edge of the cleared disc round the nest, and the midden also deters other ants: a boundary.",
    inGame: "Diggers carry soil up to the mound; the dead are carried past it to the midden.",
    scripted: { bead: "ja-k4k.5", reads: "the rival's hole position, every nest and entrance, and a scan of every ant" },
    sources: [{ note: "nest-and-home", anchor: "places-with-jobs", label: "Places with jobs" }],
  },
  {
    id: "fungus",
    title: "The fungus",
    swatch: ["var(--spore)"],
    onScreen: "Purple: spores on the ground and a dot on infected ants (brighter for a heavy load). You are the fungus.",
    realAnts:
      "Real parasites change what an ant perceives, gives off and can do, not its plans. Rickia makes its hosts carry more of one alkane, and they are attacked less by strangers. Ophiocordyceps hosts lose their daily rhythm and communicate less. Grooming off Metarhizium passes low doses that immunise nestmates.",
    inGame:
      "The fungus never chooses for an ant: each ant's policy decides from what it senses, and the fungus bends those senses and what the ant gives off (see the next entry). The game's fungus spreads like Garden (after the leafcutter's garden): its hosts carry its own odour. Two more strains exist in the code for experiments: Lockpick (after Rickia) hides and calms, and Bloom (after Metarhizium) spreads fast and is groomed off. Nothing in the game lays them.",
    sources: [
      { note: "fungus-policy", anchor: "3-what-real-parasites-do-to-ants", label: "What real parasites do to ants" },
      { note: "fungus-policy", anchor: "2-two-policies-and-the-perceived-state-between-them", label: "Two policies, and the perceived state between them" },
    ],
  },
  {
    id: "fungus-senses",
    title: "What the fungus senses, and its levers",
    swatch: ["var(--spore)"],
    onScreen: "Follow an infected ant: its card lists what the fungus senses inside it (arousal, touch, place, task, carrying, groomed) and the levers it pulls there, each at a level. Until Jev answers a new aim, the fungus plays its default there; dimmed levers are an earlier aim's, played only while Jev can't answer.",
    realAnts:
      "A fungus lives in and on its host's body. What it could read there is the host's body: amines that rise with fighting, the cuticle it touches, the juvenile hormone that tracks a worker's task. That a fungus reads these is the game's design; what parasites do with them, changing what a host perceives and gives off, is real (Rickia's alkane, Ophiocordyceps's lost rhythm).",
    inGame:
      "Your aim, in words, is read by Jev, which sets a level for every lever in each situation the fungus senses: perception levers (food, rival trails, home, alarm, stranger scent, floor marks, time out) and emission levers (trail laid, trail leaked, alarm laid, calming cue, fungal odour, showing). Lethal levers stay off until you turn them on, and in the game even then do nothing until your fungus earns them (the Odour weapon and Crown upgrades). The ant still decides, from what it now perceives.",
    sources: [
      { note: "fungus-policy", anchor: "11-what-the-fungus-senses-inside-an-ant-and-its-levers", label: "What the fungus senses inside an ant, and its levers" },
      { note: "new-queens", anchor: "4-where-the-fungus-comes-in", label: "Where the fungus comes in (queen birth)" },
    ],
  },
  {
    id: "evolution",
    title: "The fungus's body, and its mutations",
    swatch: ["var(--spore)"],
    onScreen: "The Fungus panel: its mycelium by the hole and the fungus in its hosts, mutations to keep and how fast they come, and what each upgrade does next. On a followed ant's card, a lever your fungus can't yet pull as far as Jev wants shows what it gets and what it wanted.",
    realAnts:
      "Metarhizium lives for months in soil and around roots without an insect. Passed through groups of grooming ants for ten cycles, it evolved to make more spores and to carry less of the cue groomers detect. In experimental evolution, more replication buys far less than proportionally faster adaptation.",
    inGame:
      "The fungus lands weak: it passes on slowly, clears from a host on its own, and nestmates groom it out of the nest. Its mycelium by the hole grows and turns some of its mass into spores, so foragers keep walking through them. Every bit of new fungus can mutate, as its mycelium grows and as it passes from ant to ant, so the faster it grows the faster mutations come (the game's licence: real mutations are random, and selection keeps what works). You choose which to keep, and each level asks more than the last: its body (infectivity, persistence, mycelium, fruiting body, immune evasion) or its reach, how far each group of levers may go, the lethal ones included: a lethal lever you put on the menu stays held off until you keep its upgrade. Jev is asked every lever on its full scale either way, so a new level re-asks nothing.",
    sources: [
      { note: "fungus-body", anchor: "1-growth-without-a-host", label: "Growth without a host" },
      { note: "fungus-body", anchor: "3-adapting-to-hosts", label: "Adapting to hosts" },
      { note: "fungus-body", anchor: "4-grooming-and-the-queen", label: "Grooming and the queen" },
    ],
  },
  {
    id: "unity",
    title: "One colony",
    onScreen: "The Unity bar in the Fungus panel. Ants' colours meet in between as their odours mix.",
    realAnts:
      "Introduced Argentine ants form supercolonies whose nests smell alike and don't fight, across about 6,000 km of southern Europe. Orphaned army-ant colonies fused with a neighbour in 7 of 10 trials.",
    inGame: "The colonies are one when their nests smell alike (within tolerance), their ants have met (over the last minute, some of each colony touching another's while smelling alike), and nobody has died fighting for a minute.",
    sources: [
      { note: "fungus-policy", anchor: "1-what-unified-should-mean-measurably", label: "What “unified” should mean" },
      { note: "queens-and-merging", anchor: "2-what-ants-do", label: "Merging" },
    ],
  },
  {
    id: "one-world",
    title: "The line and the curtain",
    onScreen:
      "The game is one world, seen two ways. Above: the surface from above, where ants forage, with the mound and the midden; a dashed line runs through the nests' holes, each named. Below: the ground under that line, unrolled flat, with every nest's shaft and chambers; the strip along its top is the surface under the line, with the ants standing on it, and a faint rule marks each bend of the line (“↱ 35°”). Click the line above to look below there, or the strip below to look above; a followed ant that goes through a hole takes the camera with it (Carry across).",
    realAnts:
      "A ground-nesting ant's nest is descending shafts with flat chambers off them (Tschinkel's “shish-kebab”), largest near the top: one vertical sheet keeps that shape. A founding queen flies, then walks to a nest site on foot, and most founding queens fail.",
    inGame:
      "Ants live on two layers: the plane, with the top-down maps' movement, and the curtain, a vertical sheet hung under the line, with the side view's; a hole is the only way between them. A new nest goes only beyond an end of the line, so the line stays one strip: its hole must be nearest an end hole, at least 16 from every hole, on open ground joined to the rest, and the new segment may not turn back more than 120° or come within 12 cells of the line. A new queen flies up to 140 from her mother's hole (with you in her, where you click on the top view, which shows where she would settle) and walks to the nearest spot the rule allows within 140 of where she landed; with none, she is lost, and the notice says why.",
    sources: [
      { note: "one-world", anchor: "2-the-model-a-plane-and-a-curtain", label: "The model: a plane and a curtain" },
      { note: "one-world", anchor: "3-the-line-and-where-a-new-nest-may-go", label: "The line, and where a new nest may go" },
      { note: "one-world", anchor: "5-two-views-of-one-game", label: "Two views of one game" },
      { note: "nest-and-home", anchor: "nest-structure", label: "Nest structure" },
      { note: "nest-spacing", anchor: "3-how-far-a-founding-queen-flies", label: "How far a founding queen flies" },
      { note: "new-queens", anchor: "3-the-flight-and-founding", label: "The flight and founding" },
    ],
  },
];

/** The research notes, for the guide's footer (docs/README.md's table). */
export const NOTES: { note: string; title: string; covers: string }[] = [
  { note: "vision", title: "Vision", covers: "The goal, what an ant may sense, and which behaviours are still scripted." },
  { note: "ant-communication", title: "Ant communication", covers: "Signal channels, their ranges and lifetimes, rival colonies, combat laws." },
  { note: "nest-and-home", title: "Nest and home", covers: "Finding home outside and inside, the queen, nest architecture, jobs by place and age." },
  { note: "trails", title: "Trails", covers: "The double bridge, trail amount by food quality, the “no entry” mark." },
  { note: "combat", title: "Combat", covers: "Narrow ground and the few against the many, graded alarm, meeting a stranger." },
  { note: "tiredness", title: "Tiredness", covers: "When a forager gives up a search and how it recovers." },
  { note: "activation", title: "Activation", covers: "Foragers go out because foragers come back: contacts with returners, scouts, the colony's intake." },
  { note: "raid-recruitment", title: "Raid recruitment", covers: "Scouts find a rival and recruit before a raid; encounters at a border recruit; a trail brings the fighters." },
  { note: "stance", title: "Stance", covers: "Defence as an individual's threshold raised by alarm and encounters; hunger does not raise aggression; crowded colonies raid." },
  { note: "fungus-policy", title: "The fungus policy", covers: "What real parasites do to ants, and the levers the fungus pulls." },
  { note: "fungus-body", title: "The fungus's body", covers: "A mycelium off the host, spores paid from its mass, adapting in hosts; grooming triggered by sensing the pathogen." },
  { note: "queens-and-merging", title: "Queens and merging", covers: "Several queens, adoption, and orphaned colonies merging (not built)." },
  { note: "entrances", title: "Entrances", covers: "How many entrances colonies keep, sealing them at night, and what a digger senses near the surface." },
  { note: "one-world", title: "One world", covers: "The surface and a curtain under the line between the holes: one game in two views, above and below. The views are linked, and a one-world game opens above." },
  { note: "nest-spacing", title: "Nest spacing", covers: "How far apart colonies sit, where young colonies survive, and how far a founding queen flies." },
  { note: "new-queens", title: "New queens", covers: "When a colony rears new queens, how they found, and the fungus's levers on it (not built)." },
];

export function guideEntry(id: string): GuideEntry | undefined {
  return GUIDE.find((e) => e.id === id);
}
