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
    mode: 'full',       // 'full' = detailed events+branches, 'prompt' = minimal prompt-based
    step: 0.5,
    promptStep: 0.5,     // tension step for prompt mode (default +0.5% per message)
    label: 'WILD EVENTS',
    depth: 0,
    showBadge: true,
    showDebug: false,
};

// ── Prompt-mode scale tiers (from the original prompt) ────
const PROMPT_SCALES = [
    { min: 1,  max: 10, id: 'NONE',        name: 'NO CHANGE',        adj: null },
    { min: 11, max: 14, id: 'SUBTLE',      name: 'SUBTLE CHANGE',    adj: null },
    { min: 15, max: 19, id: 'MINOR',       name: 'MINOR PLOT TWIST', adj: null },
    { min: 20, max: 24, id: 'MAJOR',       name: 'MAJOR PLOT TWIST', adj: 'reduce25' },
    { min: 25, max: 99, id: 'GIANT',       name: 'GIANT PLOT TWIST', adj: 'reset' },
];

// ── Scale tiers ────────────────────────────────────────────

const SCALES = [
    { min: 1,  max: 10, id: 'NONE',         name: 'NO CHANGE',       adj: null },
    { min: 11, max: 14, id: 'SUBTLE',       name: 'SUBTLE CHANGE',    adj: null },
    { min: 15, max: 18, id: 'MINOR',        name: 'MINOR TWIST',      adj: null },
    { min: 19, max: 22, id: 'TURNING',      name: 'TURNING POINT',    adj: 'reduce25' },
    { min: 23, max: 26, id: 'MAJOR',        name: 'MAJOR TWIST',      adj: 'reduce50' },
    { min: 27, max: 99, id: 'WORLDSHAKING', name: 'WORLD-SHAKING',    adj: 'reset' },
];

// ── Event categories with weights ──────────────────────────

const CATEGORIES = [
    { id: 'INTERPERSONAL', name: 'Interpersonal', weight: 30 },
    { id: 'EMOTIONAL',     name: 'Emotional',     weight: 25 },
    { id: 'ENVIRONMENTAL', name: 'Environmental', weight: 20 },
    { id: 'DISCOVERY',     name: 'Discovery',     weight: 15 },
    { id: 'EXTERNAL',      name: 'External',      weight: 10 },
];

// ── Branch arcs (auto-generated) ────────────────────────────
// Each event fires as an OPENER (seed) or CLOSER (terminator)
// of one or more arcs. When an arc's flag is set, weights of
// its developers and terminators are multiplied by boost.
// Flags live in chatMetadata.we_flags -- reset on new chat.

const BRANCHES = {
    BOND_ARC: {
        flag: 'branch_bond',
        boost: 3.0,
        description: 'Trust/warmth/closeness under strain. Opens with friction in an existing bond, resolves in reconciliation, break, or someone lost returns.',
        seeds: new Set([
            'someone discovers they are angry at a person they are not allowed to be angry at',
            'a relationship that seemed stable reveals a fault line neither person knew was there',
            'loyalty is tested and the result is ambiguous — not a betrayal, but not reassuring either',
            'a boundary is crossed that was never explicitly stated but both people knew it existed',
            'a misunderstanding between two people solidifies into something harder to fix than the original issue',
            'someone takes a visible risk on behalf of another person without being sure it will be appreciated',
            'someone who has been holding back offers genuine help and the offer is not transactional',
            'a gesture of trust is reciprocated in a way that raises the stakes for both people',
            'someone discovers they are loved in a way they did not know they needed',
            'a moment of honesty between two people reveals that they want fundamentally incompatible things',
            'someone withdraws their emotional investment visibly and the withdrawal changes the room',
            'someone chooses another person over their own safety and the choice is witnessed',
            'a declaration is made — of loyalty, of love, of commitment — that cannot be retracted and changes the stakes',
            'a relationship moves from transactional to genuine through a moment that was not planned',
            'a third party acknowledges the relationship between two people in a way that gives it legitimacy or weight',
        ]),
        developers: new Set([
            'a promise is broken and both parties know it was a real promise not a casual one',
            'a previously one-sided relationship shows signs of becoming reciprocal',
            'someone apologizes and the apology is specific enough to prove they understood what they did',
            'a barrier between two people — formality, rank, old resentment — drops for the first time',
            'someone admits they were wrong to a person whose respect they value',
            'two people who have been circling each other finally have a real conversation',
            'something that was believed lost is found and its return changes what is possible',
            'a discovery proves that someone who was doubted was right all along',
            'a record, testimony, or artifact surfaces that vindicates a controversial decision',
            'a place of historical or strategic significance is reached and it provides what was sought',
            'an external event validates the characters\' position to people who were skeptical',
            'an external resource arrives that was given up on — late, but still in time',
            'a relationship that has been sustaining both people reaches a point where it is sustaining neither',
            'a promise is broken under pressure and both people know the pressure is not a sufficient excuse',
            'a confrontation that has been avoided finally happens and it is worse than either person imagined',
            'a relationship that has been defined by caution shifts to one defined by trust through a single decisive moment',
            'a conflict that has been building reaches its peak and resolves through vulnerability rather than force',
            'two people who have been on opposite sides find common ground that neither expected',
            'an act of forgiveness occurs that changes what is possible going forward',
            'someone who has been absent or distant returns and their return changes the emotional landscape',
            'someone proves their worth to a person whose opinion they had given up on changing',
            'someone makes a sacrifice for another person and the sacrifice is understood and honored',
            'a pattern of miscommunication between two people breaks because one of them finally says the real thing',
        ]),
        terminators: new Set([
            'a discovery proves that a sacrifice made earlier accomplished what it was meant to accomplish',
            'a piece of knowledge that was lost is recovered and its recovery changes the rules',
            'evidence surfaces that vindicates a decision everyone else condemned',
            'a record of the past is found that provides moral authority for the present',
            'a moment of emotional honesty between two people changes the trajectory of the story',
            'a place of significance is reached after a long journey and it delivers what was promised',
            'a place of healing or restoration is found and it works as needed',
            'a place that was thought to be empty or dead shows signs of life or recovery',
            'an external event proves the characters right in the eyes of people who matter',
            'a call for help sent long ago is answered with more than was asked for',
            'an external witness provides testimony or evidence that changes the balance of power',
            'a resource from the outside world arrives that was believed to no longer exist',
            'a relationship that was the foundation of someone\'s stability collapses completely',
            'someone is abandoned by the last person they believed would stay',
            'an act of desperation damages a relationship beyond what the desperation justified',
            'two people who were essential to each other become harmful to each other',
            'a bond is tested by something that should have broken it and the bond holds',
            'someone who has been an antagonist throughout the story chooses a different path and commits to it',
            'a relationship reaches a depth where both people understand each other without the need for explanation',
            'someone makes a public commitment to another person that changes their standing with everyone else',
            'a rift between two people that defined the story resolves through mutual recognition of fault',
            'a sacrifice is made for another person and the person it was made for witnesses it and is changed by it',
            'a person who has been isolated is fully accepted into a group and the acceptance is unconditional',
            'someone proves their loyalty in a way that costs them everything they had to lose',
            'a betrayal is forgiven and the forgiveness transforms both the betrayer and the betrayed',
            'a piece of knowledge that was considered lost forever resurfaces and it changes what is possible',
            'a discovery reveals that a sacrifice previously thought wasted actually accomplished exactly what it was meant to',
            'a discovery proves that someone who was condemned was actually innocent — and the proof is undeniable',
            'something thought to be unique and irreplaceable turns out to exist in another form',
            'a hidden message or legacy left by someone long gone arrives at exactly the right moment',
            'a moment of complete emotional honesty destroys something that needed the lie to survive',
            'a moment of complete emotional honesty changes the trajectory of everything around it',
            'someone\'s vulnerability shown at the worst possible moment turns out to be exactly what was needed',
            'a safe place that was lost is recovered and returning to it changes the meaning of everything that happened since',
            'a place that was believed to be destroyed turns out to have survived in a form no one expected',
            'a resource or reinforcement arrives from a source no one thought to ask',
            'an external witness validates the characters\' version of events when no one else would',
            'a call for help that was sent long ago is finally answered',
            'the outside world learns what has been happening here and the response is support rather than judgment',
            'an institution or system that was corrupt or broken begins to reform in a way that directly helps',
            'a bond that was the emotional foundation of the story breaks under a weight it cannot carry',
            'a sacrifice made for someone is rejected and the rejection cannot be undone',
            'a bond between two people reaches a depth that fundamentally changes what they are willing to do for each other',
            'someone who has been an enemy for the entire story chooses the other side — and means it',
            'a relationship that everyone assumed was broken beyond repair reconstitutes around something no one expected',
            'two people whose conflict has defined the story reach an understanding that makes the conflict irrelevant',
            'someone sacrifices their position, safety, or future for another person without hesitation or conditions',
            'a person everyone underestimated becomes the one whose loyalty holds everything together',
            'a declaration — of love, of allegiance, of truth — is made publicly and cannot be taken back and it changes everything',
            'someone forgives something that was considered unforgivable and the forgiveness is genuine',
            'a promise made long ago is fulfilled under circumstances that make it mean far more than when it was given',
            'a group fractures and the way it reassembles reveals who truly matters to whom',
            'a relationship reaches a turning point where both people see each other completely and choose to stay',
        ]),
    },
    RIVALRY_ARC: {
        flag: 'branch_rivalry',
        boost: 3.0,
        description: 'Competition, self-interest against another, contested authority. Resolves in reconciliation (overcome), lasting break (becomes enmity), or one side taking power.',
        seeds: new Set([
            'a third person becomes involved in a dynamic between two others and the triangle creates pressure',
            'two people want the same thing and there is not enough of it for both',
            'someone makes a choice that benefits themselves at a visible cost to another person',
            'the power dynamic in a relationship reverses and the reversal is not comfortable for either person',
        ]),
        developers: new Set([
            'a promise is broken and both parties know it was a real promise not a casual one',
            'a previously one-sided relationship shows signs of becoming reciprocal',
            'someone apologizes and the apology is specific enough to prove they understood what they did',
            'a barrier between two people — formality, rank, old resentment — drops for the first time',
            'someone admits they were wrong to a person whose respect they value',
            'two people who have been circling each other finally have a real conversation',
            'a discovery proves that someone who was doubted was right all along',
            'a record, testimony, or artifact surfaces that vindicates a controversial decision',
            'an external event validates the characters\' position to people who were skeptical',
            'a relationship that has been sustaining both people reaches a point where it is sustaining neither',
            'a promise is broken under pressure and both people know the pressure is not a sufficient excuse',
            'a confrontation that has been avoided finally happens and it is worse than either person imagined',
            'a relationship that has been defined by caution shifts to one defined by trust through a single decisive moment',
            'a conflict that has been building reaches its peak and resolves through vulnerability rather than force',
            'two people who have been on opposite sides find common ground that neither expected',
            'an act of forgiveness occurs that changes what is possible going forward',
            'someone who has been absent or distant returns and their return changes the emotional landscape',
            'someone proves their worth to a person whose opinion they had given up on changing',
            'someone makes a sacrifice for another person and the sacrifice is understood and honored',
            'a pattern of miscommunication between two people breaks because one of them finally says the real thing',
        ]),
        terminators: new Set([
            'a discovery proves that a sacrifice made earlier accomplished what it was meant to accomplish',
            'evidence surfaces that vindicates a decision everyone else condemned',
            'a record of the past is found that provides moral authority for the present',
            'a moment of emotional honesty between two people changes the trajectory of the story',
            'an external event proves the characters right in the eyes of people who matter',
            'an external witness provides testimony or evidence that changes the balance of power',
            'a relationship that was the foundation of someone\'s stability collapses completely',
            'someone is abandoned by the last person they believed would stay',
            'an act of desperation damages a relationship beyond what the desperation justified',
            'two people who were essential to each other become harmful to each other',
            'a bond is tested by something that should have broken it and the bond holds',
            'someone who has been an antagonist throughout the story chooses a different path and commits to it',
            'a relationship reaches a depth where both people understand each other without the need for explanation',
            'someone makes a public commitment to another person that changes their standing with everyone else',
            'a rift between two people that defined the story resolves through mutual recognition of fault',
            'a sacrifice is made for another person and the person it was made for witnesses it and is changed by it',
            'a person who has been isolated is fully accepted into a group and the acceptance is unconditional',
            'someone proves their loyalty in a way that costs them everything they had to lose',
            'a leader earns the trust of those who follow through action rather than authority',
            'a betrayal is forgiven and the forgiveness transforms both the betrayer and the betrayed',
            'a discovery reveals that a sacrifice previously thought wasted actually accomplished exactly what it was meant to',
            'a discovery proves that someone who was condemned was actually innocent — and the proof is undeniable',
            'a hidden message or legacy left by someone long gone arrives at exactly the right moment',
            'a moment of complete emotional honesty destroys something that needed the lie to survive',
            'a moment of complete emotional honesty changes the trajectory of everything around it',
            'someone\'s vulnerability shown at the worst possible moment turns out to be exactly what was needed',
            'an authority or power structure that was an obstacle collapses and what replaces it is an opportunity',
            'an external witness validates the characters\' version of events when no one else would',
            'the outside world learns what has been happening here and the response is support rather than judgment',
            'an institution or system that was corrupt or broken begins to reform in a way that directly helps',
            'a bond that was the emotional foundation of the story breaks under a weight it cannot carry',
            'a sacrifice made for someone is rejected and the rejection cannot be undone',
            'a bond between two people reaches a depth that fundamentally changes what they are willing to do for each other',
            'someone who has been an enemy for the entire story chooses the other side — and means it',
            'a relationship that everyone assumed was broken beyond repair reconstitutes around something no one expected',
            'two people whose conflict has defined the story reach an understanding that makes the conflict irrelevant',
            'someone sacrifices their position, safety, or future for another person without hesitation or conditions',
            'a person everyone underestimated becomes the one whose loyalty holds everything together',
            'a declaration — of love, of allegiance, of truth — is made publicly and cannot be taken back and it changes everything',
            'someone forgives something that was considered unforgivable and the forgiveness is genuine',
            'a promise made long ago is fulfilled under circumstances that make it mean far more than when it was given',
            'a group fractures and the way it reassembles reveals who truly matters to whom',
            'a relationship reaches a turning point where both people see each other completely and choose to stay',
        ]),
    },
    WOUND_ARC: {
        flag: 'branch_wound',
        boost: 3.0,
        description: 'Old pain surfaces. Resolves in healing or reopening.',
        seeds: new Set([
            'a defense mechanism that usually works fails to protect against the current situation',
            'someone realizes they have been avoiding a feeling by staying busy and the busyness just stopped',
            'an emotional truth becomes impossible to ignore but equally impossible to address right now',
            'someone who has been strong for others reaches the point where the strength is performative',
            'someone discovers they are afraid of something they did not know they were afraid of',
            'an emotion that was tangled with guilt separates from it and becomes simply itself',
            'someone who was relied on reveals they are dealing with something that limits their capacity',
            'someone realizes they have become dependent on a person who may not stay',
            'two people discover a shared experience neither of them talks about and the recognition is mutual',
            'someone reveals something vulnerable and the response they get is better than what they feared',
            'a feeling of safety is shattered by something that should not have been able to reach it',
            'a moment of cruelty — deliberate or careless — damages something that was fragile and important',
        ]),
        developers: new Set([
            'someone recognizes they are repeating a pattern they swore they would not repeat',
            'an old grief is reactivated by something that should not have been able to reach it',
            'a fear that has been driving decisions is named aloud and loses some of its power',
            'an emotional pattern that has been repeating finally breaks in a small but real way',
            'a memory that has been avoided is faced and turns out to be survivable',
            'someone realizes they have been punishing themselves for something that was not their fault',
            'an old wound stops hurting in a way that is noticeable',
            'someone realizes they no longer need something they used to depend on',
            'someone in a position of external authority makes a hostile or indifferent decision',
            'an old grievance that was thought resolved resurfaces in a new form',
            'a numbing that has been protective wears off and everything it was blocking arrives at once',
            'someone realizes they have been grieving something that is not actually gone — and the grief was about something else entirely',
            'someone who has been holding themselves together for others reaches the moment where they cannot',
            'a grief that has been carried for a long time is shared with someone and the sharing changes its weight',
            'an emotional truth that has been circling finally lands and it brings relief rather than pain',
            'someone stops fighting a feeling they have been resisting and the surrender is freeing',
            'a cycle of guilt or shame is interrupted by an external event that forces perspective',
            'someone accepts a loss they have been refusing to grieve and the acceptance opens something new',
            'someone stops performing an emotion and starts feeling the real one underneath',
            'a realization arrives that changes the meaning of past suffering — it was not pointless',
            'someone discovers that the thing they have been running from was never as large as they imagined',
            'an emotional wall comes down not through force but through exhaustion and what is behind it is better than expected',
            'a place that held only negative associations reveals something that changes how it is experienced',
            'a place that was hostile becomes neutral or welcoming through a change no one controlled',
        ]),
        terminators: new Set([
            'someone reaches a point of emotional damage where recovery is uncertain',
            'a feeling of rage takes over a person who has always prided themselves on control',
            'a grief compounds with other grief until the total is unbearable',
            'an emotional dependency is suddenly removed and the withdrawal is severe',
            'someone is confronted with the full weight of what they have done and the weight is crushing',
            'someone breaks a promise to themselves and the breaking feels final',
            'an emotion that was being held at bay breaks through all defenses simultaneously',
            'a fundamental fear is confronted and although the confrontation is painful it results in freedom',
            'someone allows themselves to feel something they have been preventing for the entire story and it does not destroy them',
            'someone discovers that the strength they thought came from suppression actually comes from feeling',
            'someone who has been defined by loss discovers they are also defined by what they still have',
            'a breakdown occurs and the rebuilding that follows produces something stronger than what was there before',
            'someone makes peace with an aspect of themselves they have been at war with',
            'an emotional burden that has been carried alone is shared and the sharing is transformative',
            'someone discovers they have the capacity for forgiveness they did not believe they possessed',
            'a place that has been hostile for the entire story becomes passable or safe',
            'someone\'s attempt to protect another person is the thing that causes the most damage',
            'a pattern of harm within a relationship is finally named and naming it does not fix it',
            'two people whose relationship has been marked by pain find a way to be in each other\'s lives without pain',
            'a truth that everyone was afraid to face turns out to be survivable — difficult, but survivable',
            'someone reaches a point of emotional exhaustion where they can no longer feel what they need to feel',
            'a grief arrives that is larger than anything the person has the capacity to process',
            'a feeling that has been building for the entire story finally arrives and it is worse than anticipated',
            'someone\'s emotional armor finally fails and what comes through is not sadness but rage',
            'a memory that was a source of comfort is revealed to have been inaccurate and the real version is devastating',
            'an emotion that was supposed to be resolved returns with accumulated force and is no longer manageable',
            'a grief that has defined someone for the entire story finally begins to release its hold',
            'someone who has been performing strength finally allows themselves to break down and discovers they are held',
            'a fear that has controlled someone\'s decisions for the entire arc is faced and does not destroy them',
            'someone who has been numb for a long time feels something real again and it is not pain',
            'a cycle of self-destruction that seemed permanent is broken by a single moment of genuine connection',
            'a memory that has been a source of pain is recontextualized and becomes a source of strength',
            'someone forgives themselves for something they believed was unforgivable',
            'an emotion that has been suppressed for the entire story surfaces and it turns out to be the right one',
            'a burden carried alone for the entire story is finally shared and the sharing makes it bearable',
            'a place that has been hostile for the entire story transforms — the danger lifts and what remains is something new',
            'a place that held painful memories is retaken and returning to it on new terms changes what it meant',
        ]),
    },
    SECRET_ARC: {
        flag: 'branch_secret',
        boost: 3.0,
        description: 'Someone is hiding something / lying / has hidden agenda. Resolves in exposure or confirmed betrayal.',
        seeds: new Set([
            'someone finds evidence that something they trusted has been compromised',
            'a document, message, or record is found that changes the understanding of a past event for the worse',
            'a hidden cost of something that seemed free becomes apparent',
            'something that was assumed to be unique turns out to exist in other places — and that is not good',
            'a discovery reveals that an advantage being relied on has already been accounted for by someone else',
            'a piece of information that was being kept from someone is about to reach them through other channels',
            'something thought to be broken turns out to have been deliberately disabled',
            'a discovery reveals that what seemed like a setback was actually the intended outcome of someone else\'s plan',
            'information arrives that is true but that everyone would have been better off not knowing right now',
            'someone realizes their motivation for something they are doing is not what they told themselves it was',
            'someone discovers they have been talked about in a way that changes how they feel about the speaker',
            'someone realizes they have been managing another person rather than relating to them honestly',
            'information arrives that turns an ally into an unknown — not an enemy, but no longer reliable',
            'a discovery reveals that an enemy has been operating under a critical misunderstanding',
            'a third party intervenes and their intervention serves their interests, not the characters\'',
        ]),
        developers: new Set([
            'a discovery reveals that the situation is fundamentally different from what everyone believed',
            'evidence surfaces that someone trusted has been compromised — not by choice, but the result is the same',
            'a truth that was suspected is confirmed and the confirmation is worse than the suspicion',
            'a discovery reveals that a victory was actually a trap or a misdirection',
            'a hidden cost is discovered that retroactively changes the value of everything gained',
            'a discovery proves that a key assumption underpinning the current strategy was incorrect',
            'a record, testimony, or artifact surfaces that contradicts the accepted version of events',
            'a discovery reveals that what seemed like an obstacle was actually protecting something important',
            'a discovery reveals that the characters have been observed for longer than they knew',
            'something that was hidden is uncovered and the reason it was hidden turns out to have been valid',
            'a betrayal occurs that both people know changes everything, even if neither says so immediately',
            'a secret is revealed that retroactively poisons the trust that was built on not knowing',
            'someone realizes they have been used and the realization is sudden and complete',
            'someone who was relied on as stable proves to be the source of the instability',
            'someone reveals a secret they have been carrying and the other person already knew — and stayed anyway',
        ]),
        terminators: new Set([
            'a revelation arrives that changes the meaning of everything — and the new meaning is devastating',
            'a discovery proves that a belief everyone held was wrong, and the decisions made based on it were therefore wrong',
            'evidence surfaces that the real threat has been something entirely different from what everyone was fighting',
            'a discovery reveals the full scope of a problem that was being addressed as though it were smaller',
            'a discovery reveals that an advantage being relied on was an illusion',
            'a hidden truth is uncovered and the reason it was hidden was that knowing it makes everything more dangerous',
            'a record of the past is found that undermines the legitimacy of what is being done in the present',
            'a discovery reveals that an ally has been working with incomplete or incorrect information',
            'a truth that was hidden for protection is revealed and the protection is no longer needed',
            'the environment reveals the scale of a problem that was being perceived locally',
            'a betrayal occurs at the deepest level — the person most trusted is the source',
            'a truth about a relationship is exposed that makes it impossible to continue as before',
            'a public humiliation or exposure damages multiple relationships simultaneously',
            'a lie that has sustained a relationship is exposed and the truth is not survivable',
            'a confession of something deeply hidden is met with the one response the confessor needed',
            'a truth is uncovered that recontextualizes the entire story — and everything that felt like progress was actually serving something else',
            'a discovery reveals that a trusted foundation — a belief, an institution, a history — was built on something false',
            'a secret kept by multiple people is exposed simultaneously and none of them knew the others were keeping it',
            'a pattern becomes visible connecting events no one realized were related — and the pattern is predatory',
            'something thought to be benign or neutral is discovered to have been actively harmful the entire time',
            'a secret that has been carried as a burden is shared and turns out to be a gift',
            'a lie that has been the foundation of something important is exposed and what replaces it is stronger',
            'an emotional dependency that seemed like love is revealed to have been something else entirely',
            'a betrayal is revealed that has been running so long it has shaped the entire relationship',
            'someone trusted completely turns out to have had a separate agenda from the very beginning',
            'a lie told to protect someone is exposed and the person it was meant to protect is the one most damaged',
            'a public exposure of a private relationship destroys both people\'s positions',
            'someone discovers they have been a tool in another person\'s plan — and the plan is not over',
            'a relationship that seemed like the safest thing in the story becomes the most dangerous',
            'someone\'s love or devotion is used as a weapon against them by the person they trusted most',
            'a connection between two people is revealed to have been engineered by a third party for their own purposes',
            'a long-buried truth between two people finally surfaces and instead of destroying them it sets them free',
            'a betrayal is revealed to have been protection all along and the cost of that protection becomes visible',
        ]),
    },
    MYSTERY_ARC: {
        flag: 'branch_mystery',
        boost: 3.0,
        description: 'Something unexplained enters the story. Resolves in solving it, in leverage found, or in recovered knowledge.',
        seeds: new Set([
            'a hidden location is revealed that changes the strategic landscape entirely',
            'an object is discovered in a place it should not be, and its presence implies something troubling',
            'a connection is made between two events that were assumed to be unrelated, and the connection is alarming',
            'someone discovers that a rule or constraint they thought they understood has an exception they did not know about',
            'a map or description of the situation is found and it contradicts what was believed',
            'an object is discovered whose function or value was not initially apparent',
            'evidence surfaces that an enemy or obstacle has a weakness no one knew about',
            'a piece of old information proves unexpectedly current',
            'the environment reveals that someone or something has been here before and left something useful behind',
            'something that was believed to be unique to this situation turns out to be part of a much larger pattern',
            'a hidden feature of the location reveals itself and it changes the strategic picture completely',
        ]),
        developers: new Set([
            'someone finds evidence that a plan or effort that seemed to be failing is actually working',
            'a connection is made between two pieces of information that individually seemed useless',
            'a document, message, or record is found that changes the understanding of a past event for the better',
            'someone realizes that a rule or constraint they were working around does not actually apply',
            'a discovery confirms a theory that was considered too optimistic',
            'a major piece of the puzzle falls into place and the picture it reveals is actionable',
            'a truth that has been suspected is confirmed and the confirmation comes with proof',
            'something that was believed lost is found and its return changes what is possible',
            'a hidden connection between events reveals a pattern that can be exploited',
            'information arrives that transforms a defensive position into an offensive one',
            'a discovery reveals a path forward that no one had considered because it required information that was not available until now',
            'a breakthrough in understanding occurs that makes a previously impossible problem solvable',
            'evidence is found that the situation is more favorable than the available information suggested',
            'a discovery provides leverage that did not previously exist',
            'a piece of knowledge that was thought to be dangerous turns out to be protective when properly understood',
            'a place of historical or strategic significance is reached and it provides what was sought',
            'an external resource arrives that was given up on — late, but still in time',
            'a piece of external infrastructure that was damaged is restored and its restoration has immediate benefits',
        ]),
        terminators: new Set([
            'a mystery resolves and the resolution makes things harder, not easier',
            'a revelation arrives that changes the meaning of everything that has happened — and the new meaning is better',
            'a hidden truth is uncovered that gives the characters leverage they did not know they had',
            'a mystery that has driven the story resolves in a way that is satisfying and actionable',
            'a piece of knowledge that was lost is recovered and its recovery changes the rules',
            'a discovery reveals a way out of a situation that appeared to have no exit',
            'a breakthrough in understanding makes clear what needs to be done next',
            'a discovery proves that an enemy\'s greatest strength is also their greatest vulnerability',
            'something that was believed to be impossible is proven to be merely very difficult',
            'a discovery reveals that the characters have been closer to their goal than they realized',
            'an emotional risk pays off — not in a practical way, but in a way that matters more',
            'a place of significance is reached after a long journey and it delivers what was promised',
            'a natural boundary that was an obstacle becomes an advantage when the situation changes',
            'a place of healing or restoration is found and it works as needed',
            'a place that was thought to be empty or dead shows signs of life or recovery',
            'an institution or system that was broken begins to function again at the right moment',
            'a broader conflict shifts in a direction that makes the characters\' goals achievable',
            'a call for help sent long ago is answered with more than was asked for',
            'a resource from the outside world arrives that was believed to no longer exist',
            'an external event creates a new normal that is more favorable than the old one',
            'a mystery resolves and the answer is worse than not knowing',
            'a truth is uncovered that recontextualizes the entire story up to this point — and the new context is better',
            'a long-sought answer is finally found and it is not what anyone expected but it is what was needed',
            'a piece of knowledge that was considered lost forever resurfaces and it changes what is possible',
            'a pattern becomes visible that connects events no one realized were related — and the pattern is protective',
            'a mystery that has haunted the story resolves in a way that brings peace rather than more questions',
            'something thought to be unique and irreplaceable turns out to exist in another form',
            'a safe place that was lost is recovered and returning to it changes the meaning of everything that happened since',
            'a place that was believed to be destroyed turns out to have survived in a form no one expected',
            'a resource or reinforcement arrives from a source no one thought to ask',
            'an event elsewhere triggers a chain reaction that reaches the characters as an unexpected advantage',
            'a call for help that was sent long ago is finally answered',
        ]),
    },
    CATASTROPHE_ARC: {
        flag: 'branch_catastrophe',
        boost: 3.0,
        description: 'A disaster is brewing (natural, political, spreading decay, etc.). Resolves in disaster hitting, being averted, lasting loss, hope of return, or hope broken.',
        seeds: new Set([
            'a piece of information arrives that makes the current plan obsolete',
            'an emotional investment that has been building is threatened by circumstances that do not care about feelings',
            'something in the environment begins to change faster than expected and the change is not favorable',
            'an external conflict escalates and begins to affect the local situation',
            'an external deadline accelerates or a constraint tightens',
            'an external alliance or agreement fails and the fallout reaches the characters',
            'the broader situation destabilizes in a way that removes options locally',
            'an external conflict that was distant arrives locally with little warning',
            'an external resource that was being counted on is redirected to a different crisis',
        ]),
        developers: new Set([
            'evidence surfaces that a problem is more advanced than anyone estimated',
            'someone finds evidence that a plan or effort that seemed to be failing is actually working',
            'a discovery confirms a theory that was considered too optimistic',
            'a discovery reveals that the situation is less advanced or less severe than feared',
            'an external conflict that was causing pressure pauses or redirects',
            'an external deadline is extended or a constraint is loosened',
            'information arrives that makes a committed plan obviously wrong but too late to change',
            'something that was believed lost is found and its return changes what is possible',
            'information arrives that transforms a defensive position into an offensive one',
            'a discovery reveals that the worst-case scenario everyone was preparing for is not actually in play',
            'a breakthrough in understanding occurs that makes a previously impossible problem solvable',
            'evidence is found that the situation is more favorable than the available information suggested',
            'a discovery provides leverage that did not previously exist',
            'a hope that has been sustaining someone through difficulty is taken away by circumstances',
            'a feature of the environment that was relied upon fails or disappears',
            'the environment reveals that something has been changing slowly and the cumulative change is now critical',
            'a place that held meaning is damaged or destroyed by environmental forces',
            'a natural boundary that provided protection is breached',
            'a place of historical or strategic significance is reached and it provides what was sought',
            'an external threat that was being monitored accelerates beyond predictions',
            'an external deadline arrives and it is not negotiable',
            'a change in the broader world eliminates an option the characters were keeping in reserve',
            'an external force that was threatening is redirected by events elsewhere',
            'an external conflict resolves in a way that frees the characters from an obligation',
            'an external resource arrives that was given up on — late, but still in time',
            'an external authority reverses a decision that was causing damage',
            'a piece of external infrastructure that was damaged is restored and its restoration has immediate benefits',
            'an external force removes a figure who was causing problems without the characters having to confront them',
            'an external party that was hostile is neutralized by a completely unrelated development',
        ]),
        terminators: new Set([
            'a breakthrough in understanding arrives too late to prevent what it would have prevented',
            'a truth arrives that nobody is ready for and there is no time to become ready',
            'a hidden truth is uncovered that gives the characters leverage they did not know they had',
            'a piece of knowledge that was lost is recovered and its recovery changes the rules',
            'a discovery reveals a way out of a situation that appeared to have no exit',
            'something that was believed to be impossible is proven to be merely very difficult',
            'a discovery reveals that the characters have been closer to their goal than they realized',
            'a hope that has sustained someone is not just disappointed but proven to have been delusional',
            'a moment of emotional clarity arrives and what it reveals is that the situation is exactly as bad as it looks',
            'an emotional risk pays off — not in a practical way, but in a way that matters more',
            'the environment undergoes a change that is clearly irreversible and the implications are severe',
            'a place of safety is destroyed or fundamentally compromised',
            'a catastrophic environmental event forces abandonment of the current position',
            'the environment becomes hostile in a way that is not manageable with available resources',
            'a hidden environmental danger reaches a tipping point with no warning',
            'the landscape transforms in a way that cuts off retreat or escape',
            'a place of significance is reached and it is not what was expected — it is worse',
            'the environment destroys something that cannot be replaced',
            'a place that was being defended becomes impossible to hold',
            'a landmark or natural feature that provided orientation or meaning is gone',
            'the environment turns lethal in a way that does not distinguish between friend and enemy',
            'a contamination or decay of the environment reaches the characters location',
            'a place of significance is reached after a long journey and it delivers what was promised',
            'a catastrophic environmental event is survived and the survival changes everything',
            'a natural boundary that was an obstacle becomes an advantage when the situation changes',
            'a place of healing or restoration is found and it works as needed',
            'a devastating environmental condition lifts and the relief is tangible',
            'a place that was thought to be empty or dead shows signs of life or recovery',
            'a war, disaster, or upheaval from elsewhere reaches the characters\' situation',
            'an external power makes a decision that strips the characters of options they were counting on',
            'a crisis elsewhere demands the withdrawal of support or resources from the current situation',
            'an institution or system that was functioning collapses and its collapse has immediate consequences',
            'a broader conflict escalates to a point where the characters\' concerns become irrelevant to everyone else',
            'an external deadline arrives that cannot be negotiated and changes what must happen next',
            'a political or social shift creates conditions that are hostile to the characters\' goals',
            'an external event creates a new normal that is significantly worse than the old one',
            'the world outside stops caring about what is happening here and the indifference has consequences',
            'a major external intervention reshapes the situation in favor of the characters',
            'an external power that was hostile is overthrown or neutralized by forces unrelated to the characters',
            'a crisis elsewhere resolves and frees resources or allies for the current situation',
            'an institution or system that was broken begins to function again at the right moment',
            'an external force eliminates a threat the characters could not have handled themselves',
            'a broader conflict shifts in a direction that makes the characters\' goals achievable',
            'a call for help sent long ago is answered with more than was asked for',
            'a resource from the outside world arrives that was believed to no longer exist',
            'an external event creates a new normal that is more favorable than the old one',
            'the person someone has been fighting for gives up before they do',
            'someone who was the heart of a group is removed and the group cannot compensate',
            'a discovery renders a previous sacrifice meaningless — the sacrifice was for nothing',
            'a lie is exposed and the structure it was supporting collapses — and people were living inside that structure',
            'a hidden cost of something that seemed free becomes visible all at once',
            'a truth arrives that cannot be unknown and every relationship it touches is damaged by it',
            'a piece of knowledge that was considered lost forever resurfaces and it changes what is possible',
            'something thought to be unique and irreplaceable turns out to exist in another form',
            'a hope that has sustained someone through everything is proven to have been false',
            'a cycle of behavior repeats at the worst moment proving that the change everyone believed in was not real',
            'a safe place is permanently compromised — what made it safe is gone and will not return',
            'a catastrophe reshapes the physical world in a way that cannot be undone',
            'a spreading problem (disease, decay, decline) reaches critical mass and transforms the environment irreversibly',
            'the environment becomes actively dangerous in a way that changes all existing plans',
            'a place that held meaning is destroyed and the destruction is felt by everyone connected to it',
            'a threshold is crossed and there is no way back — the path behind ceases to exist',
            'a resource the world depended on is exhausted or poisoned',
            'a place of safety becomes a trap — the same qualities that made it protective now make it a prison',
            'a cycle of destruction accelerates beyond anyone\'s ability to intervene',
            'a change in the environment forces everyone to abandon something they cannot take with them',
            'a safe place that was lost is recovered and returning to it changes the meaning of everything that happened since',
            'a catastrophe that seemed inevitable is averted by something the environment provides at the last moment',
            'a spreading decay (disease, rot, decline) is halted at its source',
            'a place that was believed to be destroyed turns out to have survived in a form no one expected',
            'a cycle of destruction in a specific place breaks and what replaces it is something no one anticipated',
            'an external threat that was theoretical becomes real and immediate with no warning',
            'an authority or power structure that was an obstacle is replaced by something worse',
            'a deadline that seemed distant arrives early',
            'a conflict larger than the current story spills over and engulfs the characters',
            'an enemy receives external reinforcement that changes the balance entirely',
            'a call for help is answered and the answer is no',
            'the outside world learns what has been happening and the response is hostile',
            'an event elsewhere triggers a chain reaction that reaches the characters as catastrophe',
            'an institution or system the characters depended on is dismantled by external forces',
            'a force that was approaching arrives and it is worse than anticipated',
            'an external force removes a person or protection that was considered permanent',
            'the outside world closes off the last exit — whatever happens now, happens here',
            'an external threat that has been looming for the entire arc is neutralized by something no one saw coming',
            'a resource or reinforcement arrives from a source no one thought to ask',
            'an enemy\'s external support structure fails and they are suddenly vulnerable',
            'a conflict larger than the current story resolves in a way that creates space for the characters',
            'something that was approaching — a deadline, a threat, a force — stops or reverses',
            'an event elsewhere triggers a chain reaction that reaches the characters as an unexpected advantage',
            'an external force removes a person or obstacle that was considered immovable',
            'a call for help that was sent long ago is finally answered',
            'two people who defined themselves through each other are forced apart by something neither can fight',
            'a confession comes too late and the person it was meant for has already made an irreversible decision',
        ]),
    },
    IDENTITY_ARC: {
        flag: 'branch_identity',
        boost: 3.0,
        description: 'Who someone really is comes into question. Resolves in a revelation.',
        seeds: new Set([
            'someone discovers that the emotion they thought they felt was actually covering a darker one',
            'a carefully maintained sense of identity cracks under pressure that was not anticipated',
            'someone is confronted with a version of themselves from the past and the comparison is devastating',
            'someone realizes they have been making decisions from a place of damage rather than choice',
            'someone makes a decision based on what they actually want rather than what they think they should want',
            'someone discovers that the version of them another person loves is not who they actually are',
        ]),
        developers: new Set([
            'a deeply held belief about oneself is challenged by evidence and the evidence wins',
        ]),
        terminators: new Set([
            'a truth is uncovered that turns a hero of the story into something far more complicated',
            'evidence surfaces that the characters\' actions have been causing harm they were not aware of',
            'a discovery links the characters to something larger — and the connection is threatening',
            'a discovery reveals that an enemy is not what they appeared to be — and the reality is less threatening',
            'a discovery links the characters to something larger than they knew — and the connection is empowering',
            'a fundamental belief about oneself is shattered by an event that cannot be rationalized',
            'someone discovers that the thing they built their emotional life around was a defense mechanism not a truth',
            'someone realizes they have crossed a line they cannot uncross emotionally',
            'someone discovers they are capable of something they believed only bad people were capable of',
            'a crisis of identity resolves through acceptance rather than victory',
            'an emotional wall that has defined a character comes down and what is behind it is not the weakness they feared',
            'someone stops trying to be what they think they should be and becomes what they are',
            'a discovery proves that someone who was celebrated was actually responsible for something unforgivable',
            'a hidden truth about someone\'s origin or nature or purpose is revealed and it changes how everyone sees them',
            'a discovery reveals that the real threat was never what everyone thought — it was something much closer',
            'something everyone believed was a weakness turns out to be the key to everything',
            'a truth about themselves that someone has avoided for the entire story becomes undeniable',
            'someone discovers that the version of themselves they have been fighting to protect never existed',
            'someone realizes they have become the thing they defined themselves against',
            'a person reaches the point where they stop caring about something that previously defined them',
            'an identity crisis that has been building resolves in a way that makes the person more whole than before',
            'someone discovers that the thing they hated most about themselves is the thing that saves them',
            'a person who has defined themselves by their damage discovers they are not only their damage',
            'two people who were never supposed to meet discover a connection that recontextualizes both their histories',
        ]),
    },
    ALLIANCE_ARC: {
        flag: 'branch_alliance',
        boost: 3.0,
        description: 'A new cooperation forms. Resolves in solidified alliance, its fracture, or hope realized.',
        seeds: new Set([
            'a neutral external party withdraws and their absence is felt',
            'a neutral external party offers assistance or shelter without conditions',
            'someone in a position of external authority shows unexpected sympathy or flexibility',
            'an alliance of convenience starts to develop real expectations that not everyone shares',
            'a shared difficulty bonds two people who did not previously have reason to trust each other',
            'an external ally withdraws support due to their own problems elsewhere',
            'a major external ally commits resources that change the scale of what is possible',
            'a third party brokers a solution that the involved parties could not reach on their own',
            'an external event creates a situation where enemies must cooperate temporarily',
            'two people survive something together and the shared survival creates a bond that did not exist before',
        ]),
        developers: new Set([
            'someone finds evidence that a plan or effort that seemed to be failing is actually working',
            'a discovery confirms a theory that was considered too optimistic',
            'an external alliance or agreement holds when it was expected to fail',
            'information arrives that transforms a defensive position into an offensive one',
            'a hidden ally is discovered — someone who has been working toward the same goal from a different angle',
            'a breakthrough in understanding occurs that makes a previously impossible problem solvable',
            'evidence is found that the situation is more favorable than the available information suggested',
            'a discovery provides leverage that did not previously exist',
            'a piece of external infrastructure that was damaged is restored and its restoration has immediate benefits',
            'a group turns on one of its members and the turning is collective rather than individual',
            'an alliance built on shared interest collapses when the interests diverge',
        ]),
        terminators: new Set([
            'a hidden truth is uncovered that gives the characters leverage they did not know they had',
            'a discovery reveals a way out of a situation that appeared to have no exit',
            'something that was believed to be impossible is proven to be merely very difficult',
            'a discovery reveals that the characters have been closer to their goal than they realized',
            'an emotional risk pays off — not in a practical way, but in a way that matters more',
            'a natural boundary that was an obstacle becomes an advantage when the situation changes',
            'a powerful external figure publicly opposes the characters and the opposition has teeth',
            'an external event delegitimizes the characters\' position in the eyes of people who matter',
            'a powerful external figure chooses to support the characters publicly and the support is decisive',
            'an institution or system that was broken begins to function again at the right moment',
            'a broader conflict shifts in a direction that makes the characters\' goals achievable',
            'an external event forces enemies to cooperate and the cooperation reveals common ground',
            'an external event creates a new normal that is more favorable than the old one',
            'a group turns against its leader and the turning is justified but devastating',
            'a group\'s internal conflict becomes more destructive than the external threat they face',
            'a group that was fragmenting coalesces around a shared purpose that transcends individual grievances',
            'an alliance forms between unlikely people and the alliance is genuine rather than strategic',
            'a group achieves something none of them could have achieved alone and the achievement bonds them permanently',
            'a hidden ally is discovered — someone or something has been working in the background the entire time',
            'a power that has been neutral commits to a side and it is not this one',
            'a power that has been neutral for the entire story commits to a side and it is this one',
            'an event elsewhere triggers a chain reaction that reaches the characters as an unexpected advantage',
            'someone who has been loyal for the entire story reaches their limit and walks away',
            'a group\'s loyalty to one person collapses simultaneously leaving them completely alone',
        ]),
    },
    ARRIVAL_ARC: {
        flag: 'branch_arrival',
        boost: 3.0,
        description: 'An external force, figure, or power shift enters. Resolves in integration (reconciliation), overtake (power_taken), or escalation to catastrophe (which may also open CATASTROPHE_ARC via terminator overlap).',
        seeds: new Set([
            'an external force intervenes and its intervention serves no one\'s interests but its own',
            'a force from outside the story arrives and nothing that was planned accounts for it',
            'an external authority claims jurisdiction over the characters\' situation and their priorities are different',
            'a political or social shift outside the story creates new possibilities within it',
            'something in the environment indicates that someone or something else has been here recently',
            'a message arrives from outside that changes everything and there is no time to adjust',
            'someone from outside arrives and their presence complicates the existing dynamic',
            'an authority or institution makes a decision that creates a new constraint',
            'an enemy receives external support that changes the balance',
            'an external force introduces a new element that no one here can control',
            'someone from outside the current group arrives with skills or resources that are needed',
            'an external force enters the situation with demands that override current priorities',
            'a decision made far from here reaches the characters and it constrains their options severely',
            'a power structure outside the immediate situation shifts against the characters',
            'an external event changes the rules everyone was operating under',
            'a broader authority makes a decision that was not aimed at the characters but affects them disproportionately',
            'an enemy receives external legitimacy or support that changes what they are capable of',
            'a force from outside the story arrives and its presence means nothing will be the same',
            'a power structure outside the immediate situation shifts in favor of the characters',
            'a broader trend shifts in a direction that supports the characters\' goals',
            'a group dynamic shifts decisively around a moment of genuine leadership',
        ]),
        developers: new Set([
            'evidence surfaces that a problem is more advanced than anyone estimated',
            'a discovery reveals that the situation is less advanced or less severe than feared',
            'an external conflict that was causing pressure pauses or redirects',
            'an external deadline is extended or a constraint is loosened',
            'a previously one-sided relationship shows signs of becoming reciprocal',
            'someone apologizes and the apology is specific enough to prove they understood what they did',
            'a barrier between two people — formality, rank, old resentment — drops for the first time',
            'someone admits they were wrong to a person whose respect they value',
            'two people who have been circling each other finally have a real conversation',
            'information arrives that makes a committed plan obviously wrong but too late to change',
            'a discovery proves that someone who was doubted was right all along',
            'a record, testimony, or artifact surfaces that vindicates a controversial decision',
            'a discovery reveals that the worst-case scenario everyone was preparing for is not actually in play',
            'a feature of the environment that was relied upon fails or disappears',
            'the environment reveals that something has been changing slowly and the cumulative change is now critical',
            'a natural boundary that provided protection is breached',
            'an external threat that was being monitored accelerates beyond predictions',
            'an external deadline arrives and it is not negotiable',
            'an external force that was threatening is redirected by events elsewhere',
            'an external conflict resolves in a way that frees the characters from an obligation',
            'an external event validates the characters\' position to people who were skeptical',
            'an external authority reverses a decision that was causing damage',
            'an external force removes a figure who was causing problems without the characters having to confront them',
            'an external party that was hostile is neutralized by a completely unrelated development',
            'a relationship that has been defined by caution shifts to one defined by trust through a single decisive moment',
            'a conflict that has been building reaches its peak and resolves through vulnerability rather than force',
            'two people who have been on opposite sides find common ground that neither expected',
            'an act of forgiveness occurs that changes what is possible going forward',
            'someone who has been absent or distant returns and their return changes the emotional landscape',
            'someone proves their worth to a person whose opinion they had given up on changing',
            'someone makes a sacrifice for another person and the sacrifice is understood and honored',
            'a pattern of miscommunication between two people breaks because one of them finally says the real thing',
        ]),
        terminators: new Set([
            'a breakthrough in understanding arrives too late to prevent what it would have prevented',
            'a truth arrives that nobody is ready for and there is no time to become ready',
            'a discovery proves that a sacrifice made earlier accomplished what it was meant to accomplish',
            'evidence surfaces that vindicates a decision everyone else condemned',
            'a record of the past is found that provides moral authority for the present',
            'a moment of emotional clarity arrives and what it reveals is that the situation is exactly as bad as it looks',
            'a moment of emotional honesty between two people changes the trajectory of the story',
            'the environment undergoes a change that is clearly irreversible and the implications are severe',
            'a catastrophic environmental event forces abandonment of the current position',
            'the environment becomes hostile in a way that is not manageable with available resources',
            'a hidden environmental danger reaches a tipping point with no warning',
            'the landscape transforms in a way that cuts off retreat or escape',
            'a place that was being defended becomes impossible to hold',
            'the environment turns lethal in a way that does not distinguish between friend and enemy',
            'a contamination or decay of the environment reaches the characters location',
            'a catastrophic environmental event is survived and the survival changes everything',
            'a devastating environmental condition lifts and the relief is tangible',
            'a war, disaster, or upheaval from elsewhere reaches the characters\' situation',
            'a crisis elsewhere demands the withdrawal of support or resources from the current situation',
            'an institution or system that was functioning collapses and its collapse has immediate consequences',
            'an external deadline arrives that cannot be negotiated and changes what must happen next',
            'a political or social shift creates conditions that are hostile to the characters\' goals',
            'a major external intervention reshapes the situation in favor of the characters',
            'an external power that was hostile is overthrown or neutralized by forces unrelated to the characters',
            'a crisis elsewhere resolves and frees resources or allies for the current situation',
            'an external force eliminates a threat the characters could not have handled themselves',
            'an external event proves the characters right in the eyes of people who matter',
            'an external witness provides testimony or evidence that changes the balance of power',
            'a bond is tested by something that should have broken it and the bond holds',
            'someone who has been an antagonist throughout the story chooses a different path and commits to it',
            'a relationship reaches a depth where both people understand each other without the need for explanation',
            'someone makes a public commitment to another person that changes their standing with everyone else',
            'a rift between two people that defined the story resolves through mutual recognition of fault',
            'a sacrifice is made for another person and the person it was made for witnesses it and is changed by it',
            'a person who has been isolated is fully accepted into a group and the acceptance is unconditional',
            'someone proves their loyalty in a way that costs them everything they had to lose',
            'a leader earns the trust of those who follow through action rather than authority',
            'a betrayal is forgiven and the forgiveness transforms both the betrayer and the betrayed',
            'a lie is exposed and the structure it was supporting collapses — and people were living inside that structure',
            'a hidden cost of something that seemed free becomes visible all at once',
            'a truth arrives that cannot be unknown and every relationship it touches is damaged by it',
            'a discovery reveals that a sacrifice previously thought wasted actually accomplished exactly what it was meant to',
            'a discovery proves that someone who was condemned was actually innocent — and the proof is undeniable',
            'a hidden message or legacy left by someone long gone arrives at exactly the right moment',
            'a moment of complete emotional honesty changes the trajectory of everything around it',
            'someone\'s vulnerability shown at the worst possible moment turns out to be exactly what was needed',
            'a catastrophe reshapes the physical world in a way that cannot be undone',
            'the environment becomes actively dangerous in a way that changes all existing plans',
            'a threshold is crossed and there is no way back — the path behind ceases to exist',
            'a resource the world depended on is exhausted or poisoned',
            'a place of safety becomes a trap — the same qualities that made it protective now make it a prison',
            'a catastrophe that seemed inevitable is averted by something the environment provides at the last moment',
            'an external threat that was theoretical becomes real and immediate with no warning',
            'a deadline that seemed distant arrives early',
            'a conflict larger than the current story spills over and engulfs the characters',
            'an enemy receives external reinforcement that changes the balance entirely',
            'the outside world learns what has been happening and the response is hostile',
            'an event elsewhere triggers a chain reaction that reaches the characters as catastrophe',
            'an institution or system the characters depended on is dismantled by external forces',
            'a force that was approaching arrives and it is worse than anticipated',
            'the outside world closes off the last exit — whatever happens now, happens here',
            'an external threat that has been looming for the entire arc is neutralized by something no one saw coming',
            'an authority or power structure that was an obstacle collapses and what replaces it is an opportunity',
            'an enemy\'s external support structure fails and they are suddenly vulnerable',
            'a conflict larger than the current story resolves in a way that creates space for the characters',
            'something that was approaching — a deadline, a threat, a force — stops or reverses',
            'an external witness validates the characters\' version of events when no one else would',
            'an external force removes a person or obstacle that was considered immovable',
            'the outside world learns what has been happening here and the response is support rather than judgment',
            'an institution or system that was corrupt or broken begins to reform in a way that directly helps',
            'a bond between two people reaches a depth that fundamentally changes what they are willing to do for each other',
            'someone who has been an enemy for the entire story chooses the other side — and means it',
            'a relationship that everyone assumed was broken beyond repair reconstitutes around something no one expected',
            'two people whose conflict has defined the story reach an understanding that makes the conflict irrelevant',
            'someone sacrifices their position, safety, or future for another person without hesitation or conditions',
            'a person everyone underestimated becomes the one whose loyalty holds everything together',
            'a declaration — of love, of allegiance, of truth — is made publicly and cannot be taken back and it changes everything',
            'someone forgives something that was considered unforgivable and the forgiveness is genuine',
            'a promise made long ago is fulfilled under circumstances that make it mean far more than when it was given',
            'a group fractures and the way it reassembles reveals who truly matters to whom',
            'a relationship reaches a turning point where both people see each other completely and choose to stay',
        ]),
    },
    MORAL_ARC: {
        flag: 'branch_moral',
        boost: 3.0,
        description: 'A moral dilemma is introduced. Resolves in the choice being made.',
        seeds: new Set([
            'an external event creates a once-in-a-lifetime opportunity that must be acted on immediately',
            'a piece of knowledge arrives that cannot be acted on without revealing how it was obtained',
            'someone reaches the point where they can no longer separate what they feel from how they act',
            'a feeling of despair gives way to anger and the anger is useful — it has direction',
            'an external event creates a situation where the characters must act publicly when they needed to act quietly',
            'an external threat overreaches and its overreach creates vulnerability',
        ]),
        developers: new Set([
            'someone is forced to choose between two people and the choice costs them the one they did not choose',
        ]),
        terminators: new Set([
            'information arrives that makes clear a choice must be made between two things that both matter',
            'someone makes a decision from a place of pain and the decision has permanent consequences',
            'a choice is made from love rather than fear and the outcome reflects the difference',
            'a natural disaster or catastrophe forces impossible choices about who or what to save',
            'a choice between two loyalties forces a visible, permanent fracture',
            'someone\'s attempt to protect their own emotional survival causes irreparable harm to someone else',
            'a person is forced to choose between two people they love and the choice destroys one of those relationships permanently',
            'someone chooses a person over a principle they have held their entire life',
        ]),
    },
};

// ── Base event pools ───────────────────────────────────────
// Structure: EVENTS[scaleId][categoryId] = { positive: [...], negative: [...] }

const EVENTS = {

// ════════════════════════════════════════════════════════════
// SUBTLE
// ════════════════════════════════════════════════════════════

SUBTLE: {
    INTERPERSONAL: {
        positive: [
            'a brief exchange between two people carries more warmth than expected',
            'someone remembers a small detail about another person that shows they have been paying attention',
            'a moment of shared silence between two people feels comfortable rather than awkward',
            'a gesture of casual trust — handing something over, turning their back — passes without comment but is noticed',
            'someone adjusts their behavior slightly to accommodate another person without being asked',
            'a look passes between two people that communicates something words have not yet addressed',
            'someone defends another person in a small way that the person being defended does not notice',
            'a minor disagreement resolves itself through a willingness neither party had to show',
            'two people who have been distant find themselves briefly aligned by a shared reaction',
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
            'two people who are usually aligned react differently to the same thing',
            'someone overhears something about themselves that was not meant for them',
            'a moment of physical proximity creates tension where there was none before',
            'someone notices they have been excluded from something small but deliberate',
            'a question is asked that feels more like a test than genuine curiosity',
            'someone catches themselves performing for another person and does not like it',
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
            'a piece of the puzzle arrives without effort — it was just sitting there',
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
            'a previously one-sided relationship shows signs of becoming reciprocal',
            'someone apologizes and the apology is specific enough to prove they understood what they did',
            'a favor is returned in a way that shows the returner paid attention to what would actually help',
            'two people discover a shared experience neither of them talks about and the recognition is mutual',
            'someone stands up for another person in a context where doing so costs them something',
            'a barrier between two people — formality, rank, old resentment — drops for the first time',
            'someone admits they were wrong to a person whose respect they value',
            'a gesture of trust is reciprocated in a way that raises the stakes for both people',
            'two people who have been circling each other finally have a real conversation',
            'someone reveals something vulnerable and the response they get is better than what they feared',
        ],
        negative: [
            'a promise is broken and both parties know it was a real promise not a casual one',
            'someone discovers they have been talked about in a way that changes how they feel about the speaker',
            'a relationship that seemed stable reveals a fault line neither person knew was there',
            'someone does something well-intentioned that makes things significantly worse for the other person',
            'loyalty is tested and the result is ambiguous — not a betrayal, but not reassuring either',
            'a third person becomes involved in a dynamic between two others and the triangle creates pressure',
            'someone realizes they have been managing another person rather than relating to them honestly',
            'a boundary is crossed that was never explicitly stated but both people knew it existed',
            'two people want the same thing and there is not enough of it for both',
            'someone who was relied on reveals they are dealing with something that limits their capacity',
            'an old grievance that was thought resolved resurfaces in a new form',
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
            'a rumor or report from elsewhere turns out to be better than the reality it described',
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
            'a rumor or report from elsewhere turns out to be worse than the reality it described',
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
            'a conflict that has been building reaches its peak and resolves through vulnerability rather than force',
            'two people who have been on opposite sides find common ground that neither expected',
            'someone reveals a secret they have been carrying and the other person already knew — and stayed anyway',
            'a group dynamic shifts decisively around a moment of genuine leadership',
            'an act of forgiveness occurs that changes what is possible going forward',
            'someone who has been absent or distant returns and their return changes the emotional landscape',
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
            'a promise is broken under pressure and both people know the pressure is not a sufficient excuse',
            'the power dynamic in a relationship reverses and the reversal is not comfortable for either person',
            'someone discovers that the version of them another person loves is not who they actually are',
            'an alliance built on shared interest collapses when the interests diverge',
            'a moment of cruelty — deliberate or careless — damages something that was fragile and important',
            'someone withdraws their emotional investment visibly and the withdrawal changes the room',
            'a confrontation that has been avoided finally happens and it is worse than either person imagined',
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
            'a feeling of despair gives way to anger and the anger is useful — it has direction',
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
            'a space that has been confining opens up — literally or figuratively — and the opening is significant',
            'the environment creates a natural stage for a confrontation that needed to happen',
            'a dangerous feature of the landscape turns out to be navigable by someone present',
            'a place of historical or strategic significance is reached and it provides what was sought',
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
            'a discovery reveals that a victory was actually a trap or a misdirection',
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
            'someone who has been an antagonist throughout the story chooses a different path and commits to it',
            'a group that was fragmenting coalesces around a shared purpose that transcends individual grievances',
            'a relationship reaches a depth where both people understand each other without the need for explanation',
            'someone makes a public commitment to another person that changes their standing with everyone else',
            'a rift between two people that defined the story resolves through mutual recognition of fault',
            'a sacrifice is made for another person and the person it was made for witnesses it and is changed by it',
            'an alliance forms between unlikely people and the alliance is genuine rather than strategic',
            'a person who has been isolated is fully accepted into a group and the acceptance is unconditional',
            'someone proves their loyalty in a way that costs them everything they had to lose',
            'a leader earns the trust of those who follow through action rather than authority',
            'a confession of something deeply hidden is met with the one response the confessor needed',
            'two people whose relationship has been marked by pain find a way to be in each other\'s lives without pain',
            'a betrayal is forgiven and the forgiveness transforms both the betrayer and the betrayed',
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
            'a pattern of harm within a relationship is finally named and naming it does not fix it',
            'an act of desperation damages a relationship beyond what the desperation justified',
            'the person someone has been fighting for gives up before they do',
            'a public humiliation or exposure damages multiple relationships simultaneously',
            'someone who was the heart of a group is removed and the group cannot compensate',
            'a lie that has sustained a relationship is exposed and the truth is not survivable',
            'two people who were essential to each other become harmful to each other',
            'a group\'s internal conflict becomes more destructive than the external threat they face',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a fundamental fear is confronted and although the confrontation is painful it results in freedom',
            'someone allows themselves to feel something they have been preventing for the entire story and it does not destroy them',
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
            'a place of significance is reached after a long journey and it delivers what was promised',
            'a catastrophic environmental event is survived and the survival changes everything',
            'the environment provides a dramatic natural intervention at a critical moment',
            'a place that has been hostile for the entire story becomes passable or safe',
            'a hidden location is revealed that changes the strategic landscape entirely',
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
            'a place of significance is reached and it is not what was expected — it is worse',
            'the environment destroys something that cannot be replaced',
            'a natural disaster or catastrophe forces impossible choices about who or what to save',
            'the environment reveals the scale of a problem that was being perceived locally',
            'a place that was being defended becomes impossible to hold',
            'a landmark or natural feature that provided orientation or meaning is gone',
            'the environment turns lethal in a way that does not distinguish between friend and enemy',
            'a contamination or decay of the environment reaches the characters location',
            'a natural phenomenon of immense scale occurs and there is nothing to do but endure it',
        ],
    },
    DISCOVERY: {
        positive: [
            'a revelation arrives that changes the meaning of everything that has happened — and the new meaning is better',
            'a discovery proves that a sacrifice made earlier accomplished what it was meant to accomplish',
            'a hidden truth is uncovered that gives the characters leverage they did not know they had',
            'a mystery that has driven the story resolves in a way that is satisfying and actionable',
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
            'a call for help sent long ago is answered with more than was asked for',
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
            'someone who has been an enemy for the entire story chooses the other side — and means it',
            'a relationship that everyone assumed was broken beyond repair reconstitutes around something no one expected',
            'two people whose conflict has defined the story reach an understanding that makes the conflict irrelevant',
            'a betrayal is revealed to have been protection all along and the cost of that protection becomes visible',
            'someone sacrifices their position, safety, or future for another person without hesitation or conditions',
            'a person everyone underestimated becomes the one whose loyalty holds everything together',
            'a declaration — of love, of allegiance, of truth — is made publicly and cannot be taken back and it changes everything',
            'someone forgives something that was considered unforgivable and the forgiveness is genuine',
            'two people who were never supposed to meet discover a connection that recontextualizes both their histories',
            'a promise made long ago is fulfilled under circumstances that make it mean far more than when it was given',
            'someone chooses a person over a principle they have held their entire life',
            'a group fractures and the way it reassembles reveals who truly matters to whom',
            'a relationship reaches a turning point where both people see each other completely and choose to stay',
        ],
        negative: [
            'a betrayal is revealed that has been running so long it has shaped the entire relationship',
            'someone trusted completely turns out to have had a separate agenda from the very beginning',
            'a bond that was the emotional foundation of the story breaks under a weight it cannot carry',
            'a person is forced to choose between two people they love and the choice destroys one of those relationships permanently',
            'a lie told to protect someone is exposed and the person it was meant to protect is the one most damaged',
            'someone who has been loyal for the entire story reaches their limit and walks away',
            'a public exposure of a private relationship destroys both people\'s positions',
            'a sacrifice made for someone is rejected and the rejection cannot be undone',
            'someone discovers they have been a tool in another person\'s plan — and the plan is not over',
            'a relationship that seemed like the safest thing in the story becomes the most dangerous',
            'two people who defined themselves through each other are forced apart by something neither can fight',
            'a confession comes too late and the person it was meant for has already made an irreversible decision',
            'a group\'s loyalty to one person collapses simultaneously leaving them completely alone',
            'someone\'s love or devotion is used as a weapon against them by the person they trusted most',
            'a connection between two people is revealed to have been engineered by a third party for their own purposes',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a grief that has defined someone for the entire story finally begins to release its hold',
            'someone who has been performing strength finally allows themselves to break down and discovers they are held',
            'an identity crisis that has been building resolves in a way that makes the person more whole than before',
            'a fear that has controlled someone\'s decisions for the entire arc is faced and does not destroy them',
            'someone discovers that the thing they hated most about themselves is the thing that saves them',
            'a moment of complete emotional honesty changes the trajectory of everything around it',
            'someone who has been numb for a long time feels something real again and it is not pain',
            'a cycle of self-destruction that seemed permanent is broken by a single moment of genuine connection',
            'a memory that has been a source of pain is recontextualized and becomes a source of strength',
            'someone forgives themselves for something they believed was unforgivable',
            'an emotion that has been suppressed for the entire story surfaces and it turns out to be the right one',
            'a person who has defined themselves by their damage discovers they are not only their damage',
            'a moment of joy arrives in the middle of catastrophe and it is not false — it is the most real thing in the scene',
            'someone\'s vulnerability shown at the worst possible moment turns out to be exactly what was needed',
            'a burden carried alone for the entire story is finally shared and the sharing makes it bearable',
        ],
        negative: [
            'a hope that has sustained someone through everything is proven to have been false',
            'someone reaches a point of emotional exhaustion where they can no longer feel what they need to feel',
            'a truth about themselves that someone has avoided for the entire story becomes undeniable',
            'a grief arrives that is larger than anything the person has the capacity to process',
            'someone discovers that the version of themselves they have been fighting to protect never existed',
            'an emotional dependency that seemed like love is revealed to have been something else entirely',
            'a moment of complete emotional honesty destroys something that needed the lie to survive',
            'someone realizes they have become the thing they defined themselves against',
            'a cycle of behavior repeats at the worst moment proving that the change everyone believed in was not real',
            'a feeling that has been building for the entire story finally arrives and it is worse than anticipated',
            'someone\'s emotional armor finally fails and what comes through is not sadness but rage',
            'a memory that was a source of comfort is revealed to have been inaccurate and the real version is devastating',
            'a person reaches the point where they stop caring about something that previously defined them',
            'someone\'s attempt to protect their own emotional survival causes irreparable harm to someone else',
            'an emotion that was supposed to be resolved returns with accumulated force and is no longer manageable',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'a place that has been hostile for the entire story transforms — the danger lifts and what remains is something new',
            'a natural phenomenon of extreme scale occurs that fundamentally alters what is possible',
            'a safe place that was lost is recovered and returning to it changes the meaning of everything that happened since',
            'a catastrophe that seemed inevitable is averted by something the environment provides at the last moment',
            'a hidden dimension of the location is uncovered (an underground, a concealed structure, an unknown geography) that changes what the characters understand about where they are',
            'a spreading decay (disease, rot, decline) is halted at its source',
            'a place that was believed to be destroyed turns out to have survived in a form no one expected',
            'the environment shifts to make something that was impossible suddenly achievable',
            'a cycle of destruction in a specific place breaks and what replaces it is something no one anticipated',
            'a threshold is crossed and what is on the other side changes everything',
            'a place that held painful memories is retaken and returning to it on new terms changes what it meant',
        ],
        negative: [
            'a safe place is permanently compromised — what made it safe is gone and will not return',
            'a catastrophe reshapes the physical world in a way that cannot be undone',
            'a spreading problem (disease, decay, decline) reaches critical mass and transforms the environment irreversibly',
            'the environment becomes actively dangerous in a way that changes all existing plans',
            'a place that held meaning is destroyed and the destruction is felt by everyone connected to it',
            'something hidden beneath a location is uncovered (a mass grave, a facility, a buried truth about the ground itself) and its presence is not benign',
            'a threshold is crossed and there is no way back — the path behind ceases to exist',
            'a resource the world depended on is exhausted or poisoned',
            'a place of safety becomes a trap — the same qualities that made it protective now make it a prison',
            'a cycle of destruction accelerates beyond anyone\'s ability to intervene',
            'a change in the environment forces everyone to abandon something they cannot take with them',
        ],
    },
    DISCOVERY: {
        positive: [
            'a truth is uncovered that recontextualizes the entire story up to this point — and the new context is better',
            'a long-sought answer is finally found and it is not what anyone expected but it is what was needed',
            'a hidden ally is discovered — someone or something has been working in the background the entire time',
            'a piece of knowledge that was considered lost forever resurfaces and it changes what is possible',
            'a discovery reveals that a sacrifice previously thought wasted actually accomplished exactly what it was meant to',
            'something everyone believed was a weakness turns out to be the key to everything',
            'a pattern becomes visible that connects events no one realized were related — and the pattern is protective',
            'a secret that has been carried as a burden is shared and turns out to be a gift',
            'a mystery that has haunted the story resolves in a way that brings peace rather than more questions',
            'a discovery proves that someone who was condemned was actually innocent — and the proof is undeniable',
            'a lie that has been the foundation of something important is exposed and what replaces it is stronger',
            'something thought to be unique and irreplaceable turns out to exist in another form',
            'a discovery changes what everyone believed was possible about their situation',
            'a hidden message or legacy left by someone long gone arrives at exactly the right moment',
            'a truth that everyone was afraid to face turns out to be survivable — difficult, but survivable',
        ],
        negative: [
            'a truth is uncovered that recontextualizes the entire story — and everything that felt like progress was actually serving something else',
            'a discovery reveals that a trusted foundation — a belief, an institution, a history — was built on something false',
            'a secret kept by multiple people is exposed simultaneously and none of them knew the others were keeping it',
            'a piece of knowledge surfaces that was thoroughly suppressed and the fact that it survived means something is deeply wrong',
            'a discovery proves that someone who was celebrated was actually responsible for something unforgivable',
            'a pattern becomes visible connecting events no one realized were related — and the pattern is predatory',
            'a mystery resolves and the answer is worse than not knowing',
            'a hidden truth about someone\'s origin or nature or purpose is revealed and it changes how everyone sees them',
            'a discovery renders a previous sacrifice meaningless — the sacrifice was for nothing',
            'something thought to be benign or neutral is discovered to have been actively harmful the entire time',
            'a lie is exposed and the structure it was supporting collapses — and people were living inside that structure',
            'a discovery upends what everyone believed was possible about their situation and the change is terrifying',
            'a hidden cost of something that seemed free becomes visible all at once',
            'a truth arrives that cannot be unknown and every relationship it touches is damaged by it',
            'a discovery reveals that the real threat was never what everyone thought — it was something much closer',
        ],
    },
    EXTERNAL: {
        positive: [
            'a force from outside the story intervenes in a way that resets the stakes entirely',
            'an external threat that has been looming for the entire arc is neutralized by something no one saw coming',
            'an authority or power structure that was an obstacle collapses and what replaces it is an opportunity',
            'a messenger or signal arrives from outside with information that changes everything',
            'a resource or reinforcement arrives from a source no one thought to ask',
            'an enemy\'s external support structure fails and they are suddenly vulnerable',
            'a conflict larger than the current story resolves in a way that creates space for the characters',
            'something that was approaching — a deadline, a threat, a force — stops or reverses',
            'an external witness validates the characters\' version of events when no one else would',
            'a power that has been neutral for the entire story commits to a side and it is this one',
            'an event elsewhere triggers a chain reaction that reaches the characters as an unexpected advantage',
            'an external force removes a person or obstacle that was considered immovable',
            'a call for help that was sent long ago is finally answered',
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
            'a call for help is answered and the answer is no',
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

function pickCategory() {
    // Base weight dampened by category frequency: weight / (1 + count * 0.5)
    // Softer than event anti-repeat (0.5 factor vs 1.0), so base weights still dominate
    const weighted = CATEGORIES.map(c => ({
        cat: c,
        w: c.weight / (1 + getCategoryCount(c.id) * 0.5),
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

function buildPool(scaleId, categoryId, isPositive) {
    const scaleEvents = EVENTS[scaleId];
    if (!scaleEvents) return [];
    const catEvents = scaleEvents[categoryId];
    if (!catEvents) return [];
    return isPositive ? catEvents.positive : catEvents.negative;
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

// ── Branch flag helpers ────────────────────────────────────

function getFlags() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return {};
    if (!ctx.chatMetadata.we_flags) ctx.chatMetadata.we_flags = {};
    return ctx.chatMetadata.we_flags;
}

function setFlag(flagName, val) {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    if (!ctx.chatMetadata.we_flags) ctx.chatMetadata.we_flags = {};
    ctx.chatMetadata.we_flags[flagName] = val ? 1 : 0;
    ctx.saveMetadata();
}

function activeArcNames() {
    const flags = getFlags();
    return Object.entries(BRANCHES)
        .filter(([name, br]) => flags[br.flag])
        .map(([name]) => name);
}

function resetBranches() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    ctx.chatMetadata.we_flags = {};
    ctx.chatMetadata.we_flag_log = [];
    ctx.chatMetadata.we_arc_cooldowns = {};
    ctx.saveMetadata();
}

// ── Arc cooldowns ──────────────────────────────────────────
// After an arc closes, its seed weights get reduced for a few messages so
// the same arc doesn't immediately re-open.
const COOLDOWN_MESSAGES = 8;
const COOLDOWN_PENALTY = 0.3;

function getMsgCounter() {
    const ctx = getContext();
    return ctx.chatMetadata?.we_msg_counter ?? 0;
}

function bumpMsgCounter() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return 0;
    ctx.chatMetadata.we_msg_counter = (ctx.chatMetadata.we_msg_counter ?? 0) + 1;
    ctx.saveMetadata();
    return ctx.chatMetadata.we_msg_counter;
}

function getCooldowns() {
    const ctx = getContext();
    if (!ctx.chatMetadata) return {};
    if (!ctx.chatMetadata.we_arc_cooldowns) ctx.chatMetadata.we_arc_cooldowns = {};
    return ctx.chatMetadata.we_arc_cooldowns;
}

function setCooldown(arcName, expiryMsg) {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    if (!ctx.chatMetadata.we_arc_cooldowns) ctx.chatMetadata.we_arc_cooldowns = {};
    ctx.chatMetadata.we_arc_cooldowns[arcName] = expiryMsg;
    ctx.saveMetadata();
}

function arcsInCooldown() {
    const now = getMsgCounter();
    const cds = getCooldowns();
    return Object.entries(cds)
        .filter(([, expiry]) => expiry > now)
        .map(([name]) => name);
}

// Debug log: last N flag changes for the widget
function pushFlagLog(entry) {
    const ctx = getContext();
    if (!ctx.chatMetadata) return;
    if (!ctx.chatMetadata.we_flag_log) ctx.chatMetadata.we_flag_log = [];
    ctx.chatMetadata.we_flag_log.unshift(entry);
    ctx.chatMetadata.we_flag_log = ctx.chatMetadata.we_flag_log.slice(0, 20);
    ctx.saveMetadata();
}

function getFlagLog() {
    const ctx = getContext();
    return ctx.chatMetadata?.we_flag_log || [];
}

// After an event fires, open/close arcs whose seed/terminator text matches.
function mutateFlagsForEvent(eventText, scaleId) {
    if (!eventText) return { opened: [], closed: [] };
    const flags = getFlags();
    const opened = [];
    const closed = [];
    for (const [name, br] of Object.entries(BRANCHES)) {
        if (br.seeds.has(eventText) && !flags[br.flag]) {
            setFlag(br.flag, 1);
            opened.push(name);
            pushFlagLog({ ts: Date.now(), action: 'open', arc: name, scale: scaleId, text: eventText });
            console.log(`[WildEvents] OPEN ${name} (${br.flag}) via ${scaleId}: "${eventText}"`);
        } else if (br.terminators.has(eventText) && flags[br.flag]) {
            setFlag(br.flag, 0);
            setCooldown(name, getMsgCounter() + COOLDOWN_MESSAGES);
            closed.push(name);
            pushFlagLog({ ts: Date.now(), action: 'close', arc: name, scale: scaleId, text: eventText });
            console.log(`[WildEvents] CLOSE ${name} (${br.flag}) via ${scaleId}: "${eventText}" [cooldown ${COOLDOWN_MESSAGES} msgs]`);
        }
    }
    return { opened, closed };
}

// Rollback a previous flagDelta (used on swipe/reroll — the prior roll gets
// replaced by a fresh one, so its flag effect must be undone first).
function undoFlagsFromResult(prev) {
    if (!prev || !prev.flagDelta) return;
    const { opened = [], closed = [] } = prev.flagDelta;
    for (const arc of opened) {
        if (!BRANCHES[arc]) continue;
        setFlag(BRANCHES[arc].flag, 0);
        pushFlagLog({ ts: Date.now(), action: 'undo-open', arc, scale: prev.scale?.id || '?', text: prev.eventType || '' });
        console.log(`[WildEvents] UNDO-OPEN ${arc} (reroll)`);
    }
    for (const arc of closed) {
        if (!BRANCHES[arc]) continue;
        setFlag(BRANCHES[arc].flag, 1);
        // Also drop the cooldown that was set when arc closed.
        setCooldown(arc, 0);
        pushFlagLog({ ts: Date.now(), action: 'undo-close', arc, scale: prev.scale?.id || '?', text: prev.eventType || '' });
        console.log(`[WildEvents] UNDO-CLOSE ${arc} (reroll)`);
    }
}

function pickEventType(scaleId, categoryId, isPositive) {
    if (scaleId === 'NONE') return null;
    const pool = buildPool(scaleId, categoryId, isPositive);
    if (!pool.length) return null;

    const key = getCountsKey(scaleId, categoryId, isPositive);
    const activeArcs = activeArcNames().map(n => BRANCHES[n]);
    const cooldownArcs = arcsInCooldown().map(n => BRANCHES[n]).filter(Boolean);

    // Base weight: inverse of frequency count. Multiplied by branch boost
    // when the event is a developer or terminator of any active arc.
    // Multiplied by cooldown penalty when the event is a seed of an arc
    // that recently closed (prevents immediate re-opening).
    const weights = pool.map(text => {
        let w = 1 / (1 + getCount(key, text));
        for (const arc of activeArcs) {
            if (arc.developers.has(text) || arc.terminators.has(text)) {
                w *= arc.boost;
            }
        }
        for (const arc of cooldownArcs) {
            if (arc.seeds.has(text)) {
                w *= COOLDOWN_PENALTY;
            }
        }
        return w;
    });

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


// ── Prompt-mode helpers ───────────────────────────────────

function findPromptScale(score) {
    return PROMPT_SCALES.find(e => score >= e.min && score <= e.max) || PROMPT_SCALES[0];
}

function formatPromptMinimal(result) {
    const label = extension_settings[EXT].label || DEFAULTS.label;
    if (result.scale.id === 'NONE') {
        return `[${label}: NO CHANGE]\nNo forced twist. Story continues naturally.`;
    }
    const impact = result.isPositive ? 'POSITIVE' : 'NEGATIVE';
    const lines = [
        `[${label}: ${result.scale.name} | Impact for {{user}}: ${impact}]`,
        result.forced ? '(FORCED — tension reached maximum)' : '',
        'Weave this into the current scene naturally.',
    ].filter(Boolean);
    return lines.join('\n');
}

function runEventPromptMode(isNewMessage) {
    const s = extension_settings[EXT];
    if (!s.enabled) { setExtensionPrompt(EXT, '', 1, s.depth); return; }

    let tension = getTension();
    if (isNewMessage) {
        tension = Math.min(100, tension + (s.promptStep ?? DEFAULTS.promptStep));
        saveTension(tension);
    }

    let baseRoll, modifier, finalScore, isPositive, scale;
    let forced = false;

    baseRoll = Math.floor(Math.random() * 20) + 1;
    modifier = Math.floor(tension / 8);
    isPositive = baseRoll % 2 === 0;

    if (tension >= 100) { forced = true; finalScore = 25; }
    else { finalScore = baseRoll + modifier; }

    scale = findPromptScale(finalScore);

    if (isNewMessage) {
        if (scale.adj === 'reset') saveTension(0);
        else if (scale.adj === 'reduce25') saveTension(tension * 0.75);
    }

    const result = {
        tension: getTension(), baseRoll, modifier, finalScore,
        isPositive, scale, category: null, forced,
        eventType: null, activeArcs: [], flagDelta: { opened: [], closed: [] },
        promptMode: true,
    };

    const prompt = formatPromptMinimal(result);
    setExtensionPrompt(EXT, prompt, 1, s.depth, false, 0);

    extension_settings[EXT]._lastResult = result;
    saveSettingsDebounced();

    updateUI(result);
    if (s.showBadge) updateWidget(result);
}

function formatPrompt(result) {
    const label = extension_settings[EXT].label || DEFAULTS.label;
    const impact = result.isPositive ? 'POSITIVE' : 'NEGATIVE';

    if (result.scale.id === 'NONE') {
        return `[${label}: NO CHANGE]\nNo forced twist. Story continues naturally.`;
    }

    const isSoftTier = (result.scale.id === 'SUBTLE' || result.scale.id === 'MINOR');

    // Active arcs give the model a light steer — the ongoing threads the
    // story is holding open. Not required, but helps the model resonate
    // this event with earlier beats.
    const arcs = result.activeArcs || [];
    const arcLine = arcs.length
        ? `Ongoing arcs: ${arcs.join(', ')}.`
        : '';

    let lines = [
        `[${label}: ${result.scale.name} | ${impact} | ${result.category.name}]`,
        result.eventType ? `Event: ${result.eventType}.` : '',
        result.forced ? '(FORCED — tension reached maximum)' : '',
        arcLine,
        'Weave this into the current scene through actions, dialogue, or observations of characters.',
        'The event may affect any character — main characters, the user\'s character, or side characters. Prioritize those most relevant to the current scene, but only if the event fits them logically.',
        isSoftTier
            ? 'If the event does not fit the current moment, hint at it subtly rather than forcing it.'
            : 'This event must have a tangible impact on the scene — do not reduce it to a hint or implication.',
    ].filter(Boolean);

    return lines.join('\n');
}

function runEvent(isNewMessage) {
    const s = extension_settings[EXT];
    if (!s.enabled) { setExtensionPrompt(EXT, '', 1, s.depth); return; }

    // Reroll: undo effect of the previous roll on flags before generating anew.
    if (!isNewMessage) {
        undoFlagsFromResult(s._lastResult);
    }

    let tension = getTension();
    if (isNewMessage) {
        tension = Math.min(100, tension + s.step);
        saveTension(tension);
        bumpMsgCounter();
    }

    let baseRoll, modifier, finalScore, isPositive, scale;
    let forced = false;

    baseRoll = Math.floor(Math.random() * 20) + 1;
    modifier = Math.floor(tension / 8);
    isPositive = baseRoll % 2 === 0;

    if (tension >= 100) { forced = true; finalScore = 27; }
    else { finalScore = baseRoll + modifier; }

    scale = findScale(finalScore);

    if (isNewMessage) {
        if (scale.adj === 'reset') saveTension(0);
        else if (scale.adj === 'reduce50') saveTension(tension * 0.5);
        else if (scale.adj === 'reduce25') saveTension(tension * 0.75);
    }

    const category = pickCategory();
    incrementCategoryCount(category.id);
    const eventType = pickEventType(scale.id, category.id, isPositive);

    // Capture active arcs BEFORE mutation — the model needs to see the
    // threads this event lives inside, including the one it may be closing.
    const activeArcsBefore = activeArcNames();
    const flagDelta = mutateFlagsForEvent(eventType, scale.id);
    const activeArcs = activeArcsBefore;

    const result = { tension: getTension(), baseRoll, modifier, finalScore, isPositive, scale, category, forced, eventType, activeArcs, flagDelta };
    const prompt = formatPrompt(result);
    setExtensionPrompt(EXT, prompt, 1, s.depth, false, 0);

    extension_settings[EXT]._lastResult = result;
    saveSettingsDebounced();

    updateUI(result);
    if (s.showBadge) updateWidget(result);
}

// ── Generation hooks ───────────────────────────────────────

function onMessageSent() {
    const mode = extension_settings[EXT].mode || 'full';
    if (mode === 'prompt') runEventPromptMode(true);
    else runEvent(true);
}
function onMessageSwiped() {
    const mode = extension_settings[EXT].mode || 'full';
    if (mode === 'prompt') runEventPromptMode(false);
    else runEvent(false);
}


// ── Badge helpers ──────────────────────────────────────────

function injectBadge(result) { updateWidget(result); }
function removeBadges() { updateWidget(null); }

// ── Floating widget ────────────────────────────────────────

function applyWidgetPosition() {
    const s = extension_settings[EXT];
    const $w = $('#we_widget');
    if (!$w.length) return;
    if (s.widgetX != null && s.widgetY != null) {
        $w.css({ top: s.widgetY + 'px', right: 'auto', left: s.widgetX + 'px' });
    }
}

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
                <div id="we_pop_flag_delta" style="display:none;"></div>
                <div id="we_pop_arcs" style="display:none;"></div>
                <div id="we_pop_tension">
                    <span id="we_pop_tension_label">Tension</span>
                    <div id="we_pop_bar_bg"><div id="we_pop_bar_fill"></div></div>
                    <span id="we_pop_tension_val"></span>
                </div>
                <div id="we_pop_debug" style="display:none;">
                    <div id="we_pop_debug_label">Recent arc changes</div>
                    <div id="we_pop_debug_log"></div>
                </div>
            </div>
        </div>
    `);

    $('body').append($widget);
    applyWidgetPosition();

    // ── Drag-to-move (hold 500ms then drag) ──
    let holdTimer = null;
    let isDragging = false;
    let wasDragging = false;
    let dragOffset = { x: 0, y: 0 };

    function onPointerDown(e) {
        if (e.button && e.button !== 0) return;
        const px = e.clientX ?? e.touches?.[0]?.clientX;
        const py = e.clientY ?? e.touches?.[0]?.clientY;
        const rect = $widget[0].getBoundingClientRect();
        dragOffset = { x: px - rect.left, y: py - rect.top };

        holdTimer = setTimeout(() => {
            isDragging = true;
            $widget.addClass('we_dragging');
            $('#we_popup').hide();
        }, 500);
    }

    function onPointerMove(e) {
        if (!isDragging) {
            const px = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
            const py = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
            const rect = $widget[0].getBoundingClientRect();
            const dx = px - (rect.left + dragOffset.x);
            const dy = py - (rect.top + dragOffset.y);
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) clearTimeout(holdTimer);
            return;
        }
        e.preventDefault();
        const px = e.clientX ?? e.touches?.[0]?.clientX;
        const py = e.clientY ?? e.touches?.[0]?.clientY;
        const x = Math.max(0, Math.min(window.innerWidth - 36, px - dragOffset.x));
        const y = Math.max(0, Math.min(window.innerHeight - 36, py - dragOffset.y));
        $widget.css({ left: x + 'px', top: y + 'px', right: 'auto' });
    }

    function onPointerUp() {
        clearTimeout(holdTimer);
        if (isDragging) {
            isDragging = false;
            wasDragging = true;
            setTimeout(() => { wasDragging = false; }, 50);
            $widget.removeClass('we_dragging');
            const s = extension_settings[EXT];
            s.widgetX = parseInt($widget.css('left'));
            s.widgetY = parseInt($widget.css('top'));
            saveSettingsDebounced();
        }
    }

    const fab = $('#we_fab')[0];
    fab.addEventListener('mousedown', onPointerDown);
    fab.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('mousemove', onPointerMove);
    document.addEventListener('touchmove', onPointerMove, { passive: false });
    document.addEventListener('mouseup', onPointerUp);
    document.addEventListener('touchend', onPointerUp);

    $('#we_fab').on('click', function(e) {
        if (isDragging || wasDragging) return;
        e.stopPropagation();
        const $popup = $('#we_popup');
        if ($popup.is(':visible')) {
            $popup.hide();
        } else {
            const rect = $widget[0].getBoundingClientRect();
            const spaceRight = window.innerWidth - rect.right;
            if (spaceRight < 240) {
                $popup.css({ right: '0', left: 'auto' });
            } else {
                $popup.css({ left: '0', right: 'auto' });
            }
            $popup.show();
        }
    });
    $(document).on('click.we_widget', function(e) {
        if (!$(e.target).closest('#we_widget').length) $('#we_popup').hide();
    });
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
    $('#we_pop_event').text(result.eventType || '');

    // Flag delta (this-turn opens/closes)
    const opened = result.flagDelta?.opened || [];
    const closed = result.flagDelta?.closed || [];
    if (opened.length || closed.length) {
        const parts = [];
        if (opened.length) parts.push(`<span class="we_arc_opened">+ ${opened.join(', ')}</span>`);
        if (closed.length) parts.push(`<span class="we_arc_closed">− ${closed.join(', ')}</span>`);
        $('#we_pop_flag_delta').html(parts.join(' &nbsp; ')).show();
    } else {
        $('#we_pop_flag_delta').hide();
    }

    // Currently active arcs
    const arcs = result.activeArcs || activeArcNames();
    if (arcs.length) {
        $('#we_pop_arcs').html(`<span class="we_arc_label">Active arcs:</span> ${arcs.join(' · ')}`).show();
    } else {
        $('#we_pop_arcs').hide();
    }

    $('#we_pop_tension_val').text(`${tension.toFixed(1)}%`);
    $('#we_pop_bar_fill').css('width', `${Math.min(100, tension)}%`);

    // Debug log
    if (s.showDebug) {
        const log = getFlagLog();
        if (log.length) {
            const html = log.slice(0, 8).map(e => {
                const sign = e.action === 'open' ? '+' : '−';
                const cls = e.action === 'open' ? 'we_arc_opened' : 'we_arc_closed';
                return `<div class="we_dbg_row"><span class="${cls}">${sign} ${e.arc}</span> <span class="we_dbg_scale">${e.scale}</span></div>`;
            }).join('');
            $('#we_pop_debug_log').html(html);
            $('#we_pop_debug').show();
        } else {
            $('#we_pop_debug').hide();
        }
    } else {
        $('#we_pop_debug').hide();
    }

    $('#we_widget').show();
}

// ── Panel UI ───────────────────────────────────────────────

function updateUI(result) {
    const t = result?.tension ?? getTension();
    $('#we_tension_val').text(`${t.toFixed(1)}%`);
    $('#we_tension_bar').css('width', `${Math.min(100, t)}%`);
    refreshActiveArcsUI();

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

    if (result.eventType && result.scale.id !== 'NONE') {
        $('#we_type_val').text(result.eventType);
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


function toggleAccordion(bodyId, iconEl) {
    $(`#${bodyId}`).slideToggle(150);
    $(iconEl).toggleClass('we_acc_open');
}

function refreshActiveArcsUI() {
    const arcs = activeArcNames();
    const cd = arcsInCooldown();
    const $el = $('#we_active_arcs');
    if (!$el.length) return;
    const parts = [];
    if (arcs.length) parts.push(arcs.join(' · '));
    if (cd.length) {
        const now = getMsgCounter();
        const cds = getCooldowns();
        const labels = cd.map(n => `${n.replace('_ARC','')} (cd ${Math.max(0, cds[n] - now)})`);
        parts.push('<span style="opacity:0.5">' + labels.join(' · ') + '</span>');
    }
    if (parts.length) {
        $el.html(parts.join(' <span style="opacity:0.3">·</span> ')).css('opacity', '1');
    } else {
        $el.text('—').css('opacity', '0.5');
    }
}

function applyModeUI(mode) {
    const isFull = mode === 'full';
    $('#we_mode_full').toggleClass('we_mode_active', isFull);
    $('#we_mode_prompt').toggleClass('we_mode_active', !isFull);
    // Full-mode-only controls
    $('#we_show_debug').closest('label').toggle(isFull);
    $('#we_category_row').toggle(isFull);
    $('#we_type_row').toggle(isFull);
    $('#we_reset_counts').toggle(isFull);
    $('#we_reset_branches').toggle(isFull);
    $('#we_active_arcs').closest('.we_section').toggle(isFull);
    // Step inputs: show the one matching the active mode
    $('#we_step_label').toggle(isFull);
    $('#we_step').toggle(isFull);
    $('#we_prompt_step_label').toggle(!isFull);
    $('#we_prompt_step').toggle(!isFull);
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

                    <div class="we_mode_switch" style="margin-bottom:8px;">
                        <small style="opacity:0.7;">Mode</small>
                        <div class="we_mode_btns" style="display:flex;gap:4px;margin-top:3px;">
                            <input type="button" id="we_mode_full" class="menu_button" value="Full" style="flex:1;font-size:0.82em;" />
                            <input type="button" id="we_mode_prompt" class="menu_button" value="Prompt" style="flex:1;font-size:0.82em;" />
                        </div>
                    </div>

                    <label class="checkbox_label" style="margin-bottom:6px;">
                        <input type="checkbox" id="we_show_badge" /><span>Show widget</span>
                    </label>
                    <label class="checkbox_label" style="margin-bottom:6px;">
                        <input type="checkbox" id="we_show_debug" /><span>Show arc debug in widget</span>
                    </label>

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
                    </div>

                    <label style="margin-top:6px;"><small>Injection label</small></label>
                    <input type="text" id="we_label" class="text_pole" placeholder="WILD EVENTS" />
                    <label id="we_step_label"><small>Tension per message</small></label>
                    <input type="number" id="we_step" class="text_pole" min="0.1" max="10" step="0.1" />
                    <label id="we_prompt_step_label" style="display:none;"><small>Tension per message (prompt mode)</small></label>
                    <input type="number" id="we_prompt_step" class="text_pole" min="0.1" max="10" step="0.1" style="display:none;" />
                    <label><small>Injection depth (0 = end of context)</small></label>
                    <input type="number" id="we_depth" class="text_pole" min="0" max="100" step="1" />
                    <div style="margin-top:8px;display:flex;gap:6px;">
                        <input type="button" id="we_reset" class="menu_button" value="⟳ Reset Tension" style="flex:1;" />
                        <input type="button" id="we_reset_counts" class="menu_button" value="⟳ Reset Counts" style="flex:1;" />
                    </div>
                    <div style="margin-top:6px;">
                        <input type="button" id="we_reset_branches" class="menu_button" value="⟳ Reset Branches (close all active arcs)" style="width:100%;" />
                    </div>

                    <div class="we_section" style="margin-top:10px;">
                        <div class="we_row"><span>Active arcs</span><span id="we_active_arcs" style="opacity:0.7">—</span></div>
                    </div>
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

    $('#we_toggle').prop('checked', s.enabled);
    $('#we_show_badge').prop('checked', s.showBadge);
    $('#we_show_debug').prop('checked', s.showDebug);
    $('#we_label').val(s.label);
    $('#we_step').val(s.step);
    $('#we_prompt_step').val(s.promptStep ?? DEFAULTS.promptStep);
    $('#we_depth').val(s.depth);
    applyModeUI(s.mode || 'full');
    updateUI(s._lastResult || null);
    refreshActiveArcsUI();

    $(document).on('click', '.we_accordion_header', function () {
        const target = $(this).data('target');
        toggleAccordion(target, $(this).find('.we_acc_icon')[0]);
    });

    $('#we_toggle').on('change', function () { s.enabled = this.checked; saveSettingsDebounced(); if (!this.checked) setExtensionPrompt(EXT, '', 1, s.depth); });
    $('#we_show_badge').on('change', function () { s.showBadge = this.checked; saveSettingsDebounced(); if (!this.checked) $('#we_widget').hide(); });
    $('#we_show_debug').on('change', function () { s.showDebug = this.checked; saveSettingsDebounced(); if (s._lastResult) updateWidget(s._lastResult); });
    $('#we_label').on('input', function () { s.label = this.value; saveSettingsDebounced(); });
    $('#we_step').on('input', function () { s.step = parseFloat(this.value) || DEFAULTS.step; saveSettingsDebounced(); });
    $('#we_prompt_step').on('input', function () { s.promptStep = parseFloat(this.value) || DEFAULTS.promptStep; saveSettingsDebounced(); });
    $('#we_depth').on('input', function () { s.depth = parseInt(this.value) || DEFAULTS.depth; saveSettingsDebounced(); });

    $('#we_mode_full').on('click', () => { s.mode = 'full'; saveSettingsDebounced(); applyModeUI('full'); });
    $('#we_mode_prompt').on('click', () => { s.mode = 'prompt'; saveSettingsDebounced(); applyModeUI('prompt'); });

    $('#we_reset').on('click', () => {
        saveTension(0); updateUI(null);
        $('#we_roll_val').text('—'); $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', ''); $('#we_type_row').hide(); $('#we_category_row').hide();
        toastr.info('Tension reset to 0%');
    });
    $('#we_reset_counts').on('click', () => { resetEventCounts(); toastr.info('Event frequency counters reset.'); });
    $('#we_reset_branches').on('click', () => {
        resetBranches();
        refreshActiveArcsUI();
        if (s._lastResult) { s._lastResult.activeArcs = []; s._lastResult.flagDelta = { opened: [], closed: [] }; updateWidget(s._lastResult); }
        toastr.info('All arcs closed.');
    });

    // ── ST event hooks ──
    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => {
        if (s.showBadge && s._lastResult) updateWidget(s._lastResult);
    });
    eventSource.on(event_types.CHAT_CHANGED, () => {
        s._lastResult = null;
        $('#we_tension_val').text('0%');
        $('#we_tension_bar').css('width', '0%');
        $('#we_roll_val').text('—');
        $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', '');
        $('#we_type_row').hide();
        $('#we_category_row').hide();
        refreshActiveArcsUI();
        $('#we_widget').hide();
    });
});
