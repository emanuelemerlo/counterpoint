.pragma library
.import "en.js" as En
.import "it.js" as It
/*
 * Contrappunto – languages of the interface
 * -----------------------------------------
 * One file per language (en.js, it.js, ...) with the same keys as en.js, the
 * reference language. To add a language: copy en.js to xx.js, translate the
 * values (not the keys), then add two lines here: `.import "xx.js" as Xx`
 * above and `Xx.LANG` in LANGUAGES below. tests/check_i18n.js checks that no key
 * or placeholder is missing. See TRANSLATING.md.
 *
 * Values may contain placeholders {name}, filled from the args object, and may
 * be { one: "...", other: "..." } for words that change with a number: the form
 * is chosen by LANG.plural(args.n) (default: "one" for 1, otherwise "other").
 * Languages with more forms can define plural() and add keys such as "few".
 */

var LANGUAGES = [En.LANG, It.LANG];
var FALLBACK = "en";

var byCode = {};
for (var i = 0; i < LANGUAGES.length; i++) byCode[LANGUAGES[i].code] = LANGUAGES[i];

function languages() { return LANGUAGES.map(function (l) { return { code: l.code, name: l.name }; }); }

// "it_IT", "it-IT", "it" -> "it" if available, otherwise the fallback language
function match(code) {
    if (!code) return null;
    var c = String(code).replace("-", "_");
    if (byCode[c]) return c;
    c = c.split("_")[0].toLowerCase();
    return byCode[c] ? c : null;
}
// language to use: the user's choice, or (with "auto") the language of MuseScore
function resolve(pref, uiLanguage) {
    if (pref && pref !== "auto" && byCode[pref]) return pref;
    return match(uiLanguage) || FALLBACK;
}

function lookup(lang, key) {
    var l = byCode[lang] || byCode[FALLBACK];
    if (l.strings.hasOwnProperty(key)) return { lang: l, value: l.strings[key] };
    var f = byCode[FALLBACK];
    if (f.strings.hasOwnProperty(key)) return { lang: f, value: f.strings[key] };
    return null;
}

function pluralForm(l, n) {
    if (typeof l.plural === "function") return l.plural(n);
    return n === 1 ? "one" : "other";
}

function fill(text, args) {
    if (!args) return text;
    return text.replace(/\{(\w+)\}/g, function (m, k) { return args.hasOwnProperty(k) ? String(args[k]) : m; });
}

// translated text of key; a missing key shows up as ⟦key⟧, so it is easy to notice
function tr(lang, key, args) {
    var hit = lookup(lang, key);
    if (!hit) return "⟦" + key + "⟧";
    var v = hit.value;
    if (typeof v === "object" && v !== null) {
        var form = pluralForm(hit.lang, args && typeof args.n === "number" ? args.n : 0);
        v = v.hasOwnProperty(form) ? v[form] : v.other;
    }
    return fill(v, args);
}
function has(lang, key) { var l = byCode[lang]; return !!(l && l.strings.hasOwnProperty(key)); }

// ---------------------------------------------------------------- note names
// tpc (MuseScore "tonal pitch class": 14 = C, +7 = sharp, -7 = flat) -> "B♭", "Si♭"
var DEF_TPC = [14, 21, 16, 11, 18, 13, 20, 15, 10, 17, 12, 19];
function mod(a, n) { return ((a % n) + n) % n; }
// A language can define noteName(letter, alt) when its names are not "name +
// accidental sign" (German: H for B, B for B flat, Cis, Es...).
function noteName(lang, tpc) {
    var l = byCode[lang] || byCode[FALLBACK];
    var letter = mod((tpc - 14) * 4, 7);
    var alt = Math.floor((tpc + 1) / 7) - 2;
    if (typeof l.noteName === "function") return l.noteName(letter, alt);
    var acc = l.accidentals || { "-2": "♭♭", "-1": "♭", "0": "", "1": "♯", "2": "♯♯" };
    return l.notes[letter] + (acc[String(alt)] || "");
}
// MIDI pitch -> name with octave (C4 = middle C), with the usual spelling or the given tpc
function midiName(lang, midi, tpc) {
    var t = typeof tpc === "number" ? tpc : DEF_TPC[mod(midi, 12)];
    var letter = mod((t - 14) * 4, 7), alt = Math.floor((t + 1) / 7) - 2;
    var oct = Math.round((midi - alt - [0, 2, 4, 5, 7, 9, 11][letter]) / 12) - 1;
    return noteName(lang, t) + oct;
}
// key reported by the engine { tpc, mode } -> "D minor", "Re minore"
function keyName(lang, key) {
    if (!key) return "";
    return tr(lang, key.mode === "minor" ? "key.minor" : "key.major", { tonic: noteName(lang, key.tpc) });
}

// ---------------------------------------------------------------- analysis findings
// finding { tick, rule, level, args } -> sentence; tpc values become note names
function finding(lang, f) {
    var a = {}, k, src = f.args || {};
    for (k in src) a[k] = src[k];
    if (a.voice) a.voice = tr(lang, "voice." + a.voice);
    ["from", "to", "other", "note"].forEach(function (x) { if (typeof a[x] === "number") a[x] = noteName(lang, a[x]); });
    var key = "rule." + f.rule + (f.rule === "leap" && a.overOctave ? ".overOctave" : "");
    return tr(lang, key, a);
}
// error thrown by the engine ("error.noMelody") or any other error
function errorText(lang, e) {
    var s = String(e);
    if (s.indexOf("error.") === 0 && lookup(lang, s)) return tr(lang, s);
    return s;
}

if (typeof module !== "undefined")
    module.exports = { LANGUAGES: LANGUAGES, FALLBACK: FALLBACK, languages: languages, match: match, resolve: resolve, tr: tr, has: has,
                       noteName: noteName, midiName: midiName, keyName: keyName, finding: finding, errorText: errorText };
