# Rouse: the fungus makes a desert-ant host invite its nestmates out

*Design note for bead `ja-rf5.18` (PRD §60.7–60.8). Written 2026-11-14 against code at `80716ef`. The lever was the owner's choice (2026-11-11: contact at an invitation; 2026-11-14: as "rouse"). No paper shows a fungus doing this; the papers on infected ants point the other way. Numbers from abstracts are marked **unverified**.*

The desert ant has no trails, so the fungus's trail and alarm levers do nothing on it (PRD §60.7). What does reach it is contact: a finder coming down the shaft raises the pace of the nestmates waiting at the top, and they leave by their pace (`invite.ts`, PRD §60.6). The owner chose a lever that acts at that contact. The question for this note: **what do parasites do to how much an infected ant meets and moves its nestmates?**

## 1. Infected ants are less social, not more

- *Camponotus aethiops* infected with *Metarhizium brunneum* interacted less with nestmates, stopped tending brood, and from the third day after infection spent most of their time outside the nest until death (Bos et al. 2012, *J Evol Biol*; **unverified**, abstract only).
- 92 % of *Temnothorax* workers that died after exposure to *Metarhizium anisopliae* left the nest beforehand, over 1,600 workers from 28 colonies (Heinze & Walter 2010, *Curr Biol*; **unverified**, abstract and press only).
- The withdrawal may be passive: in *Myrmica rubra* infected with *M. brunneum*, seclusion looked like a growing failure to orient to nest cues (Leclerc & Detrain 2018, *BMC Evol Biol*; **unverified**, search summary only).
- *Ophiocordyceps*-infected *Camponotus* lose their activity rhythm and communicate less with nestmates, and are reported as hyperactive before the death grip (fungus-policy.md, Ophiocordyceps row, citing Hughes et al. 2011, *BMC Ecol*; **secondary**, not checked against the paper for this note).
- *Metarhizium*-exposed *Lasius* foragers and their nestmates reorganise contacts so the network resists spread (fungus-policy.md, Metarhizium row).

**In the game:** none of this shows a fungus raising the activity of the host's nestmates. What a parasite does to its own host is move it (hyperactivity) and, more often, isolate it. Rouse is therefore **design**, against the grain of the biology. It is kept because the owner chose it as the fungus's way into a species whose senses offer little else, and because it works through a sense the desert ant has: the pace a finder passes on.

## 2. What the lever does

**In the game:** an infected host that comes down its shaft raises the pace of the nestmates waiting at the top as a finder does (`invite.ts`), whether or not it carries food: they go out on a false invitation, and the host meets more of them on the way. The cue is the ant's own pace (the sense table's own-body row); the response is its `leave` response, as for a real finder. Levels: none, some, strong (a share of a finder's pass, scaled by how far the fungus has grown in the host, as the calming cue is). On a species with no invitation (`invitePace` 0, the generic ant) it does nothing: inert, as the trail levers are on the desert ant. **Design:** all of it.

## What was not found

- No study of a parasite that makes its host recruit or rouse nestmates.
- No record of fungal infection in *Cataglyphis* at all (desert-ant.md, reading of 2026-11-14).

## The mechanic

- **Lever** `rouse` (emit; none, some, strong) in `levers.ts`: `Levers.rouse` 0–1, a per-ant `rouse` array set by the fungus as the calming cue is (`fungus.ts`). Inert where the species has no invitation.
- **Effect:** in `crossDown` (crossing.ts), a host going down its own hole adds its `rouse` to the passes the ants waiting at the top meet next tick (`holeIn`), as a finder adds 1. Nothing else changes: the host keeps no pass back out unless it carries food.
- **Off:** `rouse` 0, and every species without `invitePace`: goldens bit-exact for the generic ant.
- **Cost:** the lever's brief joins the fungus's legend (`FUNGUS_LEGEND` lists every lever), so the fungus lane's shipped answers must be asked again: about $0.013 (the v8 re-ship, one lever added, cost $0.0126). Every fungus request carries the longer legend, about +2 % a request (4,941 → 5,041 characters in the default request), so the lane's hourly cost rises by about that.
- **Assay (the plan; not met, see What ja-rf5.18 built):** in the staged chamber (`invitationChamber`, D2c), an infected host with rouse strong coming down raises leaving well above the spontaneous rate (a false invitation reaches as far as some of a true one); with rouse none it doesn't. In a game, a desert colony with a roused host sends out more departures from the waiting pool than with none, on seeds 1–5.

## Play

- **See:** a desert colony whose foragers pour out of the hole with nothing found, while the warm wash is high; the Learn drawer and the lever's blurb say why.
- **Choose:** a lever only for a desert host: rouse its hosts to send nestmates out (more contact with a host on the way, more ants on the hot plane), or leave them be. On the generic ant it is greyed (inert), like the trail levers on the desert ant.
- **Progression:** a lever like the others, no new upgrade; a weak start is unchanged.
- **Cost:** about $0.013 once for the fungus lane's shipped answers; a cached game spends nothing.
- **Worse to play:** a roused colony that empties its nest into the noon heat could starve itself (a free win): watched with D5's food and deaths on a roused host.

## Open questions

- **Owner (decided):** contact at an invitation, as rouse (2026-11-14).
- **Owner (decided):** the re-ship ($0.0092, then $0.0036 for the situations an earlier ship held); rouse on in desert games; merge as it is (2026-11-14).
- **To measure:** how strong a false invitation is against a true one (the levels), and whether rouse can starve a colony.

## What ja-rf5.18 built (PRD §60.8)

The lever as planned, with two changes (owner, 2026-11-14): it is on the fungus's menu only in a desert game (`menuFor`), so a generic game's requests don't ask a lever that does nothing; and the fungus lane's answers were asked again, including the situations the earlier ship held but a fresh recording didn't meet (132 an aim).

A desert game asks the fungus with rouse on, so the shipped fungus answers (asked without it) don't serve its workers: without Jev they play the local rule (PRD §60.8).

**What it does, honestly: it raises the passes, not the departures.** Seeds 1–5, 240 s, the fungus landed, rouse strong against none, rich map: the waiting ants meet **+4.6 %** passes, ants held at the top leave about 0.5 s sooner, and departures fall **0.6 %** (fewer on 4 of 5 seeds). Why (ja-rf5.19, measured offline):
- 85–90 % of departures are finders cycling straight back out with their own pass; rouse doesn't touch them.
- About one ant (0.66–1.12) waits at the gate at any time, and every one of them leaves anyway (145 of 145, median wait 4–14 s), so a pass can only make it leave sooner.
- The upper bound, no gate wait at all, gives no more departures (1,799 against 1,837).
- Rouse at every crossing, or on finders' passes too, moved departures −1.0 % to +0.2 %.
- Only on a scarce map (0.1–0.3 food patches a chunk, 1–13 ants held) does rouse help: +0.5 % to +3.8 % departures.
- "Strong" expresses only 0.3–0.5 of a finder per host in a game (the host's load scales it).

The owner chose to merge it as it is and say so (2026-11-14). A lever that moves departures has to act on a pool that exists, such as the host itself or the hot foragers cooling inside: a new mechanic, filed as ja-rf5.21 (the "strong" level's weak expression: ja-rf5.20).

## Sources

- Bos et al. (2012). Sick ants become unsociable. *J Evol Biol* (authors, volume and pages from memory; not fetched). [record](https://test01.ku.dk/:obvius/pureproxy/3974268/da/publications/sick-ants-become-unsociable) (abstract only)
- Heinze J, Walter B (2010). Moribund ants leave their nests to die in social isolation. *Curr Biol* (volume and pages from memory; not fetched). *(secondary)* [National Geographic](https://www.nationalgeographic.com/science/article/terminally-ill-ants-choose-to-die-alone)
- Leclerc & Detrain (2018), *BMC Evol Biol* (authors from memory; not fetched). [PMC6307282](https://pmc.ncbi.nlm.nih.gov/articles/PMC6307282/) (search summary only)
- Hughes DP et al. (2011). Behavioral mechanisms and morphological symptoms of zombie ants dying from fungal infection. *BMC Ecol* 11:13. [BMC](https://www.biomedcentral.com/1472-6785/11/13)
