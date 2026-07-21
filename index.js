import { extension_settings, getContext } from '../../../extensions.js';
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    setExtensionPrompt,
} from '../../../../script.js';

const EXT = 'wild-events';


const DEFAULTS = {
    enabled: true,
    engineMode: 'default',   // 'default' = curated event from pools + threads | 'lite' = model invents it
    step: 0.5,
    label: 'WILD EVENTS',
    depth: 0,
    showBadge: true,
    // scene modes
    modeEnabled: true,
    modeSource: 'auto',      // 'auto' | 'manual'
    manualMode: 'NEUTRAL',
    modeLock: false,         // freeze current mode (auto detection paused)
    infoScanChars: 150,      // chars of the last AI message scanned for infoblock markers
    infoMarkers: null,       // filled from DEFAULT_INFO_MARKERS at init
    // threads
    maxThreads: 3,
    threadMaxAge: 40,
    showThreads: false,
    // WORLDSHAKING is an "arc payoff" tier — locked in young chats
    wsMinMsgs: 60,
};

// ── Scale tiers ────────────────────────────────────────────

// `desc` is what the Lite engine injects instead of a concrete event —
// the model invents the event itself from the tier's scale.
const SCALES = [
    { min: 1,  max: 10, id: 'NONE',         name: 'NO CHANGE',       adj: null,
      desc: 'No forced external change. The story continues under its own momentum.' },
    { min: 11, max: 14, id: 'SUBTLE',       name: 'SUBTLE CHANGE',    adj: null,
      desc: 'A minor obstacle or a small lucky break. Nothing that redirects the scene.' },
    { min: 15, max: 18, id: 'MINOR',        name: 'MINOR TWIST',      adj: null,
      desc: 'A meaningful turn that changes immediate priorities.' },
    { min: 19, max: 22, id: 'TURNING',      name: 'TURNING POINT',    adj: 'reduce25',
      desc: 'A turning point: the current course of the scene is redirected and cannot simply resume.' },
    { min: 23, max: 26, id: 'MAJOR',        name: 'MAJOR TWIST',      adj: 'reduce50',
      desc: 'A weighty event that significantly changes the current situation and its stakes.' },
    { min: 27, max: 99, id: 'WORLDSHAKING', name: 'WORLD-SHAKING',    adj: 'reset',
      desc: 'A sudden, sweeping event — a catastrophe, a brutal betrayal, a massive secret revealed, an irreversible upheaval, a life-altering stroke of fortune.' },
];

// ── Event categories with weights ──────────────────────────

const CATEGORIES = [
    { id: 'INTERPERSONAL', name: 'Interpersonal', weight: 30 },
    { id: 'EMOTIONAL',     name: 'Emotional',     weight: 25 },
    { id: 'ENVIRONMENTAL', name: 'Environmental', weight: 20 },
    { id: 'DISCOVERY',     name: 'Discovery',     weight: 15 },
    { id: 'EXTERNAL',      name: 'External',      weight: 10 },
];

// ── Lite mode ──────────────────────────────────────────────
// Instead of rolling an event from the pools, hand the model the ruleset and
// let it roll and invent the event itself. Simpler, cheaper, less controlled.
// Injected verbatim every message; the model tracks tension across the chat.

// Guidance appended in Lite mode. The roll, tension and tier are computed by
// the extension (a model cannot reliably keep a counter across a long chat) —
// this only tells the model how to invent and place the event.
const LITE_GUIDANCE = [
    'Invent the event yourself, at exactly this scale, then weave it into the scene through action, dialogue, or observation.',
    'Match the pace: in action, the event must be something that happens fast; in a quiet or intimate moment, something felt, said, or noticed — never an interruption that derails the scene.',
    'Build only on people, places, and facts already established in this chat, or introduce something genuinely new. Do not invent history that has not happened.',
    'Do not announce the event as a separate block, and never mention the roll or these rules.',
];

// ── Scene modes ────────────────────────────────────────────
// Priority ladder: when several modes could match, the EARLIER one in this
// list wins (INTIMATE at a ball is still INTIMATE, not SOCIAL).

const MODE_ORDER = ['INTIMATE', 'COMBAT', 'TENSE', 'PERSONAL', 'SOCIAL', 'ADVENTURE', 'CALM'];

// Mode config:
//   catMult      — category weight multipliers (missing = 1)
//   tierCap      — max scale id the mode allows (null = no cap)
//   eventChance  — probability a rolled event is allowed to stand (else NONE)
//   tensionMult  — multiplier on tension growth per message
//   posBias      — probability the event is positive (0.5 = neutral)
//   pace         — preferred event pace: 'fast' | 'slow' | null (see PACE_TAGS)
//   hint         — extra instruction appended to the injection prompt
const SCENE_MODES = {
    NEUTRAL: {
        name: 'Neutral',
        catMult: {}, tierCap: null, eventChance: 1.0, tensionMult: 1.0, posBias: 0.5, pace: null,
        hint: null,
    },
    INTIMATE: {
        name: 'Intimate',
        catMult: { INTERPERSONAL: 1.6, EMOTIONAL: 1.4, ENVIRONMENTAL: 0.4, DISCOVERY: 0.3, EXTERNAL: 0.1 },
        tierCap: 'MINOR', eventChance: 0.35, tensionMult: 0.3, posBias: 0.75, pace: 'slow',
        hint: 'The scene is intimate — the event must stay inside the intimacy: a feeling, a gesture, a word. Never interrupt or derail the scene.',
    },
    COMBAT: {
        name: 'Combat',
        catMult: { INTERPERSONAL: 0.7, EMOTIONAL: 0.5, ENVIRONMENTAL: 1.6, DISCOVERY: 1.0, EXTERNAL: 1.4 },
        tierCap: null, eventChance: 1.0, tensionMult: 1.15, posBias: 0.5, pace: 'fast',
        hint: 'The scene is fast and physical — the event must fit the pace of action, not slow it down with introspection.',
    },
    TENSE: {
        name: 'Tense',
        catMult: { INTERPERSONAL: 0.8, EMOTIONAL: 1.0, ENVIRONMENTAL: 1.4, DISCOVERY: 1.3, EXTERNAL: 1.2 },
        tierCap: null, eventChance: 1.0, tensionMult: 1.2, posBias: 0.45, pace: null,
        hint: 'The scene is suspenseful — the event should feed the tension, not resolve it prematurely.',
    },
    PERSONAL: {
        name: 'Personal',
        catMult: { INTERPERSONAL: 1.5, EMOTIONAL: 1.5, ENVIRONMENTAL: 0.6, DISCOVERY: 0.6, EXTERNAL: 0.3 },
        tierCap: 'TURNING', eventChance: 0.7, tensionMult: 0.6, posBias: 0.55, pace: 'slow',
        hint: 'The scene is a private, emotionally open moment — the event should deepen it, not hijack it.',
    },
    SOCIAL: {
        name: 'Social',
        catMult: { INTERPERSONAL: 1.4, EMOTIONAL: 0.8, ENVIRONMENTAL: 0.6, DISCOVERY: 1.1, EXTERNAL: 1.2 },
        tierCap: null, eventChance: 1.0, tensionMult: 1.0, posBias: 0.5, pace: null,
        hint: 'The scene is public and has social stakes — status, appearances, and who is watching all matter to how the event lands.',
    },
    ADVENTURE: {
        name: 'Adventure',
        catMult: { INTERPERSONAL: 0.7, EMOTIONAL: 0.6, ENVIRONMENTAL: 1.5, DISCOVERY: 1.5, EXTERNAL: 1.0 },
        tierCap: null, eventChance: 1.0, tensionMult: 1.0, posBias: 0.5, pace: null,
        hint: 'The scene is about movement and discovery — favor the world over introspection.',
    },
    CALM: {
        name: 'Calm',
        catMult: { INTERPERSONAL: 1.2, EMOTIONAL: 1.2, ENVIRONMENTAL: 1.0, DISCOVERY: 0.9, EXTERNAL: 0.5 },
        tierCap: 'TURNING', eventChance: 0.6, tensionMult: 0.7, posBias: 0.6, pace: 'slow',
        hint: 'The scene is quiet, low-stakes — keep the event gentle and in keeping with the mood.',
    },
};

// ── Event pace tags ────────────────────────────────────────
// PACE_TAGS[exact event text] = 'fast' | 'slow'.
// Only deviants are tagged; untagged events count as 'any' and pass every
// mode filter. 'slow' = introspection/conversation/contemplation (excluded
// from COMBAT); 'fast' = action, intrusions, catastrophes (excluded from
// INTIMATE / PERSONAL / CALM, whose pace preference is 'slow').
const S = 'slow', F = 'fast';
const PACE_TAGS = {
    // ══ SUBTLE ══
    'a moment of shared silence between two people feels comfortable rather than awkward': S,
    'someone asks a question that shows they understand more about another person than expected': S,
    'a moment of unexpected honesty slips out in casual conversation': S,
    'a small promise is forgotten and the forgetting is noticed': S,
    'someone overhears something about themselves that was not meant for them': S,
    'a moment of physical proximity creates tension where there was none before': S,
    'someone notices they have been excluded from something small but deliberate': S,
    'a moment of unexpected calm arrives after a period of tension': S,
    'a feeling that has been sitting unnamed finally finds its shape and it is manageable': S,
    'a weight that has been present for a while lifts slightly without obvious cause': S,
    'someone notices they have been holding tension in their body and consciously releases it': S,
    'a familiar comfort — a habit, a ritual, a place — provides its usual reassurance': S,
    'a thought that usually spirals into worry simply passes through without catching': S,
    'someone accepts a compliment without deflecting it for the first time': S,
    'a feeling of safety settles in without needing external confirmation': S,
    'thoughts of something ahead begin to crowd out the present moment — pleasantly': S,
    'someone catches themselves rehearsing a conversation that has not happened yet': S,
    'a moment of stillness allows a thought that has been avoided to arrive': S,
    'someone recognizes a pattern in their own behavior and does not like what it means': S,
    'a want surfaces that someone knows they should not indulge': S,
    'a sound from the environment — birdsong, rain, wind — provides an unexpected comfort': S,
    'a scent in the air shifts to something pleasant or grounding': S,
    'something in the surroundings catches light in a way that draws attention and is worth looking at': S,
    'something growing — a plant, a pattern, a change — indicates the environment is healthy': S,
    'the space responds to human presence in a way that feels welcoming rather than indifferent': S,
    'something that seemed random reveals a pattern on second look': S,
    'a source of information that was considered unreliable turns out to be accurate about this one thing': S,
    'a source of information that was trusted shows signs of unreliability': S,
    'a pattern becomes visible and the pattern suggests something no one wants to consider': S,
    'the environment offers no natural shelter or boundary when one is needed': F,
    'an interruption that seems annoying at first proves to be well-timed': F,
    'a disturbance from outside draws away something that was causing problems': F,
    'a visitor or newcomer brings energy that shifts the mood positively': F,
    'an interruption arrives at the worst possible moment': F,
    'a disturbance from outside demands attention that cannot be spared': F,
    'a visitor or newcomer brings tension from elsewhere into the current scene': F,
    // ══ MINOR ══
    'a conflict between two people resolves not through agreement but through one of them choosing the relationship over being right': S,
    'a third person says something about the relationship between two others that reframes how they see each other': S,
    'a relationship shows signs of becoming deeper than either person had admitted': S,
    'someone apologizes and the apology is specific enough to prove they understood what they did': S,
    'two people discover a shared experience neither of them talks about and the recognition is mutual': S,
    'someone admits they were wrong to a person whose respect they value': S,
    'two people drop the surface level and finally have a real conversation': S,
    'someone reveals something vulnerable and the response they get is better than what they feared': S,
    'someone discovers they have been talked about in a way that changes how they feel about the speaker': S,
    'a third person becomes involved in a dynamic between two others and the triangle creates pressure': S,
    'someone realizes they have been managing another person rather than relating to them honestly': S,
    'a grievance no one had voiced surfaces for the first time': S,
    'a misunderstanding between two people solidifies into something harder to fix than the original issue': S,
    'someone realizes they have become dependent on a person who may not stay': S,
    'an alliance of convenience starts to develop real expectations that not everyone shares': S,
    'a fear that has been driving decisions is named aloud and loses some of its power': S,
    'someone allows themselves to want something they had been pretending not to care about': S,
    'a moment of genuine rest — mental, not just physical — arrives and is accepted': S,
    'an emotion that was tangled with guilt separates from it and becomes simply itself': S,
    'a memory that has been avoided is faced and turns out to be survivable': S,
    'someone realizes they have been punishing themselves for something that was not their fault': S,
    'an old wound stops hurting in a way that is noticeable': S,
    'someone realizes they no longer need something they used to depend on': S,
    'someone realizes they have been avoiding a feeling by staying busy and the busyness just stopped': S,
    'guilt arrives for something that seemed justified at the time': S,
    'someone realizes their motivation for something they are doing is not what they told themselves it was': S,
    'a moment of envy arrives that feels ugly and cannot be easily dismissed': S,
    'the atmosphere of a place changes in a way that invites a different kind of interaction than was happening': S,
    'the quality of a space improves in a way that affects the mood of everyone in it': S,
    'the sounds of the environment shift to something that supports concentration or calm': S,
    'a connection is made between two pieces of information that individually seemed useless': S,
    'a document, message, or record is found that changes the understanding of a past event for the better': S,
    'a discovery confirms a theory that was considered too optimistic': S,
    'a document, message, or record is found that changes the understanding of a past event for the worse': S,
    'something that was assumed to be unique turns out to exist in other places — and that is not good': S,
    'a piece of information that was being kept from someone is about to reach them through other channels': S,
    'a discovery reveals that what seemed like a setback was actually the intended outcome of someone else\'s plan': S,
    'the terrain provides cover, shelter, or advantage that was not obvious until it was needed': F,
    'a boundary in the landscape — a river, a ridge, a wall — provides strategic advantage': F,
    'the terrain becomes an active obstacle rather than a passive surface': F,
    'someone from outside the current group arrives with skills or resources that are needed': F,
    'an external event creates a distraction that pulls attention away from the characters at a useful moment': F,
    'a message arrives from outside that changes everything and there is no time to adjust': F,
    'someone from outside arrives and their presence complicates the existing dynamic': F,
    // ══ TURNING ══
    'a conflict surfaces at full strength and resolves through vulnerability rather than force': S,
    'someone reveals a secret they have been carrying and the other person already knew — and stayed anyway': S,
    'an act of forgiveness occurs that changes what is possible going forward': S,
    'a third party acknowledges the relationship between two people in a way that gives it legitimacy or weight': S,
    'a pattern of miscommunication between two people breaks because one of them finally says the real thing': S,
    'a secret is revealed that retroactively poisons the trust that was built on not knowing': S,
    'a relationship that has been sustaining both people reaches a point where it is sustaining neither': S,
    'a moment of honesty between two people reveals that they want fundamentally incompatible things': S,
    'someone discovers that the version of them another person loves is not who they actually are': S,
    'a confrontation no one wanted finally happens and it is worse than either person imagined': S,
    'a grief that has been carried for a long time is shared with someone and the sharing changes its weight': S,
    'an emotional truth that has been circling finally lands and it brings relief rather than pain': S,
    'someone discovers they are loved in a way they did not know they needed': S,
    'someone accepts a loss they have been refusing to grieve and the acceptance opens something new': S,
    'a realization arrives that changes the meaning of past suffering — it was not pointless': S,
    'an emotional wall comes down not through force but through exhaustion and what is behind it is better than expected': S,
    'someone is confronted with a version of themselves from the past and the comparison is devastating': S,
    'someone realizes they have been grieving something that is not actually gone — and the grief was about something else entirely': S,
    'an emotional investment pays off in a way that is technically positive but feels hollow': S,
    'someone realizes they have been making decisions from a place of damage rather than choice': S,
    'a moment that should feel good instead feels like loss and the dissonance is disorienting': S,
    'a place that held only negative associations reveals something that changes how it is experienced': S,
    'a place of power or significance is reached and it provides what was sought': S,
    'the environment heals or restores itself in a way that mirrors or supports what is happening to the characters': S,
    'a record, testimony, or artifact surfaces that vindicates a controversial decision': S,
    'a piece of knowledge that was thought to be dangerous turns out to be protective when properly understood': S,
    'a hidden cost is discovered that retroactively changes the value of everything gained': S,
    'something that was believed to be unique to this situation turns out to be part of a much larger pattern': S,
    'a record, testimony, or artifact surfaces that contradicts the accepted version of events': S,
    'a piece of knowledge arrives that cannot be acted on without revealing how it was obtained': S,
    'a third party brokers a solution that the involved parties could not reach on their own': S,
    'someone chooses another person over their own safety and the choice is witnessed': F,
    'two people survive something together and the shared survival creates a bond that did not exist before': F,
    'a fear that was manageable when theoretical becomes visceral when encountered in reality': F,
    'the landscape or setting provides a dramatic natural advantage at a critical moment': F,
    'a hidden feature of the location reveals itself and it changes the strategic picture completely': F,
    'a dangerous feature of the landscape turns out to be navigable by someone present': F,
    'the environment separates the characters from a threat more effectively than they could have done themselves': F,
    'the landscape or setting turns against the characters at a moment of vulnerability': F,
    'a natural event of significant scale forces immediate response and overrides all other priorities': F,
    'a space that was open contracts — literally or figuratively — trapping those inside': F,
    'a hidden danger in the landscape activates without warning': F,
    'a threshold is reached where the environment itself becomes the primary threat': F,
    'a natural boundary that provided protection is breached': F,
    'information arrives that transforms a defensive position into an offensive one': F,
    'evidence is found that the timeline is wrong — there is less time than anyone thought': F,
    'an external force enters the situation with demands that override current priorities': F,
    'an external conflict that was distant arrives locally with little warning': F,
    'an external threat that was being monitored accelerates beyond predictions': F,
    'a force from outside the story arrives and its presence means nothing will be the same': F,
    // ══ MAJOR ══
    'a relationship reaches a depth where both people understand each other without the need for explanation': S,
    'a rift between two people resolves through mutual recognition of fault': S,
    'a person who has been isolated is fully accepted into a group and the acceptance is unconditional': S,
    'a confession of something deeply hidden is met with the one response the confessor needed': S,
    'two people whose relationship has been marked by pain find a way to be in each other\'s lives without pain': S,
    'a wrong that felt unforgivable is forgiven': S,
    'a truth about a relationship is exposed that makes it impossible to continue as before': S,
    'a harmful dynamic that has crept into a relationship is finally named, and naming it does not fix it': S,
    'a public humiliation or exposure damages multiple relationships simultaneously': S,
    'a lie surfaces at the core of a relationship, and the truth it was covering is barely survivable': S,
    'two people who were essential to each other become harmful to each other': S,
    'someone allows themselves to feel something long held back and it does not destroy them': S,
    'a crisis of identity resolves through acceptance rather than victory': S,
    'an emotional wall that has defined a character comes down and what is behind it is not the weakness they feared': S,
    'a moment of emotional honesty between two people changes the trajectory of the story': S,
    'someone who has been defined by loss discovers they are also defined by what they still have': S,
    'a breakdown occurs and the rebuilding that follows produces something stronger than what was there before': S,
    'someone makes peace with an aspect of themselves they have been at war with': S,
    'an emotional burden that has been carried alone is shared and the sharing is transformative': S,
    'someone discovers they have the capacity for forgiveness they did not believe they possessed': S,
    'someone discovers that the thing they built their emotional life around was a defense mechanism not a truth': S,
    'a grief compounds with other grief until the total is unbearable': S,
    'someone is confronted with the full weight of what they have done and the weight is crushing': S,
    'a feeling of emptiness arrives that is different from sadness — it is the absence of the ability to feel': S,
    'a place reveals itself to be far more significant than anyone realized, and it provides what was needed': S,
    'the environment responds to the characters\' actions in a way that suggests alignment or approval': S,
    'a place of healing or restoration is found and it works as needed': S,
    'a place that was thought to be empty or dead shows signs of life or recovery': S,
    'a place that was hoped to hold answers turns out to hold something far worse': S,
    'a revelation arrives that changes the meaning of everything that has happened — and the new meaning is better': S,
    'a discovery proves that a costly choice made earlier accomplished exactly what it was meant to': S,
    'evidence surfaces that vindicates a decision everyone else condemned': S,
    'a truth that was hidden for protection is revealed and the protection is no longer needed': S,
    'a record of the past is found that provides moral authority for the present': S,
    'a truth is uncovered that turns a hero of the story into something far more complicated': S,
    'evidence surfaces that the characters\' actions have been causing harm they were not aware of': S,
    'a record of the past is found that undermines the legitimacy of what is being done in the present': S,
    'a political or social shift outside the story creates new possibilities within it': S,
    'a leader earns the trust of those who follow through action rather than authority': F,
    'a feeling of rage takes over a person who has always prided themselves on control': F,
    'a catastrophic environmental event is survived and the survival changes everything': F,
    'the environment provides a dramatic natural intervention at a critical moment': F,
    'the environment isolates the characters from a threat so completely that the threat cannot follow': F,
    'the environment creates conditions for a last stand that actually favors the defenders': F,
    'a place of safety is destroyed or fundamentally compromised': F,
    'a catastrophic environmental event forces abandonment of the current position': F,
    'the environment becomes hostile in a way that is not manageable with available resources': F,
    'a hidden environmental danger reaches a tipping point with no warning': F,
    'the landscape transforms in a way that cuts off retreat or escape': F,
    'a natural disaster or catastrophe forces impossible choices about who or what to save': F,
    'a place that was being defended becomes impossible to hold': F,
    'the environment turns lethal in a way that does not distinguish between friend and enemy': F,
    'a discovery reveals a way out of a situation that appeared to have no exit': F,
    'an external event creates a once-in-a-lifetime opportunity that must be acted on immediately': F,
    'an external force eliminates a threat the characters could not have handled themselves': F,
    'a war, disaster, or upheaval from elsewhere reaches the characters\' situation': F,
    'a force from outside the story arrives and nothing that was planned accounts for it': F,
    // ══ WORLD-SHAKING ══
    'a bond between two people reaches a depth that fundamentally changes what they are willing to do for each other': S,
    'a long-buried truth between two people finally surfaces and instead of destroying them it sets them free': S,
    'a relationship everyone had quietly given up on reconstitutes around something no one expected': S,
    'two people locked in conflict reach an understanding that makes the conflict irrelevant': S,
    'what looked like a betrayal is revealed to have been protection all along, and the cost of that protection becomes visible': S,
    'someone forgives something that was considered unforgivable and the forgiveness is genuine': S,
    'two people who were never supposed to meet discover a connection that recontextualizes both their histories': S,
    'a relationship reaches a turning point where both people see each other completely and choose to stay': S,
    'a lie told to protect someone is exposed and the person it was meant to protect is the one most damaged': S,
    'a confession comes too late and the person it was meant for has already made an irreversible decision': S,
    'a third party is revealed to have been quietly steering the connection between two people for their own purposes': S,
    'a grief that has long defined someone finally begins to release its hold': S,
    'someone who has been performing strength finally allows themselves to break down and discovers they are held': S,
    'an identity crisis that has been building resolves in a way that makes the person more whole than before': S,
    'someone who has been numb for a long time feels something real again and it is not pain': S,
    'a cycle of self-destruction that seemed permanent is broken by a single moment of genuine connection': S,
    'a memory that has been a source of pain is recontextualized and becomes a source of strength': S,
    'someone forgives themselves for something they believed was unforgivable': S,
    'a person who has defined themselves by their damage discovers they are not only their damage': S,
    'a burden long carried alone is finally shared and the sharing makes it bearable': S,
    'a truth about themselves that someone has long avoided becomes undeniable': S,
    'someone discovers that the version of themselves they have been fighting to protect never existed': S,
    'an emotional dependency that seemed like love is revealed to have been something else entirely': S,
    'a moment of complete emotional honesty destroys something that needed the lie to survive': S,
    'a memory that was a source of comfort is revealed to have been inaccurate and the real version is devastating': S,
    'a place that once meant safety is found again, and returning to it changes the meaning of everything since': S,
    'the environment itself responds to what is happening as if it recognizes the significance': S,
    'a place that held trauma is reclaimed and the reclaiming has power': S,
    'the physical world begins to reflect the emotional or spiritual damage of what has happened and the reflection makes things worse': S,
    'a truth is uncovered that recontextualizes the entire story up to this point — and the new context is better': S,
    'a discovery reveals that an effort thought wasted actually accomplished exactly what it was meant to': S,
    'a secret that has been carried as a burden is shared and turns out to be a gift': S,
    'a question that has been hanging over everything resolves in a way that brings peace rather than more questions': S,
    'a truth that everyone was afraid to face turns out to be survivable — difficult, but survivable': S,
    'a truth is uncovered that recasts recent progress — more of it than anyone wants to admit was serving something else': S,
    'a discovery renders a costly choice meaningless': S,
    'a truth arrives that cannot be unknown and every relationship it touches is damaged by it': S,
    'someone sacrifices their position, safety, or future for another person without hesitation or conditions': F,
    'someone\'s emotional armor finally fails and what comes through is not sadness but rage': F,
    'a catastrophe that seemed inevitable is averted by something the environment provides at the last moment': F,
    'a catastrophe reshapes the physical world in a way that cannot be undone': F,
    'the place itself seems to turn against everyone within it simultaneously': F,
    'the environment becomes actively dangerous in a way that changes all existing plans': F,
    'a barrier that was protecting something fails and what it was holding back enters the world': F,
    'a cycle of destruction accelerates beyond anyone\'s ability to intervene': F,
    'a change in the environment forces everyone to abandon something they cannot take with them': F,
    'a messenger or signal arrives from outside with information that changes everything': F,
    'a force from outside the story arrives and it is larger than anything the characters have faced': F,
    'an external threat that was theoretical becomes real and immediate with no warning': F,
    'a conflict larger than the current story spills over and engulfs the characters': F,
    'an event elsewhere triggers a chain reaction that reaches the characters as catastrophe': F,
    'a force that was approaching arrives and it is worse than anticipated': F,
};

// ── Default detection config ───────────────────────────────

// Marker roots for both RU and EN — matched against the model's own scene
// classification in the infoblock. Canonical tokens (COMBAT, интимная, …)
// first, plus tone-taxonomy aliases (tender / tragic / erotic / comedic).
const DEFAULT_INFO_MARKERS = [
    'INTIMATE: intimate, интимн, эротич, чувственн, страст, близость, erotic, sensual',
    'COMBAT: combat, боев, бой, битва, сражение, погоня, схватка, battle, chase',
    'TENSE: tense, напряж, опасн, саспенс, угроза, suspense, danger',
    'PERSONAL: personal, личн, душевн, откровенн, нежн, трагич, tender, tragic, heart-to-heart',
    'SOCIAL: social, светск, приём, прием, переговор, интриг, formal',
    'ADVENTURE: adventure, приключен, путешестви, исследовани, дорога, exploration, travel',
    'CALM: calm, спокойн, быт, повседнев, отдых, комеди, comedic, slice of life',
].join('\n');

// ── Scene mode detection ───────────────────────────────────
// Single source of truth: the model's own classification in the infoblock.
// No keyword dictionaries — with two languages and open vocabulary they can
// never be complete, while the model sees the whole scene.

function escapeRe(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Newest-first tail of the chat (skips system messages).
function getChatTail(depth) {
    const chat = getContext().chat || [];
    const msgs = [];
    for (let i = chat.length - 1; i >= 0 && msgs.length < depth; i--) {
        const m = chat[i];
        if (!m || m.is_system) continue;
        msgs.push({ text: m.mes || '', isUser: !!m.is_user });
    }
    return msgs;
}

// The model's own classification in the infoblock of its last message.
// No fixed format required — the first ~chars of the message are scanned for
// marker words (infoblock like "04/12 • 18:40 • Локация • Персонажи • Тип_сцены"
// lands entirely inside that window). Ladder order breaks conflicts.
function detectByInfoblock(s) {
    const lastAI = getChatTail(6).find(m => !m.isUser);
    if (!lastAI) return null;
    const head = lastAI.text.slice(0, s.infoScanChars ?? DEFAULTS.infoScanChars);

    const map = {};
    for (const raw of String(s.infoMarkers || '').split('\n')) {
        const m = raw.match(/^\s*([A-Z]+)\s*:\s*(.+)$/i);
        if (!m) continue;
        const id = m[1].toUpperCase();
        if (!SCENE_MODES[id]) continue;
        map[id] = m[2].split(',').map(x => x.trim()).filter(Boolean);
    }
    for (const id of MODE_ORDER) {
        for (const marker of (map[id] || [])) {
            try {
                // left word boundary only, so root markers ("откровенн") match all forms
                if (new RegExp(`(^|[^\\p{L}])${escapeRe(marker)}`, 'iu').test(head)) return id;
            } catch { /* ignore */ }
        }
    }
    return null;
}

function getModeMeta() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return { current: 'NEUTRAL' };
    if (!ctx.chatMetadata.we_mode) ctx.chatMetadata.we_mode = { current: 'NEUTRAL' };
    return ctx.chatMetadata.we_mode;
}

function updateDetectedMode() {
    const s = extension_settings[EXT];
    if (!s.modeEnabled || s.modeSource === 'manual' || s.modeLock) return;
    const meta = getModeMeta();

    // The infoblock is the model's own verdict — applied immediately.
    // No marker found → keep the last known mode (sticky), don't snap to NEUTRAL:
    // a missed/absent infoblock should not reset an established scene.
    const detected = detectByInfoblock(s);
    if (detected && detected !== meta.current) {
        meta.current = detected;
        getContext().saveMetadata();
    }
}

function getEffectiveModeId() {
    const s = extension_settings[EXT];
    if (!s.modeEnabled) return 'NEUTRAL';
    if (s.modeSource === 'manual') return SCENE_MODES[s.manualMode] ? s.manualMode : 'NEUTRAL';
    return SCENE_MODES[getModeMeta().current] ? getModeMeta().current : 'NEUTRAL';
}

// ── Threads (нити) ─────────────────────────────────────────
// A seed event opens a thread; while it is open, payoff events of the same
// theme fire on a chance that grows with age, scaled by mode affinity. A payoff
// either closes the thread or (for chained themes) advances it to act three.
// Stale threads die quietly at threadMaxAge. All 45 themes have content.

const THREAD_THEMES = [
    // ── Межличностные ──
    { id: 'SUSPICION',    name: 'Подозрение',                 g: 'REL', aff: { TENSE: 1.4, SOCIAL: 1.3, PERSONAL: 1.2 } },
    { id: 'UNSPOKEN',     name: 'Недосказанность',            g: 'REL', aff: { PERSONAL: 1.5, INTIMATE: 1.2, CALM: 1.2 } },
    { id: 'PROMISE',      name: 'Долг/обещание',              g: 'REL', aff: { SOCIAL: 1.2, ADVENTURE: 1.2 } },
    { id: 'CLOSENESS',    name: 'Растущая близость',          g: 'REL', aff: { PERSONAL: 1.5, INTIMATE: 1.5, CALM: 1.3 } },
    { id: 'DRIFT',        name: 'Растущее отчуждение',        g: 'REL', aff: { PERSONAL: 1.3, CALM: 1.2, SOCIAL: 1.1 } },
    { id: 'JEALOUSY',     name: 'Ревность',                   g: 'REL', aff: { SOCIAL: 1.4, PERSONAL: 1.3, INTIMATE: 1.2 } },
    { id: 'RIVALRY',      name: 'Соперничество',              g: 'REL', aff: { SOCIAL: 1.4, COMBAT: 1.3, ADVENTURE: 1.2 } },
    { id: 'SECRET',       name: 'Чужой секрет',               g: 'REL', aff: { PERSONAL: 1.3, TENSE: 1.2, SOCIAL: 1.2 } },
    { id: 'LOYALTY',      name: 'Испытание лояльности',       g: 'REL', aff: { COMBAT: 1.4, TENSE: 1.3, SOCIAL: 1.2 } },
    { id: 'ATTRACTION',   name: 'Скрытое влечение',           g: 'REL', aff: { PERSONAL: 1.5, INTIMATE: 1.4, SOCIAL: 1.2 } },
    { id: 'GUARDIAN',     name: 'Тайное покровительство',     g: 'REL', aff: { TENSE: 1.2, SOCIAL: 1.2, ADVENTURE: 1.2 } },
    { id: 'POWERSHIFT',   name: 'Сдвиг власти в отношениях',  g: 'REL', aff: { SOCIAL: 1.3, PERSONAL: 1.2, TENSE: 1.2 } },
    { id: 'SHAREDPAST',   name: 'Общее прошлое',              g: 'REL', aff: { PERSONAL: 1.4, CALM: 1.2, SOCIAL: 1.1 } },
    { id: 'UNSUNG',       name: 'Непризнанная заслуга',       g: 'REL', aff: { SOCIAL: 1.3, CALM: 1.2, PERSONAL: 1.2 } },
    { id: 'TRIANGLE',     name: 'Треугольник',                g: 'REL', aff: { SOCIAL: 1.3, PERSONAL: 1.3, INTIMATE: 1.2 } },
    // ── Внешние / сюжетные ──
    { id: 'WATCHED',      name: 'Слежка',                     g: 'EXT', aff: { TENSE: 1.5, ADVENTURE: 1.2, SOCIAL: 1.2 } },
    { id: 'SCHEME',       name: 'Чужой план',                 g: 'EXT', aff: { SOCIAL: 1.4, TENSE: 1.3 } },
    { id: 'LURKING',      name: 'Скрытая угроза',             g: 'EXT', aff: { TENSE: 1.5, ADVENTURE: 1.3, COMBAT: 1.2 } },
    { id: 'APPROACHING',  name: 'Приближающееся',             g: 'EXT', aff: { TENSE: 1.3, ADVENTURE: 1.2, SOCIAL: 1.1 } },
    { id: 'PASTMYSTERY',  name: 'Тайна прошлого',             g: 'EXT', aff: { ADVENTURE: 1.3, PERSONAL: 1.2, TENSE: 1.2 } },
    { id: 'REPUTATION',   name: 'Репутация/слухи',            g: 'EXT', aff: { SOCIAL: 1.5, CALM: 1.1 } },
    { id: 'RELIC',        name: 'Находка с историей',         g: 'EXT', aff: { ADVENTURE: 1.4, TENSE: 1.2 } },
    { id: 'POLITICS',     name: 'Сдвиг власти в мире',        g: 'EXT', aff: { SOCIAL: 1.4, TENSE: 1.2 } },
    { id: 'DEPLETION',    name: 'Ресурс на исходе',           g: 'EXT', aff: { ADVENTURE: 1.3, TENSE: 1.2, COMBAT: 1.2 } },
    { id: 'STRANGER',     name: 'Незнакомец',                 g: 'EXT', aff: { SOCIAL: 1.3, ADVENTURE: 1.3, TENSE: 1.2 } },
    { id: 'MESSAGE',      name: 'Послание',                   g: 'EXT', aff: { SOCIAL: 1.2, TENSE: 1.2, ADVENTURE: 1.1 } },
    { id: 'LEAK',         name: 'Утечка среди своих',         g: 'EXT', aff: { TENSE: 1.4, SOCIAL: 1.3 } },
    { id: 'ODDPLACE',     name: 'Неладное место',             g: 'EXT', aff: { ADVENTURE: 1.4, TENSE: 1.3 } },
    { id: 'TRACES',       name: 'Чей-то след',                g: 'EXT', aff: { ADVENTURE: 1.4, TENSE: 1.3 } },
    { id: 'WORLDSHIFT',   name: 'Медленная перемена мира',    g: 'EXT', aff: { ADVENTURE: 1.2, CALM: 1.1 } },
    // ── Эмоциональные ──
    { id: 'SUPPRESSED',   name: 'Подавленное чувство',        g: 'EMO', aff: { PERSONAL: 1.4, INTIMATE: 1.2, CALM: 1.2 } },
    { id: 'BREAKING',     name: 'Назревающий срыв',           g: 'EMO', aff: { TENSE: 1.3, PERSONAL: 1.3, COMBAT: 1.1 } },
    { id: 'GUILT',        name: 'Вина',                       g: 'EMO', aff: { PERSONAL: 1.4, CALM: 1.2 } },
    { id: 'OLDWOUND',     name: 'Старая рана',                g: 'EMO', aff: { PERSONAL: 1.4, INTIMATE: 1.2 } },
    { id: 'ANTICIPATION', name: 'Предвкушение',               g: 'EMO', aff: { CALM: 1.3, SOCIAL: 1.2, ADVENTURE: 1.2 } },
    { id: 'AMBITION',     name: 'Мечта/амбиция',              g: 'EMO', aff: { SOCIAL: 1.2, ADVENTURE: 1.2, CALM: 1.2 } },
    { id: 'TEMPTATION',   name: 'Искушение',                  g: 'EMO', aff: { INTIMATE: 1.3, SOCIAL: 1.2, TENSE: 1.2 } },
    { id: 'HOPE',         name: 'Хрупкая надежда',            g: 'EMO', aff: { PERSONAL: 1.3, CALM: 1.2, TENSE: 1.2 } },
    { id: 'CHANGING',     name: 'Перемена в себе',            g: 'EMO', aff: { PERSONAL: 1.4, CALM: 1.2 } },
    { id: 'LONGING',      name: 'Тоска/ностальгия',           g: 'EMO', aff: { CALM: 1.3, PERSONAL: 1.3 } },
    { id: 'FEAR',         name: 'Растущий страх',             g: 'EMO', aff: { TENSE: 1.4, ADVENTURE: 1.2, PERSONAL: 1.1 } },
    { id: 'INSPIRATION',  name: 'Вдохновение',                g: 'EMO', aff: { CALM: 1.3, ADVENTURE: 1.2, SOCIAL: 1.1 } },
    { id: 'SELFDOUBT',    name: 'Сомнение в себе',            g: 'EMO', aff: { PERSONAL: 1.3, COMBAT: 1.2, SOCIAL: 1.1 } },
    { id: 'ENVY',         name: 'Зависть',                    g: 'EMO', aff: { SOCIAL: 1.4, PERSONAL: 1.2 } },
    { id: 'HEALING',      name: 'Исцеление',                  g: 'EMO', aff: { CALM: 1.4, PERSONAL: 1.3, INTIMATE: 1.2 } },
];

// ── Thread content ─────────────────────────────────────────
// All 45 themes live (wave 1 + wave 2). Payoff tiers: MINOR (quiet, fires in
// Intimate/low tension), TURNING, MAJOR. Wave 3 (stage chains / act three)
// is planned separately — see ROADMAP.md.

// THREAD_SEEDS[exact event text] = themeId — picking this event opens a thread.
// Seeds are deliberately ambivalent SUBTLE/MINOR events: the gun must not show
// its caliber when it is hung on the wall.
const THREAD_SEEDS = {
    // SUSPICION
    'someone hesitates before responding in a way that the other person registers': 'SUSPICION',
    'a look passes between two people and one of them looks away too quickly': 'SUSPICION',
    'a question is asked that feels more like a test than genuine curiosity': 'SUSPICION',
    // UNSPOKEN
    'a look passes between two people that communicates something words have not yet addressed': 'UNSPOKEN',
    'someone says the right words but the tone does not match': 'UNSPOKEN',
    // CLOSENESS
    'a brief exchange between two people carries more warmth than either of them expected': 'CLOSENESS',
    'someone remembers a small detail about another person that shows they have been paying attention': 'CLOSENESS',
    'someone mirrors another person unconsciously — a posture, a phrase, a habit': 'CLOSENESS',
    // ATTRACTION
    'a moment of physical proximity creates tension where there was none before': 'ATTRACTION',
    'someone notices they are being watched by a person whose opinion they did not realize they cared about': 'ATTRACTION',
    'someone catches themselves smiling without having decided to': 'ATTRACTION',
    // LOYALTY
    'someone defends another person in a small way that the person being defended does not notice': 'LOYALTY',
    'a gesture of casual trust — handing something over, turning their back — passes without comment but is noticed': 'LOYALTY',
    'loyalty is tested and the result is ambiguous — not a betrayal, but not reassuring either': 'LOYALTY',
    // WATCHED
    'a creeping sense of being watched or judged settles in without evidence': 'WATCHED',
    'something about the environment suggests recent disturbance — but by what': 'WATCHED',
    'something in the environment indicates that someone or something else has been here recently': 'WATCHED',
    // SCHEME
    'a piece of information that was given casually turns out to have been incomplete': 'SCHEME',
    'something thought to be broken turns out to have been deliberately disabled': 'SCHEME',
    'a source of information that was trusted shows signs of unreliability': 'SCHEME',
    // LURKING
    'a detail of the surroundings that was always there suddenly feels ominous in context': 'LURKING',
    'the space feels like it is not meant for the people currently in it': 'LURKING',
    'a smell arrives that does not belong and its source is not immediately obvious': 'LURKING',
    // APPROACHING
    'a sound from outside the immediate scene suggests something is wrong elsewhere': 'APPROACHING',
    'news from elsewhere changes the context of what is happening here': 'APPROACHING',
    'the external situation is less stable than the characters assumed it to be': 'APPROACHING',
    // STRANGER
    'a visitor or newcomer brings energy that shifts the mood positively': 'STRANGER',
    'a visitor or newcomer brings tension from elsewhere into the current scene': 'STRANGER',
    'someone from outside arrives and their presence complicates the existing dynamic': 'STRANGER',
    // SUPPRESSED
    'someone notices they are performing an emotion they do not actually feel': 'SUPPRESSED',
    'a moment of self-awareness arrives at an inconvenient time': 'SUPPRESSED',
    'someone catches themselves performing for another person and does not like it': 'SUPPRESSED',
    // TEMPTATION
    'a want surfaces that someone knows they should not indulge': 'TEMPTATION',
    'someone allows themselves to want something they had been pretending not to care about': 'TEMPTATION',
    // HOPE
    'a possibility no one dared to voice starts to look real': 'HOPE',
    'a weight that has been present for a while lifts slightly without obvious cause': 'HOPE',
    'news arrives from elsewhere and it is better than expected': 'HOPE',
    // OLDWOUND
    'something small — a sound, a smell, a texture — triggers an unwelcome memory': 'OLDWOUND',
    'an old grief is reactivated by something that should not have been able to reach it': 'OLDWOUND',
    // ANTICIPATION
    'thoughts of something ahead begin to crowd out the present moment — pleasantly': 'ANTICIPATION',
    'an external event creates a brief window of opportunity': 'ANTICIPATION',
    'something that was expected to arrive from outside arrives early and in good condition': 'ANTICIPATION',
    // ── wave 2 ──
    // PROMISE
    'a small promise is made almost in passing': 'PROMISE',
    'an external obligation resurfaces at an inconvenient time': 'PROMISE',
    // DRIFT
    'someone adjusts their behavior around a specific person in a way that suggests avoidance': 'DRIFT',
    'a brief exchange carries an edge that was not there before': 'DRIFT',
    'someone notices they have been excluded from something small but deliberate': 'DRIFT',
    // JEALOUSY
    'someone\'s attention lingers on a third party a moment too long': 'JEALOUSY',
    'a nickname or inside reference is used for the first time and it lands well': 'JEALOUSY',
    'two people find themselves unexpectedly aligned by a shared reaction': 'JEALOUSY',
    // RIVALRY
    'two people reach for the same moment of authority and the overlap is noticeable': 'RIVALRY',
    'two people want the same thing and there is not enough of it for both': 'RIVALRY',
    // SECRET
    'something that was not meant to be found is found': 'SECRET',
    'someone overhears something about themselves that was not meant for them': 'SECRET',
    // GUARDIAN
    'a small act of consideration from an unexpected source shifts the mood between people': 'GUARDIAN',
    'someone outside the current circle does something that benefits those inside it without knowing': 'GUARDIAN',
    // POWERSHIFT
    'a gesture meant to be comforting lands as patronizing': 'POWERSHIFT',
    'someone adjusts their behavior slightly to accommodate another person without being asked': 'POWERSHIFT',
    // SHAREDPAST
    'two people discover a shared experience neither of them talks about and the recognition is mutual': 'SHAREDPAST',
    'someone recognizes something they have seen before in a completely different context': 'SHAREDPAST',
    // UNSUNG
    'someone quietly does more than their share, and no one seems to notice': 'UNSUNG',
    'someone stands up for another person in a context where doing so costs them something': 'UNSUNG',
    'someone takes a visible risk on behalf of another person without being sure it will be appreciated': 'UNSUNG',
    // TRIANGLE
    'a third person becomes involved in a dynamic between two others and the triangle creates pressure': 'TRIANGLE',
    'a third person says something about the relationship between two others that reframes how they see each other': 'TRIANGLE',
    // PASTMYSTERY
    'something written, carved, or left behind by someone else proves relevant': 'PASTMYSTERY',
    'something written, carved, or left behind by someone else is discovered and its content is troubling': 'PASTMYSTERY',
    'a piece of old information proves unexpectedly current': 'PASTMYSTERY',
    // REPUTATION
    'someone discovers they have been talked about in a way that changes how they feel about the speaker': 'REPUTATION',
    'a sound from outside the immediate scene suggests something is going well elsewhere': 'REPUTATION',
    // RELIC
    'an object is discovered whose function or value was not initially apparent': 'RELIC',
    'an object is discovered in a place it should not be, and its presence implies something troubling': 'RELIC',
    // POLITICS
    'something changes in the broader situation that slightly eases local pressure': 'POLITICS',
    'something changes in the broader situation that increases local pressure': 'POLITICS',
    // DEPLETION
    'a resource that depended on external supply is cut off or reduced': 'DEPLETION',
    'something expected from outside is delayed or does not arrive': 'DEPLETION',
    // MESSAGE
    'a message arrives that raises more questions than it answers': 'MESSAGE',
    'a message or signal arrives from outside that is reassuring': 'MESSAGE',
    'a message or signal arrives from outside and its content is unwelcome': 'MESSAGE',
    // LEAK
    'a piece of information that was being kept from someone is about to reach them through other channels': 'LEAK',
    'someone not involved in the scene makes a decision that affects those who are': 'LEAK',
    'a piece of information arrives casually that turns out to matter': 'LEAK',
    // ODDPLACE
    'the quality of light in the space changes in a way that makes everything feel wrong': 'ODDPLACE',
    'a familiar environment reveals a detail that has always been there but was never noticed': 'ODDPLACE',
    // TRACES
    'the environment reveals that someone or something has been here before and left something useful behind': 'TRACES',
    'a path or passage that was obscured becomes visible': 'TRACES',
    'a path or passage that was accessible becomes blocked or less certain': 'TRACES',
    // WORLDSHIFT
    'something in the environment begins to change faster than expected and the change is not favorable': 'WORLDSHIFT',
    'something growing — a plant, a pattern, a change — indicates the environment is healthy': 'WORLDSHIFT',
    // BREAKING
    'someone realizes they have been clenching their jaw or fists without noticing': 'BREAKING',
    'a familiar coping mechanism fails to provide its usual relief': 'BREAKING',
    // GUILT
    'guilt arrives for something that seemed justified at the time': 'GUILT',
    'someone does something well-intentioned that makes things significantly worse for the other person': 'GUILT',
    'someone realizes their motivation for something they are doing is not what they told themselves it was': 'GUILT',
    // AMBITION
    'a small accomplishment provides a disproportionate sense of satisfaction': 'AMBITION',
    'someone finds they are capable of something they genuinely believed they could not do': 'AMBITION',
    'a resource or option that was not considered turns out to be available': 'AMBITION',
    // CHANGING
    'someone realizes they trust their own judgment more than they used to': 'CHANGING',
    'someone recognizes a pattern in their own behavior and does not like what it means': 'CHANGING',
    // LONGING
    'something small — a sound, a smell, a texture — triggers a genuinely pleasant memory': 'LONGING',
    'a familiar comfort — a habit, a ritual, a place — provides its usual reassurance': 'LONGING',
    'a feeling of belonging settles in at an unexpected moment': 'LONGING',
    // FEAR
    'a familiar anxiety surfaces without an obvious trigger': 'FEAR',
    'someone discovers they are afraid of something they did not know they were afraid of': 'FEAR',
    'someone realizes they are less afraid than they expected to be': 'FEAR',
    // INSPIRATION
    'a moment of beauty in the environment registers even through distraction': 'INSPIRATION',
    'a skill or ability that someone has turns out to have an application no one had considered': 'INSPIRATION',
    'a familiar thing is seen from a new angle and the new angle reveals something': 'INSPIRATION',
    // SELFDOUBT
    'a thought arrives uninvited: what if this does not work': 'SELFDOUBT',
    'someone catches themselves rehearsing a conversation that has not happened yet': 'SELFDOUBT',
    'an assumption that was about to be acted on is corrected just in time': 'SELFDOUBT',
    // ENVY
    'a moment of envy arrives that feels ugly and cannot be easily dismissed': 'ENVY',
    'a moment of pride — earned, not performed — arrives quietly': 'ENVY',
    'someone recognizes growth in themselves without having to be told': 'ENVY',
    // HEALING
    'an old wound stops hurting in a way that is noticeable': 'HEALING',
    'someone realizes they no longer need something they used to depend on': 'HEALING',
    'an emotional pattern that has been repeating finally breaks in a small but real way': 'HEALING',
};

// THREAD_PAYOFFS[themeId] = { pos: { SCALEID: [...] }, neg: { SCALEID: [...] } }
// Valence is decided at fire time by the normal roll — the seed never knows
// which way its gun points.
const THREAD_PAYOFFS = {
    SUSPICION: {
        pos: {
            MINOR: [
                'the suspicious behavior gets an innocent explanation offered casually, before anyone even asked',
            ],
            TURNING: [
                'the behavior that looked like deceit is revealed as clumsy protection',
                'the thing someone seemed to be hiding turns out to be a surprise prepared in their favor',
            ],
            MAJOR: [
                'the long-suspected person proves their innocence in a way that also reveals how much they quietly did to help',
            ],
        },
        neg: {
            MINOR: [
                'a slip in someone\'s story confirms that something is being hidden',
            ],
            TURNING: [
                'the small evasions finally connect: someone has been hiding something, and the hiding was deliberate',
                'a caught lie confirms that the earlier unease was never paranoia',
            ],
            MAJOR: [
                'the person whose behavior kept ringing false is revealed to have been working against someone',
            ],
        },
    },
    UNSPOKEN: {
        pos: {
            MINOR: [
                'a small piece of the unsaid thing finally gets spoken',
            ],
            TURNING: [
                'the thing that kept almost being said is finally said plainly, without armor',
            ],
            MAJOR: [
                'a conversation that was postponed for too long finally happens',
            ],
        },
        neg: {
            MINOR: [
                'the unsaid thing surfaces sideways',
            ],
            TURNING: [
                'the words that were swallowed too many times finally erupt harsher and less fair than they would have been said in time',
                'someone else says aloud the thing two people were carefully not saying',
            ],
            MAJOR: [
                'the unsaid thing has quietly made an irreversible decision for someone',
            ],
        },
    },
    CLOSENESS: {
        pos: {
            MINOR: [
                'a small gesture lands with unexpected weight',
            ],
            TURNING: [
                'all the small accumulated gestures suddenly add up',
                'a moment of need reveals how well someone has come to know another person',
            ],
            MAJOR: [
                'what has been growing in small steps is finally named',
            ],
        },
        neg: {
            MINOR: [
                'a small step closer is met with a polite, but unmistakable step back',
            ],
            TURNING: [
                'the growing closeness frightens someone into pulling back exactly when the other person reached out',
            ],
            MAJOR: [
                'the closeness that was quietly building is noticed by someone who has reasons to want it stopped',
            ],
        },
    },
    ATTRACTION: {
        pos: {
            MINOR: [
                'a brief, deniable look is returned',
            ],
            TURNING: [
                'a slip (a touch held too long, a look not disguised in time, etc) quietly confesses what someone has been hiding, and it is not unwelcome',
            ],
            MAJOR: [
                'the hidden feeling is confessed outright, and the answer is better than the one rehearsed',
            ],
        },
        neg: {
            MINOR: [
                'the hidden feeling almost shows itself',
            ],
            TURNING: [
                'the concealed feeling is noticed by the wrong person first, and they now hold it like a card',
            ],
            MAJOR: [
                'the hidden feeling breaks out at the worst possible moment, in front of the worst possible audience',
            ],
        },
    },
    LOYALTY: {
        pos: {
            MINOR: [
                'a small chance to walk away is quietly declined',
            ],
            TURNING: [
                'when staying finally costs something real, someone stays without weighing it',
            ],
            MAJOR: [
                'a choice arrives where betrayal would be easy, profitable, and unprovable, and it is refused without hesitation',
            ],
        },
        neg: {
            MINOR: [
                'a small promise is bent in a way that sets a precedent',
            ],
            TURNING: [
                'under real pressure, the ambiguous loyalty finally tips, and not in their favor',
            ],
            MAJOR: [
                'the accumulated small evasions were the pattern of someone positioning themselves, and they have now chosen their moment',
            ],
        },
    },
    WATCHED: {
        pos: {
            MINOR: [
                'a trace of the watcher is found, and oddly, it points to care rather than menace',
            ],
            TURNING: [
                'the presence that kept registering at the edge of awareness reveals itself, and it has been keeping them safe',
            ],
            MAJOR: [
                'the watcher steps into the open with an offer: they have seen everything, and what they saw convinced them to help',
            ],
        },
        neg: {
            MINOR: [
                'fresh evidence confirms it: someone was here, watching, and recently',
            ],
            TURNING: [
                'the watcher stops hiding: the surveillance was real, and it was preparation',
                'evidence surfaces of how long and how closely someone has been observed, and how much the watcher now knows',
            ],
            MAJOR: [
                'everything the watcher gathered is used at once, and every unguarded moment turns out to have been inventory',
            ],
        },
    },
    SCHEME: {
        pos: {
            MINOR: [
                'a small obstacle turns out to have been cleared in advance — by whom is unclear',
            ],
            TURNING: [
                'the hidden hand behind recent events is revealed to have been clearing obstacles from the characters\' path',
            ],
            MAJOR: [
                'the plan that was quietly steering events is exposed in time to turn it against its author',
            ],
        },
        neg: {
            MINOR: [
                'another coincidence lands a little too conveniently, and a pattern begins to show',
            ],
            TURNING: [
                'the coincidences stop being deniable: someone has been arranging events, and the arrangement is not finished',
            ],
            MAJOR: [
                'the shape of someone else\'s plan becomes visible at the moment it closes — the characters were placed exactly where they now stand',
            ],
        },
    },
    LURKING: {
        pos: {
            MINOR: [
                'one unsettling sign finds a mundane explanation',
            ],
            TURNING: [
                'the source of the unease is finally found, and it is a problem that can actually be solved',
            ],
            MAJOR: [
                'the lurking presence reveals itself as a guardian: the signs were not stalking, they were watch being kept',
            ],
        },
        neg: {
            MINOR: [
                'the signs multiply: whatever is out there is closer than it was',
            ],
            TURNING: [
                'the wrongness that kept accumulating in small signs finally shows its source, and it is closer than anyone guessed',
            ],
            MAJOR: [
                'the threat that announced itself in hints arrives in full, and the hints turn out to have been generous warning',
            ],
        },
    },
    APPROACHING: {
        pos: {
            MINOR: [
                'word arrives that what is coming may be less dire than feared',
            ],
            TURNING: [
                'what was approaching arrives, and it is an opportunity wearing the shape everyone feared',
            ],
            MAJOR: [
                'the long-dreaded arrival happens, and it brings the one thing no one dared to expect: help',
            ],
        },
        neg: {
            MINOR: [
                'word arrives that what is coming is closer than anyone thought',
            ],
            TURNING: [
                'what was approaching arrives ahead of every estimate, and the remaining preparations no longer matter',
            ],
            MAJOR: [
                'the approaching thing arrives, and it is larger than the version everyone prepared for',
            ],
        },
    },
    STRANGER: {
        pos: {
            MINOR: [
                'the newcomer does something small that suggests their intentions are better than their manner',
            ],
            TURNING: [
                'the stranger\'s hidden motive is revealed to be a good one, and their skills land exactly where the gaps are',
            ],
            MAJOR: [
                'the newcomer turns out to be connected to the characters in a way that changes what their arrival means',
            ],
        },
        neg: {
            MINOR: [
                'the newcomer is caught in a small inconsistency about who they are',
            ],
            TURNING: [
                'the newcomer\'s real errand surfaces, and it involves those present far more than they were told',
            ],
            MAJOR: [
                'the stranger\'s true allegiance is revealed, and every conversation they witnessed is now in enemy hands',
            ],
        },
    },
    SUPPRESSED: {
        pos: {
            MINOR: [
                'the held-back feeling slips out in a small, survivable way',
            ],
            TURNING: [
                'the mask slips, and the real feeling underneath is met with more grace than the performance ever earned',
            ],
            MAJOR: [
                'the long-suppressed feeling is finally released by choice, not by breaking',
            ],
        },
        neg: {
            MINOR: [
                'the performance slips for a moment',
            ],
            TURNING: [
                'the performed calm finally fails in front of exactly the person it was maintained for',
            ],
            MAJOR: [
                'the suppressed feeling has been leaking into choices for a while, and the cumulative damage becomes visible all at once',
            ],
        },
    },
    TEMPTATION: {
        pos: {
            MINOR: [
                'the want is looked at honestly for a moment, and it loosens its grip slightly',
            ],
            TURNING: [
                'the temptation is faced directly and refused, and the refusal returns a sense of self that had been eroding',
            ],
            MAJOR: [
                'the forbidden want turns out to be pointing at a real need, and a legitimate way to meet it is found',
            ],
        },
        neg: {
            MINOR: [
                'a small step is taken toward the thing that should be refused',
            ],
            TURNING: [
                'the resisted want wins a small battle, and the small surrender makes the next one easier',
            ],
            MAJOR: [
                'the temptation is finally indulged in full, and the cost lands on someone who did not choose it',
            ],
        },
    },
    HOPE: {
        pos: {
            MINOR: [
                'a small sign suggests the fragile hope is standing on something real',
            ],
            TURNING: [
                'the possibility no one dared to lean on takes weight, and holds',
            ],
            MAJOR: [
                'the fragile hope is confirmed beyond doubt, and everything that was endured on its account gains meaning',
            ],
        },
        neg: {
            MINOR: [
                'a small crack appears in the thing the hope was resting on',
            ],
            TURNING: [
                'the hope collapses quietly, without drama — which somehow makes it worse',
            ],
            MAJOR: [
                'the hoped-for thing happens, and turns out to be nothing like what the hoping made of it',
            ],
        },
    },
    OLDWOUND: {
        pos: {
            MINOR: [
                'the old ache is brushed against, and for once it stings less than expected',
            ],
            TURNING: [
                'the old wound is touched gently, deliberately, by someone who wants to understand, and it does not hurt the way it used to',
            ],
            MAJOR: [
                'the person or truth at the root of the old wound returns, and offers an ending the wound never had',
            ],
        },
        neg: {
            MINOR: [
                'the old ache is brushed against carelessly, and it flares',
            ],
            TURNING: [
                'the old wound is struck precisely, by someone who could only have known where it was if they had been told',
            ],
            MAJOR: [
                'the past behind the old pain surfaces in full, and it demands to be dealt with in the present',
            ],
        },
    },
    ANTICIPATION: {
        pos: {
            MINOR: [
                'a small confirmation arrives: the awaited thing is really happening',
            ],
            TURNING: [
                'the awaited thing arrives, and it is better in the one way no one thought to imagine',
            ],
            MAJOR: [
                'the long-anticipated moment arrives and delivers, and shared joy turns out to be its largest part',
            ],
        },
        neg: {
            MINOR: [
                'a small detail about the awaited thing lands wrong and plants a doubt',
            ],
            TURNING: [
                'the awaited thing arrives wrong: recognizable, but bent out of the shape it was loved for',
            ],
            MAJOR: [
                'the anticipation is revealed to have been engineered — someone needed the characters looking forward, not around',
            ],
        },
    },
    // ── wave 2 ──
    PROMISE: {
        pos: {
            MINOR: ['a small promise is remembered and kept without being reminded'],
            TURNING: ['a promise comes due at the worst possible time, and is kept anyway'],
            MAJOR: ['an old promise is honored at real cost, and honoring it changes what the person\'s word is worth'],
        },
        neg: {
            MINOR: ['a small promise quietly slips'],
            TURNING: ['a promise comes due, and the person who gave it starts negotiating with themselves about what it really meant'],
            MAJOR: ['a promise that someone built plans around is broken, and the wreckage is not limited to the promise'],
        },
    },
    DRIFT: {
        pos: {
            MINOR: ['a small distance between two people is noticed, and one of them closes it with a deliberate step'],
            TURNING: ['the drift is named out loud, and naming it turns out to be the first step back'],
            MAJOR: ['two people who were quietly losing each other choose, visibly and at cost, not to'],
        },
        neg: {
            MINOR: ['another small distance opens — an unanswered remark, a shortened evening'],
            TURNING: ['someone realizes the distance has grown while they were not looking, and the usual bridges no longer reach'],
            MAJOR: ['the drift completes itself: two people discover they have become strangers with a shared history'],
        },
    },
    JEALOUSY: {
        pos: {
            MINOR: ['a flash of jealousy is caught, examined, and set down before it does damage'],
            TURNING: ['jealousy forces a conversation that turns out to be about something much older than its trigger'],
            MAJOR: ['a jealousy faced honestly transforms into clarity about what someone actually wants, and they act on it'],
        },
        neg: {
            MINOR: ['a small remark lands wrong, and its aftertaste is unmistakably jealous'],
            TURNING: ['jealousy stops whispering and starts steering — a choice is made that would not have been made without it'],
            MAJOR: ['an accusation born of jealousy is spoken aloud and cannot be taken back — whether or not it was true'],
        },
    },
    RIVALRY: {
        pos: {
            MINOR: ['a small contest ends with grudging respect on both sides'],
            TURNING: ['rivals are forced onto the same side, and the rivalry turns out to translate into fluency — they know each other\'s moves'],
            MAJOR: ['a rivalry resolves into something neither expected: not victory, but partnership on equal terms'],
        },
        neg: {
            MINOR: ['a small win is taken a little too visibly, and the loser keeps score'],
            TURNING: ['the rivalry escalates past the point where both can pretend it is friendly'],
            MAJOR: ['the rivalry costs something that mattered more than winning'],
        },
    },
    SECRET: {
        pos: {
            MINOR: ['a corner of someone\'s secret shows, and it looks more sad than sinister'],
            TURNING: ['the secret comes out on its keeper\'s own terms, and telling it turns out to be an act of trust'],
            MAJOR: ['the secret is revealed and it recasts its keeper as someone who was carrying weight for others all along'],
        },
        neg: {
            MINOR: ['someone almost stumbles onto the secret, and its keeper reacts a beat too fast'],
            TURNING: ['the secret escapes sideways — half-revealed, at the wrong moment, to the wrong audience'],
            MAJOR: ['the secret detonates in full, and the damage spreads to people who never knew it existed'],
        },
    },
    GUARDIAN: {
        pos: {
            MINOR: ['another small kindness lands from nowhere — the pattern is starting to show'],
            TURNING: ['the quiet protector is glimpsed at work, and chooses not to deny it'],
            MAJOR: ['the full extent of someone\'s quiet protection is revealed, and it is far larger than anyone imagined'],
        },
        neg: {
            MINOR: ['a small intervention meant to protect is noticed, and reads as control'],
            TURNING: ['the quiet protection is discovered, and the protected person\'s first feeling is not gratitude but violation'],
            MAJOR: ['the protection is withdrawn — deliberately — and its absence shows how much was being held back'],
        },
    },
    POWERSHIFT: {
        pos: {
            MINOR: ['a small deference goes the other way for once'],
            TURNING: ['the balance between two people shifts in the open, and both find they prefer the new arrangement'],
            MAJOR: ['a relationship built on unequal footing finds level ground, and what stands on it is stronger'],
        },
        neg: {
            MINOR: ['a small decision is made over someone\'s head'],
            TURNING: ['the balance tips: one person now needs the other more, and both are recalibrating around that fact'],
            MAJOR: ['the power in a relationship consolidates entirely on one side, and the other side realizes it too late'],
        },
    },
    SHAREDPAST: {
        pos: {
            MINOR: ['a small overlap in two people\'s histories surfaces and makes the present easier'],
            TURNING: ['the shared past comes into focus, and it explains things both people had misread about each other'],
            MAJOR: ['the shared history turns out to run deeper than either knew, and it binds rather than divides'],
        },
        neg: {
            MINOR: ['a name from the past is mentioned, and two people\'s reactions do not match'],
            TURNING: ['the shared past surfaces with an unpaid debt attached, and someone has come to collect'],
            MAJOR: ['the shared past is revealed to contain something one of them did to the other — before they knew each other\'s faces'],
        },
    },
    UNSUNG: {
        pos: {
            MINOR: ['a small unnoticed effort finally catches someone\'s eye'],
            TURNING: ['the quiet work is acknowledged in front of the people whose opinion matters'],
            MAJOR: ['the full scale of someone\'s unrecognized contribution comes to light, and it rewrites how they are seen'],
        },
        neg: {
            MINOR: ['credit for a small thing quietly goes to the wrong person'],
            TURNING: ['the unrecognized effort curdles: someone stops doing the invisible work, and its absence is felt immediately'],
            MAJOR: ['years of unacknowledged contribution surface as a ledger of resentment — presented all at once'],
        },
    },
    TRIANGLE: {
        pos: {
            MINOR: ['the third presence recedes a step'],
            TURNING: ['the triangle resolves without a villain: someone chooses, someone accepts, and the honesty spares all three'],
            MAJOR: ['what looked like a triangle turns out to be something else entirely, and the truth dissolves the rivalry'],
        },
        neg: {
            MINOR: ['a small warmth toward the third person is noticed by exactly the wrong observer'],
            TURNING: ['the triangle forces a choice no one is ready to make, and not choosing is also a choice'],
            MAJOR: ['the triangle collapses and takes both relationships with it'],
        },
    },
    PASTMYSTERY: {
        pos: {
            MINOR: ['a small piece of the past clicks into place, and the picture is kinder than feared'],
            TURNING: ['an old question finds its answer, and the answer restores something that was thought lost'],
            MAJOR: ['the buried past surfaces in full, and it vindicates someone the present had misjudged'],
        },
        neg: {
            MINOR: ['a detail from the past refuses to fit the accepted story'],
            TURNING: ['the past surfaces with names and dates, and the accepted story does not survive contact with it'],
            MAJOR: ['the buried truth climbs out whole, and the present is rearranged around what actually happened'],
        },
    },
    REPUTATION: {
        pos: {
            MINOR: ['a kind word said elsewhere makes its way back'],
            TURNING: ['a reputation arrives ahead of its owner, and opens a door that skill alone would not have'],
            MAJOR: ['a name long dismissed is publicly restored, and the restoration changes what its bearer can do'],
        },
        neg: {
            MINOR: ['a version of events is circulating that is not quite the truth'],
            TURNING: ['the rumor reaches someone whose opinion has consequences, and they act on it without checking'],
            MAJOR: ['a reputation collapses on the strength of a story that is only half true, and the half that is true is enough'],
        },
    },
    RELIC: {
        pos: {
            MINOR: ['the found object gives up a small clue about where it has been'],
            TURNING: ['the object\'s history surfaces, and it turns out to have been meant for exactly this situation'],
            MAJOR: ['the found thing is revealed as a key — to a place, a claim, or a promise someone left behind'],
        },
        neg: {
            MINOR: ['the found object shows a detail that suggests its story is not finished'],
            TURNING: ['the object\'s previous owner turns out to exist, and to want it back'],
            MAJOR: ['the found thing is revealed as the reason everything around it keeps going wrong, and it has been carried willingly'],
        },
    },
    POLITICS: {
        pos: {
            MINOR: ['a small shift in distant power ripples down as breathing room'],
            TURNING: ['the powers that be rearrange themselves, and a door that was sealed now stands ajar'],
            MAJOR: ['the order everyone was navigating around collapses, and what replaces it is no worse'],
        },
        neg: {
            MINOR: ['a small shift in distant power ripples down as new paperwork, new suspicion, new eyes'],
            TURNING: ['the powers that be rearrange themselves, and yesterday\'s safe positions are today\'s exposed ones'],
            MAJOR: ['the new order arrives with a list, and names connected to the characters are on it'],
        },
    },
    DEPLETION: {
        pos: {
            MINOR: ['the dwindling supply is noticed early enough to matter'],
            TURNING: ['a substitute for the dwindling resource is found — imperfect, but workable'],
            MAJOR: ['the scarcity that was quietly shaping every plan is broken by a new source no one expected'],
        },
        neg: {
            MINOR: ['the supply is thinner than the last time anyone checked'],
            TURNING: ['the resource runs low enough that plans start bending around its absence'],
            MAJOR: ['the resource runs out at the moment of greatest need, and the plans built on it fall together'],
        },
    },
    MESSAGE: {
        pos: {
            MINOR: ['the confusing message yields a small piece of sense — enough to act on'],
            TURNING: ['the message finds its true recipient at last, and its meaning lands intact'],
            MAJOR: ['the message, finally understood, turns out to have been a warning generous enough to still be useful'],
        },
        neg: {
            MINOR: ['part of the message is missing — and the missing part is the part that mattered'],
            TURNING: ['the message is understood too late, or by the wrong person first'],
            MAJOR: ['the message was bait, and its answer told someone everything they needed to know'],
        },
    },
    LEAK: {
        pos: {
            MINOR: ['a piece of information moved when no one moved it'],
            TURNING: ['the leak is traced, and it turns out to be carelessness, not betrayal — fixable, forgivable'],
            MAJOR: ['the leak is found and turned: what flows through it now is exactly what its listeners deserve'],
        },
        neg: {
            MINOR: ['something said in private comes back from outside'],
            TURNING: ['the leak is confirmed: someone inside is talking, and the circle of trust redraws itself smaller'],
            MAJOR: ['the leak\'s full harvest is revealed — every private plan, delivered to the people it was hidden from'],
        },
    },
    ODDPLACE: {
        pos: {
            MINOR: ['the wrongness of the place resolves into a detail with a harmless explanation — mostly'],
            TURNING: ['the place\'s strangeness turns out to be a message: something happened here, and knowing it helps'],
            MAJOR: ['the unease of the place breaks open into revelation — it was strange because it was protecting something'],
        },
        neg: {
            MINOR: ['the place adds another small wrongness to its collection'],
            TURNING: ['the place\'s strangeness stops being background: it is active, and it has noticed its guests'],
            MAJOR: ['the place shows what it truly is, and every earlier oddity becomes, in hindsight, a warning'],
        },
    },
    TRACES: {
        pos: {
            MINOR: ['the trace yields a detail about who passed here, and the detail is reassuring'],
            TURNING: ['the trail is followed to its maker, and the meeting is worth the walk'],
            MAJOR: ['the traces converge into a message left deliberately — help, from someone who could not stay'],
        },
        neg: {
            MINOR: ['a fresh trace appears where none should be'],
            TURNING: ['the traces are read at last, and whoever left them was circling, not passing through'],
            MAJOR: ['the maker of the traces steps out of them, and they have been waiting'],
        },
    },
    WORLDSHIFT: {
        pos: {
            MINOR: ['the slow change shows a small sign of being a change for the better'],
            TURNING: ['the slow change reaches a threshold and tips visibly toward renewal'],
            MAJOR: ['the transformation completes, and the world on the far side of it has room in it for the characters'],
        },
        neg: {
            MINOR: ['the slow change is measurably further along than last time'],
            TURNING: ['the slow change reaches a threshold, and things that worked yesterday stop working'],
            MAJOR: ['the transformation completes, and the world it produces has different rules — learned the hard way'],
        },
    },
    BREAKING: {
        pos: {
            MINOR: ['the pressure vents a little — a small honest admission instead of a crack'],
            TURNING: ['the breaking point arrives and is survived — with help that was almost not asked for'],
            MAJOR: ['the collapse finally comes, and it clears space for something to be rebuilt on honest ground'],
        },
        neg: {
            MINOR: ['the hands are steady, but the small tells are multiplying'],
            TURNING: ['the composure fails in a moment that demanded it most'],
            MAJOR: ['the breakdown arrives at full force, and it does not choose a private moment'],
        },
    },
    GUILT: {
        pos: {
            MINOR: ['the guilt is spoken in a small, sideways way, and the world does not end'],
            TURNING: ['the guilt is finally confessed to the person it concerns, and the answer is not what was feared'],
            MAJOR: ['a real amends is made — costly, uncomfortable, and it actually closes the wound'],
        },
        neg: {
            MINOR: ['a small reminder brushes the guilt awake'],
            TURNING: ['the guilt starts making decisions — overcorrections, avoidances, small dishonesties of kindness'],
            MAJOR: ['the concealed guilt is exposed by someone else before it could be confessed, and the concealment now looks like the crime'],
        },
    },
    AMBITION: {
        pos: {
            MINOR: ['a small step toward the dream succeeds, and the dream stops feeling theoretical'],
            TURNING: ['a real door opens toward the ambition, and it is walked through in front of witnesses'],
            MAJOR: ['the dream arrives — different than imagined, but recognizably itself, and it was worth it'],
        },
        neg: {
            MINOR: ['a small setback nicks the ambition, and the nick shows'],
            TURNING: ['the ambition demands its first real payment, and the price is a relationship, a principle, or rest'],
            MAJOR: ['the summit is reached and found bare: the dream cost exactly what everyone warned it would'],
        },
    },
    CHANGING: {
        pos: {
            MINOR: ['an old reflex misfires — the person has changed more than their habits know'],
            TURNING: ['the change is tested by an old situation, and the new self holds'],
            MAJOR: ['the person who began this story could not have done what this one just did'],
        },
        neg: {
            MINOR: ['an old reflex fires perfectly — the change is thinner than hoped'],
            TURNING: ['the change frightens someone close to the person changing — they preferred who came before'],
            MAJOR: ['the change completes, and something loved about the old self did not survive the crossing'],
        },
    },
    LONGING: {
        pos: {
            MINOR: ['the longed-for thing sends a small emissary — a taste, a sound, a familiar phrase'],
            TURNING: ['a piece of what was missed is actually recovered — smaller than memory made it, and still enough'],
            MAJOR: ['the return finally happens, and the longing turns out to have kept something alive rather than embalmed it'],
        },
        neg: {
            MINOR: ['the longing sharpens on contact with a reminder'],
            TURNING: ['the longed-for thing is revealed to have changed — the place, the person, the time is not waiting'],
            MAJOR: ['the return finally happens, and what is found there proves the longing was for something that no longer exists'],
        },
    },
    FEAR: {
        pos: {
            MINOR: ['the fear is said out loud for the first time, and shrinks slightly in the open air'],
            TURNING: ['the feared thing is met at last, and it is survivable — barely, but survivably'],
            MAJOR: ['the fear is walked through entirely, and on the far side the person finds it no longer votes'],
        },
        neg: {
            MINOR: ['the fear finds one more piece of evidence for its case'],
            TURNING: ['the fear begins making choices — routes not taken, words not said, doors not opened'],
            MAJOR: ['the feared thing arrives, and it is shaped exactly like the fear said it would be'],
        },
    },
    INSPIRATION: {
        pos: {
            MINOR: ['a small spark catches: an idea that refuses to be put down'],
            TURNING: ['the inspiration produces its first real result, and the result is better than the idea'],
            MAJOR: ['the inspired work is finished, and it outlives the mood that made it'],
        },
        neg: {
            MINOR: ['the spark gutters against the day\'s demands'],
            TURNING: ['the inspiration demands more than the schedule, the body, or the people around it can give'],
            MAJOR: ['the inspired work consumes its maker\'s reserves and is abandoned at the worst possible stage — visible, unfinished, and loud'],
        },
    },
    SELFDOUBT: {
        pos: {
            MINOR: ['a small decision made despite the doubt turns out to be right'],
            TURNING: ['the doubted judgment is vindicated in the open, in a way even the doubter cannot argue with'],
            MAJOR: ['the doubt is confronted at its root, and what stands after is not confidence but something sturdier: self-knowledge'],
        },
        neg: {
            MINOR: ['the doubt collects one more small confirmation'],
            TURNING: ['the doubt causes a hesitation at a moment that punished hesitation'],
            MAJOR: ['the doubt proves self-fulfilling: the failure it predicted arrives because it was predicted'],
        },
    },
    ENVY: {
        pos: {
            MINOR: ['the envy is caught in the act and named privately for what it is'],
            TURNING: ['the envy, examined, turns out to be a map: it points precisely at what someone actually wants'],
            MAJOR: ['the envied person and the envier end up on the same side, and the envy converts into drive without the poison'],
        },
        neg: {
            MINOR: ['a small success nearby lands like a small insult'],
            TURNING: ['the envy leaks into behavior — a withheld congratulation, a qualified compliment, a quiet sabotage of joy'],
            MAJOR: ['the envy acts at last, and the act costs the envier the very standing they envied'],
        },
    },
    HEALING: {
        pos: {
            MINOR: ['what had been mending is tested lightly, and it holds'],
            TURNING: ['what was mending holds under real weight for the first time'],
            MAJOR: ['the mending finishes something no one dared call finished, and it does not give way again'],
        },
        neg: {
            MINOR: ['something that seemed mended gives a small warning that it is not'],
            TURNING: ['what was mending is leaned on too hard, too early, and it gives'],
            MAJOR: ['what had been mending fails completely, and with it the belief that it ever would'],
        },
    },
};

function getThreads() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return [];
    if (!ctx.chatMetadata.we_threads) ctx.chatMetadata.we_threads = [];
    return ctx.chatMetadata.we_threads;
}

function tickThreads() {
    const s = extension_settings[EXT];
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    const maxAge = s.threadMaxAge ?? DEFAULTS.threadMaxAge;
    const threads = getThreads();
    threads.forEach(t => t.age++);
    // не каждый взгляд — заговор: пересидевшие нити тихо умирают
    ctx.chatMetadata.we_threads = threads.filter(t => t.age <= maxAge);
    ctx.saveMetadata();
}

function maybeSeedThread(eventText) {
    const s = extension_settings[EXT];
    const themeId = THREAD_SEEDS[eventText];
    if (!themeId) return;
    const threads = getThreads();
    if (threads.length >= (s.maxThreads ?? DEFAULTS.maxThreads)) return;
    if (threads.some(t => t.id === themeId)) return;
    threads.push({ id: themeId, age: 0 });
    getContext().saveMetadata();
}

function closeThread(themeId) {
    const ctx = getContext();
    if (!ctx.chatMetadata?.we_threads) return;
    ctx.chatMetadata.we_threads = ctx.chatMetadata.we_threads.filter(t => t.id !== themeId);
    ctx.saveMetadata();
}

// ── Act three: stage chains ────────────────────────────────
// An act-2 payoff can, instead of closing its thread, transition it into a
// follow-up stage with its own bidirectional pools (valence rolled again at
// fire time). Max depth is 3 acts: seed → payoff → stage payoff → close.

const CHAIN_CHANCE = 0.6; // вероятность, что развязка откроет третий акт вместо закрытия нити

// THREAD_FOLLOWUPS[themeId][valence of act-2 payoff] = stageId
const THREAD_FOLLOWUPS = {
    LOYALTY:    { neg: 'LOYALTY_AFTERMATH' },
    SUSPICION:  { neg: 'SUSPICION_RECKONING' },
    ATTRACTION: { pos: 'ATTRACTION_BLOOM', neg: 'ATTRACTION_FALLOUT' },
    CLOSENESS:  { neg: 'CLOSENESS_OPPOSITION' },
    SCHEME:     { neg: 'SCHEME_ENDGAME' },
    WATCHED:    { neg: 'WATCHED_STRIKE' },
    SECRET:     { neg: 'SECRET_FALLOUT' },
    HOPE:       { neg: 'HOPE_ASHES' },
    BREAKING:   { neg: 'BREAKING_AFTER' },
    TEMPTATION: { neg: 'TEMPTATION_PRICE' },
    JEALOUSY:   { neg: 'JEALOUSY_RIFT' },
};

const THREAD_STAGES = {
    LOYALTY_AFTERMATH: {
        name: 'После предательства',
        payoffs: {
            pos: {
                MINOR: ['a small gesture arrives from the one who walked away — clumsy, unsigned, unmistakably theirs'],
                TURNING: ['the betrayal is explained — not excused, explained — and the explanation contains a sacrifice no one saw'],
                MAJOR: ['the one who turned away returns at the worst moment, on the right side, at real cost — actions where words would be cheap'],
            },
            neg: {
                MINOR: ['a small consequence of the broken trust surfaces in an unrelated place'],
                TURNING: ['the damage spreads: others quietly recalibrate their own loyalty against what betrayal visibly cost — nothing'],
                MAJOR: ['the betrayal turns out to have been the first move, not the last, and the second is already in motion'],
            },
        },
    },
    SUSPICION_RECKONING: {
        name: 'Расплата за обман',
        payoffs: {
            pos: {
                MINOR: ['the deceiver leaves a small opening for honesty — deliberate, or so it seems'],
                TURNING: ['confronted, the deceiver tells the whole truth at last, and it is heavier than the lie, but cleaner'],
                MAJOR: ['the reason for the deception is revealed and it was protecting the deceived — the anger has nowhere left to stand, and something gentler takes its place'],
            },
            neg: {
                MINOR: ['caught once, the deceiver adjusts — the new lies are better'],
                TURNING: ['the confrontation happens and the deceiver does not apologize — they explain why they would do it again'],
                MAJOR: ['the uncovered deception turns out to be one thread of a larger fabric, and pulling it has alerted the weaver'],
            },
        },
    },
    ATTRACTION_BLOOM: {
        name: 'Расцвет чувства',
        payoffs: {
            pos: {
                MINOR: ['a small new ritual quietly installs itself between the two — as if it had always been there'],
                TURNING: ['the new closeness survives its first real test'],
                MAJOR: ['what began as a hidden feeling settles into something with weight and a future, and both people choose it out loud'],
            },
            neg: {
                MINOR: ['the first small awkwardness arrives — the old ease has not yet learned the new shape'],
                TURNING: ['the new closeness moves faster than one of them can breathe, and the gap becomes visible'],
                MAJOR: ['the confessed feeling, now out and real, collides with something immovable — duty, history, or another person'],
            },
        },
    },
    ATTRACTION_FALLOUT: {
        name: 'Чувство в чужих руках',
        payoffs: {
            pos: {
                MINOR: ['the awkwardness thaws slightly — a look that forgives the exposure'],
                TURNING: ['the exposure, for all its cruelty, put the truth in the room, and the truth does better than the hiding did'],
                MAJOR: ['what was meant to wound by exposure instead clears the field: with nothing left to hide, something honest becomes possible'],
            },
            neg: {
                MINOR: ['the exposed feeling becomes a small currency — referenced, hinted at, never kindly'],
                TURNING: ['the one who holds the secret spends it, and the price is set by them alone'],
                MAJOR: ['the exposed feeling is used to steer its owner into a choice they would never have made freely'],
            },
        },
    },
    CLOSENESS_OPPOSITION: {
        name: 'Сближение под ударом',
        payoffs: {
            pos: {
                MINOR: ['the interference shows its hand a little too openly'],
                TURNING: ['the pressure meant to separate two people teaches them to act as one'],
                MAJOR: ['the opposition plays its strongest card and loses: the bond holds, publicly, and the matter is settled'],
            },
            neg: {
                MINOR: ['a small wedge finds a real seam'],
                TURNING: ['the interference starts working — doubts that are not native begin to grow'],
                MAJOR: ['the opposition wins a decisive round: circumstances are arranged so that staying close now costs more than one of them can pay'],
            },
        },
    },
    SCHEME_ENDGAME: {
        name: 'Эндшпиль чужого плана',
        payoffs: {
            pos: {
                MINOR: ['a small piece of the plan misfires — the first crack in its clockwork'],
                TURNING: ['the plan\'s next step is anticipated and quietly sabotaged — the schemer does not yet know'],
                MAJOR: ['the plan is turned inside out at its final step, and the trap closes on the hand that set it'],
            },
            neg: {
                MINOR: ['another piece moves into place, unremarked'],
                TURNING: ['the plan absorbs the resistance against it — it had accounted for being discovered'],
                MAJOR: ['the plan completes, and its true objective is revealed to be worse than anyone had guessed'],
            },
        },
    },
    WATCHED_STRIKE: {
        name: 'Удар наблюдателя',
        payoffs: {
            pos: {
                MINOR: ['a gap in the watcher\'s attention is found — small, but real'],
                TURNING: ['the watcher\'s next move is predicted from their own patterns — the watched have learned to watch back'],
                MAJOR: ['the strike comes and finds its target ready: everything the watcher learned was, in the end, allowed to be seen'],
            },
            neg: {
                MINOR: ['a precaution turns out to have been observed and noted'],
                TURNING: ['the first move lands exactly where the surveillance said it would hurt'],
                MAJOR: ['the strike is total: every gathered detail is spent in one coordinated blow'],
            },
        },
    },
    SECRET_FALLOUT: {
        name: 'Секрет на свободе',
        payoffs: {
            pos: {
                MINOR: ['the half-revealed secret earns a small unexpected kindness instead of judgment'],
                TURNING: ['with the secret half-out, its keeper chooses to finish the telling — on their own terms, at last'],
                MAJOR: ['the secret, fully aired, turns out to bind people closer: what it cost to keep is finally visible, and it is honored'],
            },
            neg: {
                MINOR: ['the half-known secret breeds a small wrong version of itself'],
                TURNING: ['the distorted half-truth travels faster than the correction'],
                MAJOR: ['the secret\'s exposure triggers others: vaults open one another, and no one\'s ledger stays closed'],
            },
        },
    },
    HOPE_ASHES: {
        name: 'Пепел надежды',
        payoffs: {
            pos: {
                MINOR: ['in the flat grey after the hope, one small thing still works'],
                TURNING: ['a new hope forms — smaller, unglamorous, and standing on facts this time'],
                MAJOR: ['the collapsed hope turns out to have been aimed at the wrong door: the right one opens where no one was looking'],
            },
            neg: {
                MINOR: ['a small opportunity passes unclaimed — hoping feels expensive now'],
                TURNING: ['the space where the hope lived is colonized by a hard, serviceable cynicism'],
                MAJOR: ['a decision is made from the ashes — final, defensible, and wrong in a way only the lost hope could have shown'],
            },
        },
    },
    BREAKING_AFTER: {
        name: 'После срыва',
        payoffs: {
            pos: {
                MINOR: ['the first person to mention the breakdown does it with unexpected gentleness'],
                TURNING: ['the breakdown, it turns out, gave others permission — someone else lowers their armor because they saw it survive'],
                MAJOR: ['what broke in public is rebuilt in public, and the rebuilding earns more respect than the composure ever did'],
            },
            neg: {
                MINOR: ['a small accommodation appears — well-meant, and it stings'],
                TURNING: ['the breakdown is quietly priced in: responsibilities drift away without a word being said'],
                MAJOR: ['the moment of collapse is retold by someone else, in their version, to people who matter'],
            },
        },
    },
    TEMPTATION_PRICE: {
        name: 'Цена искушения',
        payoffs: {
            pos: {
                MINOR: ['the morning after the surrender is faced squarely instead of explained away'],
                TURNING: ['the fall is named to the person it wronged, before they could find out another way'],
                MAJOR: ['the debt of the indulgence is paid in full and openly, and builds something sturdier than the innocence lost'],
            },
            neg: {
                MINOR: ['the second time asks for less justification than the first'],
                TURNING: ['covering the indulgence begins to cost more than the indulgence did'],
                MAJOR: ['the appetite, fed, has grown a schedule, and it now feeds on someone else\'s trust'],
            },
        },
    },
    JEALOUSY_RIFT: {
        name: 'Трещина после обвинения',
        payoffs: {
            pos: {
                MINOR: ['a first apology arrives — partial, awkward, and genuinely meant'],
                TURNING: ['beneath the accusation both people find the real fear, and the real fear can actually be answered'],
                MAJOR: ['the rift is repaired with better material than the original: what stands now has been tested and chosen'],
            },
            neg: {
                MINOR: ['the apology is accepted in words and filed away in fact'],
                TURNING: ['the accusation is forgiven but not forgotten, and it resurfaces armed at the next argument'],
                MAJOR: ['the accusation proves prophetic in the worst way: suspicion built the very thing it feared'],
            },
        },
    },
};

// Payoff attempt: each open thread rolls against a chance that grows with age
// and is scaled by the theme's affinity to the current mode. Staged threads
// (act three) draw from their stage pools. Returns
// { eventText, themeId, act3 } or null.
function tryThreadPayoff(modeId, scaleId, isPositive) {
    if (scaleId === 'NONE') return null;
    const threads = getThreads();
    for (const t of threads) {
        if (t.age < 3) continue; // ружьё должно повисеть — никаких развязок сразу после посева/перехода
        const theme = THREAD_THEMES.find(x => x.id === t.id);
        if (!theme) continue;
        const fromStage = !!t.stage;
        const pools = fromStage ? THREAD_STAGES[t.stage]?.payoffs : THREAD_PAYOFFS[t.id];
        if (!pools) continue;
        const pool = (isPositive ? pools.pos : pools.neg)?.[scaleId];
        if (!pool || !pool.length) continue;
        const affinity = theme.aff[modeId] ?? 1;
        const chance = Math.min(0.85, 0.1 + t.age * 0.03) * affinity;
        if (Math.random() < chance) {
            const eventText = pool[Math.floor(Math.random() * pool.length)];
            const followup = !fromStage ? THREAD_FOLLOWUPS[t.id]?.[isPositive ? 'pos' : 'neg'] : null;
            if (followup && THREAD_STAGES[followup] && Math.random() < CHAIN_CHANCE) {
                // акт 2 не закрывает нить — переводит её в третий акт
                t.stage = followup;
                t.age = 0;
                getContext().saveMetadata();
            } else {
                closeThread(t.id);
            }
            return { eventText, themeId: t.id, act3: fromStage };
        }
    }
    return null;
}

// ── Base event pools ───────────────────────────────────────
// Structure: EVENTS[scaleId][categoryId] = { positive: [...], negative: [...] }

const EVENTS = {

// ════════════════════════════════════════════════════════════
// SUBTLE
// ════════════════════════════════════════════════════════════

SUBTLE: {
    INTERPERSONAL: {
        positive: [
            'a brief exchange between two people carries more warmth than either of them expected',
            'someone remembers a small detail about another person that shows they have been paying attention',
            'a moment of shared silence between two people feels comfortable rather than awkward',
            'a gesture of casual trust — handing something over, turning their back — passes without comment but is noticed',
            'someone adjusts their behavior slightly to accommodate another person without being asked',
            'a look passes between two people that communicates something words have not yet addressed',
            'someone defends another person in a small way that the person being defended does not notice',
            'a minor disagreement resolves itself through a willingness neither party had to show',
            'two people find themselves unexpectedly aligned by a shared reaction',
            'someone asks a question that shows they understand more about another person than expected',
            'a small act of consideration from an unexpected source shifts the mood between people',
            'a nickname or inside reference is used for the first time and it lands well',
            'someone mirrors another person unconsciously — a posture, a phrase, a habit',
            'a moment of unexpected honesty slips out in casual conversation',
            'someone notices they are being watched by a person whose opinion they did not realize they cared about',
        ],
        negative: [
            'a brief exchange carries an edge that was not there before',
            'someone says the right words but the tone does not match',
            'a gesture meant to be comforting lands as patronizing',
            'two people reach for the same moment of authority and the overlap is noticeable',
            'someone hesitates before responding in a way that the other person registers',
            'a look passes between two people and one of them looks away too quickly',
            'a small promise is forgotten and the forgetting is noticed',
            'someone adjusts their behavior around a specific person in a way that suggests avoidance',
            'a joke falls flat because it accidentally touches something real',
            'two people react differently to the same thing',
            'someone overhears something about themselves that was not meant for them',
            'a moment of physical proximity creates tension where there was none before',
            'someone notices they have been excluded from something small but deliberate',
            'a question is asked that feels more like a test than genuine curiosity',
            'someone catches themselves performing for another person and does not like it',
            'someone\'s attention lingers on a third party a moment too long',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a moment of unexpected calm arrives after a period of tension',
            'something small — a sound, a smell, a texture — triggers a genuinely pleasant memory',
            'a feeling that has been sitting unnamed finally finds its shape and it is manageable',
            'someone realizes they are less afraid than they expected to be',
            'a weight that has been present for a while lifts slightly without obvious cause',
            'a moment of genuine amusement breaks through a serious mood',
            'someone notices they have been holding tension in their body and consciously releases it',
            'a familiar comfort — a habit, a ritual, a place — provides its usual reassurance',
            'someone catches themselves smiling without having decided to',
            'a thought that usually spirals into worry simply passes through without catching',
            'a small accomplishment provides a disproportionate sense of satisfaction',
            'someone realizes they trust their own judgment more than they used to',
            'a moment of beauty in the environment registers even through distraction',
            'someone accepts a compliment without deflecting it for the first time',
            'a feeling of safety settles in without needing external confirmation',
            'a possibility no one dared to voice starts to look real',
            'thoughts of something ahead begin to crowd out the present moment — pleasantly',
            'a small promise is made almost in passing',
            'someone quietly does more than their share, and no one seems to notice',
        ],
        negative: [
            'a familiar anxiety surfaces without an obvious trigger',
            'a feeling that was manageable a moment ago suddenly is not',
            'someone catches themselves rehearsing a conversation that has not happened yet',
            'a moment of stillness allows a thought that has been avoided to arrive',
            'an emotional reaction is disproportionate to what caused it and the person knows it',
            'something small — a sound, a smell, a texture — triggers an unwelcome memory',
            'a creeping sense of being watched or judged settles in without evidence',
            'someone realizes they have been clenching their jaw or fists without noticing',
            'a moment of self-awareness arrives at an inconvenient time',
            'a mood shift happens fast enough that the person experiencing it cannot hide it',
            'someone notices they are performing an emotion they do not actually feel',
            'a brief flash of anger arrives at something that does not deserve it',
            'a thought arrives uninvited: what if this does not work',
            'a familiar coping mechanism fails to provide its usual relief',
            'someone recognizes a pattern in their own behavior and does not like what it means',
            'a want surfaces that someone knows they should not indulge',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'the quality of light in the space changes in a way that makes everything feel different',
            'a sound from the environment — birdsong, rain, wind — provides an unexpected comfort',
            'the temperature shifts in a way that suits the moment',
            'a detail of the surroundings that was previously unnoticed proves useful or beautiful',
            'the space feels briefly larger or more open than it usually does',
            'a scent in the air shifts to something pleasant or grounding',
            'the environment provides a natural boundary or shelter at the right moment',
            'something in the surroundings catches light in a way that draws attention and is worth looking at',
            'the noise level drops and the quiet feels earned rather than empty',
            'a path or passage that was obscured becomes visible',
            'the weather shifts in a direction that makes the current situation easier',
            'a natural feature of the landscape offers an unexpected vantage point or advantage',
            'something growing — a plant, a pattern, a change — indicates the environment is healthy',
            'the space responds to human presence in a way that feels welcoming rather than indifferent',
            'a familiar environment reveals a detail that has always been there but was never noticed',
        ],
        negative: [
            'the quality of light in the space changes in a way that makes everything feel wrong',
            'a sound from the environment sets teeth on edge without obvious reason',
            'the temperature shifts uncomfortably and there is no easy remedy',
            'a smell arrives that does not belong and its source is not immediately obvious',
            'the space feels smaller or more enclosed than it should',
            'shadows fall in a way that makes the environment harder to read',
            'the environment offers no natural shelter or boundary when one is needed',
            'something in the surroundings draws attention and what it draws attention to is unsettling',
            'the noise level rises from a source that cannot be easily addressed',
            'a path or passage that was accessible becomes blocked or less certain',
            'the weather shifts in a direction that complicates everything',
            'a natural feature of the landscape that seemed stable proves less reliable than assumed',
            'something about the environment suggests recent disturbance — but by what',
            'the space feels like it is not meant for the people currently in it',
            'a detail of the surroundings that was always there suddenly feels ominous in context',
        ],
    },
    DISCOVERY: {
        positive: [
            'a small detail that was previously overlooked clicks into place with something else',
            'a piece of information arrives casually that turns out to matter',
            'someone stumbles onto something they were not looking for and it is useful',
            'a connection between two previously separate things becomes visible',
            'a question someone forgot to ask is answered incidentally',
            'something that seemed random reveals a pattern on second look',
            'a resource or option that was not considered turns out to be available',
            'a misunderstanding is corrected and what replaces it is more useful than the original assumption',
            'something written, carved, or left behind by someone else proves relevant',
            'a familiar thing is seen from a new angle and the new angle reveals something',
            'a guess turns out to be more accurate than expected',
            'someone recognizes something they have seen before in a completely different context',
            'a piece of the puzzle arrives without effort',
            'an assumption that was about to be acted on is corrected just in time',
            'a source of information that was considered unreliable turns out to be accurate about this one thing',
        ],
        negative: [
            'a small detail that was previously overlooked turns out to have been important',
            'something assumed to be true reveals a crack on closer inspection',
            'a discovery is made that would have been useful earlier — too late now',
            'a connection between two things becomes visible and the implication is uncomfortable',
            'information arrives that contradicts something that was being relied on',
            'something that was not meant to be found is found',
            'a familiar thing seen from a new angle looks less reassuring',
            'a guess turns out to have been wrong in a way that matters',
            'something written, carved, or left behind by someone else is discovered and its content is troubling',
            'a piece of information that was given casually turns out to have been incomplete',
            'a source of information that was trusted shows signs of unreliability',
            'a pattern becomes visible and the pattern suggests something no one wants to consider',
            'an assumption that was never questioned turns out to have a flaw',
            'something hidden in plain sight is noticed and once seen it cannot be unseen',
            'a discovery raises a question that does not have a comfortable answer',
        ],
    },
    EXTERNAL: {
        positive: [
            'a sound from outside the immediate scene suggests something is going well elsewhere',
            'someone not directly involved in the scene contributes something small but helpful',
            'news arrives from elsewhere and it is better than expected',
            'an interruption that seems annoying at first proves to be well-timed',
            'something changes in the broader situation that slightly eases local pressure',
            'a message or signal arrives from outside that is reassuring',
            'an external deadline or pressure turns out to have been extended or reduced',
            'someone outside the current circle does something that benefits those inside it without knowing',
            'a resource from an external source becomes available without being requested',
            'an external authority or force makes a decision that happens to help',
            'a disturbance from outside draws away something that was causing problems',
            'a visitor or newcomer brings energy that shifts the mood positively',
            'an external event creates a brief window of opportunity',
            'something that was expected to arrive from outside arrives early and in good condition',
            'the external situation is more stable than the characters assumed it to be',
        ],
        negative: [
            'a sound from outside the immediate scene suggests something is wrong elsewhere',
            'an interruption arrives at the worst possible moment',
            'news from elsewhere changes the context of what is happening here',
            'someone not involved in the scene makes a decision that affects those who are',
            'an external deadline or pressure tightens without warning',
            'a message or signal arrives from outside and its content is unwelcome',
            'something changes in the broader situation that increases local pressure',
            'an external authority or force makes a decision that complicates things',
            'a disturbance from outside demands attention that cannot be spared',
            'a visitor or newcomer brings tension from elsewhere into the current scene',
            'an external event closes a window that was assumed to be open',
            'something expected from outside is delayed or does not arrive',
            'an external obligation resurfaces at an inconvenient time',
            'a resource that depended on external supply is cut off or reduced',
            'the external situation is less stable than the characters assumed it to be',
            'a message arrives that raises more questions than it answers',
        ],
    },
},


// ════════════════════════════════════════════════════════════
// MINOR
// ════════════════════════════════════════════════════════════

MINOR: {
    INTERPERSONAL: {
        positive: [
            'someone takes a visible risk on behalf of another person without being sure it will be appreciated',
            'a conflict between two people resolves not through agreement but through one of them choosing the relationship over being right',
            'a third person says something about the relationship between two others that reframes how they see each other',
            'someone who has been holding back offers genuine help and the offer is not transactional',
            'a shared difficulty bonds two people who did not previously have reason to trust each other',
            'a relationship shows signs of becoming deeper than either person had admitted',
            'someone apologizes and the apology is specific enough to prove they understood what they did',
            'a favor is returned in a way that shows the returner paid attention to what would actually help',
            'two people discover a shared experience neither of them talks about and the recognition is mutual',
            'someone stands up for another person in a context where doing so costs them something',
            'a barrier between two people — formality, rank, old resentment — drops for the first time',
            'someone admits they were wrong to a person whose respect they value',
            'a gesture of trust is reciprocated in a way that raises the stakes for both people',
            'two people drop the surface level and finally have a real conversation',
            'someone reveals something vulnerable and the response they get is better than what they feared',
        ],
        negative: [
            'a promise — even a small one — is broken, and both parties know it mattered more than its size',
            'someone discovers they have been talked about in a way that changes how they feel about the speaker',
            'a relationship that seemed stable reveals a fault line neither person knew was there',
            'someone does something well-intentioned that makes things significantly worse for the other person',
            'loyalty is tested and the result is ambiguous — not a betrayal, but not reassuring either',
            'a third person becomes involved in a dynamic between two others and the triangle creates pressure',
            'someone realizes they have been managing another person rather than relating to them honestly',
            'a boundary is crossed that was never explicitly stated but both people knew it existed',
            'two people want the same thing and there is not enough of it for both',
            'someone who was relied on reveals they are dealing with something that limits their capacity',
            'a grievance no one had voiced surfaces for the first time',
            'someone makes a choice that benefits themselves at a visible cost to another person',
            'a misunderstanding between two people solidifies into something harder to fix than the original issue',
            'someone realizes they have become dependent on a person who may not stay',
            'an alliance of convenience starts to develop real expectations that not everyone shares',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a fear that has been driving decisions is named aloud and loses some of its power',
            'someone allows themselves to want something they had been pretending not to care about',
            'an emotional pattern that has been repeating finally breaks in a small but real way',
            'someone finds they are capable of something they genuinely believed they could not do',
            'a moment of genuine rest — mental, not just physical — arrives and is accepted',
            'an emotion that was tangled with guilt separates from it and becomes simply itself',
            'someone chooses honesty over self-protection and the honesty does not cost as much as feared',
            'a memory that has been avoided is faced and turns out to be survivable',
            'someone realizes they have been punishing themselves for something that was not their fault',
            'a feeling of belonging settles in at an unexpected moment',
            'someone recognizes growth in themselves without having to be told',
            'an old wound stops hurting in a way that is noticeable',
            'someone drops a defense they have been maintaining and nothing bad happens',
            'a moment of pride — earned, not performed — arrives quietly',
            'someone realizes they no longer need something they used to depend on',
        ],
        negative: [
            'a defense mechanism that usually works fails to protect against the current situation',
            'someone realizes they have been avoiding a feeling by staying busy and the busyness just stopped',
            'an emotional truth becomes impossible to ignore but equally impossible to address right now',
            'guilt arrives for something that seemed justified at the time',
            'someone recognizes they are repeating a pattern they swore they would not repeat',
            'a feeling that was manageable in private becomes unbearable in the presence of others',
            'someone discovers they are angry at a person they are not allowed to be angry at',
            'a carefully maintained emotional composure cracks at a visible moment',
            'an old grief is reactivated by something that should not have been able to reach it',
            'someone realizes their motivation for something they are doing is not what they told themselves it was',
            'a moment of envy arrives that feels ugly and cannot be easily dismissed',
            'someone who has been strong for others reaches the point where the strength is performative',
            'a need that was being met by the current situation is suddenly not being met and the absence is felt immediately',
            'someone discovers they are afraid of something they did not know they were afraid of',
            'an emotional investment that has been building is threatened by circumstances that do not care about feelings',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'the environment shifts in a way that naturally separates the characters from a source of pressure',
            'a feature of the landscape provides something the characters needed without them having to search for it',
            'the atmosphere of a place changes in a way that invites a different kind of interaction than was happening',
            'a natural event — weather, tide, season — arrives at a time that creates opportunity',
            'a space that was being used for one purpose turns out to serve another purpose better',
            'something about the environment triggers a useful association or memory',
            'the terrain provides cover, shelter, or advantage that was not obvious until it was needed',
            'a change in the surroundings creates a natural pause in whatever was happening',
            'the environment reveals that someone or something has been here before and left something useful behind',
            'a boundary in the landscape — a river, a ridge, a wall — provides strategic advantage',
            'the quality of a space improves in a way that affects the mood of everyone in it',
            'a natural or structural feature of the environment makes a difficult thing easier',
            'the sounds of the environment shift to something that supports concentration or calm',
            'a previously harsh or unwelcoming environment softens as conditions change',
            'something alive in the environment — an animal, a plant — behaves in a way that is helpful or informative',
        ],
        negative: [
            'the environment shifts to make the current plan significantly harder',
            'a feature of the landscape that was relied on proves less stable than expected',
            'the atmosphere of a place becomes oppressive in a way that affects judgment',
            'a natural event arrives at the worst possible time',
            'a space that felt safe reveals a vulnerability — a weak wall, an unsecured entrance, a blind spot',
            'something in the environment indicates that someone or something else has been here recently',
            'the terrain becomes an active obstacle rather than a passive surface',
            'a change in the surroundings forces a decision that was being deferred',
            'the environment conceals something that should have been visible',
            'a boundary in the landscape becomes a barrier rather than an advantage',
            'the quality of a space deteriorates in a way that affects the people in it',
            'the sounds of the environment shift to something that disrupts focus or raises alarm',
            'a natural or structural feature of the environment makes an easy thing suddenly difficult',
            'the environment provides false information — a path that leads nowhere, a shelter that is not safe',
            'something in the environment begins to change faster than expected and the change is not favorable',
        ],
    },
    DISCOVERY: {
        positive: [
            'a piece of information that has been missing arrives and the picture it completes is encouraging',
            'someone finds evidence that a plan or effort that seemed to be failing is actually working',
            'a hidden resource is discovered in a location that was already being used for something else',
            'a connection is made between two pieces of information that individually seemed useless',
            'a document, message, or record is found that changes the understanding of a past event for the better',
            'an object is discovered whose function or value was not initially apparent',
            'someone realizes that a rule or constraint they were working around does not actually apply',
            'a map, diagram, or description of the current situation is found and it is more complete than what was available',
            'evidence surfaces that an enemy or obstacle has a weakness no one knew about',
            'something that was hidden is found because the conditions for finding it happened to align',
            'a skill or ability that someone has turns out to have an application no one had considered',
            'a piece of old information proves unexpectedly current',
            'a discovery confirms a theory that was considered too optimistic',
            'something that was broken turns out to be repairable with what is available',
            'a discovery reveals that the situation is less advanced or less severe than feared',
        ],
        negative: [
            'a piece of information arrives that makes the current plan obsolete',
            'someone finds evidence that something they trusted has been compromised',
            'a document, message, or record is found that changes the understanding of a past event for the worse',
            'an object is discovered in a place it should not be, and its presence implies something troubling',
            'a connection is made between two events that were assumed to be unrelated, and the connection is alarming',
            'someone discovers that a rule or constraint they thought they understood has an exception they did not know about',
            'evidence surfaces that a problem is more advanced than anyone estimated',
            'a hidden cost of something that seemed free becomes apparent',
            'a map or description of the situation is found and it contradicts what was believed',
            'something that was assumed to be unique turns out to exist in other places — and that is not good',
            'a discovery reveals that an advantage being relied on has already been accounted for by someone else',
            'a piece of information that was being kept from someone is about to reach them through other channels',
            'something thought to be broken turns out to have been deliberately disabled',
            'a discovery reveals that what seemed like a setback was actually the intended outcome of someone else\'s plan',
            'information arrives that is true but that everyone would have been better off not knowing right now',
        ],
    },
    EXTERNAL: {
        positive: [
            'a message arrives from outside with information that changes the local calculation',
            'an external conflict that was causing pressure pauses or redirects',
            'someone from outside the current group arrives with skills or resources that are needed',
            'an authority or institution makes a decision that indirectly benefits the current situation',
            'an external event creates a distraction that pulls attention away from the characters at a useful moment',
            'a supply, shipment, or delivery arrives that was not certain',
            'an external deadline is extended or a constraint is loosened',
            'a neutral external party offers assistance or shelter without conditions',
            'an enemy\'s external support is disrupted by something unrelated to the characters',
            'the reality behind an alarming rumor turns out to be better than what was described',
            'an external force removes an obstacle without being asked',
            'a change in external circumstances makes a previously risky plan significantly safer',
            'someone in a position of external authority shows unexpected sympathy or flexibility',
            'an external alliance or agreement holds when it was expected to fail',
            'the broader situation stabilizes in a way that gives the characters room to breathe',
        ],
        negative: [
            'a message arrives from outside that changes everything and there is no time to adjust',
            'an external conflict escalates and begins to affect the local situation',
            'someone from outside arrives and their presence complicates the existing dynamic',
            'an authority or institution makes a decision that creates a new constraint',
            'an external event draws the characters into something they were trying to avoid',
            'a supply or resource that was expected from outside does not arrive',
            'an external deadline accelerates or a constraint tightens',
            'a neutral external party withdraws and their absence is felt',
            'an enemy receives external support that changes the balance',
            'the reality behind a reassuring report turns out to be worse than what was described',
            'an external force introduces a new element that no one here can control',
            'a change in external circumstances makes a safe plan suddenly risky',
            'someone in a position of external authority makes a hostile or indifferent decision',
            'an external alliance or agreement fails and the fallout reaches the characters',
            'the broader situation destabilizes in a way that removes options locally',
        ],
    },
},


// ════════════════════════════════════════════════════════════
// TURNING POINT
// ════════════════════════════════════════════════════════════

TURNING: {
    INTERPERSONAL: {
        positive: [
            'a relationship that has been defined by caution shifts to one defined by trust through a single decisive moment',
            'someone chooses another person over their own safety and the choice is witnessed',
            'a conflict surfaces at full strength and resolves through vulnerability rather than force',
            'two people who have been on opposite sides find common ground that neither expected',
            'someone reveals a secret they have been carrying and the other person already knew — and stayed anyway',
            'a group dynamic shifts decisively around a moment of genuine leadership',
            'an act of forgiveness occurs that changes what is possible going forward',
            'someone unexpected arrives, and their arrival changes the emotional landscape',
            'a declaration is made — of loyalty, of love, of commitment — that cannot be retracted and changes the stakes',
            'two people survive something together and the shared survival creates a bond that did not exist before',
            'someone proves their worth to a person whose opinion they had given up on changing',
            'a relationship moves from transactional to genuine through a moment that was not planned',
            'a third party acknowledges the relationship between two people in a way that gives it legitimacy or weight',
            'someone makes a sacrifice for another person and the sacrifice is understood and honored',
            'a pattern of miscommunication between two people breaks because one of them finally says the real thing',
        ],
        negative: [
            'a betrayal occurs that both people know changes everything, even if neither says so immediately',
            'someone is forced to choose between two people and the choice costs them the one they did not choose',
            'a secret is revealed that retroactively poisons the trust that was built on not knowing',
            'a relationship that has been sustaining both people reaches a point where it is sustaining neither',
            'someone realizes they have been used and the realization is sudden and complete',
            'a group turns on one of its members and the turning is collective rather than individual',
            'a moment of honesty between two people reveals that they want fundamentally incompatible things',
            'someone who was relied on as stable proves to be the source of the instability',
            'a commitment breaks under pressure and both people know the pressure is not a sufficient excuse',
            'the power dynamic in a relationship reverses and the reversal is not comfortable for either person',
            'someone discovers that the version of them another person loves is not who they actually are',
            'an alliance built on shared interest collapses when the interests diverge',
            'a moment of cruelty — deliberate or careless — damages something that was fragile and important',
            'someone withdraws their emotional investment visibly and the withdrawal changes the room',
            'a confrontation no one wanted finally happens and it is worse than either person imagined',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a grief that has been carried for a long time is shared with someone and the sharing changes its weight',
            'someone makes a decision based on what they actually want rather than what they think they should want',
            'an emotional truth that has been circling finally lands and it brings relief rather than pain',
            'someone stops fighting a feeling they have been resisting and the surrender is freeing',
            'a moment of absolute clarity cuts through confusion and the clarity is about something that matters',
            'someone discovers they are loved in a way they did not know they needed',
            'a cycle of guilt or shame is interrupted by an external event that forces perspective',
            'someone accepts a loss they have been refusing to grieve and the acceptance opens something new',
            'a deeply held belief about oneself is challenged by evidence and the evidence wins',
            'someone experiences genuine pride in another person and the pride transforms their own state',
            'a feeling of despair gives way to anger, and the anger has direction',
            'someone stops performing an emotion and starts feeling the real one underneath',
            'a realization arrives that changes the meaning of past suffering — it was not pointless',
            'someone discovers that the thing they have been running from was never as large as they imagined',
            'an emotional wall comes down not through force but through exhaustion and what is behind it is better than expected',
        ],
        negative: [
            'a hope that has been sustaining someone through difficulty is taken away by circumstances',
            'someone discovers that the emotion they thought they felt was actually covering a darker one',
            'a carefully maintained sense of identity cracks under pressure that was not anticipated',
            'someone reaches the point where they can no longer separate what they feel from how they act',
            'a numbing that has been protective wears off and everything it was blocking arrives at once',
            'someone is confronted with a version of themselves from the past and the comparison is devastating',
            'a fear that was manageable when theoretical becomes visceral when encountered in reality',
            'someone realizes they have been grieving something that is not actually gone — and the grief was about something else entirely',
            'an emotional investment pays off in a way that is technically positive but feels hollow',
            'someone discovers they have used up a reserve of strength they assumed was deeper',
            'a feeling of safety is shattered by something that should not have been able to reach it',
            'someone who has been holding themselves together for others reaches the moment where they cannot',
            'an emotion arrives that does not have a name and its namelessness makes it harder to manage',
            'someone realizes they have been making decisions from a place of damage rather than choice',
            'a moment that should feel good instead feels like loss and the dissonance is disorienting',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'the environment transforms in a way that opens possibilities that did not exist before',
            'a place that held only negative associations reveals something that changes how it is experienced',
            'the landscape or setting provides a dramatic natural advantage at a critical moment',
            'a change in environment forces a change in approach and the new approach is better',
            'a hidden feature of the location reveals itself and it changes the strategic picture completely',
            'the weather or natural conditions shift dramatically in a way that favors the characters',
            'a space that has been confining opens up, literally or figuratively',
            'the environment creates a natural stage for a confrontation that needed to happen',
            'a dangerous feature of the landscape turns out to be navigable by someone present',
            'a place of power or significance is reached and it provides what was sought',
            'the environment heals or restores itself in a way that mirrors or supports what is happening to the characters',
            'a threshold is crossed and the new territory is better than what was left behind',
            'a natural phenomenon occurs that is so striking it forces everyone to stop and the stopping is needed',
            'the environment separates the characters from a threat more effectively than they could have done themselves',
            'a place that was hostile becomes neutral or welcoming through a change no one controlled',
        ],
        negative: [
            'the environment shifts in a way that removes the current plan as an option',
            'a place that was safe becomes dangerous through a change that was not predicted',
            'the landscape or setting turns against the characters at a moment of vulnerability',
            'a feature of the environment that was relied upon fails or disappears',
            'a natural event of significant scale forces immediate response and overrides all other priorities',
            'the terrain becomes impassable in a direction that matters',
            'a space that was open contracts — literally or figuratively — trapping those inside',
            'the environment reveals that something has been changing slowly and the cumulative change is now critical',
            'a hidden danger in the landscape activates without warning',
            'a place that held meaning is damaged or destroyed by environmental forces',
            'the weather or natural conditions shift dramatically against the characters',
            'a threshold is reached where the environment itself becomes the primary threat',
            'a natural boundary that provided protection is breached',
            'the environment creates conditions that force a confrontation before anyone is ready',
            'a change in the surroundings reveals how precarious the current position actually was',
        ],
    },
    DISCOVERY: {
        positive: [
            'a major piece of the puzzle falls into place and the picture it reveals is actionable',
            'a truth that has been suspected is confirmed and the confirmation comes with proof',
            'a discovery reveals that an enemy has been operating under a critical misunderstanding',
            'something that was believed lost is found and its return changes what is possible',
            'a hidden connection between events reveals a pattern that can be exploited',
            'a discovery proves that someone who was doubted was right all along',
            'information arrives that transforms a defensive position into an offensive one',
            'a discovery reveals a path forward that no one had considered because it required information that was not available until now',
            'a record, testimony, or artifact surfaces that vindicates a controversial decision',
            'a discovery reveals that the worst-case scenario everyone was preparing for is not actually in play',
            'a hidden ally is discovered — someone who has been working toward the same goal from a different angle',
            'a breakthrough in understanding occurs that makes a previously impossible problem solvable',
            'evidence is found that the situation is more favorable than the available information suggested',
            'a discovery provides leverage that did not previously exist',
            'a piece of knowledge that was thought to be dangerous turns out to be protective when properly understood',
        ],
        negative: [
            'a discovery reveals that the situation is fundamentally different from what everyone believed',
            'evidence surfaces that someone trusted has been compromised — not by choice, but the result is the same',
            'a truth that was suspected is confirmed and the confirmation is worse than the suspicion',
            'an apparent success reveals itself as a trap or a misdirection',
            'information arrives that makes a committed plan obviously wrong but too late to change',
            'a hidden cost is discovered that retroactively changes the value of everything gained',
            'a discovery proves that a key assumption underpinning the current strategy was incorrect',
            'something that was believed to be unique to this situation turns out to be part of a much larger pattern',
            'evidence is found that the timeline is wrong — there is less time than anyone thought',
            'a record, testimony, or artifact surfaces that contradicts the accepted version of events',
            'a discovery reveals that what seemed like an obstacle was actually protecting something important',
            'information arrives that turns an ally into an unknown — not an enemy, but no longer reliable',
            'a discovery reveals that the characters have been observed for longer than they knew',
            'something that was hidden is uncovered and the reason it was hidden turns out to have been valid',
            'a piece of knowledge arrives that cannot be acted on without revealing how it was obtained',
        ],
    },
    EXTERNAL: {
        positive: [
            'an external force that was threatening is redirected by events elsewhere',
            'a major external ally commits resources that change the scale of what is possible',
            'an external conflict resolves in a way that frees the characters from an obligation',
            'a power structure outside the immediate situation shifts in favor of the characters',
            'an external event validates the characters\' position to people who were skeptical',
            'a third party brokers a solution that the involved parties could not reach on their own',
            'an external resource arrives that was given up on — late, but still in time',
            'an external threat overreaches and its overreach creates vulnerability',
            'a change in the broader world creates a new option that did not exist before',
            'an external authority reverses a decision that was causing damage',
            'an external event creates a situation where enemies must cooperate temporarily',
            'a piece of external infrastructure that was damaged is restored and its restoration has immediate benefits',
            'an external force removes a figure who was causing problems without the characters having to confront them',
            'a broader trend shifts in a direction that supports the characters\' goals',
            'an external party that was hostile is neutralized by a completely unrelated development',
        ],
        negative: [
            'an external force enters the situation with demands that override current priorities',
            'a decision made far from here reaches the characters and it constrains their options severely',
            'an external conflict that was distant arrives locally with little warning',
            'a power structure outside the immediate situation shifts against the characters',
            'an external ally withdraws support due to their own problems elsewhere',
            'a third party intervenes and their intervention serves their interests, not the characters\'',
            'an external event changes the rules everyone was operating under',
            'an external threat that was being monitored accelerates beyond predictions',
            'a broader authority makes a decision that was not aimed at the characters but affects them disproportionately',
            'an external resource that was being counted on is redirected to a different crisis',
            'an enemy receives external legitimacy or support that changes what they are capable of',
            'an external deadline arrives and it is not negotiable',
            'a change in the broader world eliminates an option the characters were keeping in reserve',
            'an external event creates a situation where the characters must act publicly when they needed to act quietly',
            'a force from outside the story arrives and its presence means nothing will be the same',
        ],
    },
},


// ════════════════════════════════════════════════════════════
// MAJOR
// ════════════════════════════════════════════════════════════

MAJOR: {
    INTERPERSONAL: {
        positive: [
            'a bond is tested by something that should have broken it and the bond holds',
            'someone positioned against the characters chooses a different path and commits to it',
            'a group that was fragmenting coalesces around a shared purpose that transcends individual grievances',
            'a relationship reaches a depth where both people understand each other without the need for explanation',
            'someone makes a public commitment to another person that changes their standing with everyone else',
            'a rift between two people resolves through mutual recognition of fault',
            'a sacrifice is made for another person and the person it was made for witnesses it and is changed by it',
            'an alliance forms between unlikely people and the alliance is genuine rather than strategic',
            'a person who has been isolated is fully accepted into a group and the acceptance is unconditional',
            'someone proves their loyalty in a way that costs them everything they had to lose',
            'a leader earns the trust of those who follow through action rather than authority',
            'a confession of something deeply hidden is met with the one response the confessor needed',
            'two people whose relationship has been marked by pain find a way to be in each other\'s lives without pain',
            'a wrong that felt unforgivable is forgiven',
            'a group achieves something none of them could have achieved alone and the achievement bonds them permanently',
        ],
        negative: [
            'a betrayal occurs at the deepest level — the person most trusted is the source',
            'a relationship that was the foundation of someone\'s stability collapses completely',
            'a group turns against its leader and the turning is justified but devastating',
            'someone is abandoned by the last person they believed would stay',
            'a truth about a relationship is exposed that makes it impossible to continue as before',
            'a choice between two loyalties forces a visible, permanent fracture',
            'someone\'s attempt to protect another person is the thing that causes the most damage',
            'a harmful dynamic that has crept into a relationship is finally named, and naming it does not fix it',
            'an act of desperation damages a relationship beyond what the desperation justified',
            'the person someone has been fighting for gives up before they do',
            'a public humiliation or exposure damages multiple relationships simultaneously',
            'someone who was the heart of a group is removed and the group cannot compensate',
            'a lie surfaces at the core of a relationship, and the truth it was covering is barely survivable',
            'two people who were essential to each other become harmful to each other',
            'a group\'s internal conflict becomes more destructive than the external threat they face',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a fundamental fear is confronted and although the confrontation is painful it results in freedom',
            'someone allows themselves to feel something long held back and it does not destroy them',
            'a crisis of identity resolves through acceptance rather than victory',
            'an emotional wall that has defined a character comes down and what is behind it is not the weakness they feared',
            'someone discovers that the strength they thought came from suppression actually comes from feeling',
            'a moment of emotional honesty between two people changes the trajectory of the story',
            'someone who has been defined by loss discovers they are also defined by what they still have',
            'a breakdown occurs and the rebuilding that follows produces something stronger than what was there before',
            'a choice is made from love rather than fear and the outcome reflects the difference',
            'someone makes peace with an aspect of themselves they have been at war with',
            'an emotional burden that has been carried alone is shared and the sharing is transformative',
            'a moment of pure, uncomplicated happiness arrives and is recognized as significant',
            'someone discovers they have the capacity for forgiveness they did not believe they possessed',
            'an emotional risk pays off — not in a practical way, but in a way that matters more',
            'someone stops trying to be what they think they should be and becomes what they are',
        ],
        negative: [
            'a fundamental belief about oneself is shattered by an event that cannot be rationalized',
            'someone reaches a point of emotional damage where recovery is uncertain',
            'a feeling of rage takes over a person who has always prided themselves on control',
            'someone discovers that the thing they built their emotional life around was a defense mechanism not a truth',
            'a grief compounds with other grief until the total is unbearable',
            'someone makes a decision from a place of pain and the decision has permanent consequences',
            'an emotional dependency is suddenly removed and the withdrawal is severe',
            'someone is confronted with the full weight of what they have done and the weight is crushing',
            'a hope that has sustained someone is not just disappointed but proven to have been delusional',
            'someone realizes they have crossed a line they cannot uncross emotionally',
            'a feeling of emptiness arrives that is different from sadness — it is the absence of the ability to feel',
            'someone breaks a promise to themselves and the breaking feels final',
            'an emotion that was being held at bay breaks through all defenses simultaneously',
            'someone discovers they are capable of something they believed only bad people were capable of',
            'a moment of emotional clarity arrives and what it reveals is that the situation is exactly as bad as it looks',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'the environment undergoes a dramatic transformation that signals a genuine change in the situation',
            'a place reveals itself to be far more significant than anyone realized, and it provides what was needed',
            'a catastrophic environmental event is survived and the survival changes everything',
            'the environment provides a dramatic natural intervention at a critical moment',
            'a place that had been hostile becomes passable or safe',
            'a hidden location is revealed that changes the strategic landscape entirely',
            'the environment responds to the characters\' actions in a way that suggests alignment or approval',
            'a natural boundary that was an obstacle becomes an advantage when the situation changes',
            'a place of healing or restoration is found and it works as needed',
            'the environment isolates the characters from a threat so completely that the threat cannot follow',
            'a landmark or natural feature serves as a turning point — once past it, the rules change',
            'a devastating environmental condition lifts and the relief is tangible',
            'a place that was thought to be empty or dead shows signs of life or recovery',
            'the environment creates conditions for a last stand that actually favors the defenders',
            'a natural phenomenon of immense scale occurs and its effect on the situation is beneficial',
        ],
        negative: [
            'the environment undergoes a change that is clearly irreversible and the implications are severe',
            'a place of safety is destroyed or fundamentally compromised',
            'a catastrophic environmental event forces abandonment of the current position',
            'the environment becomes hostile in a way that is not manageable with available resources',
            'a hidden environmental danger reaches a tipping point with no warning',
            'the landscape transforms in a way that cuts off retreat or escape',
            'a place that was hoped to hold answers turns out to hold something far worse',
            'the environment destroys something that cannot be replaced',
            'a natural disaster or catastrophe forces impossible choices about who or what to save',
            'the environment reveals the scale of a problem that was being perceived locally',
            'a place that was being defended becomes impossible to hold',
            'a landmark or natural feature that provided orientation or meaning is gone',
            'the environment turns lethal in a way that does not distinguish between friend and enemy',
            'a contamination or corruption of the environment reaches the characters\' location',
            'a natural phenomenon of immense scale occurs and there is nothing to do but endure it',
        ],
    },
    DISCOVERY: {
        positive: [
            'a revelation arrives that changes the meaning of everything that has happened — and the new meaning is better',
            'a discovery proves that a costly choice made earlier accomplished exactly what it was meant to',
            'a hidden truth is uncovered that gives the characters leverage they did not know they had',
            'a lingering question resolves in a way that is satisfying and actionable',
            'a discovery reveals that an enemy is not what they appeared to be — and the reality is less threatening',
            'a piece of knowledge that was lost is recovered and its recovery changes the rules',
            'evidence surfaces that vindicates a decision everyone else condemned',
            'a discovery reveals a way out of a situation that appeared to have no exit',
            'a truth that was hidden for protection is revealed and the protection is no longer needed',
            'a discovery links the characters to something larger than they knew — and the connection is empowering',
            'a breakthrough in understanding makes clear what needs to be done next',
            'a discovery proves that an enemy\'s greatest strength is also their greatest vulnerability',
            'something that was believed to be impossible is proven to be merely very difficult',
            'a record of the past is found that provides moral authority for the present',
            'a discovery reveals that the characters have been closer to their goal than they realized',
        ],
        negative: [
            'a revelation arrives that changes the meaning of everything — and the new meaning is devastating',
            'a discovery proves that a belief everyone held was wrong, and the decisions made based on it were therefore wrong',
            'evidence surfaces that the real threat has been something entirely different from what everyone was fighting',
            'a truth is uncovered that turns a hero of the story into something far more complicated',
            'a discovery reveals the full scope of a problem that was being addressed as though it were smaller',
            'information arrives that makes clear a choice must be made between two things that both matter',
            'a mystery resolves and the resolution makes things harder, not easier',
            'a discovery reveals that an advantage being relied on was an illusion',
            'evidence surfaces that the characters\' actions have been causing harm they were not aware of',
            'a hidden truth is uncovered and the reason it was hidden was that knowing it makes everything more dangerous',
            'a breakthrough in understanding arrives too late to prevent what it would have prevented',
            'a discovery links the characters to something larger — and the connection is threatening',
            'a record of the past is found that undermines the legitimacy of what is being done in the present',
            'a discovery reveals that an ally has been working with incomplete or incorrect information',
            'a truth arrives that nobody is ready for and there is no time to become ready',
        ],
    },
    EXTERNAL: {
        positive: [
            'a major external intervention reshapes the situation in favor of the characters',
            'an external power that was hostile is overthrown or neutralized by forces unrelated to the characters',
            'a crisis elsewhere resolves and frees resources or allies for the current situation',
            'an external event creates a once-in-a-lifetime opportunity that must be acted on immediately',
            'a powerful external figure chooses to support the characters publicly and the support is decisive',
            'an institution or system that was broken begins to function again at the right moment',
            'an external force eliminates a threat the characters could not have handled themselves',
            'a broader conflict shifts in a direction that makes the characters\' goals achievable',
            'an external event proves the characters right in the eyes of people who matter',
            'help arrives that no one remembers asking for, and it is more than was needed',
            'an external event forces enemies to cooperate and the cooperation reveals common ground',
            'a political or social shift outside the story creates new possibilities within it',
            'an external witness provides testimony or evidence that changes the balance of power',
            'a resource from the outside world arrives that was believed to no longer exist',
            'an external event creates a new normal that is more favorable than the old one',
        ],
        negative: [
            'an external force intervenes and its intervention serves no one\'s interests but its own',
            'a war, disaster, or upheaval from elsewhere reaches the characters\' situation',
            'an external power makes a decision that strips the characters of options they were counting on',
            'a crisis elsewhere demands the withdrawal of support or resources from the current situation',
            'a powerful external figure publicly opposes the characters and the opposition has teeth',
            'an institution or system that was functioning collapses and its collapse has immediate consequences',
            'a broader conflict escalates to a point where the characters\' concerns become irrelevant to everyone else',
            'an external deadline arrives that cannot be negotiated and changes what must happen next',
            'an external event delegitimizes the characters\' position in the eyes of people who matter',
            'a political or social shift creates conditions that are hostile to the characters\' goals',
            'an enemy receives external validation or support that makes them significantly more dangerous',
            'a force from outside the story arrives and nothing that was planned accounts for it',
            'an external event creates a new normal that is significantly worse than the old one',
            'an external authority claims jurisdiction over the characters\' situation and their priorities are different',
            'the world outside stops caring about what is happening here and the indifference has consequences',
        ],
    },
},


// ════════════════════════════════════════════════════════════
// WORLD-SHAKING
// ════════════════════════════════════════════════════════════

WORLDSHAKING: {
    INTERPERSONAL: {
        positive: [
            'a bond between two people reaches a depth that fundamentally changes what they are willing to do for each other',
            'a long-buried truth between two people finally surfaces and instead of destroying them it sets them free',
            'someone who stood firmly against them chooses the other side and means it',
            'a relationship everyone had quietly given up on reconstitutes around something no one expected',
            'two people locked in conflict reach an understanding that makes the conflict irrelevant',
            'what looked like a betrayal is revealed to have been protection all along, and the cost of that protection becomes visible',
            'someone sacrifices their position, safety, or future for another person without hesitation or conditions',
            'a person everyone underestimated becomes the one whose loyalty holds everything together',
            'a declaration — of love, of allegiance, of truth — is made publicly and cannot be taken back',
            'someone forgives something that was considered unforgivable and the forgiveness is genuine',
            'two people who were never supposed to meet discover a connection that recontextualizes both their histories',
            'a promise made long ago is fulfilled under circumstances that make it mean far more than when it was given',
            'someone chooses a person over a principle they have held their entire life',
            'a group fractures and the way it reassembles reveals who truly matters to whom',
            'a relationship reaches a turning point where both people see each other completely and choose to stay',
        ],
        negative: [
            'a betrayal is revealed that has been running longer than anyone would like to believe',
            'someone trusted completely turns out to have been carrying a separate agenda — for how long is not yet clear',
            'a bond that was the emotional foundation of the story breaks under a weight it cannot carry',
            'a person is forced to choose between two people they love and the choice destroys one of those relationships permanently',
            'a lie told to protect someone is exposed and the person it was meant to protect is the one most damaged',
            'someone whose loyalty was never in question reaches their limit and walks away',
            'a public exposure of a private relationship destroys both people\'s positions',
            'a sacrifice made for someone is rejected and the rejection cannot be undone',
            'someone discovers they have been a tool in another person\'s plan, and the plan is not over',
            'a relationship that seemed like the safest thing in the story becomes the most dangerous',
            'two people who defined themselves through each other are forced apart by something neither can fight',
            'a confession comes too late and the person it was meant for has already made an irreversible decision',
            'a group\'s loyalty to one person collapses simultaneously leaving them completely alone',
            'someone\'s love or devotion is used as a weapon against them by the person they trusted most',
            'a third party is revealed to have been quietly steering the connection between two people for their own purposes',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a grief that has long defined someone finally begins to release its hold',
            'someone who has been performing strength finally allows themselves to break down and discovers they are held',
            'an identity crisis that has been building resolves in a way that makes the person more whole than before',
            'a fear that has quietly steered someone\'s decisions is faced and does not destroy them',
            'someone discovers that the thing they hated most about themselves is the thing that saves them',
            'a moment of complete emotional honesty changes the trajectory of everything around it',
            'someone who has been numb for a long time feels something real again and it is not pain',
            'a cycle of self-destruction that seemed permanent is broken by a single moment of genuine connection',
            'a memory that has been a source of pain is recontextualized and becomes a source of strength',
            'someone forgives themselves for something they believed was unforgivable',
            'an emotion long suppressed surfaces and it turns out to be the right one',
            'a person who has defined themselves by their damage discovers they are not only their damage',
            'a moment of joy arrives in the middle of catastrophe, and it is not false',
            'someone\'s vulnerability shown at the worst possible moment turns out to be exactly what was needed',
            'a burden long carried alone is finally shared and the sharing makes it bearable',
        ],
        negative: [
            'a hope that has sustained someone through everything is proven to have been false',
            'someone reaches a point of emotional exhaustion where they can no longer feel what they need to feel',
            'a truth about themselves that someone has long avoided becomes undeniable',
            'a grief arrives that is larger than anything the person has the capacity to process',
            'someone discovers that the version of themselves they have been fighting to protect never existed',
            'an emotional dependency that seemed like love is revealed to have been something else entirely',
            'a moment of complete emotional honesty destroys something that needed the lie to survive',
            'someone realizes they have become the thing they defined themselves against',
            'an old pattern resurfaces at the worst moment, casting doubt on how real the change ever was',
            'a feeling that has long been building finally arrives and it is worse than anticipated',
            'someone\'s emotional armor finally fails and what comes through is not sadness but rage',
            'a memory that was a source of comfort is revealed to have been inaccurate and the real version is devastating',
            'a person reaches the point where they stop caring about something that previously defined them',
            'someone\'s attempt to protect their own emotional survival causes irreparable harm to someone else',
            'an emotion that was supposed to be resolved returns with accumulated force and is no longer manageable',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'a place that had been hostile transforms, and what remains is something new',
            'a natural or supernatural phenomenon occurs that fundamentally alters the landscape of what is possible',
            'a place that once meant safety is found again, and returning to it changes the meaning of everything since',
            'the environment itself responds to what is happening as if it recognizes the significance',
            'a barrier that has defined the world — a wall, a border, a divide — ceases to exist',
            'a catastrophe that seemed inevitable is averted by something the environment provides at the last moment',
            'the place itself seems to lend its strength to everyone present, regardless of allegiance',
            'the world reveals a hidden layer that changes what the characters understand about where they are',
            'something that had been quietly poisoning the surroundings is reversed at its source',
            'a place that was believed to be destroyed turns out to have survived in a form no one expected',
            'the environment shifts to make something that was impossible suddenly achievable',
            'a cycle of destruction in a specific place breaks and what replaces it is something no one anticipated',
            'a threshold is crossed and what is on the other side changes everything',
            'a place that held trauma is reclaimed and the reclaiming has power',
            'the world itself seems to exhale — a pressure that has been building in the environment releases',
        ],
        negative: [
            'a safe place is permanently compromised — what made it safe is gone and will not return',
            'a catastrophe reshapes the physical world in a way that cannot be undone',
            'something that has been quietly spreading through the environment reaches critical mass and begins to transform it irreversibly',
            'the place itself seems to turn against everyone within it simultaneously',
            'the environment becomes actively dangerous in a way that changes all existing plans',
            'a barrier that was protecting something fails and what it was holding back enters the world',
            'a place that held meaning is destroyed and the destruction is felt by everyone connected to it',
            'the world reveals something that was hidden beneath it and that something is not benign',
            'a threshold is crossed and there is no way back',
            'the environment begins to behave in ways that suggest something is fundamentally wrong at a level deeper than surface',
            'a resource the world depended on is exhausted or poisoned',
            'a place of safety becomes a trap — the same qualities that made it protective now make it a prison',
            'a cycle of destruction accelerates beyond anyone\'s ability to intervene',
            'the physical world begins to reflect the emotional or spiritual damage of what has happened and the reflection makes things worse',
            'a change in the environment forces everyone to abandon something they cannot take with them',
        ],
    },
    DISCOVERY: {
        positive: [
            'a truth is uncovered that recontextualizes the entire story up to this point — and the new context is better',
            'an answer arrives that no one expected, and it is what was needed',
            'a hidden ally is discovered — someone or something has been working in the background the entire time',
            'a piece of knowledge that was considered lost forever resurfaces and it changes what is possible',
            'a discovery reveals that an effort thought wasted actually accomplished exactly what it was meant to',
            'something everyone believed was a weakness turns out to be the key to everything',
            'a pattern becomes visible that connects events no one realized were related — and the pattern is protective',
            'a secret that has been carried as a burden is shared and turns out to be a gift',
            'a question that has been hanging over everything resolves in a way that brings peace rather than more questions',
            'a discovery proves that someone who was condemned was actually innocent, and the proof is undeniable',
            'a lie that has been the foundation of something important is exposed and what replaces it is stronger',
            'something thought to be unique and irreplaceable turns out to exist in another form',
            'a discovery changes the rules of what is possible in this world',
            'a hidden message or legacy left by someone long gone arrives at exactly the right moment',
            'a truth that everyone was afraid to face turns out to be survivable — difficult, but survivable',
        ],
        negative: [
            'a truth is uncovered that recasts recent progress — more of it than anyone wants to admit was serving something else',
            'a discovery reveals that a trusted foundation — a belief, an institution, a history — was built on something false',
            'a secret kept by multiple people is exposed simultaneously and none of them knew the others were keeping it',
            'a piece of knowledge surfaces that should not exist and the fact that it exists means something terrible',
            'a discovery proves that someone who was celebrated was actually responsible for something unforgivable',
            'a pattern becomes visible connecting events no one realized were related — and the pattern is predatory',
            'a mystery resolves and the answer is worse than not knowing',
            'a hidden truth about someone\'s origin or nature or purpose is revealed and it changes how everyone sees them',
            'a discovery renders a costly choice meaningless',
            'something thought to be benign or neutral is discovered to have been actively harmful the entire time',
            'a lie is exposed and the structure it was supporting collapses, and people were living inside that structure',
            'a discovery changes the rules of what is possible in this world and the change is terrifying',
            'a hidden cost of something that seemed free becomes visible all at once',
            'a truth arrives that cannot be unknown and every relationship it touches is damaged by it',
            'a discovery reveals that the real threat was never what everyone thought — it was something much closer',
        ],
    },
    EXTERNAL: {
        positive: [
            'a force from outside the story intervenes in a way that resets the stakes entirely',
            'an external threat that had been looming is neutralized by something no one saw coming',
            'an authority or power structure that was an obstacle collapses and what replaces it is an opportunity',
            'a messenger or signal arrives from outside with information that changes everything',
            'a resource or reinforcement arrives from a source no one thought to ask',
            'an enemy\'s external support structure fails and they are suddenly vulnerable',
            'a conflict larger than the current story resolves in a way that creates space for the characters',
            'something that was approaching — a deadline, a threat, a force — stops or reverses',
            'an external witness validates the characters\' version of events when no one else would',
            'a power that had stayed neutral commits to a side and it is this one',
            'an event elsewhere triggers a chain reaction that reaches the characters as an unexpected advantage',
            'an external force removes a person or obstacle that was considered immovable',
            'aid arrives from a direction no one was watching — unasked, unforced, and exactly in time',
            'the outside world learns what has been happening here and the response is support rather than judgment',
            'an institution or system that was corrupt or broken begins to reform in a way that directly helps',
        ],
        negative: [
            'a force from outside the story arrives and it is larger than anything the characters have faced',
            'an external threat that was theoretical becomes real and immediate with no warning',
            'an authority or power structure that was an obstacle is replaced by something worse',
            'a deadline that seemed distant arrives early',
            'a conflict larger than the current story spills over and engulfs the characters',
            'an enemy receives external reinforcement that changes the balance entirely',
            'a power that has been neutral commits to a side and it is not this one',
            'a plea for help — spoken or merely hoped — is answered, and the answer is no',
            'the outside world learns what has been happening and the response is hostile',
            'an event elsewhere triggers a chain reaction that reaches the characters as catastrophe',
            'an institution or system the characters depended on is dismantled by external forces',
            'a force that was approaching arrives and it is worse than anticipated',
            'an external force removes a person or protection that was considered permanent',
            'something the characters did draws the attention of something that should never have noticed them',
            'the outside world closes off the last exit — whatever happens now, happens here',
        ],
    },
},

}; // end EVENTS


// ── Category selection (weighted random) ───────────────────

function getCategoryCount(categoryId) {
    const ctx = getContext();
    return ctx.chatMetadata?.we_cat_counts?.[categoryId] ?? 0;
}

function incrementCategoryCount(categoryId) {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    if (!ctx.chatMetadata.we_cat_counts) ctx.chatMetadata.we_cat_counts = {};
    ctx.chatMetadata.we_cat_counts[categoryId] = (ctx.chatMetadata.we_cat_counts[categoryId] ?? 0) + 1;
    ctx.saveMetadata();
}

function pickCategory(mode) {
    // Base weight dampened by category frequency: weight / (1 + count * 0.5)
    // Softer than event anti-repeat (0.5 factor vs 1.0), so base weights still dominate.
    // Scene mode multiplies on top: Intimate boosts Interpersonal/Emotional, kills External, etc.
    const weighted = CATEGORIES.map(c => ({
        cat: c,
        w: (c.weight * (mode?.catMult?.[c.id] ?? 1)) / (1 + getCategoryCount(c.id) * 0.5),
    }));
    const total = weighted.reduce((a, x) => a + x.w, 0);
    let rand = Math.random() * total;
    for (const x of weighted) {
        rand -= x.w;
        if (rand <= 0) return x.cat;
    }
    return weighted[weighted.length - 1].cat;
}

// ── Pool builder ───────────────────────────────────────────

function buildPool(scaleId, categoryId, isPositive, mode) {
    const scaleEvents = EVENTS[scaleId];
    if (!scaleEvents) return [];
    const catEvents = scaleEvents[categoryId];
    if (!catEvents) return [];
    const base = isPositive ? catEvents.positive : catEvents.negative;
    // Pace filter: Combat wants 'fast' events, Intimate/Calm want 'slow'.
    // Untagged events count as 'any'; if the filter empties the pool, fall back.
    const pref = mode?.pace;
    if (!pref) return base;
    const filtered = base.filter(e => {
        const t = PACE_TAGS[e];
        return !t || t === 'any' || t === pref;
    });
    return filtered.length ? filtered : base;
}

// ── Event frequency counters ──────────────────────────────

function getCountsKey(scaleId, categoryId, isPositive) {
    return `${scaleId}:${categoryId}:${isPositive ? 'pos' : 'neg'}`;
}

function getEventCounts() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return {};
    if (!ctx.chatMetadata.we_counts) ctx.chatMetadata.we_counts = {};
    return ctx.chatMetadata.we_counts;
}

function getCount(key, eventText) {
    return getEventCounts()[key]?.[eventText] ?? 0;
}

function incrementCount(key, eventText) {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    if (!ctx.chatMetadata.we_counts) ctx.chatMetadata.we_counts = {};
    const key2 = key;
    if (!ctx.chatMetadata.we_counts[key2]) ctx.chatMetadata.we_counts[key2] = {};
    const counts = ctx.chatMetadata.we_counts[key2];
    counts[eventText] = (counts[eventText] ?? 0) + 1;
    ctx.saveMetadata();
}

function resetEventCounts() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    ctx.chatMetadata.we_counts = {};
    ctx.chatMetadata.we_cat_counts = {};
    ctx.saveMetadata();
}

function pickEventType(scaleId, categoryId, isPositive, mode) {
    if (scaleId === 'NONE') return null;
    const pool = buildPool(scaleId, categoryId, isPositive, mode);
    if (!pool.length) return null;

    const key = getCountsKey(scaleId, categoryId, isPositive);
    const weights = pool.map(e => 1 / (1 + getCount(key, e)));
    const total = weights.reduce((a, b) => a + b, 0);
    let rand = Math.random() * total;
    let chosen = pool[pool.length - 1];
    for (let i = 0; i < pool.length; i++) {
        rand -= weights[i];
        if (rand <= 0) { chosen = pool[i]; break; }
    }
    incrementCount(key, chosen);
    return chosen;
}

// ── Tension helpers ────────────────────────────────────────

function getTension() {
    const ctx = getContext();
    return ctx.chatMetadata?.wild_events_tension ?? 0;
}

function saveTension(val) {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    ctx.chatMetadata.wild_events_tension = Math.max(0, Math.min(100, val));
    ctx.saveMetadata();
}

// ── Core logic ─────────────────────────────────────────────

function findScale(score) {
    return SCALES.find(e => score >= e.min && score <= e.max) || SCALES[0];
}

function formatPrompt(result) {
    const label = extension_settings[EXT].label || DEFAULTS.label;
    const impact = result.isPositive ? 'POSITIVE' : 'NEGATIVE';
    const mode = result.mode;
    // The scene type is not echoed back: the model classified it itself in the
    // infoblock. Only the mode's instruction (how to fit the event) is passed.
    const modeHint = (mode && result.modeId !== 'NEUTRAL' && mode.hint) ? mode.hint : '';

    if (result.scale.id === 'NONE') {
        return `[${label}: NO CHANGE]\nNo forced twist. Story continues naturally.`;
    }

    const isSoftTier = (result.scale.id === 'SUBTLE' || result.scale.id === 'MINOR');

    // Lite: hand over the tier and its scale, let the model invent the event.
    if (result.lite) {
        return [
            `[${label}: ${result.scale.name} | ${impact}]`,
            result.scale.desc,
            result.forced ? '(FORCED — tension reached maximum)' : '',
            ...LITE_GUIDANCE,
            modeHint,
        ].filter(Boolean).join('\n');
    }

    let lines = [
        `[${label}: ${result.scale.name} | ${impact} | ${result.category.name}]`,
        result.eventType ? `Event: ${result.eventType}.` : '',
        result.forced ? '(FORCED — tension reached maximum)' : '',
        'Weave this into the current scene through actions, dialogue, or observations of characters.',
        'The event may affect any character — main characters, the user\'s character, or side characters. Prioritize those most relevant to the current scene, but only if the event fits them logically.',
        isSoftTier
            ? 'If the event does not fit the current moment, hint at it subtly rather than forcing it.'
            : 'This event must have a tangible impact on the scene — do not reduce it to a hint or implication.',
        modeHint,
        result.threadPayoff
            ? (result.threadAct3
                ? 'This event is the next chapter of a storyline that already turned visibly earlier — build directly on those established events and their consequences.'
                : 'This event is the payoff of something hinted at earlier in the story. If a recent small moment fits as its foreshadowing (a glance, a hesitation, an odd detail), connect the two naturally.')
            : '',
    ].filter(Boolean);

    return lines.join('\n');
}

function runEvent(isNewMessage) {
    const s = extension_settings[EXT];
    if (!s.enabled) { setExtensionPrompt(EXT, '', 1, s.depth); return; }

    const lite = s.engineMode === 'lite';

    if (isNewMessage) {
        updateDetectedMode();
        // Threads are frozen in lite mode: they cannot fire, so they must not
        // age out either — otherwise a spell in lite would quietly kill them.
        if (!lite) tickThreads();
    }
    const modeId = getEffectiveModeId();
    const mode = SCENE_MODES[modeId] || SCENE_MODES.NEUTRAL;

    let tension = getTension();
    if (isNewMessage) { tension = Math.min(100, tension + s.step * mode.tensionMult); saveTension(tension); }

    let baseRoll, modifier, finalScore, isPositive, scale;
    let forced = false;

    baseRoll = Math.floor(Math.random() * 20) + 1;
    modifier = Math.floor(tension / 8);
    isPositive = Math.random() < (mode.posBias ?? 0.5);

    if (tension >= 100) { forced = true; finalScore = 27; }
    else { finalScore = baseRoll + modifier; }

    // Mode gate: quiet modes (Intimate, Calm) suppress part of the events entirely.
    if (!forced && finalScore > 10 && Math.random() > mode.eventChance) finalScore = 1;

    // Tension relief is judged on the UNCAPPED scale, so a forced event in a
    // capped mode still resets tension instead of forcing every message.
    const scaleForAdj = findScale(finalScore);
    if (isNewMessage) {
        if (scaleForAdj.adj === 'reset') saveTension(0);
        else if (scaleForAdj.adj === 'reduce50') saveTension(tension * 0.5);
        else if (scaleForAdj.adj === 'reduce25') saveTension(tension * 0.75);
    }

    // WORLDSHAKING needs an established story — in young chats it caps at MAJOR.
    // Applies to forced events too (tension already relieved via scaleForAdj above).
    const chatLen = (getContext().chat || []).length;
    if (chatLen < (s.wsMinMsgs ?? DEFAULTS.wsMinMsgs)) {
        finalScore = Math.min(finalScore, 26);
    }

    // Tier cap: Intimate never escalates past MINOR, Personal/Calm past TURNING.
    if (mode.tierCap) {
        const cap = SCALES.find(x => x.id === mode.tierCap);
        if (cap) finalScore = Math.min(finalScore, cap.max);
    }
    scale = findScale(finalScore);

    // Lite mode stops here: the tier and impact are the whole instruction, and
    // the model invents the event. Pools, categories and threads stay untouched,
    // so switching back to default resumes exactly where it left off.
    let category = null, eventType = null, threadPayoff = null, threadAct3 = false;

    if (!lite) {
        category = pickCategory(mode);
        incrementCategoryCount(category.id);

        // Threads first: a ripe payoff overrides the random pick (and either
        // closes its thread or chains it into act three).
        const payoff = tryThreadPayoff(modeId, scale.id, isPositive);
        if (payoff) {
            eventType = payoff.eventText;
            threadPayoff = payoff.themeId;
            threadAct3 = payoff.act3;
        } else {
            eventType = pickEventType(scale.id, category.id, isPositive, mode);
            if (eventType) maybeSeedThread(eventType);
        }
    }

    const result = { tension: getTension(), baseRoll, modifier, finalScore, isPositive, scale, category, forced, eventType, modeId, mode, threadPayoff, threadAct3, lite };
    const prompt = formatPrompt(result);
    setExtensionPrompt(EXT, prompt, 1, s.depth, false, 0);

    extension_settings[EXT]._lastResult = result;
    saveSettingsDebounced();

    updateUI(result);
    if (s.showBadge) updateWidget(result);
}

// ── Generation hooks ───────────────────────────────────────

function onMessageSent() { runEvent(true); }
function onMessageSwiped() { runEvent(false); }


// ── Badge helpers ──────────────────────────────────────────

function injectBadge(result) { updateWidget(result); }
function removeBadges() { updateWidget(null); }

// ── Floating widget ────────────────────────────────────────

function ensureWidget() {
    if ($('#we_widget').length) return;

    const $widget = $(`
        <div id="we_widget" style="display:none;">
            <button id="we_fab" aria-label="Wild Events">
                <i class="fa-solid fa-yin-yang" style="font-size:16px;pointer-events:none;"></i>
                <span id="we_fab_dot"></span>
            </button>
            <div id="we_popup" style="display:none;">
                <div id="we_pop_tier"></div>
                <div id="we_pop_impact"></div>
                <div id="we_pop_category" style="display:none;"></div>
                <div id="we_pop_event"></div>
                <div id="we_pop_scene">
                    <span id="we_pop_scene_label">Scene</span>
                    <span id="we_pop_scene_val">—</span>
                </div>
                <div id="we_pop_threads" style="display:none;"></div>
                <div id="we_pop_tension">
                    <span id="we_pop_tension_label">Tension</span>
                    <div id="we_pop_bar_bg"><div id="we_pop_bar_fill"></div></div>
                    <span id="we_pop_tension_val"></span>
                </div>
            </div>
        </div>
    `);

    $('body').append($widget);

    // The widget is read-only — scene mode is configured in the settings panel.
    $('#we_fab').on('click', function(e) {
        e.stopPropagation();
        const $popup = $('#we_popup');
        $popup.is(':visible') ? $popup.hide() : $popup.show();
    });
    $(document).on('click.we_widget', function(e) {
        if (!$(e.target).closest('#we_widget').length) $('#we_popup').hide();
    });

    syncModeControls();
}

// Reflect current mode in the (read-only) widget and in the settings panel.
function syncModeControls() {
    const s = extension_settings[EXT];
    const effective = getEffectiveModeId();
    // status marks: hand = set manually, lock = auto-detection paused
    const marks =
        (s.modeSource === 'manual' ? ' <i class="fa-solid fa-hand we_mode_mark" title="Set manually"></i>' : '') +
        (s.modeLock ? ' <i class="fa-solid fa-lock we_mode_mark" title="Detection paused"></i>' : '');

    // widget: display only
    $('#we_pop_scene_val').html(SCENE_MODES[effective].name + marks);

    // threads line (only when enabled and something is open)
    const $thr = $('#we_pop_threads');
    if ($thr.length) {
        const threads = s.showThreads ? getThreads() : [];
        if (threads.length) {
            const names = threads.map(t => {
                if (t.stage && THREAD_STAGES[t.stage]) return `${THREAD_STAGES[t.stage].name} (акт 3)`;
                return THREAD_THEMES.find(x => x.id === t.id)?.name || t.id;
            });
            $thr.html(`<i class="fa-solid fa-timeline we_thread_icon"></i> ${names.join(' · ')}`).show();
        } else {
            $thr.hide();
        }
    }

    // settings panel mirrors
    $('#we_mode_source').val(s.modeSource);
    $('#we_mode_manual').val(s.manualMode);
    $('#we_mode_lock_cb').prop('checked', !!s.modeLock);
    $('#we_mode_current').html(SCENE_MODES[effective].name + marks);
}

function updateWidget(result) {
    const s = extension_settings[EXT];
    if (!s.showBadge) { $('#we_widget').hide(); return; }

    ensureWidget();
    const isNone = !result || result.scale.id === 'NONE';

    if (isNone) {
        const tension = result?.tension ?? getTension();
        $('#we_fab_dot').attr('class', 'we_dot_none');
        $('#we_pop_tier').text('NO CHANGE');
        $('#we_pop_impact').html('<span style="opacity:0.4">—</span>');
        $('#we_pop_category').hide();
        $('#we_pop_event').text('Story continues naturally.');
        $('#we_pop_tension_val').text(`${tension.toFixed(1)}%`);
        $('#we_pop_bar_fill').css('width', `${Math.min(100, tension)}%`);
        syncModeControls();
        $('#we_widget').show();
        return;
    }

    const isPos = result.isPositive;
    const tension = result.tension ?? getTension();

    $('#we_fab_dot').attr('class', isPos ? 'we_dot_pos' : 'we_dot_neg');
    $('#we_pop_tier').text(result.scale.name);
    $('#we_pop_impact').html(
        `<span class="${isPos ? 'we_pop_arrow_pos' : 'we_pop_arrow_neg'}">${isPos ? '▲' : '▼'}</span> ${isPos ? 'Positive' : 'Negative'}`
    );
    if (result.category) {
        $('#we_pop_category').text(result.category.name).show();
    } else {
        $('#we_pop_category').hide();
    }
    // lite has no concrete event — show what the model was asked to invent
    $('#we_pop_event').text(result.eventType || (result.lite ? result.scale.desc : ''));
    $('#we_pop_tension_val').text(`${tension.toFixed(1)}%`);
    $('#we_pop_bar_fill').css('width', `${Math.min(100, tension)}%`);
    syncModeControls();
    $('#we_widget').show();
}

// ── Panel UI ───────────────────────────────────────────────

function updateUI(result) {
    const t = result?.tension ?? getTension();
    $('#we_tension_val').text(`${t.toFixed(1)}%`);
    $('#we_tension_bar').css('width', `${Math.min(100, t)}%`);

    if (!result) return;

    $('#we_roll_val').text(result.forced ? '⚡ FORCED' : `${result.baseRoll} + ${result.modifier} = ${result.finalScore}`);

    const evEl = $('#we_event_val');
    evEl.text(result.scale.name);
    evEl.css('color', result.scale.id === 'NONE'
        ? 'var(--SmartThemeBodyColor)'
        : result.isPositive ? '#66bb6a' : '#ef5350');

    if (result.category && result.scale.id !== 'NONE') {
        $('#we_category_val').text(result.category.name);
        $('#we_category_row').show();
    } else {
        $('#we_category_row').hide();
    }

    const typeText = result.eventType || (result.lite ? result.scale.desc : '');
    if (typeText && result.scale.id !== 'NONE') {
        $('#we_type_val').text(typeText);
        $('#we_type_row').show();
    } else {
        $('#we_type_row').hide();
    }

    const impEl = $('#we_impact_val');
    if (result.scale.id === 'NONE') {
        impEl.text('—').css('color', 'var(--SmartThemeBodyColor)');
    } else {
        impEl.text(result.isPositive ? '▲ POSITIVE' : '▼ NEGATIVE');
        impEl.css('color', result.isPositive ? '#66bb6a' : '#ef5350');
    }
}

// Highlight the active engine button and explain what it does. Rows that only
// make sense for the default engine (category, event text) are hidden in lite.
function syncEngineUI() {
    const s = extension_settings[EXT];
    const lite = s.engineMode === 'lite';
    $('.we_seg_btn').each(function () {
        $(this).toggleClass('we_seg_active', $(this).data('engine') === s.engineMode);
    });
    $('#we_engine_hint').text(lite
        ? 'The extension rolls and injects only the tier and impact — the model invents the event. Threads and event pools are paused, their progress is kept.'
        : 'Curated events from the pools, with scene modes and story threads.');
    if (lite) { $('#we_category_row').hide(); $('#we_type_row').hide(); }
}

function toggleAccordion(bodyId, iconEl) {
    $(`#${bodyId}`).slideToggle(150);
    $(iconEl).toggleClass('we_acc_open');
}

function buildUI() {
    const html = `
    <div id="we_panel" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Wild Events</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">

            <!-- ── Accordion: Events ── -->
            <div class="we_accordion">
                <div class="we_accordion_header" data-target="we_sec_events">
                    <span><i class="fa-solid fa-dice-d20"></i> Events</span>
                    <i class="fa-solid fa-chevron-down we_acc_icon"></i>
                </div>
                <div class="we_accordion_body" id="we_sec_events">
                    <label class="checkbox_label" style="margin-bottom:6px;">
                        <input type="checkbox" id="we_toggle" /><span>Enable</span>
                    </label>
                    <label class="checkbox_label" style="margin-bottom:6px;">
                        <input type="checkbox" id="we_show_badge" /><span>Show widget</span>
                    </label>

                    <label style="margin-top:4px;"><small>Engine</small></label>
                    <div class="we_seg">
                        <button class="we_seg_btn" data-engine="default" title="Curated event pools, scene modes and story threads">Default</button>
                        <button class="we_seg_btn" data-engine="lite" title="Only the tier and impact are injected — the model invents the event">Lite</button>
                    </div>
                    <div id="we_engine_hint" class="we_hint"></div>

                    <div class="we_section">
                        <div class="we_row"><span>Tension</span><b id="we_tension_val">0%</b></div>
                        <div class="we_bar_bg"><div class="we_bar_fill" id="we_tension_bar"></div></div>
                    </div>

                    <div class="we_section we_results">
                        <div class="we_row"><span>Roll</span><span id="we_roll_val">—</span></div>
                        <div class="we_row"><span>Event</span><b id="we_event_val">—</b></div>
                        <div class="we_row" id="we_category_row" style="display:none;"><span>Category</span><span id="we_category_val">—</span></div>
                        <div class="we_type_row" id="we_type_row" style="display:none;"><span id="we_type_val"></span></div>
                        <div class="we_row"><span>Impact</span><span id="we_impact_val">—</span></div>
                        <div class="we_row"><span>Scene</span><span id="we_mode_current">—</span></div>
                    </div>

                    <label style="margin-top:6px;"><small>Injection label</small></label>
                    <input type="text" id="we_label" class="text_pole" placeholder="WILD EVENTS" />
                    <label><small>Tension per message</small></label>
                    <input type="number" id="we_step" class="text_pole" min="0.1" max="10" step="0.1" />
                    <label><small>Injection depth (0 = end of context)</small></label>
                    <input type="number" id="we_depth" class="text_pole" min="0" max="100" step="1" />
                    <label><small>World-shaking unlock (min messages in chat)</small></label>
                    <input type="number" id="we_ws_min" class="text_pole" min="0" max="500" step="10" />
                    <div style="margin-top:8px;display:flex;gap:6px;">
                        <input type="button" id="we_reset" class="menu_button" value="⟳ Reset Tension" style="flex:1;" />
                        <input type="button" id="we_reset_counts" class="menu_button" value="⟳ Reset Counts" style="flex:1;" />
                    </div>
                </div>
            </div>

            <!-- ── Accordion: Scene Modes ── -->
            <div class="we_accordion">
                <div class="we_accordion_header" data-target="we_sec_modes">
                    <span><i class="fa-solid fa-masks-theater"></i> Scene Modes</span>
                    <i class="fa-solid fa-chevron-down we_acc_icon"></i>
                </div>
                <div class="we_accordion_body" id="we_sec_modes" style="display:none;">
                    <label class="checkbox_label" style="margin-bottom:6px;">
                        <input type="checkbox" id="we_mode_enabled" /><span>Enable scene modes</span>
                    </label>

                    <label><small>Source</small></label>
                    <select id="we_mode_source" class="text_pole">
                        <option value="auto">Auto-detect</option>
                        <option value="manual">Manual</option>
                    </select>

                    <label><small>Manual mode</small></label>
                    <select id="we_mode_manual" class="text_pole"></select>

                    <label class="checkbox_label" style="margin:6px 0;">
                        <input type="checkbox" id="we_mode_lock_cb" /><span>Lock current mode (pause detection)</span>
                    </label>

                    <label style="margin-top:8px;"><small>Infoblock markers (MODE: root, root — matched in the first chars of the last AI message; RU/EN roots)</small></label>
                    <textarea id="we_info_markers" class="text_pole" rows="7" style="width:100%;box-sizing:border-box;font-size:0.85em;resize:vertical;"></textarea>
                    <div style="font-size:0.78em;opacity:0.55;margin-top:4px;">
                        Detection relies on the model classifying the scene in its infoblock (see preset instructions). No marker found → last mode is kept.
                    </div>
                </div>
            </div>

            <!-- ── Accordion: Threads ── -->
            <div class="we_accordion">
                <div class="we_accordion_header" data-target="we_sec_threads">
                    <span><i class="fa-solid fa-timeline"></i> Threads</span>
                    <i class="fa-solid fa-chevron-down we_acc_icon"></i>
                </div>
                <div class="we_accordion_body" id="we_sec_threads" style="display:none;">
                    <div style="font-size:0.82em;opacity:0.6;margin-bottom:6px;">
                        Seeded story threads that ripen into payoffs. Engine is live; content pools arrive in waves.
                    </div>
                    <label class="checkbox_label" style="margin-bottom:6px;">
                        <input type="checkbox" id="we_show_threads" /><span>Show active threads in widget</span>
                    </label>
                    <label><small>Max concurrent threads</small></label>
                    <input type="number" id="we_max_threads" class="text_pole" min="1" max="10" step="1" />
                    <label><small>Thread max age (messages before it fades)</small></label>
                    <input type="number" id="we_thread_age" class="text_pole" min="5" max="200" step="5" />
                </div>
            </div>

        </div>
    </div>`;
    $('#extensions_settings').append(html);
}

// ── Init ───────────────────────────────────────────────────

jQuery(async () => {
    buildUI();

    if (!extension_settings[EXT]) extension_settings[EXT] = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (extension_settings[EXT][k] === undefined) extension_settings[EXT][k] = v;
    }
    const s = extension_settings[EXT];

    // detection config
    if (!s.infoMarkers) s.infoMarkers = DEFAULT_INFO_MARKERS;
    // выпилено: keyword-фоллбэк и редактируемый lite-промпт
    delete s.kw; delete s.modeScanDepth; delete s.modeThreshold; delete s.litePrompt;

    $('#we_toggle').prop('checked', s.enabled);
    $('#we_show_badge').prop('checked', s.showBadge);
    $('#we_label').val(s.label);
    $('#we_step').val(s.step);
    $('#we_depth').val(s.depth);
    $('#we_ws_min').val(s.wsMinMsgs);
    syncEngineUI();

    // scene modes panel
    const $manual = $('#we_mode_manual');
    for (const id of ['NEUTRAL', ...MODE_ORDER]) {
        $manual.append(`<option value="${id}">${SCENE_MODES[id].name}</option>`);
    }
    $('#we_mode_enabled').prop('checked', s.modeEnabled);
    $('#we_mode_source').val(s.modeSource);
    $manual.val(s.manualMode);
    $('#we_mode_lock_cb').prop('checked', !!s.modeLock);
    $('#we_info_markers').val(s.infoMarkers);

    // threads panel
    $('#we_show_threads').prop('checked', !!s.showThreads);
    $('#we_max_threads').val(s.maxThreads);
    $('#we_thread_age').val(s.threadMaxAge);

    updateUI(s._lastResult || null);
    syncModeControls();

    $(document).on('click', '.we_accordion_header', function () {
        const target = $(this).data('target');
        toggleAccordion(target, $(this).find('.we_acc_icon')[0]);
    });

    $('#we_toggle').on('change', function () { s.enabled = this.checked; saveSettingsDebounced(); if (!this.checked) setExtensionPrompt(EXT, '', 1, s.depth); });
    $('#we_show_badge').on('change', function () { s.showBadge = this.checked; saveSettingsDebounced(); if (!this.checked) $('#we_widget').hide(); });
    $('#we_label').on('input', function () { s.label = this.value; saveSettingsDebounced(); });
    $('#we_step').on('input', function () { s.step = parseFloat(this.value) || DEFAULTS.step; saveSettingsDebounced(); });
    $('#we_depth').on('input', function () { s.depth = parseInt(this.value) || DEFAULTS.depth; saveSettingsDebounced(); });
    $('#we_ws_min').on('input', function () { const v = parseInt(this.value); s.wsMinMsgs = Number.isFinite(v) ? v : DEFAULTS.wsMinMsgs; saveSettingsDebounced(); });

    $(document).on('click', '.we_seg_btn', function () {
        s.engineMode = $(this).data('engine');
        saveSettingsDebounced();
        syncEngineUI();
    });

    // scene modes
    $('#we_mode_enabled').on('change', function () { s.modeEnabled = this.checked; saveSettingsDebounced(); syncModeControls(); });
    $('#we_mode_source').on('change', function () { s.modeSource = this.value; saveSettingsDebounced(); syncModeControls(); });
    $('#we_mode_manual').on('change', function () { s.manualMode = this.value; saveSettingsDebounced(); syncModeControls(); });
    $('#we_mode_lock_cb').on('change', function () { s.modeLock = this.checked; saveSettingsDebounced(); syncModeControls(); });
    $('#we_info_markers').on('input', function () { s.infoMarkers = this.value; saveSettingsDebounced(); });

    // threads
    $('#we_show_threads').on('change', function () { s.showThreads = this.checked; saveSettingsDebounced(); syncModeControls(); });
    $('#we_max_threads').on('input', function () { s.maxThreads = parseInt(this.value) || DEFAULTS.maxThreads; saveSettingsDebounced(); });
    $('#we_thread_age').on('input', function () { s.threadMaxAge = parseInt(this.value) || DEFAULTS.threadMaxAge; saveSettingsDebounced(); });

    $('#we_reset').on('click', () => {
        saveTension(0); updateUI(null);
        $('#we_roll_val').text('—'); $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', ''); $('#we_type_row').hide(); $('#we_category_row').hide();
        toastr.info('Tension reset to 0%');
    });
    $('#we_reset_counts').on('click', () => { resetEventCounts(); toastr.info('Event frequency counters reset.'); });

    // ── ST event hooks ──
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        if (s.showBadge && s._lastResult) updateWidget(s._lastResult);
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        s._lastResult = null;
        // Reset panel display to zero immediately on chat switch
        $('#we_tension_val').text('0%');
        $('#we_tension_bar').css('width', '0%');
        $('#we_roll_val').text('—');
        $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', '');
        $('#we_type_row').hide();
        $('#we_category_row').hide();
        $('#we_widget').hide();
        syncModeControls();
    });
});
