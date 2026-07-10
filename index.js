import { extension_settings, getContext } from '../../../extensions.js';
import {
    saveSettingsDebounced,
    eventSource,
    event_types,
    setExtensionPrompt,
} from '../../../../script.js';

// ── Constants ──────────────────────────────────────────────

const EXT = 'wild-events';

const DEFAULTS = {
    enabled: true,
    step: 0.5,
    label: 'WILD EVENTS',
    depth: 0,
    setting: 'none',
};

const EVENTS = [
    { min: 1,  max: 10, id: 'NONE',   name: 'NO CHANGE',       adj: null,     desc: 'No forced external change. Story flows naturally.' },
    { min: 11, max: 14, id: 'SUBTLE', name: 'SUBTLE CHANGE',    adj: null },
    { min: 15, max: 19, id: 'MINOR',  name: 'MINOR PLOT TWIST', adj: null },
    { min: 20, max: 24, id: 'MAJOR',  name: 'MAJOR PLOT TWIST', adj: 'reduce' },
    { min: 25, max: 99, id: 'GIANT',  name: 'GIANT PLOT TWIST', adj: 'reset' },
];

const SETTING_LABELS = {
    none:    null,
    slavic:  'Slavic Fantasy',
    omegaverse: 'Omegaverse',
    isekai:  'Isekai / Fantasy',
    kpop:    'K-Pop / Idol',
    xianxia: 'Chinese Xianxia',
};

// ── Base event pools ───────────────────────────────────────

const EVENT_TYPES = {
    SUBTLE: {
        positive: [
            'an unexpected piece of information reaches the right person at the right time',
            'a small gesture of goodwill from a stranger changes the mood of the scene',
            'something lost is found in an unlikely place',
            'a minor inconvenience resolves itself without intervention',
            'an overheard fragment of conversation proves unexpectedly useful',
            'someone arrives slightly earlier than expected',
            'a small environmental detail creates an opportunity',
            'an old favor is quietly repaid',
            'the atmosphere shifts in a way that eases tension',
            'a chance encounter with a familiar face',
            'something that seemed broken turns out to still work',
            'a small distraction provides cover for something else',
            'an offhand remark accidentally contains useful truth',
            'a minor delay leads to something being avoided',
            'the weather or environment becomes briefly favorable',
            'someone notices a detail others have missed',
            'a forgotten resource turns out to be available',
            'a small misunderstanding is cleared up before it grows',
            'an unexpected moment of privacy presents itself',
            'something trivial provides an unlikely insight',
        ],
        negative: [
            'a minor object breaks or malfunctions at an inconvenient moment',
            'an overheard fragment of conversation creates a wrong impression',
            'someone arrives slightly earlier than expected and sees something they should not',
            'a small environmental detail becomes an obstacle',
            'a brief distraction causes something important to be missed',
            'an offhand remark lands worse than intended',
            'a minor delay has a ripple effect on something else',
            'the weather or environment becomes briefly unpleasant',
            'something assumed to be available turns out not to be',
            'a small misunderstanding is not caught in time',
            'a moment of inattention costs more than expected',
            'something that seemed fine reveals a small flaw',
            'an unwanted face appears at an inconvenient moment',
            'a minor promise is unexpectedly called in',
            'a small noise or movement draws unwanted attention',
            'something private is accidentally made visible',
            'a routine thing takes unexpectedly long',
            'a trivial detail triggers an unexpected reaction in someone',
            'a message arrives at the worst possible moment',
            'a small assumption turns out to have been wrong all along',
        ],
    },
    MINOR: {
        positive: [
            'an unexpected ally appears with useful resources or knowledge',
            'a piece of information surfaces that reframes an ongoing problem',
            'someone in a position of influence shows unexpected favor',
            'a previously closed path becomes available',
            'an old connection resurfaces at a useful moment',
            'a misunderstanding between two parties is accidentally resolved',
            'an outside party intervenes in a way that benefits the current situation',
            'a hidden resource or advantage is revealed',
            'someone changes their stance without explanation',
            'an obstacle removes itself through unrelated circumstances',
            'a rival makes an error that creates an opening',
            'a small victory has larger implications than expected',
            'information shared in confidence proves more valuable than anticipated',
            'an event elsewhere draws attention away from the current situation',
            'a risk taken earlier pays off in an unexpected way',
            'someone offers help without being asked',
            'a dangerous situation defuses before it escalates',
            'an unexpected delay creates space to reconsider something important',
            'a third party\'s interference accidentally helps',
            'something believed to be permanent turns out to be negotiable',
        ],
        negative: [
            'a trusted source of information turns out to be unreliable',
            'an outside party interferes in a way that complicates the current situation',
            'a previously available path closes unexpectedly',
            'someone in a position of influence withdraws their support',
            'a hidden weakness or flaw is exposed at a bad moment',
            'an old conflict resurfaces through no one\'s direct fault',
            'a misunderstanding between two parties deepens rather than resolves',
            'a carefully maintained arrangement falls apart over something minor',
            'someone changes their stance without explanation and not in a good way',
            'a risk taken earlier creates unforeseen complications now',
            'an event elsewhere demands attention at the worst possible time',
            'something believed to be settled turns out not to be',
            'a third party\'s presence changes the dynamic in an unwelcome way',
            'an obligation surfaces that cannot be easily ignored',
            'a small deception unravels and takes something else down with it',
            'a dangerous situation escalates before it can be addressed',
            'an advantage is lost through circumstances outside anyone\'s control',
            'something shared in confidence reaches the wrong ears',
            'a past decision creates a complication in the present',
            'an unexpected cost arrives alongside an expected benefit',
        ],
    },
    MAJOR: {
        positive: [
            'a significant threat is neutralized by an external force',
            'a long-hidden truth surfaces and changes the situation dramatically',
            'an unexpected alliance is offered under surprising terms',
            'something previously out of reach becomes attainable',
            'a powerful figure intervenes on behalf of someone without being asked',
            'a crisis elsewhere redirects pressure away from the current situation',
            'a secret kept by someone else turns out to be protective rather than dangerous',
            'an enemy\'s plan fails due to factors entirely outside the protagonists\' control',
            'a major resource or opportunity arrives from an unexpected direction',
            'two separate problems solve each other when brought together',
            'a sacrifice made earlier is returned in a meaningful way',
            'a long-standing obstacle is removed by someone else\'s actions',
            'a catastrophic outcome is narrowly avoided through luck or timing',
            'something thought permanently lost is recovered',
            'a major shift in circumstances resets the balance of power',
            'an unexpected revelation makes a seemingly impossible situation workable',
            'someone with the ability to change everything chooses to do so',
            'a dangerous confrontation ends without the expected consequences',
            'a painful impasse is broken by an outside development',
            'a hidden strength or capability reveals itself under pressure',
        ],
        negative: [
            'a significant betrayal is revealed — not recent, but long-running',
            'a major external force enters the situation with its own agenda',
            'something that seemed secure collapses without warning',
            'a truth surfaces that changes the meaning of past events',
            'a crisis arrives from a direction no one was watching',
            'a powerful figure withdraws protection or support at a critical moment',
            'an alliance fractures under pressure that was not anticipated',
            'a plan that seemed to be working is revealed to have been compromised',
            'a previous action creates consequences that can no longer be delayed',
            'a hidden threat that has been building finally makes itself visible',
            'someone trusted makes a decision that cannot be undone',
            'a resource or advantage disappears at the worst possible moment',
            'two separate problems converge into something worse than either alone',
            'a secret is exposed in front of the worst possible audience',
            'a dangerous force is accidentally awakened or provoked',
            'the cost of a past choice arrives all at once',
            'an irreversible mistake is made before anyone realizes what is happening',
            'a situation spirals past the point where the usual solutions apply',
            'someone disappears or becomes unavailable at a critical moment',
            'a major assumption everyone shared turns out to have been completely wrong',
        ],
    },
    GIANT: {
        positive: [
            'a catastrophe is averted by the narrowest possible margin and the world shifts because of it',
            'an enemy becomes an ally through circumstances that would have seemed impossible',
            'something believed to be permanent and immovable is suddenly gone',
            'a force larger than the current conflict intervenes and resets the stakes',
            'a sacrifice made long ago pays off in a way no one expected or could have planned',
            'the truth behind a long-running mystery is finally revealed and it changes everything',
            'a major power structure collapses in a way that opens entirely new possibilities',
            'someone thought lost returns, changed, at exactly the right moment',
            'a decision that seemed small at the time is revealed to have shaped everything since',
            'an impossible alliance holds when it was expected to shatter',
            'a source of ongoing threat or suffering is permanently removed',
            'something dormant and forgotten wakes up in a way that benefits the current situation',
            'a long-running deception is exposed and the aftermath is better than the lie',
            'an enemy destroys themselves without any outside intervention',
            'a single revelation recontextualizes the entire arc of events up to now',
            'a crisis of historic proportions resolves in an unexpected direction',
            'what everyone believed to be an ending turns out to be a beginning',
            'a power or resource of enormous significance changes hands without violence',
            'an external catastrophe unites previously opposed forces',
            'something that was supposed to be impossible simply happens',
        ],
        negative: [
            'a catastrophe arrives that changes the shape of the world going forward',
            'an ally becomes an enemy through a revelation neither side can take back',
            'something believed to be safe and permanent is destroyed or lost',
            'a force larger than the current conflict arrives with its own agenda and dwarfs everything else',
            'a long-running deception is exposed and the fallout is worse than anyone feared',
            'a source of stability that everyone relied on disappears',
            'a secret kept by someone trusted turns out to have been the foundation of something dangerous',
            'a past event reasserts itself and cannot be managed or delayed any further',
            'an irreversible decision is made by someone with the power to make it',
            'a power structure collapses and the chaos it releases is worse than the structure itself',
            'something dormant and forgotten wakes up in a way that threatens everything',
            'a single action sets off a chain of consequences that cannot be stopped',
            'a sacrifice is demanded that has no acceptable alternative',
            'an outside force permanently closes off options that seemed available',
            'what everyone believed to be a beginning turns out to have been an ending',
            'a truth is revealed that cannot be unknown and changes every relationship in its wake',
            'an enemy proves to be far more significant than anyone understood',
            'a crisis of historic proportions resolves in the worst possible direction',
            'the cost of everything done up to this point arrives simultaneously',
            'something that was supposed to be impossible simply happens and it is terrible',
        ],
    },
};

// ── Setting-specific event pools ───────────────────────────

const SETTING_EVENTS = {
    slavic: {
        SUBTLE: {
            positive: [
                'the mist thickens in a way that feels deliberate rather than natural',
                'an animal behaves as if it perceives something others cannot',
                'something left as an offering disappears without explanation',
                'a faint sound — like a name being called — comes from the wrong direction',
                'the fire or flame changes color briefly without reason',
                'a plant or tree in the area seems subtly wrong — too still, too aware',
                'a familiar path looks different than it should',
                'someone\'s amulet or charm feels warm to the touch without cause',
                'a dream from the previous night suddenly feels relevant to what is happening now',
                'the wind shifts in a way that seems responsive to what was just said',
                'a stranger passing through knows something they should not know',
                'an old scar or wound aches without physical reason',
                'a reflection shows something that is not quite right',
                'a bird or animal delivers what feels like a deliberate warning',
                'the boundary between two places feels thinner than usual',
            ],
            negative: [
                'something protective — an amulet, a threshold charm — is found broken or missing',
                'a name is called from outside, in a familiar voice, but no one is there',
                'an animal refuses to enter a space it has never had trouble with before',
                'the fire goes out at a symbolically bad moment',
                'a reflection shows something slightly wrong',
                'an offering left earlier has been moved or scattered, not simply taken',
                'a path through familiar territory becomes briefly unrecognizable',
                'someone refers to a person who is not present as though they are watching',
                'a smell — earth, decay, river water — appears where it does not belong',
                'a child or animal stares at something in an empty space',
                'something said aloud feels immediately like a mistake, though no one reacts',
                'a boundary marker — fence post, stone, carved wood — is found displaced',
                'the usual sounds of night or forest are conspicuously absent',
                'a candle or lamp cannot be lit no matter the conditions',
                'a wound or illness appears or worsens for no visible cause',
            ],
        },
        MINOR: {
            positive: [
                'someone with knowledge of the old ways offers help without being asked',
                'the forest or water seems to clear a path rather than obstruct',
                'an old pact or agreement with a local spirit holds when it might not have',
                'a spirit\'s interference accidentally benefits those present',
                'something that should have been dangerous passes without incident, as if redirected',
                'the right herb, object, or material appears where it is needed',
                'someone remembers a piece of old knowledge at exactly the right moment',
                'an entity that could have been hostile chooses to observe instead',
                'a liminal space — crossroads, riverbank, forest edge — provides unexpected shelter',
                'a harmful working or curse directed at someone deflects without clear reason',
                'an old burial or sacred site nearby exerts a calming effect on something agitated',
                'a person long thought gone or dead sends some form of signal',
                'a creature of the forest intervenes between two parties',
                'the right words come to someone who has no training in speaking them',
                'something thought to be sealed or closed opens on its own',
            ],
            negative: [
                'a protective boundary — salt line, threshold charm, carved post — is found violated',
                'something with unclean history attached to a place begins to make itself felt',
                'a local spirit\'s displeasure manifests in a way that cannot be ignored',
                'someone performs a small ritual incorrectly and the effect is the opposite of intended',
                'a bargain or old agreement is called in at the worst possible time',
                'an entity begins to follow without revealing itself',
                'a site of unclean death nearby grows more active than usual',
                'the wrong name is spoken aloud at the wrong moment',
                'an offering is refused — returned, scattered, or burned — which is a serious sign',
                'something from Nav bleeds into Yav in a way that is visible to more than one person',
                'a person begins to behave in ways that suggest outside influence',
                'a working intended for one target appears to affect someone else instead',
                'what seemed like a safe path proves to pass through claimed territory',
                'a summoning or ritual begins before anyone intends it to',
                'an object of significance is found in a place it should not be, with no explanation',
            ],
        },
        MAJOR: {
            positive: [
                'a molfar or powerful practitioner intervenes from outside the immediate situation',
                'an ancestor makes their presence unambiguously known in a protective capacity',
                'a debt owed to someone by a spirit is called in at a critical moment',
                'a long-dormant sacred site activates in a way that serves those present',
                'a spirit of significant power chooses alliance over neutrality',
                'an unclean dead finds resolution and removes itself as a threat',
                'a curse breaks ahead of its natural end due to something someone did without knowing',
                'an entity that has been hostile reveals the condition under which it will not be',
                'the boundary closes at exactly the right moment',
                'a ritual performed imperfectly still holds because someone\'s sincerity compensates',
                'a dangerous working rebounds on its originator',
                'something protected by a powerful spirit turns out to be within reach',
                'a figure from the old stories turns out to be present and not entirely opposed',
                'nature itself shifts in a way that changes the balance of a dangerous situation',
                'a sacrifice made earlier — willing or not — pays off in a way no one expected',
            ],
            negative: [
                'something sealed for a long time breaks open and what is inside is not what was expected',
                'an entity of significant power decides the current situation is its business',
                'a molfar or practitioner with opposing interests makes themselves known',
                'a curse that was thought finished resurfaces with accumulated force',
                'something from Nav crosses fully into Yav and is not going back easily',
                'the dead begin to gather around a specific person or place in visible numbers',
                'a working of protection is turned against the people it was meant to protect',
                'an old agreement between a place and something inhuman expires and the terms change',
                'someone\'s true name is known by something that should not know it',
                'a ritual spirals past the point where it can be stopped by those who started it',
                'something thought to be a minor spirit reveals a much greater depth',
                'the boundary between two people and Nav becomes dangerously permeable',
                'a location where many died unclean deaths reaches a threshold of accumulated energy',
                'a protective figure — human or otherwise — is removed from the situation',
                'something that has been watching for a long time decides to act',
            ],
        },
    },

    omegaverse: {
        SUBTLE: {
            positive: [
                'a scent from someone nearby registers in a way that is distracting but not unwelcome',
                'the dynamic between two people shifts almost imperceptibly but both notice',
                'a social situation resolves in someone\'s favor due to instinct rather than strategy',
                'someone\'s instinctive read of a room proves more accurate than anyone\'s rational assessment',
                'an unexpected moment of physical proximity creates more ease than tension',
                'a suppressed instinct surfaces briefly and turns out to be correct',
                'the pack or group dynamic shifts in a way that benefits someone who needed it',
                'a mark or bond connection provides information at a useful moment',
                'someone\'s status in a room changes based on something no one can articulate',
                'an instinctive protective response comes from an unexpected source',
                'a brief contact — unintentional — resets a dynamic that had been stuck',
                'someone reads the room through instinct and makes the right call',
                'a social obligation attached to biology is fulfilled in a way that also benefits the situation',
                'the hierarchy of a group quietly reorganizes around a natural shift',
                'two people reach an understanding without words, through something closer to instinct',
            ],
            negative: [
                'a scent or biological signal gives away something that was meant to stay private',
                'instinct overrides reason at an inconvenient moment',
                'the hierarchy of a group shifts in a way that disadvantages someone without warning',
                'a bond connection pulls attention at the worst possible moment',
                'someone\'s status in a room changes in a way that no one acknowledges but everyone feels',
                'a biological response surfaces that contradicts what someone has been presenting',
                'the pack dynamic absorbs a new tension without resolving it',
                'a suppressed instinct surfaces as irritability or aggression instead of clarity',
                'someone\'s read on another person is thrown off by chemistry rather than character',
                'an unintended signal is sent and correctly interpreted by the wrong person',
                'a physical response to proximity makes clear thinking difficult',
                'a social obligation tied to biology is called in unexpectedly',
                'two people\'s dynamic destabilizes around something neither of them chose',
                'a status assumption proves to have been wrong, and the correction is inconvenient',
                'an involuntary response to someone reveals more than intended',
            ],
        },
        MINOR: {
            positive: [
                'a bond that has been strained stabilizes around a shared external pressure',
                'someone\'s instinctive loyalty to another proves to be the deciding factor',
                'a biological pull between two people creates an opening that strategy could not',
                'a pack or group closes ranks in a way that excludes a threat',
                'an instinctive read on someone\'s true intentions proves accurate',
                'a heat or rut cycle, inconvenient in timing, also removes someone from danger',
                'a bond connection provides genuine comfort or stabilization at a crisis point',
                'a status dynamic shifts in a way that gives someone unexpected authority',
                'two people\'s chemistry short-circuits a conflict that was about to escalate',
                'someone\'s protective instinct activates before they consciously register the threat',
                'a rejected bond resurfaces and turns out to have left something protective behind',
                'an outsider\'s instinctive deference to the group\'s structure resolves a standoff',
                'the correct instinctive response surfaces before reason has time to complicate it',
                'a dynamic between two people stabilizes around genuine trust rather than hierarchy',
                'a biological signal confirms what someone wanted to believe but couldn\'t verify',
            ],
            negative: [
                'a heat or rut cycle begins at the worst narrative moment',
                'a bond connection between two people begins to develop without either intending it',
                'the pack dynamic fractures around a status challenge no one initiated',
                'someone\'s instinctive response to another is at odds with what the situation requires',
                'a biological signal is misread and causes a significant misunderstanding',
                'two people\'s chemistry becomes a problem for everyone around them',
                'a status assumption made early on turns out to have been backwards',
                'a suppressant or blocker fails at a critical moment',
                'an instinctive territorial response complicates a situation that required diplomacy',
                'a bond that was thought severed turns out to have left a residual connection',
                'someone\'s protective instinct is triggered in the wrong direction',
                'a dynamic between two people destabilizes a larger group around them',
                'a biological vulnerability is exposed to someone who was not supposed to know about it',
                'a pack or group\'s internal hierarchy becomes relevant when everyone needed to be equal',
                'an instinctive submission or dominance response happens publicly and cannot be taken back',
            ],
        },
        MAJOR: {
            positive: [
                'a bond completes or deepens at a moment that changes the stakes entirely',
                'a pack or group achieves genuine cohesion around a shared crisis',
                'someone\'s biological status turns out to be the key to a situation that seemed closed',
                'an instinct that has been suppressed for the entire story finally surfaces and it is right',
                'a rejected or severed bond resolves in a way that is better than the original',
                'two people whose chemistry has been complicated reach a point of genuine clarity',
                'the pack dynamic reorganizes around the person who should have been leading all along',
                'a biological response that seemed like a vulnerability turns out to be an advantage',
                'a bond connection provides information or warning that changes the outcome',
                'a crisis forces two people past the point of managing their dynamic into something real',
                'someone\'s status shift changes the power balance in a situation at a standstill',
                'an instinctive alliance forms between two people who had no reason to trust each other',
                'a biological truth someone has been hiding turns out to be protective rather than dangerous',
                'the group\'s instinctive loyalty to one person holds when it was expected to fracture',
                'an act of genuine care within a bond dynamic shifts the entire situation',
            ],
            negative: [
                'a bond breaks or is severed under circumstances that have lasting consequences for both',
                'a status challenge within the group escalates past the point of easy resolution',
                'a heat or rut cycle at the worst possible moment forces a major decision',
                'two people\'s bond becomes a liability that others can and do exploit',
                'a pack fractures around a biological conflict that no one has the vocabulary to resolve',
                'someone\'s true dynamic is revealed publicly in a way that cannot be managed',
                'a biological vulnerability is deliberately used as leverage',
                'the instinctive hierarchy of the group selects the wrong leader at the worst moment',
                'a bond that was supposed to be stable destabilizes everything around it',
                'someone\'s suppression of their biology reaches a breaking point with consequences',
                'a status shift removes someone from the position where they were most needed',
                'two people\'s unresolved dynamic forces a confrontation the situation cannot absorb',
                'an outsider\'s read on the group\'s biological dynamics is accurate and they use it',
                'a protective instinct misfires and causes harm to the person it was meant to protect',
                'the cost of a bond — or its absence — becomes undeniable at the worst possible time',
            ],
        },
    },

    isekai: {
        SUBTLE: {
            positive: [
                'a local custom or piece of world knowledge turns out to be unexpectedly useful',
                'someone\'s origin — their otherness in this world — is read as something auspicious',
                'a piece of knowledge from another context applies perfectly to a situation here',
                'the environment provides something that would not exist anywhere else',
                'a small magic or supernatural element of the world resolves a mundane problem',
                'a local figure treats an outsider with more warmth than the situation seemed to call for',
                'a skill or habit from before carries over in a way that creates a real advantage',
                'an element of the world that seemed like flavor turns out to matter',
                'a class, ability, or status that seemed minor turns out to be exactly what is needed',
                'the world itself seems to nudge something toward a better outcome',
                'a language or communication barrier resolves in an unexpected way',
                'two things from very different parts of this world connect in a useful way',
                'a local legend or myth turns out to describe the current situation with uncomfortable accuracy',
                'an NPC or minor character turns out to have significant resources or knowledge',
                'something that seemed like a liability in this world reveals an advantage',
            ],
            negative: [
                'a custom or rule of this world that no one explained creates a costly mistake',
                'someone\'s outsider status registers as suspicious rather than interesting',
                'a piece of assumed knowledge turns out to work differently here than expected',
                'a local element of the world complicates something that would have been simple elsewhere',
                'a skill that worked before fails in this context',
                'the gap in knowledge about how this world works becomes visible at a bad moment',
                'a class, ability, or title carries an obligation no one mentioned',
                'a local figure\'s warmth turns out to have been conditional on something not yet known',
                'a language or cultural gap causes a misread that has consequences',
                'something that felt like a safe assumption about this world proves to be wrong',
                'an element of the world that seemed minor turns out to be load-bearing',
                'a local legend or myth seems to apply to the current situation in an ominous direction',
                'a favor given freely in this world carries a weight that is only now becoming clear',
                'the world\'s rules interact with someone\'s abilities in an unexpected and unhelpful way',
                'what seemed like flavor or background turns out to be an active element with its own agenda',
            ],
        },
        MINOR: {
            positive: [
                'a title, reputation, or status acquired in this world opens a door that would have been closed',
                'an ability or class trait reveals a dimension that had not been used yet',
                'an NPC with a connection to the protagonist\'s reputation steps in at a useful moment',
                'a piece of world lore that seemed academic turns out to describe a current threat accurately',
                'the protagonist\'s outsider perspective identifies a solution locals cannot see',
                'a local power structure shifts in a way that creates opportunity',
                'an enemy\'s reliance on the world\'s standard rules becomes a vulnerability',
                'a resource unique to this world becomes available at a key moment',
                'a side quest or detour pays off in the main situation',
                'a magical or supernatural element activates in response to genuine need',
                'a party member\'s class or background provides the specific thing the situation requires',
                'a local faction\'s internal politics creates an unexpected opening',
                'something the protagonist brought from another context becomes a significant advantage here',
                'a seemingly impossible local rule turns out to have a loophole',
                'a piece of information obtained earlier pays off in a way that reframes the current situation',
            ],
            negative: [
                'a rule of this world interacts badly with someone\'s abilities or choices',
                'a reputation or title acquired earlier now creates an unwanted obligation',
                'a local power structure shifts in a way that removes previous support',
                'an enemy demonstrates knowledge of the world\'s rules that they should not have',
                'a magical or supernatural element activates at the wrong moment for the wrong person',
                'a side quest or earlier decision creates a complication in the main situation',
                'a local faction\'s involvement changes the stakes in an unwelcome way',
                'a unique property of this world removes an option that seemed available',
                'a previously neutral figure in the world takes a side and it is not this one',
                'an ability or class trait has a cost or limitation that is only now relevant',
                'a piece of world lore that was filed away as flavor turns out to be a warning',
                'the protagonist\'s outsider status creates a blind spot at a critical moment',
                'a resource that this world runs on becomes scarce or contested at the wrong time',
                'a local custom demands something that complicates the current plan',
                'an NPC who had been helpful reveals they have been navigating their own agenda',
            ],
        },
        MAJOR: {
            positive: [
                'a power or ability that has been inaccessible finally becomes available',
                'the protagonist\'s status in this world reaches a point where it changes the rules of engagement',
                'a piece of system knowledge reveals something that changes everything',
                'an impossible alliance forms around a threat that is larger than existing conflicts',
                'a legendary or mythic element of this world turns out to be real and accessible',
                'the world itself intervenes in a way that cannot be explained by its own internal rules',
                'a choice made very early pays off in a way that reframes the entire journey',
                'a figure of great power in this world chooses a side and it is this one',
                'a world mechanic that has been an obstacle flips into an advantage',
                'a seemingly closed path opens through a piece of world knowledge no one thought to apply',
                'the protagonist\'s difference from this world turns out to be precisely what it needed',
                'an enemy\'s greatest strength turns out to depend on a rule of the world that can be broken',
                'a power structure in this world collapses in a way that opens entirely new possibilities',
                'a piece of lore from before the story turns out to be about what is happening now',
                'something the world said was impossible simply turns out not to be',
            ],
            negative: [
                'a world-level threat enters the situation that dwarfs the current conflict',
                'a power or ability is sealed, removed, or turned against its owner',
                'a rule of this world changes or is revealed to have always worked differently than assumed',
                'a figure of great power in this world takes an opposing position and commits to it',
                'a legendary threat that was theoretical becomes immediate',
                'a world mechanic that was an advantage is exploited by an enemy',
                'a power structure that provided stability collapses at the worst possible time',
                'a choice made much earlier is revealed to have had world-level consequences',
                'an ally\'s class or ability turns out to place them in direct conflict with what is needed',
                'the system itself — classes, levels, skills — interacts with the situation in a deeply unfavorable way',
                'something the world held dormant wakes up because of what the protagonist has been doing',
                'a faction or power that was neutral commits to opposition',
                'the world\'s version of an impossible situation turns out to actually be impossible',
                'a price attached to an earlier power or choice comes due all at once',
                'what seemed like a manageable complication of the world\'s rules turns out to be existential',
            ],
        },
    },

    kpop: {
        SUBTLE: {
            positive: [
                'a small gesture from a fan reaches the idol at exactly the right moment',
                'a candid moment is captured and received warmly rather than misused',
                'an offhand creative choice in rehearsal turns out to be exactly what the stage needed',
                'industry chemistry between two people clicks during a shared project',
                'a rumor circulating about the idol turns out to be less damaging than feared',
                'a moment of genuine connection with a fan does not go public but stays with the idol',
                'a small industry favor from months ago pays off in an unexpected way',
                'a staff member or junior artist turns out to be quietly protective',
                'a skill developed in private turns out to be exactly what an upcoming project needs',
                'a low-profile appearance becomes a significant moment for the right audience',
                'something the idol said in an interview is reframed by context and lands better than expected',
                'a scheduled obligation shifts in a way that creates a small but real breathing space',
                'something lost in the chaos of the schedule turns up at the right moment',
                'a creative instinct the idol suppressed turns out to have been correct',
                'an industry relationship that felt purely formal turns out to have genuine warmth',
            ],
            negative: [
                'a candid moment is captured and the framing is unfavorable',
                'an offhand comment in a casual context gets noted and circulated',
                'a rumor surfaces that is small but persistent and requires energy to not address',
                'a creative contribution is received politely but not integrated',
                'a schedule overlap creates a conflict that reveals a priority the idol did not want made visible',
                'a small industry favor is called in at an inconvenient time',
                'a staff member\'s loyalty turns out to have limits',
                'a skill or project the idol has invested in quietly is mentioned publicly at the wrong moment',
                'something the idol managed carefully slips just slightly in a visible way',
                'a low-profile moment gets more attention than intended',
                'something said in a private context is repeated, stripped of nuance',
                'a moment of exhaustion is noticed by more people than the idol realized',
                'an industry relationship that seemed solid turns out to have been contingent on something',
                'a creative instinct the idol acted on is questioned by the people whose opinion matters',
                'something minor surfaces that connects to something the idol would prefer stayed separate',
            ],
        },
        MINOR: {
            positive: [
                'a project the idol was not the center of generates significant attention for their contribution',
                'an industry figure the idol has wanted to connect with initiates contact',
                'a piece of creative work that was shelved turns out to be exactly what is needed now',
                'the idol\'s reputation for something specific opens a door in an unexpected field',
                'a controversy that was building deflates because of something unrelated',
                'a new alliance within the industry forms around a shared creative interest',
                'a fan community\'s organized support shifts public perception at a useful moment',
                'an opportunity surfaces that no one else in the idol\'s position was considered for',
                'a relationship the idol has invested in carefully turns out to be genuinely reciprocal',
                'a narrative the industry had been building around the idol shifts in a favorable direction',
                'a skill or quality the idol has been underestimated for becomes publicly recognized',
                'a past statement or action is rediscovered and received far better in the current context',
                'a personal project or creative risk lands in a way the idol did not expect',
                'an industry barrier that seemed fixed turns out to have a specific key',
                'a rival\'s misstep creates space that benefits the idol without any action on their part',
            ],
            negative: [
                'a controversy surfaces that is not the idol\'s fault but requires their response',
                'an industry figure the idol has needed to impress forms an opinion at the wrong moment',
                'a piece of creative work the idol is proud of is publicly compared unfavorably',
                'a relationship the idol has maintained carefully is reframed by outside speculation',
                'a fan community\'s reaction to something creates a pressure the idol did not anticipate',
                'an opportunity is publicly given to someone else and the comparison is drawn',
                'a narrative the industry has been building about the idol begins to work against them',
                'a past statement or action resurfaces in a context that changes its meaning',
                'a personal investment — creative, relational — becomes visible in a way that exposes it to judgment',
                'a rival\'s success creates a contrast that the idol cannot control the framing of',
                'a scheduled project is delayed or changed in a way that has public implications',
                'an alliance that seemed stable shifts and the shift is noticed',
                'an industry figure who had been neutral publicly aligns against',
                'something the idol has been managing privately becomes a matter of industry knowledge',
                'a creative direction the idol has committed to is questioned by people with the power to redirect it',
            ],
        },
        MAJOR: {
            positive: [
                'a major public moment redefines how the idol is perceived at an industry level',
                'a long-term investment in a specific creative direction is publicly validated',
                'a figure of significant industry power publicly endorses or aligns with the idol',
                'a controversy that had been building is resolved in a way that strengthens rather than damages',
                'a creative project that felt like a risk becomes a defining moment',
                'a relationship that has been complicated by industry context reaches genuine resolution',
                'a narrative that had been imposed on the idol from outside finally breaks',
                'an opportunity arrives that was not anticipated and changes the scale of what is possible',
                'a community — fans, peers, industry — coalesces around the idol in a visible and meaningful way',
                'a truth about the idol that has been obscured becomes publicly known and it helps',
                'a creative collaboration produces something that exceeds what either party could have done alone',
                'a long-running tension within the idol\'s professional life resolves unexpectedly',
                'something the idol made quietly turns out to matter enormously to the right people',
                'a power structure within the industry shifts in a way that benefits the idol\'s position',
                'a relationship that was professional becomes something that genuinely sustains the idol',
            ],
            negative: [
                'a large-scale public controversy attaches to the idol and cannot be managed with standard tools',
                'a creative investment that defined a period is publicly rejected or dismantled',
                'a figure of significant industry power publicly opposes or distances from the idol',
                'a relationship the idol depended on — professionally or personally — publicly fractures',
                'a truth about the idol\'s situation becomes public knowledge and the framing is not theirs',
                'a long-running narrative that was being carefully managed collapses all at once',
                'a rival\'s moment completely resets the context the idol had been building',
                'a creative direction the idol committed to is revealed to have been a strategic mistake',
                'a community that had been supportive fractures around the idol',
                'a power structure within the industry shifts in a way that removes protection or opportunity',
                'a past compromise or decision is exposed in a way that changes how the idol is read',
                'a project of significant importance fails publicly and the idol is associated with it',
                'something managed privately for a long time becomes the subject of industry-wide knowledge',
                'an alliance that had been central to the idol\'s position dissolves under pressure',
                'a defining moment goes wrong and the narrative that forms around it is not the idol\'s to control',
            ],
        },
    },

    xianxia: {
        SUBTLE: {
            positive: [
                'a fragment of spiritual energy from an unexpected source proves unexpectedly nourishing',
                'someone\'s reputation in the cultivation world reaches a person who matters, ahead of them',
                'a minor ghost or spirit shows deference in a way that others notice',
                'a technique practiced in obscurity turns out to apply to the current situation precisely',
                'the spiritual energy of a place is more abundant than expected',
                'an old debt in the cultivation world is remembered in the protagonist\'s favor',
                'a piece of sect lore or heavenly rule turns out to provide cover for something needed',
                'someone\'s true character is perceived through their spiritual energy rather than their words',
                'a cultivation breakthrough occurs at an inconvenient moment but changes the balance of things',
                'an insignificant ghost or spirit provides information no living person would share',
                'something discarded or abandoned in the cultivation world turns out to still be functional',
                'a small act of genuine compassion is witnessed by someone who matters',
                'the protagonist\'s approach — unorthodox, humble, unexpected — creates an opening',
                'a past master\'s lingering intent surfaces in an artifact or location at a useful time',
                'two unrelated threads of spiritual cause and effect converge in someone\'s favor',
            ],
            negative: [
                'spiritual energy in the area feels wrong — thick, old, contaminated by something unresolved',
                'a ghost or spirit in the area has noticed someone and has not been noticed in return yet',
                'a sect rule or heavenly decree that was ignorable becomes relevant',
                'a reputation precedes someone in a way they did not intend and did not want',
                'a resentful energy begins to accumulate around a specific person or place',
                'a spiritual object behaves erratically without clear cause',
                'a cultivation imbalance that had been managed becomes slightly less manageable',
                'a small wrongdoing from the past — someone else\'s — leaves a mark on the current situation',
                'a ghost in the area is more coherent and more aware than it appeared',
                'a technique or ability behaves unexpectedly, just slightly',
                'an old sect rivalry surfaces in a way that no one here caused but everyone feels',
                'a place that seemed spiritually neutral turns out to have a history',
                'spiritual energy is drawn toward someone without their control or intent',
                'an ancestor or lineage matter surfaces that has implications someone would have preferred to avoid',
                'something that was sealed or contained is less sealed than it was',
            ],
        },
        MINOR: {
            positive: [
                'a ghost with unfinished business chooses to resolve it in a way that benefits those present',
                'a sect or faction\'s political situation shifts to create an unexpected ally',
                'a forbidden or unorthodox technique turns out to be precisely what the situation requires',
                'a merit or good deed accrued without thought pays off in the cultivation world\'s accounting',
                'a divine official, cultivator, or spirit offers information they had no obligation to share',
                'a place of heavenly significance provides shelter or advantage to the deserving',
                'a spiritual weapon or artifact recognizes the right person',
                'a long-standing ghost\'s coherence is used as an advantage rather than a problem',
                'something believed to be corrupted or resentful turns out to be merely wounded',
                'a reputation built on misunderstanding is corrected by events rather than argument',
                'a sect or clan matter that has been a liability transforms into a point of leverage',
                'a spiritual technique\'s true nature reveals itself at the moment it is most needed',
                'an enemy\'s reliance on conventional cultivation wisdom becomes a vulnerability',
                'two cultivators with no reason to cooperate find a third path through a shared problem',
                'a divine intervention arrives in the form that was least expected and most needed',
            ],
            negative: [
                'resentful energy accumulates to the point where it begins to affect those nearby',
                'a sect or clan political matter creates an obligation that cannot be cleanly refused',
                'a ghost or spirit\'s coherence increases in a way that makes it significantly more dangerous',
                'a cultivation technique\'s side effect becomes relevant at the worst moment',
                'a heavenly decree or divine rule creates an obstruction that has no obvious workaround',
                'a forbidden technique leaves a mark that others can detect',
                'a spiritual debt from the past is called in by someone who has the standing to do so',
                'a divine official becomes aware of the situation and their interest is not protective',
                'an artifact with a complicated history makes its complications felt',
                'a faction\'s involvement shifts the moral weight of the situation in an unhelpful direction',
                'resentful energy that was being managed breaks containment',
                'a reputation — earned or inherited — becomes actively counterproductive',
                'a sect or lineage matter resurfaces and its resolution requires something that is not available',
                'two sources of spiritual conflict in the area begin to reinforce each other',
                'a ghost achieves enough coherence to pursue a specific agenda',
            ],
        },
        MAJOR: {
            positive: [
                'a being of significant spiritual power intervenes on behalf of those who did not ask',
                'a long-running spiritual injustice resolves and the release of that energy changes everything',
                'a forbidden path or unorthodox cultivation method is validated by its outcome',
                'a figure from the heavenly realm takes an interest that turns out to be genuinely protective',
                'a ghost\'s story reaches its conclusion and what they leave behind is a gift',
                'a spiritual truth that was obscured becomes undeniable and changes the balance of power',
                'a sect, clan, or faction\'s centuries-long mistake begins to be corrected',
                'a weapon, technique, or artifact of profound significance aligns with someone\'s intent',
                'a debt between realms — heavenly, human, ghostly — is settled in a way no one predicted',
                'a cultivation method that was abandoned for being too difficult turns out to have been the right path',
                'two lineages or factions in conflict find resolution through what happens here',
                'a divine law that seemed immovable reveals a condition under which it does not apply',
                'someone\'s spiritual nature — long hidden, long suppressed — is finally recognized by the world',
                'a long-running spiritual misunderstanding that has caused harm finally corrects itself',
                'a moment of genuine sacrifice changes the spiritual accounting of a situation entirely',
            ],
            negative: [
                'a cultivation deviation begins that cannot be corrected by conventional means',
                'a figure of immense spiritual power decides the current situation requires their direct involvement',
                'a spiritual seal that has been holding something back fails',
                'a ghost or entity achieves a level of power or coherence that changes what kind of problem it is',
                'a heavenly decree is handed down that closes off the most obvious paths forward',
                'a sect or faction\'s collective resentment crystallizes into something that acts',
                'a forbidden technique\'s full cost arrives',
                'a lineage curse or ancestral burden activates at the worst possible moment',
                'a divine official reveals that they have known about the situation far longer than anyone realized',
                'two sources of resentful energy merge into something that is more than the sum of its parts',
                'a spiritual truth is revealed that changes the meaning of everything that has come before',
                'a path that seemed like the right one turns out to have been feeding something it should not have',
                'a figure trusted in the cultivation world reveals that their interest has always been in something else',
                'a long-contained spiritual catastrophe begins to wake up',
                'the price of everything done in this arc — every spiritual shortcut, every debt incurred — arrives at once',
            ],
        },
    },
};

// ── Pool builder ───────────────────────────────────────────

function buildPool(scaleId, isPositive) {
    const base = EVENT_TYPES[scaleId];
    if (!base) return [];
    const baseList = isPositive ? base.positive : base.negative;

    const setting = extension_settings[EXT]?.setting || 'none';
    if (setting === 'none' || !SETTING_EVENTS[setting]) return baseList;

    const settingPool = SETTING_EVENTS[setting][scaleId];
    if (!settingPool) return baseList;
    const settingList = isPositive ? settingPool.positive : settingPool.negative;

    return [...baseList, ...settingList];
}

function pickEventType(scaleId, isPositive) {
    if (scaleId === 'NONE') return null;
    const pool = buildPool(scaleId, isPositive);
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
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

function findEvent(score) {
    return EVENTS.find(e => score >= e.min && score <= e.max) || EVENTS[0];
}

function formatPrompt(result) {
    const label = extension_settings[EXT].label || DEFAULTS.label;
    const impact = result.isPositive ? 'POSITIVE' : 'NEGATIVE';

    if (result.event.id === 'NONE') {
        return `[${label}: NO CHANGE]\nNo forced twist. Story continues naturally.`;
    }

    const settingKey = extension_settings[EXT]?.setting || 'none';
    const settingLabel = SETTING_LABELS[settingKey];
    const eventType = result.eventType;

    let lines = [
        `[${label}: ${result.event.name} | ${impact}]`,
        settingLabel ? `Setting: ${settingLabel}.` : '',
        eventType ? `Type: ${eventType}.` : '',
        result.forced ? '(FORCED — tension reached maximum)' : '',
        'Implement naturally in the scene. Do not skip or change the event type.',
    ].filter(Boolean);

    return lines.join('\n');
}

function runEvent(isNewMessage) {
    const s = extension_settings[EXT];

    if (!s.enabled) {
        setExtensionPrompt(EXT, '', 1, s.depth);
        return;
    }

    let tension = getTension();

    if (isNewMessage) {
        tension = Math.min(100, tension + s.step);
        saveTension(tension);
    }

    let baseRoll, modifier, finalScore, isPositive, event;
    let forced = false;

    baseRoll = Math.floor(Math.random() * 20) + 1;
    modifier = Math.floor(tension / 8);
    isPositive = baseRoll % 2 === 0;

    if (tension >= 100) {
        forced = true;
        finalScore = 25;
    } else {
        finalScore = baseRoll + modifier;
    }

    event = findEvent(finalScore);

    if (isNewMessage) {
        if (event.adj === 'reset') saveTension(0);
        else if (event.adj === 'reduce') saveTension(tension * 0.75);
    }

    const eventType = pickEventType(event.id, isPositive);
    const result = { tension: getTension(), baseRoll, modifier, finalScore, isPositive, event, forced, eventType };
    const prompt = formatPrompt(result);
    setExtensionPrompt(EXT, prompt, 1, s.depth, false, 0);

    extension_settings[EXT]._lastResult = result;
    saveSettingsDebounced();

    updateUI(result);
}

// ── Generation hooks ───────────────────────────────────────

function onMessageSent() { runEvent(true); }
function onMessageSwiped() { runEvent(false); }

// ── UI ─────────────────────────────────────────────────────

function updateUI(result) {
    const t = result?.tension ?? getTension();
    $('#we_tension_val').text(`${t.toFixed(1)}%`);
    $('#we_tension_bar').css('width', `${Math.min(100, t)}%`);

    if (!result) return;

    $('#we_roll_val').text(result.forced ? '⚡ FORCED' : `${result.baseRoll} + ${result.modifier} = ${result.finalScore}`);

    const evEl = $('#we_event_val');
    evEl.text(result.event.name);
    evEl.css('color', result.event.id === 'NONE'
        ? 'var(--SmartThemeBodyColor)'
        : result.isPositive ? '#66bb6a' : '#ef5350');

    if (result.eventType && result.event.id !== 'NONE') {
        $('#we_type_val').text(result.eventType);
        $('#we_type_row').show();
    } else {
        $('#we_type_row').hide();
    }

    const impEl = $('#we_impact_val');
    if (result.event.id === 'NONE') {
        impEl.text('—').css('color', 'var(--SmartThemeBodyColor)');
    } else {
        impEl.text(result.isPositive ? '▲ POSITIVE' : '▼ NEGATIVE');
        impEl.css('color', result.isPositive ? '#66bb6a' : '#ef5350');
    }
}

function buildUI() {
    const html = `
    <div id="we_panel" class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>Wild Events</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label">
                <input type="checkbox" id="we_toggle" />
                <span>Enable</span>
            </label>
            <div class="we_section">
                <div class="we_row"><span>Tension</span><b id="we_tension_val">0%</b></div>
                <div class="we_bar_bg"><div class="we_bar_fill" id="we_tension_bar"></div></div>
            </div>
            <div class="we_section we_results">
                <div class="we_row"><span>Roll</span><span id="we_roll_val">—</span></div>
                <div class="we_row"><span>Event</span><b id="we_event_val">—</b></div>
                <div class="we_type_row" id="we_type_row" style="display:none;"><span id="we_type_val"></span></div>
                <div class="we_row"><span>Impact</span><span id="we_impact_val">—</span></div>
            </div>
            <hr>
            <label><small>Setting</small></label>
            <select id="we_setting" class="text_pole">
                <option value="none">— No setting —</option>
                <option value="slavic">Slavic Fantasy</option>
                <option value="omegaverse">Omegaverse</option>
                <option value="isekai">Isekai / Fantasy</option>
                <option value="kpop">K-Pop / Idol</option>
                <option value="xianxia">Chinese Xianxia</option>
            </select>
            <label><small>Injection label</small></label>
            <input type="text" id="we_label" class="text_pole" placeholder="WILD EVENTS" />
            <label><small>Tension per message</small></label>
            <input type="number" id="we_step" class="text_pole" min="0.1" max="10" step="0.1" />
            <label><small>Injection depth (0 = end of context)</small></label>
            <input type="number" id="we_depth" class="text_pole" min="0" max="100" step="1" />
            <div style="margin-top: 8px;">
                <input type="button" id="we_reset" class="menu_button" value="⟳ Reset Tension" />
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
    $('#we_label').val(s.label);
    $('#we_step').val(s.step);
    $('#we_depth').val(s.depth);
    $('#we_setting').val(s.setting || 'none');
    updateUI(s._lastResult || null);

    $('#we_toggle').on('change', function () {
        s.enabled = this.checked;
        saveSettingsDebounced();
        if (!this.checked) setExtensionPrompt(EXT, '', 1, s.depth);
    });
    $('#we_label').on('input', function () { s.label = this.value; saveSettingsDebounced(); });
    $('#we_step').on('input', function () { s.step = parseFloat(this.value) || DEFAULTS.step; saveSettingsDebounced(); });
    $('#we_depth').on('input', function () { s.depth = parseInt(this.value) || DEFAULTS.depth; saveSettingsDebounced(); });
    $('#we_setting').on('change', function () { s.setting = this.value; saveSettingsDebounced(); });
    $('#we_reset').on('click', () => {
        saveTension(0);
        updateUI(null);
        $('#we_roll_val').text('—');
        $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', '');
        $('#we_type_row').hide();
        toastr.info('Tension reset to 0%');
    });

    eventSource.on(event_types.MESSAGE_SENT, onMessageSent);
    eventSource.on(event_types.MESSAGE_SWIPED, onMessageSwiped);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        extension_settings[EXT]._lastResult = null;
        updateUI(null);
        $('#we_roll_val').text('—');
        $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', '');
        $('#we_type_row').hide();
    });
});
