/**
 * Wild Events — SillyTavern Extension
 * Replaces the in-prompt random events system with pure JS mechanics.
 * Zero AI tokens spent on dice rolls or tension math.
 * Now includes specific event type injection per scale and polarity.
 */

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
};

const EVENTS = [
    { min: 1,  max: 10, id: 'NONE',   name: 'NO CHANGE',       adj: null,     desc: 'No forced external change. Story flows naturally.' },
    { min: 11, max: 14, id: 'SUBTLE', name: 'SUBTLE CHANGE',    adj: null },
    { min: 15, max: 19, id: 'MINOR',  name: 'MINOR PLOT TWIST', adj: null },
    { min: 20, max: 24, id: 'MAJOR',  name: 'MAJOR PLOT TWIST', adj: 'reduce' },
    { min: 25, max: 99, id: 'GIANT',  name: 'GIANT PLOT TWIST', adj: 'reset' },
];

// ── Event type pools ───────────────────────────────────────

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

function pickEventType(scaleId, isPositive) {
    const pool = EVENT_TYPES[scaleId];
    if (!pool) return null;
    const list = isPositive ? pool.positive : pool.negative;
    return list[Math.floor(Math.random() * list.length)];
}

// ── State ──────────────────────────────────────────────────

let lastIncrementedMsgId = null;

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

    const eventType = result.eventType || pickEventType(result.event.id, result.isPositive);

    let lines = [
        `[${label}: ${result.event.name} | ${impact}]`,
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

    updateUI(result);
}

// ── Generation hooks ───────────────────────────────────────

function onGenerationStarted() {
    const ctx = getContext();
    const chat = ctx.chat ?? [];
    const currentMsgId = chat.length;

    const isNew = currentMsgId !== lastIncrementedMsgId;
    if (isNew) lastIncrementedMsgId = currentMsgId;

    runEvent(isNew);
}

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
    updateUI(null);

    $('#we_toggle').on('change', function () {
        s.enabled = this.checked;
        saveSettingsDebounced();
        if (!this.checked) setExtensionPrompt(EXT, '', 1, s.depth);
    });
    $('#we_label').on('input', function () { s.label = this.value; saveSettingsDebounced(); });
    $('#we_step').on('input', function () { s.step = parseFloat(this.value) || DEFAULTS.step; saveSettingsDebounced(); });
    $('#we_depth').on('input', function () { s.depth = parseInt(this.value) || DEFAULTS.depth; saveSettingsDebounced(); });
    $('#we_reset').on('click', () => {
        saveTension(0);
        lastIncrementedMsgId = null;
        updateUI(null);
        $('#we_roll_val').text('—');
        $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', '');
        $('#we_type_row').hide();
        toastr.info('Tension reset to 0%');
    });

    eventSource.on(event_types.GENERATION_STARTED, onGenerationStarted);
    eventSource.on(event_types.CHAT_CHANGED, () => {
        lastIncrementedMsgId = null;
        updateUI(null);
        $('#we_roll_val').text('—');
        $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', '');
        $('#we_type_row').hide();
    });
});
