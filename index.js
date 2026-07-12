import { extension_settings, getContext } from '../../../extensions.js';
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    setExtensionPrompt,
    getRequestHeaders,
} from '../../../../script.js';

const EXT = 'wild-events';


const DEFAULTS = {
    enabled: true,
    step: 0.5,
    label: 'WILD EVENTS',
    depth: 0,
    setting: 'none',
    showBadge: true,
    connectionProfile: '',
    customSettings: {},
};

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
            'a place of significance is reached and it is not what was expected — it is worse',
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
            'a natural or supernatural phenomenon occurs that fundamentally alters the landscape of what is possible',
            'a safe place that was lost is recovered and returning to it changes the meaning of everything that happened since',
            'the environment itself responds to what is happening as if it recognizes the significance',
            'a barrier that has defined the world — a wall, a border, a divide — ceases to exist',
            'a catastrophe that seemed inevitable is averted by something the environment provides at the last moment',
            'a place of power activates in a way that benefits everyone present regardless of allegiance',
            'the world reveals a hidden layer that changes what the characters understand about where they are',
            'a corruption or blight that has been spreading is reversed at its source',
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
            'a corruption or blight reaches a critical mass and begins to transform the environment irreversibly',
            'a place of power turns hostile to everyone within it simultaneously',
            'the environment becomes actively dangerous in a way that changes all existing plans',
            'a barrier that was protecting something fails and what it was holding back enters the world',
            'a place that held meaning is destroyed and the destruction is felt by everyone connected to it',
            'the world reveals something that was hidden beneath it and that something is not benign',
            'a threshold is crossed and there is no way back — the path behind ceases to exist',
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
            'a discovery changes the rules of what is possible in this world',
            'a hidden message or legacy left by someone long gone arrives at exactly the right moment',
            'a truth that everyone was afraid to face turns out to be survivable — difficult, but survivable',
        ],
        negative: [
            'a truth is uncovered that recontextualizes the entire story — and everything that felt like progress was actually serving something else',
            'a discovery reveals that a trusted foundation — a belief, an institution, a history — was built on something false',
            'a secret kept by multiple people is exposed simultaneously and none of them knew the others were keeping it',
            'a piece of knowledge surfaces that should not exist and the fact that it exists means something terrible',
            'a discovery proves that someone who was celebrated was actually responsible for something unforgivable',
            'a pattern becomes visible connecting events no one realized were related — and the pattern is predatory',
            'a mystery resolves and the answer is worse than not knowing',
            'a hidden truth about someone\'s origin or nature or purpose is revealed and it changes how everyone sees them',
            'a discovery renders a previous sacrifice meaningless — the sacrifice was for nothing',
            'something thought to be benign or neutral is discovered to have been actively harmful the entire time',
            'a lie is exposed and the structure it was supporting collapses — and people were living inside that structure',
            'a discovery changes the rules of what is possible in this world and the change is terrifying',
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


// ── Setting labels (built-in settings removed, keeping infrastructure) ─

const SETTING_LABELS = {
    none: null,
    slavic: 'Slavic Fantasy',
};

const SETTING_EVENTS = {
    slavic: {

// ════════════════════════════════════════════════════════════
// SUBTLE
// ════════════════════════════════════════════════════════════

SUBTLE: {
    INTERPERSONAL: {
        positive: [
            'a stranger passing through knows something about someone they should not know, and the knowing creates an unexpected bond',
            'two people share a moment of wordless recognition at a threshold — doorway, riverbank, forest edge',
            'someone defends another person using old words of warding that work better than expected',
            'a shared superstition between two people becomes a small private language',
            'an elder offers a blessing that is received with more sincerity than anyone expected',
            'someone notices that another person has been leaving small protective offerings and says nothing, but the noticing matters',
            'two people find themselves on the same side of an old local argument without having discussed it',
            'a piece of old knowledge is passed from one person to another as casually as gossip, but it lands like a gift',
            'someone reads another person\'s dream fragment correctly and the accuracy creates trust',
            'a moment of shared fear of something unseen pulls two people closer than politeness would have',
            'someone remembers the correct name to use with a local spirit and the remembering impresses the person beside them',
            'two people discover they share the same protective charm without having compared notes before',
            'a small act of hospitality — salt, bread, a seat by the fire — resets a strained dynamic',
            'someone picks up a task another person abandoned out of fear and the gesture is understood correctly',
            'a look passes between two people when something in the environment behaves wrongly, and the shared recognition is a kind of closeness',
        ],
        negative: [
            'someone breaks a small hospitality custom without knowing it and the room shifts',
            'a name is used incorrectly — too familiar, or the wrong one entirely — and the person addressed notices',
            'two people disagree about whether something was a sign, and the disagreement reveals a deeper incompatibility',
            'someone refuses a blessing offered in good faith and the refusal creates an invisible wall',
            'a protective gesture made for one person is interpreted as a slight by another',
            'an elder\'s warning is dismissed in front of someone who believed it, and the dismissal damages something',
            'two people share a space that feels wrong, and each handles it differently enough to cause friction',
            'someone reveals they don\'t know a local custom that everyone assumed was common knowledge',
            'a piece of old knowledge is shared and then mocked by the person it was shared with',
            'someone performs a gesture of warding in front of a person who finds it foolish',
            'two people have conflicting obligations to the same threshold and neither will yield',
            'a shared moment of fear is handled so differently by each person that it highlights how little they understand each other',
            'someone receives help they didn\'t ask for in a way that implies they couldn\'t manage alone',
            'a well-intentioned protection placed on someone without their knowledge is found and misread',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a dream from the previous night suddenly feels relevant and the recognition brings a strange calm',
            'an old scar or wound aches without physical reason, and the ache feels like a reminder rather than a warning',
            'someone catches themselves performing a protective gesture they learned as a child and feels, briefly, held',
            'a familiar smell — woodsmoke, river mud, dried herbs — arrives and loosens something that had been tight',
            'someone realizes they have been unconsciously following the old rules of a liminal space and feels safer for it',
            'a feeling of being watched resolves into a feeling of being watched over',
            'someone lets themselves believe in something for a moment and the belief is restful rather than foolish',
            'an old superstition observed out of habit turns out to have been exactly right',
            'a memory of a ritual from childhood surfaces and provides unexpected comfort in the present moment',
            'someone feels the particular calm of a space that has been properly kept and tended',
            'a moment of genuine fear passes cleanly, leaving alertness rather than dread',
            'someone names what they felt to themselves using the old word for it, and the naming helps',
            'a brief sense of alignment between the internal and external — weather matching mood, season matching state',
            'someone feels, without evidence, that a decision they made was the right one',
            'an unease that has been present all day lifts when someone performs a small habitual gesture of closing and protection',
        ],
        negative: [
            'a familiar anxiety returns wearing the face of something older and harder to name',
            'someone performs a protective gesture and feels nothing — the usual reassurance does not come',
            'a smell that should be neutral triggers something that is not grief but is adjacent to it',
            'a dream fragment surfaces during waking hours and resists being pushed back down',
            'someone realizes they have been avoiding a specific threshold for days without consciously deciding to',
            'a feeling of being watched does not resolve — it simply intensifies whenever attention is paid to it',
            'someone observes an old prohibition and feels the weight of it as oppression rather than safety',
            'a superstition observed out of habit turns out to have been ignored at exactly the wrong moment',
            'someone cannot shake the sense that something in the environment is slightly wrong in a way they cannot name',
            'a piece of old knowledge arrives too late to be useful and the lateness is its own kind of grief',
            'a moment of genuine fear does not pass — it settles in and makes itself at home',
            'someone finds themselves unable to sleep in a space that should feel safe',
            'an emotion that should be simple becomes complicated by its resemblance to something from the old stories',
            'someone notices they have been unconsciously breaking a rule of a liminal space and cannot remember when they started',
            'a restlessness arrives that feels like something asking to be done, but what it is asking for is unclear',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'the mist thickens in a way that feels deliberate rather than natural, and the deliberateness is protective',
            'a fire or flame changes color briefly — green, blue — and the change feels like acknowledgment',
            'the wind shifts in a way that seems responsive to what was just said aloud',
            'an animal behaves as if it perceives something others cannot, and its behavior is a useful warning',
            'a familiar path looks different than it should, but the difference leads somewhere better',
            'a plant or tree in the area seems subtly aware in a way that feels watchful rather than threatening',
            'the boundary between two places feels thinner than usual, and the thinness is an opportunity',
            'something left as an offering disappears without explanation, and the disappearance feels like acceptance',
            'the quality of light in a forest space shifts to something that makes navigation easier',
            'water in the area behaves in a way that suggests recent passage by something that means no harm',
            'a stone or carved marker that was previously unnoticed turns out to be exactly where it is needed',
            'a smell of herbs or earth or rain arrives that has no immediate source but clears the head',
            'the space around a threshold feels more solid and defined than usual',
            'a bird or small animal settles nearby in a way that communicates, specifically, safety',
            'the sounds of the forest arrange themselves into something almost like guidance',
        ],
        negative: [
            'the mist thickens in a way that feels deliberate rather than natural, and the deliberateness is not protective',
            'the fire goes out at a symbolically bad moment and will not relight easily',
            'a familiar path through known territory becomes briefly unrecognizable',
            'the usual sounds of night or forest are conspicuously absent where they should not be',
            'a plant or tree in the area seems subtly wrong — too still, too aware in the wrong direction',
            'a smell — earth, decay, standing water — appears where it does not belong',
            'a child or animal stares at something in an apparently empty space with focused attention',
            'the boundary between two places feels thinner than usual, and the thinness is a warning',
            'a reflection shows something that is not quite right about the space behind the viewer',
            'a stone or carved marker is found displaced from where it should be, recently',
            'the quality of light changes in a way that makes distances harder to judge',
            'a candle or lamp cannot be lit no matter the conditions or the material',
            'water in the area behaves in a way that suggests recent disturbance by something that does not belong here',
            'something left as an offering has been returned — scattered or moved rather than taken',
            'the space around a threshold feels unstable in a way it has not felt before',
        ],
    },
    DISCOVERY: {
        positive: [
            'a boundary marker — carved post, particular stone, knotted cord — is found that clarifies where something begins and ends',
            'an old name for a local feature surfaces that contains information about its nature',
            'a dream detail matches something in the waking environment precisely enough to be useful',
            'a protective charm found in an unexpected place turns out to have been left deliberately',
            'a plant growing where it should not be turns out to have a specific and relevant meaning in the old system',
            'a piece of local knowledge passed on casually contains more practical information than it appeared to',
            'a pattern in repeated small events becomes visible and turns out to be a readable sign',
            'something that seemed like decoration turns out to be functional warding',
            'a story told about this place turns out to describe the current situation with uncomfortable accuracy',
            'a discarded or forgotten object turns out to carry information about what happened here before',
            'a particular quality of silence identifies a space as significant in a way that proves useful',
            'an animal track or behavioral pattern in the area points to something worth knowing',
            'a small detail in the environment matches something from a known protective practice and the match is actionable',
            'a threshold or boundary in the landscape is identified that was previously invisible',
            'the time of day or season turns out to be significant in a way that creates a specific, brief opportunity',
        ],
        negative: [
            'a boundary marker is found broken or removed, and its absence explains something that had seemed random',
            'a name for a local spirit or feature surfaces that changes the nature of what has already been done here',
            'a pattern in repeated small events becomes visible and what it indicates is not reassuring',
            'something that seemed like natural variation in the environment turns out to be evidence of recent activity',
            'a protective charm is found in a place where it was not placed — moved, or placed by someone else',
            'a piece of local knowledge arrives that reframes recent events in an uncomfortable direction',
            'a story told about this place turns out to describe the current situation more accurately than is comfortable',
            'a plant or substance in the area is recognized as significant in a context that was not wanted',
            'something found in the environment indicates that someone or something has been watching this space',
            'a detail that seemed minor turns out to be the one that matters and was already acted upon incorrectly',
            'a threshold identified too late was already crossed in the wrong manner',
            'the time of day or season turns out to be significant in a way that closed a window that was assumed to be open',
            'an old name or classification for something here turns out to come with obligations that were not known',
            'a quality of the space that was read as neutral turns out to indicate active presence',
            'a discovery about what this place is changes the nature of every interaction that has already happened in it',
        ],
    },
    EXTERNAL: {
        positive: [
            'a traveler passing through brings news from another place that reframes local conditions favorably',
            'someone with knowledge of the old ways arrives without being summoned at a useful moment',
            'word reaches the characters that a threat elsewhere has resolved itself',
            'an obligation to an outside person or community turns out to have been quietly fulfilled by circumstance',
            'a resource from another settlement arrives that was not expected and is exactly what is needed',
            'a rumor circulating in the wider area turns out to be more accurate than rumor usually is, and the accuracy helps',
            'news arrives that a practitioner of the old knowledge is closer than thought',
            'a seasonal obligation from outside that was dreaded turns out to be less burdensome than feared',
            'word from elsewhere confirms that what was observed here is not isolated — which makes it recognizable',
            'a message from a distance arrives with information that clarifies an ongoing uncertainty',
            'an outside community\'s decision about something unrelated turns out to benefit the current situation',
            'a wandering figure passes through and leaves behind information without being asked',
            'news arrives that whatever was troubling a neighboring area has moved on',
            'an external threat is redirected by conditions elsewhere before it arrives here',
            'word comes that the right person, the one who would know, is in the area',
        ],
        negative: [
            'word arrives from elsewhere that changes the local situation in an unwelcome way',
            'a traveler passing through brings something with them that did not start here',
            'news from the wider area suggests that what was observed here is not isolated — which makes it harder to manage',
            'an obligation to an outside community resurfaces at the wrong time',
            'word arrives that a practitioner who could have helped has moved on or is unavailable',
            'a seasonal obligation from outside arrives and its demands conflict with what is currently needed',
            'something that was sent away from here returns from elsewhere in a changed form',
            'news from another place creates a pressure to act before the local situation is ready',
            'a rumor circulating in the wider area about this place or these people makes its way back and is inconvenient',
            'an outside community\'s decision about something unrelated creates a new constraint here',
            'word arrives that the conditions that were being waited out have changed in an unfavorable direction',
            'a wandering figure passes through and disturbs something that had been quiet',
            'news comes that a neighboring area\'s problem has resolved by sending the problem in this direction',
            'an external obligation arrives that requires leaving or dividing attention at the wrong moment',
            'word arrives from a distance that reframes recent local events in a way that demands response',
        ],
    },
},

// ════════════════════════════════════════════════════════════
// MINOR
// ════════════════════════════════════════════════════════════

MINOR: {
    INTERPERSONAL: {
        positive: [
            'someone with knowledge of the old ways offers real help without being asked and without wanting payment',
            'an old pact between two people or families holds under pressure that should have broken it',
            'someone performs a protective rite for another person and the sincerity of it changes the relationship',
            'two people who have been on opposite sides of a local spiritual disagreement find common ground in a practical crisis',
            'a debt of hospitality is repaid in a way that is exactly right and both people know it',
            'someone stands between another person and something hostile, using knowledge rather than force',
            'a piece of old knowledge shared freely proves its worth in a way that creates genuine gratitude',
            'two people discover they were both maintaining the same protective practice in the same place without knowing it',
            'someone is accepted into a community\'s protective circle in a moment that marks a real shift in relationship',
            'an elder\'s guidance, initially resisted, turns out to have been exactly correct',
            'someone\'s willingness to observe an old prohibition alongside another person creates an unexpected bond',
            'a healing or protective act performed for someone changes how they see the person who performed it',
            'two people who have never trusted each other find they share the same reading of a sign, and the shared reading matters',
            'someone asks for help in the old formal way and the formality itself creates the space for real assistance',
            'a circle of protection is extended to include someone who had been outside it, and the extension is felt',
        ],
        negative: [
            'a promise made by invoking old forms is broken, and the breaking is witnessed',
            'someone performs a protective rite incorrectly and the person it was performed for knows',
            'a debt of hospitality is called in at the worst possible moment and cannot be refused',
            'two people\'s different relationships to the same local spirit create an active conflict rather than tension',
            'someone reveals that they have been maintaining a protection that benefited others without acknowledgment, and the revelation creates resentment',
            'an elder\'s prohibition is violated in front of someone who believed in it',
            'a circle of protection is broken from within by someone who didn\'t believe it was real',
            'someone\'s reading of a sign conflicts with another person\'s and the conflict cannot be resolved by evidence',
            'a formal request for help in the old way is refused, which is a significant social and spiritual act',
            'two people discover they have been working at cross purposes on the same protective practice',
            'an act of healing performed without permission creates an obligation the recipient did not agree to',
            'someone is excluded from a protective circle in a way that makes the exclusion visible to everyone',
            'a piece of old knowledge used against someone proves its worth in a way that damages trust permanently',
            'an old enmity between families or communities resurfaces through the people present',
            'someone\'s attempt to mediate between two forces using the old protocols makes things worse',
        ],
    },
    EMOTIONAL: {
        positive: [
            'a fear that has been shapeless takes on the name of something from the old stories and becomes, briefly, manageable',
            'someone performs a small ritual correctly and the rightness of it is felt as relief rather than superstition',
            'a grief that has no modern frame finds a container in an old form of mourning and the container helps',
            'someone allows themselves to believe in something protective and the belief itself provides the protection',
            'a moment of genuine contact with something larger — the forest, the water, the old boundary — brings unexpected peace',
            'someone speaks the right words over the right action and feels, specifically, heard',
            'a fear that has been following someone is named aloud in the correct way and loses some of its weight',
            'an old prohibition consciously observed gives someone a sense of order in a disordered situation',
            'someone\'s anger finds the correct old form of expression and becomes clean rather than corrosive',
            'a habitual protective gesture is performed with full intention for the first time and the difference is felt',
            'someone finds the old word for what they are experiencing and the word helps',
            'a moment of genuine reverence for something ancient creates space between a person and their immediate problems',
            'an act of proper farewell performed for something lost provides actual closure',
            'someone lets themselves grieve in the old way and the grief moves rather than stagnating',
            'a recognition of being in the right place at the right time — liminal and alive — brings unexpected steadiness',
        ],
        negative: [
            'a fear takes on the specific face of something from the old stories and becomes worse for having a name',
            'a protective ritual performed in distress fails to provide the comfort it has always provided before',
            'someone realizes they have been carrying something — a grief, a fear, an obligation — in the wrong form for too long',
            'an emotion that should be simple is complicated by its resemblance to a specific old story that ends badly',
            'someone breaks an old prohibition without meaning to and cannot un-know that they broke it',
            'a moment that should have been reverent is interrupted and the interruption feels like a bad sign',
            'someone loses the ability to perform a comfort ritual they have relied on — the words won\'t come, the gesture feels wrong',
            'an anger without the correct form of expression becomes something that cannot be safely contained',
            'a grief that was being held in old forms breaks the forms and has nowhere left to go',
            'someone realizes they have been observing the wrong prohibition and ignoring the one that mattered',
            'a feeling of being abandoned by whatever was watching over this place settles in and does not lift',
            'someone who has always known what to do in liminal spaces finds themselves genuinely uncertain',
            'an old shame resurfaces in connection with a current situation and the combination is heavier than either alone',
            'a recognition of being in the wrong place at the wrong time creates a dread that is hard to rationalize away',
            'something that has always felt like protection is revealed to have been containment',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'a liminal space — crossroads, riverbank, forest edge — provides shelter that should not be available there',
            'the forest or water seems to clear a path rather than obstruct it, in a way that is specific and useful',
            'a site of old significance activates in a minor way that is exactly what is needed',
            'a protective boundary in the landscape holds against something testing it',
            'the environment provides the correct material — herb, water, earth, wood — at exactly the right moment',
            'a threshold properly maintained proves its maintenance in a visible way',
            'the terrain shifts to make a difficult passage possible at the right moment',
            'a natural feature of the landscape that was unknown turns out to have been a recognized site of significance',
            'something growing in the area turns out to have protective properties that are relevant now',
            'the light in a specific space changes in a way that makes something previously invisible clear',
            'water in the area behaves in a useful way — direction, clarity, behavior — at a moment when it matters',
            'the environment responds to a correct action in a way that confirms the action was correct',
            'a boundary in the landscape that was uncertain becomes definite and the definition is helpful',
            'a place of rest or safety opens up in territory that had seemed uniformly hostile',
            'the old markers in the environment turn out to still be accurate about the nature of the space they mark',
        ],
        negative: [
            'a protective boundary in the landscape fails in a specific location',
            'a liminal space that should have been safe proves to be actively dangerous',
            'the environment withholds what is needed — no running water, no shelter, no suitable material',
            'a threshold that was properly maintained is found unmaintained, recently',
            'a place that was known and familiar becomes subtly wrong in ways that accumulate',
            'something in the environment is recognized as indicating recent presence of something that belongs elsewhere',
            'a natural site of significance becomes hostile to those currently present',
            'the terrain becomes impassable in a direction that was the only viable option',
            'a protective feature of the landscape is revealed to have been a contained threat all along',
            'water in the area becomes unreliable as a guide or resource',
            'the environment responds to an incorrect action in a way that makes the incorrectness undeniable',
            'a boundary in the landscape that seemed stable is found compromised',
            'the old markers in the environment turn out to be warnings rather than guides',
            'a space that provided rest or safety closes — not dramatically, but irrevocably',
            'something growing in the area turns out to be relevant to the current situation in an unfavorable direction',
        ],
    },
    DISCOVERY: {
        positive: [
            'a piece of old knowledge surfaces that reframes the current problem as a known and solvable type',
            'an object found in the environment is recognized as something with established protective use',
            'a local story, initially dismissed as folklore, turns out to describe the current situation exactly',
            'someone remembers the correct procedure for the current situation at a moment when it can still be applied',
            'a site discovered in the area turns out to have been a place of protection or significance',
            'the correct name for what is happening here is found, and naming it changes what can be done about it',
            'an old agreement between this place and something else is discovered and turns out still to be valid',
            'evidence surfaces that someone dealt successfully with this same situation here before',
            'a resource — knowledge, material, location — that was thought lost turns out to be present and accessible',
            'a pattern in recent events is recognized as a specific known type of manifestation that has established responses',
            'something that appeared to be a threat is correctly identified as a test or challenge with a known form',
            'a piece of information about the history of this place explains current events and suggests a path forward',
            'a protective working already in place is discovered that was not known about and is still functioning',
            'the correct form of address or approach for the current situation is identified in time to use it',
            'a connection between this place and a known entity is established that defines what can and cannot be done here',
        ],
        negative: [
            'a piece of old knowledge surfaces that reveals the current situation is more serious than it appeared',
            'an object found in the environment is recognized as belonging to a context that is actively problematic',
            'a local story dismissed as exaggeration turns out to have been an understatement',
            'the correct procedure for the current situation is found, but too late to apply it in the normal way',
            'a site discovered in the area turns out to have a history that changes what it means to be here',
            'the correct name for what is happening here is found, and the name indicates the situation is worse than assumed',
            'an old agreement about this place is discovered and the current situation is a violation of it',
            'evidence surfaces that this situation has occurred here before and did not end well',
            'a resource thought to be available is found to have been already used, exhausted, or taken',
            'a pattern in recent events is recognized as a specific known type of manifestation — one with a known terrible endpoint',
            'something identified as a challenge or test turns out to not have a known form — it is something else',
            'information about the history of this place explains current events in a way that removes the most obvious options',
            'a protective working already in place is discovered to be the source of the problem rather than a guard against it',
            'the correct form of address for the current situation is found to have already been used incorrectly',
            'a connection between this place and a known entity establishes that certain things are permanently off the table',
        ],
    },
    EXTERNAL: {
        positive: [
            'someone with knowledge of the old ways arrives from outside — not summoned, but here at the right time',
            'a spirit\'s interference with the local situation accidentally benefits those present',
            'word arrives that conditions elsewhere have changed in a way that reduces pressure here',
            'a practitioner from another community offers assistance that bridges a gap in local knowledge',
            'an entity that has been neutral chooses to observe rather than intervene, which is the help that was needed',
            'news reaches the area that a harmful working directed at this place has been redirected elsewhere',
            'an outside authority with standing in the old system makes a decision that helps the current situation',
            'a wandering figure with relevant knowledge stops here because the place itself called them',
            'conditions in the wider area shift in a way that makes the local situation easier to manage',
            'an old network of practitioners that was thought defunct turns out to still function, and notices what is happening here',
            'something sent from this place a long time ago returns in a form that is useful now',
            'the timing of something external — a season, a celestial event, a migration — turns out to work in favor of the current situation',
            'word comes that a threat that was converging on this area from outside has stalled or turned',
            'outside circumstances create a window of opportunity in the local situation that would not otherwise exist',
            'an entity from outside this place passes through and, in passing, incidentally resolves something that had been stuck',
        ],
        negative: [
            'something arrives from outside the local area that the local protections were not designed for',
            'word comes from elsewhere that a practitioner who could have helped has been drawn away by something larger',
            'conditions in the wider area shift in a way that increases pressure on the local situation',
            'an entity following its own purposes passes through and disturbs something that had been stable',
            'an outside authority with standing in the old system makes a decision that complicates the current situation',
            'something that was managed elsewhere becomes this area\'s problem',
            'a seasonal or celestial condition arrives that strengthens whatever is currently causing difficulty',
            'news arrives that what was thought to be a local problem is part of a much wider pattern',
            'an old agreement made by someone with standing in this area is called in by an outside party',
            'a wandering figure passes through and the passing disturbs something that was in equilibrium',
            'an entity that had been neutral elsewhere arrives in this area with intentions already formed',
            'conditions in a neighboring area resolve by pushing the problem in this direction',
            'an outside event creates a symbolic resonance with the current situation that amplifies it',
            'word comes that what was sent away from here has returned, having gathered something additional',
            'a window that was being waited for closes because of external conditions that have nothing to do with local actions',
        ],
    },
},

// ════════════════════════════════════════════════════════════
// TURNING
// ════════════════════════════════════════════════════════════

TURNING: {
    INTERPERSONAL: {
        positive: [
            'a protective alliance is formalized in the old way — witnessed, with the correct words — and the formalization makes it real',
            'someone reveals they have been a practitioner in secret and steps forward to use that knowledge now',
            'a rift between two people or families is healed through a ritual act that both parties recognize as binding',
            'someone performs an act of protection for another that costs them something real, and the cost is witnessed',
            'two people on opposite sides of a spiritual conflict find that the conflict itself is resolved by what happens here',
            'an elder passes on knowledge that has been withheld until this moment, and the passing changes the relationship',
            'someone accepts a burden on behalf of another in the old formal sense, knowing what accepting means',
            'a broken oath is repaired in a form that both parties and any witnesses know to be genuine',
            'two practitioners from different traditions find their knowledge is complementary at the exact moment when it needs to be',
            'someone stands as witness to an old form of commitment and the standing makes the commitment real',
            'an old enmity is ended through a specific act that has weight in the old system',
            'someone who has always refused the old ways chooses to use them for the sake of someone else',
            'a community\'s protection is extended to someone who had been outside it in a moment that cannot be undone',
            'two people\'s combined knowledge proves to be exactly the thing that was needed',
            'someone who was not trusted with old knowledge proves they should have been, in a moment that changes their standing',
        ],
        negative: [
            'someone reveals that what appeared to be protection was in fact a trap set using the old forms',
            'an oath sworn using old forms is broken in a way that has consequences beyond the personal',
            'two people whose combined knowledge was the only solution find themselves on opposite sides',
            'someone uses knowledge of the old ways against a person who trusted them with it',
            'a protective alliance fails at the moment it was most needed and the failure reveals it was never real',
            'an elder\'s delayed revelation turns out to have been too late to change anything',
            'someone accepts a burden they were not equipped to carry because they did not know what accepting meant',
            'a ritual intended to heal a rift tears it wider because one party was not sincere',
            'two practitioners whose traditions should complement each other find their knowledge is in active conflict here',
            'a commitment witnessed in the old form turns out to have been witnessed incorrectly, and it doesn\'t hold',
            'someone\'s standing in the old system is used against them in a way they cannot counter',
            'a secret practitioner reveals themselves at the worst moment for the worst reasons',
            'the extension of a community\'s protection to someone creates a vulnerability in the protection itself',
            'someone who has always refused the old ways uses them now without understanding what using them means',
            'knowledge passed on in a moment of need turns out to be incomplete in the one specific way that matters',
        ],
    },
    EMOTIONAL: {
        positive: [
            'someone faces what has been following them and the confrontation, though costly, breaks the following',
            'a grief carried in the wrong form is finally released through the correct old rite and the release is real',
            'someone discovers they have more capacity for the old knowledge than they were told they had',
            'a fear that has controlled decisions for a long time is named in the correct way and loses its hold',
            'someone accepts a difficult truth about the nature of their situation in the old framing and the acceptance steadies them',
            'a burden carried alone is shared through an old form of witnessed telling and the sharing lightens it',
            'someone who has been performing skepticism discovers genuine belief and the discovery is freeing',
            'a cycle of damage passed down through a lineage is interrupted here, in this person, in this moment',
            'an emotion that had no form finds its old form and becomes something that can move',
            'someone experiences genuine awe in a liminal space and the awe resets their relationship to what they are facing',
            'a long-suppressed connection to the old practices resurfaces as a resource rather than a burden',
            'someone makes peace with an ancestor\'s choice they have always resented, and the peace extends to the present',
            'a moment of genuine surrender to something larger creates a steadiness that has not been available through effort',
            'someone discovers that what they thought was their weakness in the old framework is actually the specific thing needed',
            'a recognition of being exactly in the place and time they were meant to be in creates certainty rather than fear',
        ],
        negative: [
            'someone faces what has been following them and the confrontation reveals that they were not ready',
            'a grief released through an old rite turns out to have been holding something else in place',
            'someone discovers they have inherited a capacity they did not want and cannot return',
            'a fear named in the correct way becomes more real rather than less, because naming it was an invitation',
            'someone accepts a difficult truth about the nature of their situation in the old framing and the acceptance is devastating',
            'a burden shared through witnessed telling binds the witness to it in a way they did not agree to',
            'someone discovers genuine belief at the worst possible moment — when the thing believed in is dangerous',
            'a cycle of damage interrupted here does not end — it redirects',
            'an emotion given its old form becomes something that cannot be contained in the old forms',
            'someone experiences genuine terror in a liminal space and the terror changes their relationship to everything after',
            'a connection to the old practices resurfaces not as a resource but as a debt',
            'someone makes peace with an ancestor\'s choice and inherits the consequences of it',
            'a moment of surrender to something larger reveals that what they surrendered to does not have their interests at heart',
            'someone\'s specific capacity in the old framework makes them the target rather than the solution',
            'a recognition of being in the right place at the right time contains no comfort because of what the right place is',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'a place of genuine power is reached and it provides what was needed in the old sense of providing',
            'a boundary that has been weakening holds because of what happens here — an action, a word, a presence',
            'the environment reveals a path through something that appeared impassable, specific and usable',
            'a site that was hostile becomes neutral through a correct action performed here',
            'the landscape shifts in a way that separates those present from what was following them',
            'a threshold crossed correctly opens onto something useful that was not expected',
            'a place of the dead is crossed without disturbing it because the crossing was done right',
            'the forest or water makes a decision that benefits those present — and it is clearly a decision',
            'a natural feature of the landscape is revealed to be a protective structure that still functions',
            'a space that seemed indifferent proves to be on a specific side, and it is this one',
            'a liminal space at exactly the right moment becomes a space of passage rather than danger',
            'the environment provides an intervention that could not have been provided by any person present',
            'a threshold improperly maintained is restored through effort and the restoration is immediately felt',
            'a site of old violence is pacified by what happens here and the pacification changes the surrounding area',
            'the environment demonstrates that the correct choice was made by responding visibly to it',
        ],
        negative: [
            'a boundary fails in a specific location at a specific moment that cannot be worse',
            'a place that was known to be significant proves to be significant in the wrong direction',
            'the environment closes off a path that was the only option at a moment that cannot be recovered from',
            'a threshold crossed incorrectly cannot be uncrossed',
            'a place of the dead is disturbed in a way that will not be settled quickly',
            'the landscape itself becomes hostile in a way that is clearly intentional rather than indifferent',
            'a natural feature of the landscape that was a protection turns against those it was protecting',
            'a space that was neutral takes a side, and it is not this one',
            'a liminal space at exactly the wrong moment becomes a trap rather than a passage',
            'the environment makes a decision that cannot be argued with or bargained around',
            'a threshold maintained with genuine care fails anyway, which means the threat was not what was believed',
            'a site of power activates in a way that benefits no one currently present',
            'a space that provided protection revokes it in a way that is specific and targeted',
            'the environment demonstrates that the wrong choice was made in a way that leaves no room for interpretation',
            'a place that was trusted completely reveals it was never safe',
        ],
    },
    DISCOVERY: {
        positive: [
            'the true name of what has been happening here is found, and with the name comes the method',
            'a piece of knowledge thought lost turns out to have been preserved and is now accessible',
            'evidence surfaces that what is happening here has happened before and was survived through a specific means',
            'a connection between current events and an old obligation is found that, when honored, resolves the current situation',
            'the correct form of address and negotiation for what is present here is identified in time to use it',
            'a map of the significant sites in the area is reconstructed well enough to change the available options',
            'a working still active from a previous practitioner is found and can be redirected to current needs',
            'the specific weakness in what is currently threatening this place is discovered through old knowledge',
            'a way through the current problem is found in an old account that describes this exact situation',
            'an entity\'s conditions — what it can and cannot do, what it requires, what it responds to — are established',
            'a discovery proves that the situation is a known type with established responses that work',
            'the history of this place is recovered well enough to identify who or what has standing here',
            'a resource known in the old system to be effective in this type of situation is found to be present',
            'a piece of knowledge about what was done here long ago turns out to still have binding force',
            'the pattern of recent events is correctly identified as a specific type of manifestation with a specific resolution',
        ],
        negative: [
            'the true name of what has been happening here is found, and what the name means is worse than what was assumed',
            'a piece of knowledge thought to be available turns out to have been lost in the one specific way that matters',
            'evidence surfaces that this has happened here before, and that the previous resolution was not a resolution',
            'an old obligation connected to current events is found, and fulfilling it is incompatible with what needs to happen',
            'the form of address for what is present here is identified, but using it correctly requires something not available',
            'the significant sites in the area are mapped well enough to show that the current position is the worst possible one',
            'a working still active from a previous practitioner is found and cannot be redirected — only ended or endured',
            'the specific weakness in what is threatening this place is discovered, but exploiting it is not possible with what is available',
            'an old account of this exact situation is found, and the account describes what happens next',
            'an entity\'s conditions are established — and meeting them is incompatible with anything else that matters',
            'a discovery proves that the situation is a known type, and the known response has a cost that cannot be met',
            'the history of this place identifies who has standing here, and it is not anyone present',
            'a resource known to be effective is found to be present, but is bound in a way that prevents use',
            'the binding force of what was done here long ago extends to the current situation in a constraining direction',
            'the pattern of events is identified as a specific type of manifestation, and the known resolution requires something already lost',
        ],
    },
    EXTERNAL: {
        positive: [
            'a practitioner of genuine ability arrives from outside the area — too specifically to be coincidence',
            'something sent from this place a long time ago returns at exactly the right moment in exactly the right form',
            'an entity that has been neutral elsewhere arrives here having already chosen a side, and the side is this one',
            'conditions in the wider world shift in a way that reduces the strength of whatever is currently pressing here',
            'an old network of knowledge and protection that was thought dissolved proves to still have function',
            'an outside authority with standing in the old system makes a ruling that resolves something that couldn\'t be resolved from inside',
            'a piece of knowledge from a distant tradition arrives through an unlikely chain and is exactly applicable',
            'whatever has been building from outside this area reaches a turning point elsewhere and redirects',
            'a seasonal or celestial condition arrives that weakens what is currently threatening and strengthens what is protecting',
            'an entity following its own purposes acts in a way that incidentally resolves the local problem entirely',
            'help arrives from a source that was not known to be a source and the timing is not coincidental',
            'the conditions that have been making the current situation worse reverse due to something that had nothing to do with this place',
            'an outside event creates a window in what had seemed like a closed situation',
            'word arrives that what was threatening to converge on this place from outside has been turned aside',
            'something about the wider conditions changes in a way that restores access to a resource that had been unavailable',
        ],
        negative: [
            'something from outside the area arrives that the local knowledge and protections were specifically not designed for',
            'conditions in the wider world shift in a way that strengthens whatever is currently threatening this place',
            'an entity that has been neutral arrives having already formed intentions that are not compatible with what is needed here',
            'an old network of knowledge and protection that was being counted on proves to no longer function',
            'an outside authority with standing in the old system makes a ruling that removes the most viable options',
            'whatever has been building from outside this area reaches a turning point here rather than elsewhere',
            'a seasonal or celestial condition arrives that strengthens what is threatening and weakens what is protecting',
            'an entity following its own purposes acts in a way that incidentally makes the local situation significantly worse',
            'what was sent away from this place returns from outside having gathered additional force',
            'the conditions that have been making the situation worse are reinforced by something from outside that has nothing to do with this place',
            'an outside event closes a window that was the only option',
            'word arrives that what was being counted on from outside will not come, is gone, or has changed sides',
            'something about the wider conditions changes in a way that cuts off a resource that was almost available',
            'the wider pattern of which this is a part becomes clear, and the scale of it changes what counts as a solution',
            'an outside actor with standing arrives and their presence changes what can be done here in ways that cannot be negotiated',
        ],
    },
},

// ════════════════════════════════════════════════════════════
// MAJOR
// ════════════════════════════════════════════════════════════

MAJOR: {
    INTERPERSONAL: {
        positive: [
            'a lineage of knowledge passes to the person it was meant for, and the passing is recognized by both as inevitable',
            'two practitioners combine their knowledge in a way that creates something neither tradition contains alone',
            'someone makes a sacrifice of standing or safety to protect another using the old forms, and the sacrifice holds',
            'a community\'s collective protection, invoked correctly, proves stronger than what was testing it',
            'an ancient enmity between two lines is ended here, through these people, in a way that both lines will recognize',
            'someone reveals a truth about the nature of their relationship to the powers of this place that changes everything',
            'a bond of witnessed obligation is formed that carries weight in the old system and will not break',
            'a person long considered lost to the old ways returns to them in a moment of genuine need for someone else',
            'the combined standing of all present in the old system proves sufficient to change the terms',
            'someone\'s willingness to be the one who pays the cost changes what is possible for everyone else',
            'a healing performed here through genuine knowledge and genuine intent repairs something that has been broken for generations',
            'two people whose relationship has been defined by opposition to each other recognize a common responsibility',
            'someone is formally accepted into the old system of knowledge and protection in a way that changes their standing permanently',
            'a betrayal is repaired not through forgiveness but through an act of genuine restoration in the old sense',
            'the right people in the right place with the right knowledge acting at the right time — and all of those conditions are met',
        ],
        negative: [
            'knowledge is deliberately used against the person it was entrusted with, in the old formal sense',
            'a protective alliance built on the old forms collapses, and its collapse reveals that it was never what it appeared to be',
            'someone is abandoned by the people who were bound to stand with them by old forms of obligation',
            'a sacrifice made in the old sense is rejected, which means something specific about the nature of the situation',
            'a community\'s collective protection is breached from within by someone who was inside it',
            'two practitioners whose combined knowledge was the only solution become enemies through what happens here',
            'a bond of witnessed obligation is violated in the old sense and the violation has consequences beyond the personal',
            'someone\'s standing in the old system is permanently altered in the wrong direction by what they do here',
            'a secret kept for the protection of others is revealed and the revelation damages what it was protecting',
            'the person who pays the cost does not survive it, and what was supposed to be saved is lost anyway',
            'knowledge that should have been passed on was withheld, and the withholding is why the current situation is what it is',
            'two people whose combined standing would have been enough act separately and neither is sufficient',
            'someone who should have had standing in the old system is revealed not to, at the moment when it matters most',
            'a restoration attempted in the old forms tears open something that had been sealed',
            'the right knowledge, the right people, the right place — and the wrong time, which cannot be recovered',
        ],
    },
    EMOTIONAL: {
        positive: [
            'someone confronts what has been inherited from their lineage and interrupts it — and the interruption is real',
            'a complete grief, the full old form of it, is experienced and it ends, and what it leaves behind is clear',
            'someone discovers the full extent of their capacity in the old sense, and it is greater than they were told',
            'a fear that has organized someone\'s entire understanding of themselves is revealed to be a misidentification',
            'someone accepts what they are in the old framework — what they can do, what they owe, what they belong to — and the acceptance is freeing',
            'a burden carried for a lineage is set down correctly, in the right place, in the right form, and does not need to be picked up again',
            'someone experiences the genuine old form of joy — specific, rooted, located — and it becomes the thing they return to',
            'a moment of complete alignment between a person and the place and the time and the action creates certainty that lasts',
            'an old wound is healed in the specific old way that is the only way it could be healed',
            'someone who has been outside the protection of the old system is brought inside it and feels the difference immediately',
            'a connection to the dead that has been a source of dread becomes a source of genuine support',
            'someone makes peace with the specific old obligation they were born with and finds it lighter than the resistance was',
            'a recognition of what this moment is — in the old sense, what it actually is — creates the capacity to meet it',
            'someone lets themselves be held by the old framework fully, for the first time, and discovers it holds',
            'a complete surrender to what is larger, in the old sense of surrender, produces exactly the outcome that was needed',
        ],
        negative: [
            'what was inherited from the lineage cannot be interrupted — it can only be redirected, and the redirection has its own cost',
            'a grief fully entered in the old form reveals something inside it that was not the grief',
            'someone discovers the full extent of their capacity in the old sense and it comes with the full extent of what is owed',
            'a fear revealed to be a misidentification turns out to have been correct identification of something that was misnamed',
            'an acceptance of what they are in the old framework shows someone the full weight of what that means',
            'a burden set down in the correct form simply passes to the nearest available person',
            'someone experiences the genuine old form of grief — specific, total, and consuming — and it does not end cleanly',
            'a moment of alignment between person, place, time, and action creates certainty — and certainty about what is required is devastating',
            'an attempt to heal the old wound in the old way reveals that the wound was not the wound — it was the scar over something deeper',
            'someone brought inside the protection of the old system discovers what the protection costs from the inside',
            'a connection to the dead that has been a source of dread reveals itself as an obligation rather than a haunting',
            'the old obligation is accepted and it is not lighter — but at least now its weight is known',
            'a recognition of what this moment is in the old sense creates knowledge of what must be done that cannot be refused',
            'the old framework held — but what it held was not what was hoped',
            'a complete surrender to what is larger reveals that what is larger does not share the priorities of the person who surrendered',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'a place of genuine power acts in a way that makes clear it has made a decision and the decision is protective',
            'a boundary held at significant cost holds, and the holding changes the situation on both sides of it',
            'the environment undergoes a visible change that signals a genuine shift — something has resolved, or been accepted, or ended',
            'a site that was corrupted or damaged is restored through what happens here, and the restoration is permanent',
            'the landscape produces something at exactly the right moment in a way that could not have been arranged by any person',
            'a threshold that was uncertain becomes clear and the clarity reveals a path that was not visible before',
            'a place of significant old power recognizes the people present as having standing here, and acts accordingly',
            'the environment removes an obstacle that no action from within could have removed',
            'a site that had been closed for a long time opens — and what is inside is what was needed',
            'the natural world intervenes in a way that makes the old relationship between people and place visible',
            'a corrupted or hostile place is pacified by what happens here, permanently and visibly',
            'the environment demonstrates, specifically and unmistakably, that the correct choice was made',
            'a liminal space becomes a space of genuine passage that leads to exactly the right place',
            'what was sealed in this place is released correctly, and the release resolves what the sealing was maintaining',
            'the old places of power align with the people who are acting correctly in them',
        ],
        negative: [
            'a place of genuine power makes a decision that goes against those present, and the decision is not negotiable',
            'a boundary maintained at great cost fails, and what was being held does not stay held',
            'the environment undergoes a visible change that signals that something was decided, and the decision was not the right one',
            'a site damaged here cannot be restored — what was done here has changed this place permanently',
            'the landscape withholds what was needed at the moment when it could no longer be acquired elsewhere',
            'a threshold made clear reveals that the only path forward passes through something that should not be passed through',
            'a place of old power recognizes those present as not having standing here and acts on that recognition',
            'the environment produces the intervention, but the intervention does not distinguish between sides',
            'what opens in this place is not what was hoped — and what was hoped cannot be gotten another way',
            'the natural world makes the old relationship between people and place visible in a way that reveals the relationship is broken',
            'a hostile place is not pacified — it is awakened, and it is now aware of who was here',
            'the environment demonstrates, specifically and unmistakably, that the wrong thing was done',
            'a liminal space becomes a trap in the specific old sense — entered but not exited in the same form',
            'what was sealed is released incorrectly, and what the sealing was containing is now loose',
            'the old places of power act against the people in them because of what those people did or are',
        ],
    },
    DISCOVERY: {
        positive: [
            'the full truth of what this place is and what has been happening here is revealed, and with it, a clear path',
            'a piece of knowledge of exactly the right kind arrives in the only form in which it could arrive here',
            'evidence that the situation is a known type and the resolution is known provides both method and courage',
            'a connection between this situation and an old obligation, when fulfilled, ends the situation',
            'the specific terms under which what is present here can be negotiated are found and they are terms that can be met',
            'a complete map of significance in the area is recovered and it changes everything about what is possible',
            'a working from the past that should have ended the situation turns out to still be functioning — only dormant',
            'the lineage responsible for this place is identified and the current people have standing within it',
            'a piece of the old knowledge that addresses this exact type of situation is found to have been preserved',
            'the pattern is recognized as a known type with a known resolution that can be performed with what is available',
            'a discovery reveals that what was believed to be permanent damage is actually a reversible condition with a specific reversal',
            'the history of this place is recovered in enough detail to understand what is required of those who are here now',
            'an entity\'s true conditions and obligations are discovered in a form that makes them actionable',
            'the connection between this place and the wider old system is revealed and the connection can be used',
            'a discovery provides something that has been missing — a name, a form, a history, a method — and the provision is complete',
        ],
        negative: [
            'the full truth of what this place is and what has been happening here is revealed, and the truth forecloses most options',
            'the knowledge needed arrives in the only form in which it can arrive, and that form has a cost that cannot be avoided',
            'evidence that the situation is a known type arrives alongside the knowledge that the known resolution failed last time',
            'an obligation connected to the current situation is found — and fulfilling it requires something that cannot be given',
            'the terms under which what is present can be negotiated are found, and they cannot be met with what is available',
            'a complete map of significance reveals that the current position is inside the problem rather than facing it',
            'a working from the past is found to still be functioning — and it is the source of the current situation, not a solution to it',
            'the lineage responsible for this place is identified and no one present has standing within it',
            'the piece of old knowledge that addresses this situation is found to exist but is not available',
            'the pattern is recognized as a known type — one where the resolution requires something already irreversibly lost',
            'a discovery reveals that what appeared to be a reversible condition has already passed the point of reversal',
            'the history of this place recovered in full reveals that no one who has faced this situation here has succeeded',
            'an entity\'s true conditions and obligations are discovered in a form that makes clear that meeting them is not possible',
            'the connection to the wider old system is revealed, and the wider system\'s current condition makes it unavailable',
            'the missing piece arrives too late, or in incomplete form, or bound to a condition that cannot be met',
        ],
    },
    EXTERNAL: {
        positive: [
            'a practitioner of significant ability arrives from outside having been called by the situation itself',
            'the wider network of the old knowledge becomes aware of what is happening here and sends something useful',
            'conditions across the region shift in a way that reduces what is pressing on this specific place',
            'an authority in the old system from outside makes a ruling that changes the terms of what is possible here',
            'something from the old world that had been absent from this area returns — and its return changes the available options',
            'an entity of significant power arriving from outside takes a position in the local situation that resolves it',
            'the pattern of which this place is a part reaches its turning point elsewhere, which ends the pressure here',
            'something sent from this place in another time returns in a form that is precisely useful now',
            'outside circumstances create conditions that are exactly the conditions under which the current problem can be resolved',
            'a seasonal or celestial shift of significant magnitude creates a window that makes the impossible briefly possible',
            'what was being threatened from outside fails to arrive because something in the wider world stopped it',
            'an old debt owed to this place by something outside it is paid at exactly the right moment',
            'the wider conditions that have been sustaining the current difficulty simply cease, leaving the difficulty without support',
            'a figure of significance in the old system arrives and their presence alone changes what is permissible here',
            'something from outside that no one planned or predicted becomes the thing that resolves the situation',
        ],
        negative: [
            'something of significant power arrives from outside the area for reasons entirely unrelated to it, and the arrival changes everything',
            'the wider network of the old knowledge is aware of what is happening here and has decided not to intervene',
            'conditions across the region shift in a way that increases what is pressing on this specific place',
            'an authority in the old system from outside makes a ruling that removes the options that remained',
            'something from the old world that had been absent returns, and its return is the source of the current problem',
            'an entity of significant power arriving from outside takes a position in the local situation that makes it unresolvable from inside',
            'the pattern of which this place is a part reaches its turning point here — and here is the worst possible place for it',
            'what was sent away from this place in another time returns with everything it has gathered since',
            'outside circumstances create conditions that are exactly the conditions under which the current problem cannot be resolved',
            'a seasonal or celestial shift of significant magnitude closes the only available window',
            'what was threatening from outside arrives, and what was expected to stop it did not',
            'an old debt owed by this place to something outside it is called in at the worst possible moment',
            'the wider conditions that were sustaining the resistance to the current difficulty cease, and the difficulty expands to fill the space',
            'a figure of significance in the old system arrives and their presence alone changes what is permissible here — in the wrong direction',
            'something from outside that no one anticipated becomes the thing that makes the situation unresolvable',
        ],
    },
},

// ════════════════════════════════════════════════════════════
// WORLDSHAKING
// ════════════════════════════════════════════════════════════

WORLDSHAKING: {
    INTERPERSONAL: {
        positive: [
            'a lineage of knowledge passes completely and correctly to the one who was always meant to carry it, ending a long waiting',
            'two traditions of the old knowledge merge here, through these people, into something that neither contained and both needed',
            'a bond formed here in the full old sense — witnessed, sworn, binding in the old way — becomes the thing that changes what is possible',
            'a long-broken covenant between people and place is repaired through what the people present are willing to do',
            'someone gives up their standing in the old system for another person, and the giving is accepted and real',
            'the gathered knowledge of everyone present combines at exactly the right moment into exactly the right form',
            'an ancient division between two lines of knowledge is resolved here, in this moment, permanently',
            'someone is released from an inherited obligation that has constrained their line for generations, and the release is clean',
            'a community comes together in the old form of unified protection and the unity is genuine and sufficient',
            'what was broken between people and the old powers of this place is restored, and the restoration is witnessed',
            'the right people in the right roles with the right knowledge at the right time — and what they do together cannot be undone',
            'an enmity that has shaped the history of this place ends here, through the willingness of those present',
            'someone accepts responsibility for this place and its history in the full old sense, and the acceptance is accepted',
            'the old forms of relation between people are restored to a place that had lost them, and the restoration takes',
            'what was done here changes what is true about the relationship between people and the old world, for this place, permanently',
        ],
        negative: [
            'a betrayal in the full old sense — of knowledge, of trust, of bond — happens here, and its consequences extend beyond the personal',
            'the last line of a tradition ends here, through the actions of those present, and what was carried in it is lost',
            'a bond formed in the old sense is broken in the old sense, and the breaking changes what is possible in this place',
            'a covenant between people and place is violated completely, and the violation changes the terms permanently',
            'someone uses the full weight of their standing in the old system against the people who trusted them with knowledge of it',
            'the combined knowledge of those present is turned against itself through what happens here',
            'an ancient alliance in the old sense collapses, and what was kept back by the alliance is no longer kept back',
            'someone releases an inherited obligation by passing it to everyone present, without asking',
            'a community\'s unified protection is broken from within at the moment when it was the only thing maintaining the boundary',
            'the relationship between people and the old powers of this place is severed, and the severing is permanent',
            'what was done here cannot be undone and what it changes extends beyond this place and these people',
            'an enmity that was managed becomes an enmity that has won, here, through what the people present did or failed to do',
            'someone who held responsibility for this place abandons it in the full old sense, and the abandonment is accepted',
            'the old forms of relation between people are lost from this place through what happens here, and lost permanently',
            'the actions of those present change what is true about the relationship between people and the old world, for everyone, not just this place',
        ],
    },
    EMOTIONAL: {
        positive: [
            'someone becomes what they were always meant to be in the old framework, and the becoming is witnessed and complete',
            'a grief that has been carried by a lineage for generations ends here, in this person, through what they are willing to feel',
            'someone faces the deepest old fear — of the boundary, of what is beyond it, of what looks back — and is not destroyed',
            'a recognition of what this place is and what this moment is creates a certainty that nothing that comes after can touch',
            'someone discovers that they are the one who was always going to be here for this, and the discovery is peace rather than burden',
            'a complete acceptance of what they are in the old sense — mortal, located, obligated, beloved — opens something that had been closed',
            'a moment of genuine contact with the old world creates a knowledge that cannot be taken away',
            'someone releases everything they have been holding and what remains is what they actually are',
            'an old terror that has organized a person\'s understanding of the world is revealed as a misidentification — what they feared was something else entirely',
            'a person steps fully into the old framework for the first time and finds it holds them in a way nothing else has',
            'what has been damaged in a lineage for generations is healed here, in this person, through what they are willing to face',
            'someone experiences the genuine old form of belonging — to a place, to a tradition, to a line — and it is real',
            'a surrender to what is larger than the self, in the full old sense, is met by what is larger, and what meets them is not hostile',
            'someone finds that the capacity they were told they lacked was the one thing they actually had, and they have it fully',
            'what happens to this person here changes what is true about the people who come from this place and carry this knowledge after them',
        ],
        negative: [
            'someone becomes what the old framework always said they would become, and it is not what they chose or wanted',
            'a grief enters a lineage here, through this person, that will be carried by everyone who comes after them',
            'the deepest old fear — of the boundary, of what is beyond it, of what looks back — is faced and the facing changes the person permanently',
            'a certainty arrives about what this moment is and what it requires, and the certainty contains no mercy',
            'someone discovers that they are the one who was always going to be here for this, and what that means is not survivable in the old sense',
            'a complete acceptance of what they are in the old sense reveals the full weight of what that means and what it costs',
            'a moment of genuine contact with the old world creates a knowledge that cannot be set down',
            'someone releases everything they have been holding and what remains is less than what they believed they were',
            'what was feared is correctly identified and the correct identification shows that the fear was understating the situation',
            'someone steps fully into the old framework and finds it holds them — but holds them in the way a place holds the dead',
            'what was damaged in a lineage is not healed here — it is completed, and what was incomplete about the damage is now complete',
            'someone experiences the genuine old form of belonging and discovers that what they belong to requires something from them that cannot be refused',
            'a surrender to what is larger in the full old sense is met by what is larger, and what meets them is indifferent to them specifically',
            'the capacity they have fully is the one that makes them the cost rather than the resolution',
            'what happens to this person here changes what is true about the people who come from this place after them, in a direction they would not have chosen',
        ],
    },
    ENVIRONMENTAL: {
        positive: [
            'the old powers of this place act in a way that makes clear they have taken a position, and the position is with those present',
            'a boundary that defines this place — spiritual, natural, old — is restored to full function through what happens here',
            'the environment undergoes a transformation that signals a genuine change in the nature of this place — something resolved at the root',
            'a site of old power in this place awakens fully and acts in a way that changes what is possible here permanently',
            'the landscape itself participates in what is happening in a way that makes the old relationship between place and people visible',
            'what was sealed in this place and what the sealing cost is finally completed, and the completion restores what the sealing had damaged',
            'the old places of power in the area align and what they create together is what was needed',
            'a corruption in this place that has been running for a long time is reversed at its source',
            'the natural world demonstrates, unmistakably, that what was done here was right in the old sense',
            'a threshold that has been uncertain for a long time becomes certain in the right direction',
            'this place claims those who are acting correctly within it in the old sense, and the claiming is protection',
            'a space that has been hostile for as long as anyone can remember becomes what it was before it became hostile',
            'the environment provides something that cannot be provided by anything less than this place acting intentionally',
            'what has been wrong with this place since something happened here long ago is corrected by what happens here now',
            'the place itself becomes a participant rather than a setting, and its participation changes the outcome',
        ],
        negative: [
            'the old powers of this place act in a way that makes clear they have taken a position, and the position is not with those present',
            'a boundary that defines this place fails completely and permanently, and what was defined by it is no longer defined',
            'the environment undergoes a transformation that signals a genuine change in the nature of this place — something completed that should not have been',
            'a site of old power in this place awakens fully and what it does with that power is not aligned with any human interest',
            'the landscape participates in what is happening in a way that makes visible how broken the relationship between this place and people is',
            'what was sealed here is released and the sealing is not repeated — what was contained will not be contained again',
            'the old places of power in the area align, and what they create together is the thing that was being threatened',
            'a corruption in this place that has been managed reaches its completion and the managing is over',
            'the natural world demonstrates, unmistakably, that what was done here was wrong in the old sense and will not be corrected',
            'a threshold that was uncertain becomes certain in the wrong direction and the certainty is permanent',
            'this place rejects those who are present in the old sense — actively, specifically, and without appeal',
            'a space that was the last safe place becomes what the places that were already hostile had been',
            'the environment produces the intervention, but the intervention is in response to everything that has been done here, not just the current moment',
            'what has been wrong with this place since something long ago is not corrected — it is completed',
            'the place itself becomes a participant rather than a setting, and its participation ends the possibility of the outcome that was hoped for',
        ],
    },
    DISCOVERY: {
        positive: [
            'the true nature of this place — what it is in the oldest sense, what it has always been — is revealed, and the revelation is a gift',
            'the complete knowledge needed to address what has been happening here surfaces in a form that can actually be used',
            'a discovery reveals that everything that has happened here has been part of a pattern with a resolution, and the resolution is achievable',
            'the original covenant of this place is found, and honoring it resolves everything that has been a consequence of it being broken',
            'what has been sought in the old knowledge — the name, the form, the method — is found completely and in time',
            'a discovery reveals that this place and these people have been connected to each other since before any of them knew, and the connection is the solution',
            'the complete history of what happened here is recovered, and in it is the specific thing that was needed',
            'what an entity is, what it wants, what it owes, and what it will accept is discovered in full, and the full knowledge makes a resolution possible',
            'a piece of the old world that was believed to be gone turns out to be present here, in this place, accessible to those who know',
            'the pattern of everything that has happened becomes fully visible, and seeing it completely reveals the path through it',
            'a discovery proves that this situation has a resolution that was designed specifically for this place and these people',
            'the full weight of what this place is in the old framework is revealed, and it is enough — the place itself is sufficient',
            'what was lost from this place is found, and finding it restores what its loss had been preventing',
            'the knowledge of what must be done arrives in complete form with enough time to do it',
            'a discovery reveals that what was believed to be the problem was actually the solution — it has been the solution all along',
        ],
        negative: [
            'the true nature of this place is revealed, and what it actually is forecloses everything that was hoped',
            'the complete knowledge of what has been happening here surfaces, and what it shows cannot be changed with what is available',
            'a discovery reveals that everything that has happened here has been part of a pattern, and the pattern has already completed',
            'the original covenant of this place is found — and it was broken in a way that cannot be repaired by those present',
            'what has been sought is found, completely and accurately, and what it reveals is that there is no path through this',
            'a discovery reveals that the connection between this place and these people is the problem, not the solution',
            'the complete history of what happened here is recovered, and in it is the specific thing that made the current situation inevitable',
            'what an entity is, what it wants, what it owes, and what it will accept is discovered in full, and the full knowledge makes clear that no resolution is possible',
            'the piece of the old world that was believed to be gone turns out to be present, and it is what has been causing this',
            'the pattern of everything that has happened becomes fully visible, and what it shows is that the people present were always going to be here for this',
            'a discovery proves that this situation has a resolution, but the resolution requires something that was lost, done, or given away before this moment',
            'the full weight of what this place is in the old framework is revealed, and it is too much — what is here cannot be addressed by the people who are here',
            'what was lost from this place is found, and what it shows is that the loss was the only thing holding something back',
            'the knowledge of what must be done arrives in complete form with no time to do it',
            'a discovery reveals that what was believed to be the solution was actually the problem — it has been the problem all along',
        ],
    },
    EXTERNAL: {
        positive: [
            'the old world beyond this place acts in a way that makes clear it has decided what happens here matters, and acts accordingly',
            'something of enormous significance in the old framework arrives from outside — not summoned, not expected — and its arrival changes the terms completely',
            'the wider pattern of which this situation is a part reaches its resolution elsewhere, and the resolution here is a consequence',
            'an old debt of the old world to this place is paid in the only currency that matters',
            'what was always going to come from outside comes, and it comes in time, and it is sufficient',
            'the combined weight of what has been done correctly in this place over a long time becomes visible and effective all at once',
            'an entity of old and genuine significance takes a position in what is happening here and the position changes what is possible',
            'the seasonal and celestial conditions that were needed align in a way that cannot be manufactured and arrives anyway',
            'something from outside the known world of this tradition offers what the tradition alone could not provide',
            'the old network of knowledge and protection that underlies this place activates in full, and what it can do at full function is sufficient',
            'what was always coming from outside arrives before what was feared from outside, and what arrives first is enough',
            'an outside intervention strips away everything that has been accumulating here and leaves only what can be worked with',
            'the old world demonstrates that this place and these people are not alone in what they are facing',
            'what comes from outside is not what was expected and is exactly what was needed in the way that nothing expected could have been',
            'the full weight of the old world\'s attention arrives here, and it is on the side of those who have been acting correctly',
        ],
        negative: [
            'the old world beyond this place acts in a way that makes clear it has decided what happens here, and the decision is not the one hoped for',
            'something of enormous significance in the old framework arrives from outside and its arrival ends the possibility of the resolution that was being worked toward',
            'the wider pattern of which this situation is a part reaches its completion here, and this place is where the cost is paid',
            'an old debt of this place to the old world is called in, and the debt is everything',
            'what was always going to come from outside comes, and it is not what was hoped would come',
            'the combined weight of what has been done incorrectly in this place over a long time becomes visible and effective all at once',
            'an entity of old and genuine significance takes a position in what is happening here, and the position forecloses what was being attempted',
            'the seasonal and celestial conditions that were being waited for arrive in inverse form — they strengthen what was being resisted',
            'something from outside the known world of this tradition arrives that the tradition has no framework for and no response to',
            'the old network of knowledge and protection that underlies this place activates, and what is activating it is not those present',
            'what comes from outside arrives first, and what arrives first is enough to prevent what was coming to help',
            'an outside intervention removes everything that has been built here and leaves nothing to work with',
            'the old world demonstrates that this place and these people are entirely alone in what they are facing',
            'what comes from outside is exactly what was feared, and it is sufficient to end what was being protected',
            'the full weight of the old world\'s attention arrives here, and what it attends to is not those who believed they had been acting correctly',
        ],
    },
},

    }, // end slavic
}; // end SETTING_EVENTS


// ── Custom setting storage helpers ─────────────────────────

function getCustomSettings() {
    const s = extension_settings[EXT];
    if (!s.customSettings) s.customSettings = {};
    return s.customSettings;
}

function saveCustomSetting(cs) {
    getCustomSettings()[cs.id] = cs;
    saveSettingsDebounced();
}

function deleteCustomSetting(id) {
    delete getCustomSettings()[id];
    if (extension_settings[EXT].setting === `custom:${id}`) {
        extension_settings[EXT].setting = 'none';
        $('#we_setting').val('none');
    }
    saveSettingsDebounced();
}

function getCustomSettingById(id) {
    return getCustomSettings()[id] || null;
}

// ── Connection profile helpers ─────────────────────────────

function getConnectionProfiles() {
    const ctx = SillyTavern.getContext();
    return ctx.extensionSettings?.connectionManager?.profiles || [];
}

function getDefaultProfileName() {
    const ctx = SillyTavern.getContext();
    const cm = ctx.extensionSettings?.connectionManager;
    if (!cm) return '';
    return cm.profiles?.find(p => p.id === cm.selectedProfile)?.name || cm.profiles?.[0]?.name || '';
}

// ── API call ───────────────────────────────────────────────

async function callAPI(messages, maxTokens = 8000) {
    const s = extension_settings[EXT];
    const profiles = getConnectionProfiles();
    if (!profiles.length) { toastr.error('No connection profiles found.'); return null; }

    const profileName = s.connectionProfile || getDefaultProfileName();
    const profile = profiles.find(p => p.name === profileName) || profiles[0];
    if (!profile) { toastr.error('No connection profile available.'); return null; }

    const apiName = profile.api || 'openai';
    const cc_source = apiName === 'google' ? 'makersuite' : apiName;

    const generate_data = {
        messages, model: profile.model || '', temperature: 0.95,
        frequency_penalty: 0.1, presence_penalty: 0.2, max_tokens: maxTokens,
        stream: false, chat_completion_source: cc_source,
    };
    if (profile['secret-id']) generate_data['secret_id'] = profile['secret-id'];
    if (cc_source === 'custom' && profile['api-url']) generate_data['custom_url'] = profile['api-url'].trim().replace(/\/+$/, '');
    if (cc_source === 'vertexai' && profile['api-url']) generate_data['vertexai_region'] = profile['api-url'];
    if (cc_source === 'makersuite' || cc_source === 'claude') generate_data['use_sysprompt'] = true;

    try {
        const r = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST', headers: getRequestHeaders(), body: JSON.stringify(generate_data),
        });
        const text = await r.text();
        if (!r.ok) { console.error('[WE] API error:', r.status, text.slice(0, 300)); toastr.error(`API error ${r.status}`); return null; }
        const data = JSON.parse(text);
        return cc_source === 'claude'
            ? data?.content?.[0]?.text?.trim() || null
            : data?.choices?.[0]?.message?.content?.trim() || null;
    } catch (e) { console.error('[WE] Fetch error:', e.message); toastr.error('API fetch failed.'); return null; }
}

// ── Setting generation prompts ─────────────────────────────

const GENERATION_SYSTEM_PROMPT = `You are a creative writing assistant generating narrative event pools for a roleplay randomizer.
The user describes a setting. You generate event concepts across three tiers (SUBTLE, MINOR, MAJOR) and two polarities (positive, negative).

Each entry is a short narrative direction that the roleplay model will interpret and weave into the scene. Use the setting's vocabulary, factions, locations, institutions, and themes freely — that's what makes the events feel grounded. The only rule: do NOT use specific character names, and do NOT describe a specific outcome (who wins, who dies, what exactly happens). Give a direction, not a result.

Examples for a Star Wars Clone Wars setting:
- Bad (named character + specific outcome): "Anakin destroys the Separatist flagship and saves the fleet"
- Good (setting elements, open direction): "a Jedi's connection to the Force is tested by an encounter with the dark side"
- Good: "a clone unit's loyalty is pulled in two directions by conflicting orders"
- Good: "something within the Jedi Temple is discovered to be not what it appeared"

Return ONLY valid JSON. No markdown, no backticks, no explanation.`;

function buildGenerationPrompt(description) {
    return `Setting: "${description}"

Generate event concepts for this setting. Return a JSON object with exactly this structure:
{
  "SUBTLE": {
    "positive": [ /* 15 strings */ ],
    "negative": [ /* 15 strings */ ]
  },
  "MINOR": {
    "positive": [ /* 15 strings */ ],
    "negative": [ /* 15 strings */ ]
  },
  "MAJOR": {
    "positive": [ /* 15 strings */ ],
    "negative": [ /* 15 strings */ ]
  }
}

Tier definitions:
- SUBTLE: a barely noticeable shift — atmosphere, mood, a sensory detail, a small dynamic between people that could mean nothing or everything
- MINOR: a clear development — something changes, an opportunity opens or closes, a tension surfaces or eases
- MAJOR: a significant turning point — a power shift, a revelation, a crisis that breaks open or resolves

Polarity:
- positive: moves toward opportunity, relief, connection, clarity, or resolution
- negative: moves toward complication, danger, loss, exposure, or tension

Rules:
- lowercase, no period at the end
- use the setting's factions, locations, institutions, powers, and themes freely
- do NOT use specific character names
- do NOT describe a specific outcome — give a direction that the story can take in multiple ways
- all 15 entries per tier/polarity must be distinct

Return only the JSON object.`;
}

function parseGeneratedEvents(raw) {
    let cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); } catch {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) { try { parsed = JSON.parse(match[0]); } catch { return null; } } else { return null; }
    }
    for (const tier of ['SUBTLE', 'MINOR', 'MAJOR']) {
        if (!parsed[tier] || !Array.isArray(parsed[tier].positive) || !Array.isArray(parsed[tier].negative)) return null;
        if (!parsed[tier].positive.length || !parsed[tier].negative.length) return null;
    }
    return parsed;
}

async function generateCustomSetting(name, description) {
    const messages = [
        { role: 'system', content: GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: buildGenerationPrompt(description) },
    ];
    const raw = await callAPI(messages, 8000);
    if (!raw) return null;
    const events = parseGeneratedEvents(raw);
    if (!events) { console.error('[WE] Parse failed:', raw.slice(0, 500)); toastr.error('Could not parse generated events.'); return null; }
    return { id: `cs_${Date.now()}`, name, description, events };
}

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
    const baseList = isPositive ? catEvents.positive : catEvents.negative;

    const setting = extension_settings[EXT]?.setting || 'none';

    // Built-in setting — organized by tier and category
    if (setting !== 'none' && SETTING_EVENTS[setting]) {
        const settingTier = SETTING_EVENTS[setting][scaleId];
        if (settingTier && settingTier[categoryId]) {
            const extra = isPositive ? settingTier[categoryId].positive : settingTier[categoryId].negative;
            return [...baseList, ...(extra || [])];
        }
    }

    // Custom setting — no categories, adds globally to the tier
    if (setting.startsWith('custom:')) {
        const id = setting.slice(7);
        const cs = getCustomSettingById(id);
        const csKey = scaleId === 'TURNING' ? 'MINOR' : scaleId === 'WORLDSHAKING' ? 'MAJOR' : scaleId;
        if (cs?.events?.[csKey]) {
            const extra = isPositive ? cs.events[csKey].positive : cs.events[csKey].negative;
            return [...baseList, ...(extra || [])];
        }
    }

    return baseList;
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

function pickEventType(scaleId, categoryId, isPositive) {
    if (scaleId === 'NONE') return null;
    const pool = buildPool(scaleId, categoryId, isPositive);
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

function getActiveSettingLabel() {
    const setting = extension_settings[EXT]?.setting || 'none';
    if (setting === 'none') return null;
    if (setting.startsWith('custom:')) {
        const cs = getCustomSettingById(setting.slice(7));
        return cs ? cs.name : null;
    }
    return SETTING_LABELS[setting] || null;
}

function formatPrompt(result) {
    const label = extension_settings[EXT].label || DEFAULTS.label;
    const impact = result.isPositive ? 'POSITIVE' : 'NEGATIVE';

    if (result.scale.id === 'NONE') {
        return `[${label}: NO CHANGE]\nNo forced twist. Story continues naturally.`;
    }

    const settingLabel = getActiveSettingLabel();
    const isSoftTier = (result.scale.id === 'SUBTLE' || result.scale.id === 'MINOR');

    let lines = [
        `[${label}: ${result.scale.name} | ${impact} | ${result.category.name}]`,
        settingLabel ? `Setting: ${settingLabel}.` : '',
        result.eventType ? `Event: ${result.eventType}.` : '',
        result.forced ? '(FORCED — tension reached maximum)' : '',
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

    let tension = getTension();
    if (isNewMessage) { tension = Math.min(100, tension + s.step); saveTension(tension); }

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
    const result = { tension: getTension(), baseRoll, modifier, finalScore, isPositive, scale, category, forced, eventType };
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
                <div id="we_pop_setting" style="display:none;"></div>
                <div id="we_pop_tension">
                    <span id="we_pop_tension_label">Tension</span>
                    <div id="we_pop_bar_bg"><div id="we_pop_bar_fill"></div></div>
                    <span id="we_pop_tension_val"></span>
                </div>
            </div>
        </div>
    `);

    $('body').append($widget);
    $('#we_fab').on('click', function(e) {
        e.stopPropagation();
        const $popup = $('#we_popup');
        $popup.is(':visible') ? $popup.hide() : $popup.show();
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
        $('#we_pop_setting').hide();
        $('#we_pop_tension_val').text(`${tension.toFixed(1)}%`);
        $('#we_pop_bar_fill').css('width', `${Math.min(100, tension)}%`);
        $('#we_widget').show();
        return;
    }

    const isPos = result.isPositive;
    const settingLabel = getActiveSettingLabel();
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
    settingLabel ? $('#we_pop_setting').text(settingLabel).show() : $('#we_pop_setting').hide();
    $('#we_pop_tension_val').text(`${tension.toFixed(1)}%`);
    $('#we_pop_bar_fill').css('width', `${Math.min(100, tension)}%`);
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

function rebuildSettingDropdown() {
    const $sel = $('#we_setting');
    const current = extension_settings[EXT].setting || 'none';
    $sel.empty();
    $sel.append('<option value="none">— No setting —</option>');

    // Built-in settings
    const builtins = Object.entries(SETTING_LABELS).filter(([k, v]) => k !== 'none' && v);
    if (builtins.length) {
        $sel.append('<option disabled>── Built-in ──</option>');
        for (const [key, label] of builtins) {
            $sel.append(`<option value="${key}">${label}</option>`);
        }
    }

    // Custom settings
    const customs = Object.values(getCustomSettings());
    if (customs.length) {
        $sel.append('<option disabled>── Custom ──</option>');
        for (const cs of customs) {
            $sel.append(`<option value="custom:${cs.id}">${cs.name}</option>`);
        }
    }
    $sel.val(current);
    if ($sel.val() === null) { $sel.val('none'); extension_settings[EXT].setting = 'none'; }
}

function renderCustomSettingsList() {
    const $list = $('#we_custom_list');
    $list.empty();
    const customs = Object.values(getCustomSettings());
    if (!customs.length) { $list.append('<div class="we_cs_empty">No custom settings yet.</div>'); return; }

    for (const cs of customs) {
        const isActive = extension_settings[EXT].setting === `custom:${cs.id}`;
        $list.append(`
            <div class="we_cs_card" data-id="${cs.id}">
                <div class="we_cs_header">
                    <span class="we_cs_name">${cs.name}</span>
                    <span class="we_cs_desc_preview">${cs.description.slice(0, 60)}${cs.description.length > 60 ? '…' : ''}</span>
                </div>
                <div class="we_cs_actions">
                    <button class="menu_button we_cs_btn_use ${isActive ? 'we_cs_active' : ''}" data-id="${cs.id}">${isActive ? '✓ Active' : 'Use'}</button>
                    <button class="menu_button we_cs_btn_export" data-id="${cs.id}">⬇ Export</button>
                    <button class="menu_button we_cs_btn_delete we_btn_danger" data-id="${cs.id}">✕</button>
                </div>
            </div>
        `);
    }
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

                    <div style="margin-top:8px;">
                        <label><small>Setting</small></label>
                        <select id="we_setting" class="text_pole"></select>
                    </div>

                    <label style="margin-top:6px;"><small>Injection label</small></label>
                    <input type="text" id="we_label" class="text_pole" placeholder="WILD EVENTS" />
                    <label><small>Tension per message</small></label>
                    <input type="number" id="we_step" class="text_pole" min="0.1" max="10" step="0.1" />
                    <label><small>Injection depth (0 = end of context)</small></label>
                    <input type="number" id="we_depth" class="text_pole" min="0" max="100" step="1" />
                    <div style="margin-top:8px;display:flex;gap:6px;">
                        <input type="button" id="we_reset" class="menu_button" value="⟳ Reset Tension" style="flex:1;" />
                        <input type="button" id="we_reset_counts" class="menu_button" value="⟳ Reset Counts" style="flex:1;" />
                    </div>
                </div>
            </div>

            <!-- ── Accordion: Custom Settings ── -->
            <div class="we_accordion">
                <div class="we_accordion_header" data-target="we_sec_custom">
                    <span><i class="fa-solid fa-wand-magic-sparkles"></i> Custom Settings</span>
                    <i class="fa-solid fa-chevron-down we_acc_icon"></i>
                </div>
                <div class="we_accordion_body" id="we_sec_custom" style="display:none;">
                    <div id="we_custom_list" style="margin-bottom:8px;"></div>

                    <div style="display:flex;gap:6px;">
                        <label class="menu_button" style="flex:1;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px;">
                            <i class="fa-solid fa-file-import"></i> Import
                            <input type="file" id="we_cs_import_file" accept=".json" style="display:none;" />
                        </label>
                    </div>

                    <div style="margin-top:8px;">
                        <label><small>Connection profile</small></label>
                        <div style="display:flex;gap:6px;">
                            <select id="we_profile_select" class="text_pole" style="flex:1;"></select>
                            <button id="we_profile_refresh" class="menu_button" title="Refresh" style="flex-shrink:0;padding:4px 8px;">
                                <i class="fa-solid fa-rotate"></i>
                            </button>
                        </div>
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
    $('#we_label').val(s.label);
    $('#we_step').val(s.step);
    $('#we_depth').val(s.depth);
    rebuildSettingDropdown();
    updateUI(s._lastResult || null);
    renderCustomSettingsList();

    $(document).on('click', '.we_accordion_header', function () {
        const target = $(this).data('target');
        toggleAccordion(target, $(this).find('.we_acc_icon')[0]);
    });

    $('#we_toggle').on('change', function () { s.enabled = this.checked; saveSettingsDebounced(); if (!this.checked) setExtensionPrompt(EXT, '', 1, s.depth); });
    $('#we_show_badge').on('change', function () { s.showBadge = this.checked; saveSettingsDebounced(); if (!this.checked) $('#we_widget').hide(); });
    $('#we_label').on('input', function () { s.label = this.value; saveSettingsDebounced(); });
    $('#we_step').on('input', function () { s.step = parseFloat(this.value) || DEFAULTS.step; saveSettingsDebounced(); });
    $('#we_depth').on('input', function () { s.depth = parseInt(this.value) || DEFAULTS.depth; saveSettingsDebounced(); });
    $('#we_setting').on('change', function () { s.setting = this.value; saveSettingsDebounced(); });

    $('#we_reset').on('click', () => {
        saveTension(0); updateUI(null);
        $('#we_roll_val').text('—'); $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', ''); $('#we_type_row').hide(); $('#we_category_row').hide();
        toastr.info('Tension reset to 0%');
    });
    $('#we_reset_counts').on('click', () => { resetEventCounts(); toastr.info('Event frequency counters reset.'); });

    // ── Connection profiles ──
    function refreshProfileSelect() {
        const profiles = getConnectionProfiles();
        const $sel = $('#we_profile_select');
        $sel.empty();
        if (!profiles.length) { $sel.append('<option value="">— no profiles —</option>'); return; }
        const currentName = s.connectionProfile || getDefaultProfileName();
        for (const p of profiles) {
            $sel.append(`<option value="${p.name}" ${p.name === currentName ? 'selected' : ''}>${p.name} (${p.api || '?'} / ${p.model || '?'})</option>`);
        }
        if (!s.connectionProfile) s.connectionProfile = currentName;
    }
    refreshProfileSelect();
    $('#we_profile_select').on('change', function () { s.connectionProfile = this.value; saveSettingsDebounced(); });
    $('#we_profile_refresh').on('click', () => { refreshProfileSelect(); toastr.info('Refreshed.'); });

    // ── Custom settings list actions ──
    $('#we_custom_list').on('click', '.we_cs_btn_use', function () {
        s.setting = `custom:${$(this).data('id')}`; saveSettingsDebounced();
        rebuildSettingDropdown(); renderCustomSettingsList(); toastr.info('Setting activated.');
    });
    $('#we_custom_list').on('click', '.we_cs_btn_export', function () {
        const cs = getCustomSettingById($(this).data('id'));
        if (!cs) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(cs, null, 2)], { type: 'application/json' }));
        a.download = `we_setting_${cs.name.replace(/\s+/g, '_').toLowerCase()}.json`; a.click();
    });
    $('#we_custom_list').on('click', '.we_cs_btn_delete', function () {
        const cs = getCustomSettingById($(this).data('id'));
        if (!cs || !confirm(`Delete "${cs.name}"?`)) return;
        deleteCustomSetting(cs.id); rebuildSettingDropdown(); renderCustomSettingsList(); toastr.info(`"${cs.name}" deleted.`);
    });

    // ── Import ──
    $('#we_cs_import_file').on('change', function () {
        const file = this.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const cs = JSON.parse(e.target.result);
                if (!cs.id || !cs.name || !cs.events) throw new Error('Invalid format');
                cs.id = `cs_${Date.now()}`;
                saveCustomSetting(cs); rebuildSettingDropdown(); renderCustomSettingsList();
                toastr.success(`Imported "${cs.name}".`);
            } catch (err) { toastr.error('Import failed: ' + err.message); }
        };
        reader.readAsText(file); this.value = '';
    });

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
    });
});
