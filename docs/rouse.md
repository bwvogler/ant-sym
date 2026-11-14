# Rouse: the fungus makes a desert-ant host invite its nestmates out

*Design note for bead `ja-rf5.18` (PRD §60.7–60.8). Written 2026-11-14 against code at `80716ef`. The lever was the owner's choice (2026-11-11: contact at an invitation; 2026-11-14: as "rouse"). No paper shows a fungus doing this; the papers on infected ants point the other way. Numbers from abstracts are marked **unverified**.*

The desert ant has no trails, so the fungus's trail and alarm levers do nothing on it (PRD §60.7). What does reach it is contact: a finder coming down the shaft raises the pace of the nestmates waiting at the top, and they leave by their pace (`invite.ts`, PRD §60.6). The owner chose a lever that acts at that contact. The question for this note: **what do parasites do to how much an infected ant meets and moves its nestmates?**

## 1. Infected ants are less social, not more

- *Camponotus aethiops* infected with *Metarhizium brunneum* interacted less with nestmates, stopped tending brood, and from the third day after infection spent most of their time outside the nest until death (Bos et al. 2012, *J Evol Biol*; **unverified**, abstract only).
- 92 % of *Temnothorax* workers that died after exposure to *Metarhizium anisopliae* left the nest beforehand, over 1,600 workers from 28 colonies (Heinze & Walter 2010, *Curr Biol*; **unverified**, abstract and press only).
- The withdrawal may be passive: in *Myrmica rubra* infected with *M. brunneum*, seclusion looked like a growing failure to orient to nest cues (Leclerc & Detrain 2018, *BMC Evol Biol*; **unverified**, search summary only).
- *Ophiocordyceps*-infected *Camponotus* lose their activity rhythm and communicate less with nestmates, and the fungus makes its own host hyperactive before its death grip (fungus-policy.md, Ophiocordyceps row; Hughes et al. 2011, *BMC Ecol*).
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
- **Cost:** the lever's brief joins the fungus's legend (`FUNGUS_LEGEND` lists every lever), so the fungus lane's shipped answers must be asked again: about $0.013 (the v8 re-ship, one lever added, cost $0.0126). Steady state per hour unchanged.
- **Assay:** in the staged chamber (`invitationChamber`, D2c), an infected host with rouse strong coming down raises leaving well above the spontaneous rate (a false invitation reaches as far as some of a true one); with rouse none it doesn't. In a game, a desert colony with a roused host sends out more departures from the waiting pool than with none, on seeds 1–5.

## Play

- **See:** a desert colony whose foragers pour out of the hole with nothing found, while the warm wash is high; the Learn drawer and the lever's blurb say why.
- **Choose:** a lever only for a desert host: rouse its hosts to send nestmates out (more contact with a host on the way, more ants on the hot plane), or leave them be. On the generic ant it is greyed (inert), like the trail levers on the desert ant.
- **Progression:** a lever like the others, no new upgrade; a weak start is unchanged.
- **Cost:** about $0.013 once for the fungus lane's shipped answers; a cached game spends nothing.
- **Worse to play:** a roused colony that empties its nest into the noon heat could starve itself (a free win): watched with D5's food and deaths on a roused host.

## Open questions

- **Owner (decided):** contact at an invitation, as rouse (2026-11-14).
- **Owner (to decide):** the fungus lane's re-ship (about $0.013).
- **To measure:** how strong a false invitation is against a true one (the levels), and whether rouse can starve a colony.

## What ja-rf5.18 built (PRD §60.8)

The lever as planned, with one change: it is off the fungus's default menu (the player puts it on in a desert game), so a generic game's requests don't ask a lever that does nothing. In a game it works but weakly: about 5 % more passes reach the waiting ants with the colony's hosts roused (seed 1, 240 s), because a desert ant rarely comes down its shaft with nothing found. Whether rouse should also strengthen a finder's pass is open for the owner.

## Sources

- Bos et al. (2012). Sick ants become unsociable. *J Evol Biol* (authors, volume and pages from memory; not fetched). [record](https://test01.ku.dk/:obvius/pureproxy/3974268/da/publications/sick-ants-become-unsociable) (abstract only)
- Heinze J, Walter B (2010). Moribund ants leave their nests to die in social isolation. *Curr Biol* (volume and pages from memory; not fetched). *(secondary)* [National Geographic](https://www.nationalgeographic.com/science/article/terminally-ill-ants-choose-to-die-alone)
- Leclerc & Detrain (2018), *BMC Evol Biol* (authors from memory; not fetched). [PMC6307282](https://pmc.ncbi.nlm.nih.gov/articles/PMC6307282/) (search summary only)
- Hughes DP et al. (2011). Behavioral mechanisms and morphological symptoms of zombie ants dying from fungal infection. *BMC Ecol* 11:13. [BMC](https://www.biomedcentral.com/1472-6785/11/13)
