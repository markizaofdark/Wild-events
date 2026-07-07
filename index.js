/**
 * Wild Events — SillyTavern Extension
 * Replaces the in-prompt random events system with pure JS mechanics.
 * Zero AI tokens spent on dice rolls or tension math.
 * 
 * Injects a one-line event directive into the prompt that the model
 * must follow when generating its response.
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
    step: 0.5,        // tension added per new message
    label: 'WILD EVENTS',
    depth: 0,          // 0 = end of context (maximum model attention)
};

/**
 * Event table — maps final score ranges to event types.
 * adj: how tension changes after this event fires.
 */
const EVENTS = [
    { min: 1,  max: 10, id: 'NONE',   name: 'NO CHANGE',       adj: null,     desc: 'No forced external change. Story flows naturally.' },
    { min: 11, max: 14, id: 'SUBTLE', name: 'SUBTLE CHANGE',    adj: null,     desc: 'A minor obstacle or a small lucky break.' },
    { min: 15, max: 19, id: 'MINOR',  name: 'MINOR PLOT TWIST', adj: null,     desc: 'Meaningful turn that changes immediate priorities.' },
    { min: 20, max: 24, id: 'MAJOR',  name: 'MAJOR PLOT TWIST', adj: 'reduce', desc: 'Weighty event that significantly changes the current situation.' },
    { min: 25, max: 99, id: 'GIANT',  name: 'GIANT PLOT TWIST', adj: 'reset',  desc: 'Sudden global event — betrayal, catastrophe, massive secret, pregnancy, death.' },
];

// ── State ──────────────────────────────────────────────────

let lastChatLen = 0; // tracks chat length to distinguish new messages from swipes

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

/**
 * Formats the injection text that the model will see in its context.
 * Designed to be short, authoritative, and hard to ignore.
 */
function formatPrompt(result) {
    const label = extension_settings[EXT].label || DEFAULTS.label;
    const impact = result.isPositive ? 'POSITIVE' : 'NEGATIVE';

    if (result.event.id === 'NONE') {
        return `[${label}: NO CHANGE]\nNo forced twist. Story continues naturally.`;
    }

    let lines = [
        `[${label}: ${result.event.name} | ${impact}]`,
        result.event.desc,
    ];

    if (result.forced) {
        lines.push('(FORCED — tension reached maximum)');
    }

    lines.push('Implement naturally. Do not skip or change the event type.');
    return lines.join('\n');
}

/**
 * Main function: rolls dice, calculates event, injects into prompt.
 * Called on every generation (including swipes/regenerations).
 * Tension only increments on genuinely new messages.
 */
function onGeneration() {
    const s = extension_settings[EXT];

    if (!s.enabled) {
        setExtensionPrompt(EXT, '', 1, s.depth);
        return;
    }

    const ctx = getContext();
    const chatLen = ctx.chat?.length ?? 0;

    // ── Step 1: Tension ──
    let tension = getTension();

    // Only add tension on new messages, not swipes/regenerations
    if (chatLen > lastChatLen) {
        tension = Math.min(100, tension + s.step);
        lastChatLen = chatLen;
    }

    // ── Step 2: Roll ──
    let baseRoll, modifier, finalScore, isPositive, event;
    let forced = false;

    if (tension >= 100) {
        // Forced GIANT at max tension
        forced = true;
        baseRoll = Math.floor(Math.random() * 20) + 1;
        isPositive = baseRoll % 2 === 0;
        modifier = Math.floor(tension / 8);
        finalScore = 25; // guaranteed GIANT
        event = EVENTS[4];
    } else {
        baseRoll = Math.floor(Math.random() * 20) + 1;
        modifier = Math.floor(tension / 8);
        finalScore = baseRoll + modifier;
        isPositive = baseRoll % 2 === 0;
        event = findEvent(finalScore);
    }

    // ── Step 3: Adjust tension after event ──
    if (event.adj === 'reset') tension = 0;
    else if (event.adj === 'reduce') tension *= 0.75;

    saveTension(tension);

    // ── Step 4: Inject into prompt ──
    const result = { tension, baseRoll, modifier, finalScore, isPositive, event, forced };
    const prompt = formatPrompt(result);

    // Position 1 = IN_CHAT, role 0 = SYSTEM
    setExtensionPrompt(EXT, prompt, 1, s.depth, false, 0);

    // ── Step 5: Update UI ──
    updateUI(result);
}

// ── UI ─────────────────────────────────────────────────────

function updateUI(result) {
    const t = result?.tension ?? getTension();
    $('#we_tension_val').text(`${t.toFixed(1)}%`);
    $('#we_tension_bar').css('width', `${Math.min(100, t)}%`);

    if (!result) return;

    if (result.forced) {
        $('#we_roll_val').text('⚡ FORCED');
    } else {
        $('#we_roll_val').text(`${result.baseRoll} + ${result.modifier} = ${result.finalScore}`);
    }

    const evEl = $('#we_event_val');
    evEl.text(result.event.name);
    evEl.css('color', result.event.id === 'NONE'
        ? 'var(--SmartThemeBodyColor)'
        : result.isPositive ? '#66bb6a' : '#ef5350');

    const impEl = $('#we_impact_val');
    if (result.event.id === 'NONE') {
        impEl.text('—');
        impEl.css('color', 'var(--SmartThemeBodyColor)');
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

            <!-- Toggle -->
            <label class="checkbox_label">
                <input type="checkbox" id="we_toggle" />
                <span>Enable</span>
            </label>

            <!-- Tension bar -->
            <div class="we_section">
                <div class="we_row">
                    <span>Tension</span>
                    <b id="we_tension_val">0%</b>
                </div>
                <div class="we_bar_bg">
                    <div class="we_bar_fill" id="we_tension_bar"></div>
                </div>
            </div>

            <!-- Last roll info -->
            <div class="we_section we_results">
                <div class="we_row">
                    <span>Roll</span>
                    <span id="we_roll_val">—</span>
                </div>
                <div class="we_row">
                    <span>Event</span>
                    <b id="we_event_val">—</b>
                </div>
                <div class="we_row">
                    <span>Impact</span>
                    <span id="we_impact_val">—</span>
                </div>
            </div>

            <hr>

            <!-- Settings -->
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
    // Build UI
    buildUI();

    // Load settings (merge with defaults)
    if (!extension_settings[EXT]) extension_settings[EXT] = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (extension_settings[EXT][k] === undefined) {
            extension_settings[EXT][k] = v;
        }
    }
    const s = extension_settings[EXT];

    // Populate UI from settings
    $('#we_toggle').prop('checked', s.enabled);
    $('#we_label').val(s.label);
    $('#we_step').val(s.step);
    $('#we_depth').val(s.depth);
    updateUI(null);

    // ── Event handlers ──

    $('#we_toggle').on('change', function () {
        s.enabled = this.checked;
        saveSettingsDebounced();
        if (!this.checked) {
            setExtensionPrompt(EXT, '', 1, s.depth);
        }
    });

    $('#we_label').on('input', function () {
        s.label = this.value;
        saveSettingsDebounced();
    });

    $('#we_step').on('input', function () {
        s.step = parseFloat(this.value) || DEFAULTS.step;
        saveSettingsDebounced();
    });

    $('#we_depth').on('input', function () {
        s.depth = parseInt(this.value) || DEFAULTS.depth;
        saveSettingsDebounced();
    });

    $('#we_reset').on('click', () => {
        saveTension(0);
        updateUI(null);
        toastr.info('Tension reset to 0%');
    });

    // ── Hook into generation pipeline ──
    eventSource.on(event_types.GENERATION_STARTED, onGeneration);

    // ── Sync UI on chat switch ──
    eventSource.on(event_types.CHAT_CHANGED, () => {
        lastChatLen = 0;
        updateUI(null);
        $('#we_roll_val').text('—');
        $('#we_event_val').text('—').css('color', '');
        $('#we_impact_val').text('—').css('color', '');
    });
});
