import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────
// REAL API — talks to FastAPI at localhost:8000
// Token is stored in module-level variable and
// sent as X-Auth-Token header on every request.
// ─────────────────────────────────────────────
const BASE = "http://localhost:8000";
let _token = null;

async function apiFetch(path, options = {}) {
    const headers = { "Content-Type": "application/json" };
    if (_token) headers["X-Auth-Token"] = _token;
    const res = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Request failed");
    }
    if (res.status === 204) return null;
    return res.json();
}

const api = {
    // Auth — no token needed for these two
    signup: ({ name, email, password }) =>
        fetch(`${BASE}/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) })
            .then(async r => { if (!r.ok) { const e = await r.json(); throw new Error(e.detail); } return r.json(); }),

    login: async ({ email, password }) => {
        const res = await fetch(`${BASE}/users/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Invalid email or password"); }
        const data = await res.json();
        _token = data.token;
        return data.user;
    },

    logout: () => { _token = null; },

    // Tags
    listTags: () => apiFetch("/tags"),
    createTag: (name) => apiFetch("/tags", { method: "POST", body: JSON.stringify({ name }) }),

    // Decks
    listDecks: (uid, tag) => apiFetch(tag ? `/decks?tag=${encodeURIComponent(tag)}` : "/decks"),
    getDeck: (id) => apiFetch(`/decks/${id}`),
    createDeck: (payload) => apiFetch("/decks", { method: "POST", body: JSON.stringify(payload) }),
    updateDeck: (id, payload) => apiFetch(`/decks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteDeck: (id) => apiFetch(`/decks/${id}`, { method: "DELETE" }),

    // Questions
    listQuestions: (deckId) => apiFetch(`/decks/${deckId}/questions`),
    createQuestion: (deckId, payload) => apiFetch(`/decks/${deckId}/questions`, { method: "POST", body: JSON.stringify(payload) }),
    updateQuestion: (id, payload) => apiFetch(`/questions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteQuestion: (id) => apiFetch(`/questions/${id}`, { method: "DELETE" }),

    // Progress
    upsertProgress: (questionId, status) => apiFetch(`/progress/${questionId}`, { method: "PUT", body: JSON.stringify({ status }) }),
    listProgress: () => apiFetch("/progress"),
};

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const DIFF = {
    easy: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
    medium: { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
    hard: { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" }
};
const COLORS = ["#6366f1","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#ec4899","#14b8a6","#f97316","#06b6d4"];
const EMOJI_CATEGORIES = {
    "General":    ["📚","🃏","🎯","🏆","💡","🎓","📋","🗒️","📌","🔖","💎","🚀","🎲","🎮","⭐","🔑"],
    "Science":    ["🧬","🔬","⚗️","🧪","🔭","🧫","💉","🩺","🫀","🧠","🦠","⚡","🌡️","🔋","🧲"],
    "Maths":      ["📐","📏","🔢","📊","📈","🧮","➗","✖️","➕","➖","📉","🎲","🔄","💯"],
    "Humanities": ["📜","🎭","🎨","✍️","📖","🏛️","🗿","🎼","🎻","🖼️","🗽","🏰","📰","✒️","🗺️"],
    "Languages":  ["💬","🗣️","📝","✉️","🌐","🗺️","🔤","🌍","🌏","🌎","🤝","💭","🔊","📢","🎙️"],
    "Nature":     ["🌿","🌊","🌋","🦋","🐾","🌸","🍃","🌙","☀️","⭐","🪐","🌈","🦁","🌺","🍀"],
};

function calcStreak(progress) {
    const days = [...new Set(progress.filter(p => p.last_reviewed_at).map(p => new Date(p.last_reviewed_at).toDateString()))];
    if (!days.length) return 0;
    let streak = 0, check = new Date(); check.setHours(0,0,0,0);
    for (let i = 0; i < 365; i++) {
        if (days.includes(check.toDateString())) { streak++; check.setDate(check.getDate()-1); }
        else if (i === 0) { check.setDate(check.getDate()-1); }
        else break;
    }
    return streak;
}

function getWeeklyData(progress) {
    const result = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        const label = d.toLocaleDateString("en", { weekday: "short" });
        const count = progress.filter(p => p.status === "known" && p.last_reviewed_at && new Date(p.last_reviewed_at).toDateString() === d.toDateString()).length;
        result.push({ label, count, dateStr: d.toDateString() });
    }
    return result;
}

// ─────────────────────────────────────────────
// SHARED UI
// ─────────────────────────────────────────────
function DiffBadge({ difficulty }) {
    const c = DIFF[difficulty] || DIFF.easy;
    return <span style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}`, borderRadius: 999, padding: "2px 10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{difficulty}</span>;
}

function TagPill({ tag, active, onClick, onRemove }) {
    return (
        <span onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: active ? "#0f172a" : "#f1f5f9", color: active ? "#fff" : "#475569", border: `1.5px solid ${active ? "#0f172a" : "#e2e8f0"}`, borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: onClick ? "pointer" : "default", userSelect: "none", transition: "all 0.15s" }}>
      {tag.name}
            {onRemove && <span onClick={e => { e.stopPropagation(); onRemove(); }} style={{ cursor: "pointer", opacity: 0.5, fontSize: 15, marginLeft: 2 }}>×</span>}
    </span>
    );
}

function FInput({ label, value, onChange, placeholder, type = "text", multiline, required, error }) {
    const [focused, setFocused] = useState(false);
    const base = { width: "100%", padding: "11px 14px", border: `1.5px solid ${error ? "#fca5a5" : focused ? "#6366f1" : "#e2e8f0"}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: "#0f172a", background: "#fafafa", outline: "none", transition: "border-color 0.15s", boxSizing: "border-box", resize: multiline ? "vertical" : undefined };
    return (
        <div style={{ marginBottom: 16 }}>
            {label && <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>{label}{required && <span style={{ color: "#ef4444" }}> *</span>}</label>}
            {multiline
                ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={base} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
                : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />}
            {error && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#ef4444" }}>{error}</p>}
        </div>
    );
}

function Btn({ children, onClick, variant = "primary", disabled, fullWidth, color, size = "md" }) {
    const [hov, setHov] = useState(false);
    const pad = size === "sm" ? "7px 14px" : size === "lg" ? "14px 28px" : "10px 20px";
    const fs = size === "sm" ? 13 : size === "lg" ? 15 : 14;
    const bgs = { primary: color || "#0f172a", secondary: "#f1f5f9", danger: "#fee2e2", ghost: "transparent" };
    const txs = { primary: "#fff", secondary: "#374151", danger: "#991b1b", ghost: "#64748b" };
    const bds = { primary: color || "#0f172a", secondary: "#e2e8f0", danger: "#fca5a5", ghost: "transparent" };
    return (
        <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
                style={{ padding: pad, background: disabled ? "#e2e8f0" : bgs[variant], color: disabled ? "#94a3b8" : txs[variant], border: `1.5px solid ${disabled ? "#e2e8f0" : bds[variant]}`, borderRadius: 10, fontSize: fs, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.15s", opacity: hov && !disabled ? 0.88 : 1, transform: hov && !disabled ? "translateY(-1px)" : "translateY(0)", width: fullWidth ? "100%" : undefined, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {children}
        </button>
    );
}

function Modal({ title, onClose, children, width = 480 }) {
    useEffect(() => { const h = e => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
    return (
        <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(6px)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 22, padding: 32, width: "100%", maxWidth: width, boxShadow: "0 32px 80px rgba(0,0,0,0.2)", animation: "popIn .2s ease", maxHeight: "90vh", overflowY: "auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{title}</h2>
                    <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>
                {children}
            </div>
        </div>
    );
}

function EmojiPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const [cat, setCat] = useState("General");
    useEffect(() => {
        if (!open) return;
        const h = e => { if (!e.target.closest("[data-emoji-picker]")) setOpen(false); };
        document.addEventListener("mousedown", h);
        return () => document.removeEventListener("mousedown", h);
    }, [open]);
    return (
        <div style={{ position: "relative", marginBottom: 16 }} data-emoji-picker>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Deck Emoji</label>
            <button onClick={() => setOpen(!open)} style={{ width: 56, height: 56, borderRadius: 14, border: `1.5px solid ${open ? "#6366f1" : "#e2e8f0"}`, background: "#fafafa", fontSize: 26, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "border-color 0.15s" }}>
                {value || "📚"}
            </button>
            {open && (
                <div style={{ position: "absolute", top: 70, left: 0, zIndex: 400, background: "#fff", borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.15)", border: "1px solid #f1f5f9", width: 300, animation: "popIn .15s ease" }}>
                    <div style={{ padding: "10px 10px 0", display: "flex", gap: 5, flexWrap: "wrap", borderBottom: "1px solid #f1f5f9", paddingBottom: 8 }}>
                        {Object.keys(EMOJI_CATEGORIES).map(c => (
                            <button key={c} onClick={() => setCat(c)} style={{ padding: "3px 9px", borderRadius: 999, border: "none", background: cat === c ? "#0f172a" : "#f1f5f9", color: cat === c ? "#fff" : "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
                        ))}
                    </div>
                    <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 2 }}>
                        {EMOJI_CATEGORIES[cat].map(e => (
                            <button key={e} onClick={() => { onChange(e); setOpen(false); }}
                                    style={{ width: 38, height: 38, borderRadius: 8, border: value === e ? "2px solid #6366f1" : "2px solid transparent", background: value === e ? "#ede9fe" : "transparent", fontSize: 20, cursor: "pointer", transition: "background 0.1s", display: "flex", alignItems: "center", justifyContent: "center" }}
                                    onMouseEnter={e2 => { if (value !== e) e2.currentTarget.style.background = "#f1f5f9"; }}
                                    onMouseLeave={e2 => { e2.currentTarget.style.background = value === e ? "#ede9fe" : "transparent"; }}>
                                {e}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function ColorPicker({ value, onChange }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Colour</label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {COLORS.map(c => (
                    <button key={c} onClick={() => onChange(c)} style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: value === c ? "3px solid #0f172a" : "3px solid transparent", cursor: "pointer", transition: "transform 0.15s", transform: value === c ? "scale(1.25)" : "scale(1)", outline: "none" }} />
                ))}
            </div>
        </div>
    );
}

function TagSelector({ allTags, selectedIds, onChange, onCreateTag }) {
    const [input, setInput] = useState(""); const [creating, setCreating] = useState(false);
    const handleCreate = async () => {
        if (!input.trim()) return; setCreating(true);
        const t = await onCreateTag(input.trim()); onChange([...selectedIds, t.id]); setInput(""); setCreating(false);
    };
    return (
        <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>Tags</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {allTags.map(t => <TagPill key={t.id} tag={t} active={selectedIds.includes(t.id)} onClick={() => onChange(selectedIds.includes(t.id) ? selectedIds.filter(i => i !== t.id) : [...selectedIds, t.id])} />)}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} placeholder="New tag…" style={{ flex: 1, padding: "8px 12px", border: "1.5px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                <Btn onClick={handleCreate} variant="secondary" size="sm" disabled={creating || !input.trim()}>+ Add</Btn>
            </div>
        </div>
    );
}

function DeckForm({ initial, allTags, onSave, onCancel, onCreateTag, saving }) {
    const [title, setTitle] = useState(initial?.title || "");
    const [desc, setDesc] = useState(initial?.description || "");
    const [color, setColor] = useState(initial?.color || "#6366f1");
    const [emoji, setEmoji] = useState(initial?.emoji || "📚");
    const [tagIds, setTagIds] = useState(initial?.tag_ids || initial?.tags?.map(t => t.id) || []);
    return (
        <div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <EmojiPicker value={emoji} onChange={setEmoji} />
                <div style={{ flex: 1 }}><FInput label="Title" value={title} onChange={setTitle} placeholder="e.g. Biology Basics" required /></div>
            </div>
            <FInput label="Description" value={desc} onChange={setDesc} placeholder="What's this deck about?" multiline />
            <ColorPicker value={color} onChange={setColor} />
            <TagSelector allTags={allTags} selectedIds={tagIds} onChange={setTagIds} onCreateTag={onCreateTag} />
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
                <Btn onClick={() => title.trim() && onSave({ title: title.trim(), description: desc.trim(), color, emoji, tag_ids: tagIds })} disabled={saving || !title.trim()}>{saving ? "Saving…" : initial ? "Save Changes" : "Create Deck"}</Btn>
            </div>
        </div>
    );
}

function WeeklyChart({ progress }) {
    const data = getWeeklyData(progress);
    const max = Math.max(...data.map(d => d.count), 1);
    const thisWeek = data.reduce((s, d) => s + d.count, 0);
    const todayStr = new Date().toDateString();
    const lastWeekCount = (() => {
        let total = 0;
        for (let i = 13; i >= 7; i--) {
            const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
            total += progress.filter(p => p.status === "known" && p.last_reviewed_at && new Date(p.last_reviewed_at).toDateString() === d.toDateString()).length;
        }
        return total;
    })();
    const diff = thisWeek - lastWeekCount;
    return (
        <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #f1f5f9", padding: "22px 24px", marginBottom: 26, boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <div>
                    <h3 style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Weekly Progress</h3>
                    <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>Cards mastered each day</p>
                </div>
                <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{thisWeek}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: diff >= 0 ? "#166534" : "#991b1b", marginTop: 2 }}>
                        {diff === 0 ? "same as" : diff > 0 ? `↑ ${diff} from` : `↓ ${Math.abs(diff)} from`} last week
                    </div>
                </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 88 }}>
                {data.map((d, i) => {
                    const isToday = d.dateStr === todayStr;
                    const barH = d.count === 0 ? 4 : Math.max(10, Math.round((d.count / max) * 72));
                    return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: isToday ? "#6366f1" : "#64748b", visibility: d.count > 0 ? "visible" : "hidden" }}>{d.count}</span>
                            <div style={{ width: "100%", height: barH, borderRadius: 6, background: isToday && d.count > 0 ? "#6366f1" : d.count > 0 ? "#c7d2fe" : "#f1f5f9", position: "relative", overflow: "hidden", transition: "height 0.5s ease" }}>
                                {isToday && d.count > 0 && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#818cf8,#6366f1)" }} />}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? "#6366f1" : "#94a3b8" }}>{d.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────
function AuthScreen({ onLogin }) {
    const [mode, setMode] = useState("login");
    const [name, setName] = useState(""); const [email, setEmail] = useState("");
    const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false); const [error, setError] = useState("");

    const handleSubmit = async () => {
        setError("");
        if (!email.trim() || !password) { setError("Please fill in all fields"); return; }
        if (mode === "signup") {
            if (!name.trim()) { setError("Name is required"); return; }
            if (password !== confirm) { setError("Passwords do not match"); return; }
            if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
        }
        setLoading(true);
        try {
            if (mode === "signup") {
                // Create the account, then log in to get the token
                await api.signup({ name, email, password });
            }
            const user = await api.login({ email, password });
            onLogin(user);
        } catch (e) { setError(e.message); }
        setLoading(false);
    };

    const toggle = () => { setMode(m => m === "login" ? "signup" : "login"); setError(""); setName(""); setEmail(""); setPassword(""); setConfirm(""); };

    return (
        <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Sora','DM Sans',sans-serif", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: -150, right: -150, width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle,#6366f120,transparent 70%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", bottom: -100, left: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle,#8b5cf618,transparent 70%)", pointerEvents: "none" }} />
            <div style={{ width: "100%", maxWidth: 420, animation: "popIn .3s ease" }}>
                <div style={{ textAlign: "center", marginBottom: 36 }}>
                    <div style={{ fontSize: 56, marginBottom: 10 }}>🃏</div>
                    <h1 style={{ margin: "0 0 6px", fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>Flashcard</h1>
                    <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>Study smarter, not harder</p>
                </div>
                <div style={{ background: "#fff", borderRadius: 24, padding: 36, boxShadow: "0 32px 80px rgba(0,0,0,0.5)" }}>
                    <h2 style={{ margin: "0 0 22px", fontSize: 19, fontWeight: 800, color: "#0f172a" }}>{mode === "login" ? "Welcome back 👋" : "Create your account"}</h2>
                    {error && <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#991b1b", fontWeight: 600 }}>{error}</div>}
                    {mode === "signup" && <FInput label="Full name" value={name} onChange={setName} placeholder="Alex Rivera" required />}
                    <FInput label="Email" value={email} onChange={setEmail} placeholder="you@example.com" type="email" required />
                    <FInput label="Password" value={password} onChange={setPassword} placeholder={mode === "signup" ? "Min. 6 characters" : "Your password"} type="password" required />
                    {mode === "signup" && <FInput label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Same again" type="password" required />}
                    <div style={{ marginBottom: 16 }}>
                        <Btn onClick={handleSubmit} disabled={loading} fullWidth size="lg">{loading ? "Please wait…" : mode === "login" ? "Log In →" : "Create Account →"}</Btn>
                    </div>
                    <div style={{ textAlign: "center", fontSize: 14, color: "#64748b" }}>
                        {mode === "login" ? "No account? " : "Already have one? "}
                        <span onClick={toggle} style={{ color: "#6366f1", fontWeight: 700, cursor: "pointer" }}>{mode === "login" ? "Sign up free" : "Log in"}</span>
                    </div>
                    {mode === "login" && (
                        <div style={{ marginTop: 16, padding: "11px 14px", background: "#f8fafc", borderRadius: 10, fontSize: 12, color: "#64748b", textAlign: "center", lineHeight: 1.6 }}>
                            Demo: <strong>alex@example.com</strong> · <strong>password123</strong>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// DECK CARD
// ─────────────────────────────────────────────
function DeckCard({ deck, progress, questionIds, onSelect, onDelete }) {
    const [hov, setHov] = useState(false);
    const knownCount = progress.filter(p => p.status === "known" && questionIds.has(p.question_id)).length;
    const pct = deck.card_count > 0 ? Math.round((knownCount / deck.card_count) * 100) : 0;
    return (
        <div onClick={onSelect} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
             style={{ background: "#fff", borderRadius: 18, border: "1px solid #f1f5f9", overflow: "hidden", cursor: "pointer", transition: "transform 0.18s, box-shadow 0.18s", transform: hov ? "translateY(-4px)" : "none", boxShadow: hov ? "0 16px 40px rgba(0,0,0,0.1)" : "0 2px 8px rgba(0,0,0,0.05)" }}>
            <div style={{ height: 5, background: deck.color }} />
            <div style={{ padding: "18px 20px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: deck.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{deck.emoji || "📚"}</div>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 }}>{deck.title}</h3>
                    </div>
                    <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#e2e8f0", padding: "2px 4px", opacity: hov ? 1 : 0, transition: "opacity 0.15s, color 0.15s", fontSize: 14 }}
                            onMouseEnter={e => e.currentTarget.style.color = "#ef4444"} onMouseLeave={e => e.currentTarget.style.color = "#e2e8f0"}>🗑</button>
                </div>
                {deck.description && <p style={{ margin: "0 0 10px", fontSize: 13, color: "#64748b", lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{deck.description}</p>}
                {deck.tags?.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>{deck.tags.map(t => <TagPill key={t.id} tag={t} />)}</div>}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>{deck.card_count} card{deck.card_count !== 1 ? "s" : ""}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? "#166534" : pct > 0 ? "#1d4ed8" : "#94a3b8" }}>{pct}% mastered</span>
                </div>
                <div style={{ height: 4, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#22c55e" : deck.color, borderRadius: 999, transition: "width 0.6s ease" }} />
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// HOME VIEW
// ─────────────────────────────────────────────
function HomeView({ user, decks, tags, progress, deckQuestionIds, activeTagFilter, setActiveTagFilter, onSelectDeck, onCreateDeck, onDeleteDeck, onCreateTag, onSignOut }) {
    const [showCreate, setShowCreate] = useState(false); const [saving, setSaving] = useState(false);
    const streak = calcStreak(progress);
    const totalKnown = progress.filter(p => p.status === "known").length;
    const totalLearning = progress.filter(p => p.status === "learning").length;
    const totalQ = decks.reduce((s, d) => s + (d.card_count || 0), 0);
    const initials = user?.name?.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "U";
    return (
        <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Sora','DM Sans',sans-serif" }}>
            <nav style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "0 24px", height: 62, display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 22 }}>🃏</span>
                    <span style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", letterSpacing: "-0.02em" }}>Flashcard</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {streak > 0 && <div style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 999, padding: "5px 11px" }}><span>🔥</span><span style={{ fontWeight: 700, fontSize: 12, color: "#c2410c" }}>{streak}d</span></div>}
                    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{initials}</div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#374151" }}>{user?.name}</span>
                    </div>
                    <Btn variant="secondary" size="sm" onClick={onSignOut}>Sign out</Btn>
                </div>
            </nav>
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
                    {[
                        { label: "Decks", value: decks.length, emoji: "📚", bg: "#ede9fe" },
                        { label: "Questions", value: totalQ, emoji: "❓", bg: "#dbeafe" },
                        { label: "Mastered", value: totalKnown, emoji: "✅", bg: "#dcfce7" },
                        { label: "Learning", value: totalLearning, emoji: "⏳", bg: "#fef9c3" },
                    ].map(s => (
                        <div key={s.label} style={{ background: "#fff", border: "1px solid #f1f5f9", borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                            <div style={{ width: 40, height: 40, borderRadius: 11, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{s.emoji}</div>
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>{s.value}</div>
                                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontWeight: 500 }}>{s.label}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <WeeklyChart progress={progress} />
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 22, alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginRight: 2 }}>Filter</span>
                    <TagPill tag={{ name: "All" }} active={!activeTagFilter} onClick={() => setActiveTagFilter(null)} />
                    {tags.map(t => <TagPill key={t.id} tag={t} active={activeTagFilter === t.name} onClick={() => setActiveTagFilter(activeTagFilter === t.name ? null : t.name)} />)}
                </div>
                {decks.length === 0
                    ? <div style={{ textAlign: "center", padding: "64px 24px", color: "#94a3b8" }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#475569", marginBottom: 6 }}>No decks yet</div>
                        <div style={{ fontSize: 13 }}>Hit the + button to create your first deck</div>
                    </div>
                    : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(268px,1fr))", gap: 16 }}>
                        {decks.map(d => <DeckCard key={d.id} deck={d} progress={progress} questionIds={deckQuestionIds[d.id] || new Set()} onSelect={() => onSelectDeck(d)} onDelete={() => onDeleteDeck(d.id)} />)}
                    </div>
                }
            </div>
            <button onClick={() => setShowCreate(true)} style={{ position: "fixed", bottom: 26, right: 26, width: 54, height: 54, borderRadius: "50%", background: "#0f172a", color: "#fff", border: "none", fontSize: 24, cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,0.22)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40, transition: "transform 0.15s" }}
                    onMouseEnter={e => e.currentTarget.style.transform = "scale(1.1)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>+</button>
            {showCreate && (
                <Modal title="Create New Deck" onClose={() => setShowCreate(false)}>
                    <DeckForm allTags={tags} onSave={async p => { setSaving(true); await onCreateDeck(p); setSaving(false); setShowCreate(false); }} onCancel={() => setShowCreate(false)} onCreateTag={onCreateTag} saving={saving} />
                </Modal>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────
// QUESTION ROW
// ─────────────────────────────────────────────
function QuestionRow({ question, progress, isEditing, onEdit, onCancelEdit, onSave, onDelete }) {
    const [qt, setQt] = useState(question.question_text);
    const [diff, setDiff] = useState(question.difficulty);
    const [topic, setTopic] = useState(question.topic || "");
    const prog = progress.find(p => p.question_id === question.id);
    const dot = prog?.status === "known" ? "#22c55e" : prog?.status === "learning" ? "#f59e0b" : "#e2e8f0";
    if (isEditing) return (
        <div style={{ background: "#fff", borderRadius: 14, border: "2px solid #6366f1", padding: 18 }}>
            <FInput label="Question" value={qt} onChange={setQt} />
            <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Difficulty</label>
                    <select value={diff} onChange={e => setDiff(e.target.value)} style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none" }}>
                        <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                    </select>
                </div>
                <div style={{ flex: 1 }}><FInput label="Topic" value={topic} onChange={setTopic} placeholder="Optional" /></div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <Btn variant="secondary" size="sm" onClick={onCancelEdit}>Cancel</Btn>
                <Btn size="sm" onClick={() => onSave({ question_text: qt, difficulty: diff, topic: topic || null })}>Save</Btn>
            </div>
        </div>
    );
    return (
        <div style={{ background: "#fff", borderRadius: 13, border: "1px solid #f1f5f9", padding: "13px 16px", borderLeft: `4px solid ${DIFF[question.difficulty]?.border || "#e2e8f0"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                        <DiffBadge difficulty={question.difficulty} />
                        {question.topic && <span style={{ fontSize: 12, color: "#64748b" }}>{question.topic}</span>}
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: dot, marginLeft: "auto" }} title={prog?.status || "unseen"} />
                    </div>
                    <p style={{ margin: "0 0 7px", fontSize: 14, color: "#0f172a", fontWeight: 600, lineHeight: 1.5 }}>{question.question_text}</p>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                        {question.answers?.map(a => <span key={a.id} style={{ background: "#f1f5f9", color: "#374151", borderRadius: 7, padding: "3px 9px", fontSize: 12, fontWeight: 500 }}>{a.answer_text}</span>)}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                    <button onClick={onEdit} style={{ background: "#f1f5f9", border: "none", borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontSize: 13 }}>✏️</button>
                    <button onClick={onDelete} style={{ background: "#fee2e2", border: "none", borderRadius: 7, padding: "5px 8px", cursor: "pointer", fontSize: 13 }}>🗑</button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// ADD QUESTION FORM
// ─────────────────────────────────────────────
function AddQuestionForm({ deckColor, onSave, onCancel }) {
    const [qt, setQt] = useState(""); const [diff, setDiff] = useState("medium"); const [topic, setTopic] = useState("");
    const [answers, setAnswers] = useState([]); const [ansInput, setAnsInput] = useState(""); const [saving, setSaving] = useState(false);
    const addAns = () => { const t = ansInput.trim(); if (!t || answers.includes(t)) return; setAnswers(a => [...a, t]); setAnsInput(""); };
    return (
        <div style={{ background: "#fff", borderRadius: 16, border: `2px solid ${deckColor}`, padding: 22, boxShadow: `0 4px 20px ${deckColor}20` }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 14, fontWeight: 800, color: "#0f172a" }}>Add a Question</h3>
            <FInput label="Question" value={qt} onChange={setQt} placeholder="What do you want to be asked?" required multiline />
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Difficulty</label>
                    <select value={diff} onChange={e => setDiff(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fafafa" }}>
                        <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                    </select>
                </div>
                <div style={{ flex: 1 }}><FInput label="Topic (optional)" value={topic} onChange={setTopic} placeholder="e.g. Organelles" /></div>
            </div>
            <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>Answers <span style={{ color: "#ef4444" }}>*</span> <span style={{ color: "#94a3b8", fontSize: 11, fontWeight: 400 }}>press Enter to add</span></label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <input value={ansInput} onChange={e => setAnsInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAns(); } }} placeholder="Type an answer…" style={{ flex: 1, padding: "10px 14px", border: "1.5px solid #e2e8f0", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fafafa" }} onFocus={e => e.target.style.borderColor = deckColor} onBlur={e => e.target.style.borderColor = "#e2e8f0"} />
                    <button onClick={addAns} style={{ padding: "10px 15px", background: deckColor, border: "none", borderRadius: 10, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 18 }}>+</button>
                </div>
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                    {answers.map((a, i) => <span key={i} style={{ background: "#f1f5f9", color: "#374151", borderRadius: 7, padding: "5px 10px", fontSize: 12, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 5 }}>{a}<span onClick={() => setAnswers(answers.filter((_, j) => j !== i))} style={{ cursor: "pointer", opacity: 0.5, fontSize: 14 }}>×</span></span>)}
                </div>
                {answers.length === 0 && <p style={{ margin: "5px 0 0", fontSize: 12, color: "#f87171" }}>At least one answer is required</p>}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
                <Btn color={deckColor} disabled={saving || !qt.trim() || answers.length === 0} onClick={async () => { setSaving(true); await onSave({ question_text: qt.trim(), difficulty: diff, topic: topic.trim() || null, answers }); setSaving(false); }}>{saving ? "Saving…" : "Save Question"}</Btn>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// DECK DETAIL VIEW
// ─────────────────────────────────────────────
function DeckDetailView({ deck, questions, tags, progress, onBack, onStudy, onUpdateDeck, onDeleteDeck, onAddQuestion, onUpdateQuestion, onDeleteQuestion, onCreateTag }) {
    const [editing, setEditing] = useState(false); const [saving, setSaving] = useState(false);
    const [showAdd, setShowAdd] = useState(false); const [editingQ, setEditingQ] = useState(null);
    const handleDelete = async () => { if (window.confirm(`Delete "${deck.title}"? All questions will be removed.`)) { await onDeleteDeck(deck.id); onBack(); } };
    return (
        <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Sora','DM Sans',sans-serif" }}>
            <div style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "0 24px", height: 54, display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 50 }}>
                <button onClick={onBack} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>← Back</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{deck.emoji} {deck.title}</span>
            </div>
            <div style={{ maxWidth: 760, margin: "0 auto", padding: "26px 24px" }}>
                <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #f1f5f9", overflow: "hidden", marginBottom: 22, boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
                    <div style={{ height: 5, background: deck.color }} />
                    {editing ? (
                        <div style={{ padding: 22 }}>
                            <DeckForm initial={deck} allTags={tags} onSave={async p => { setSaving(true); await onUpdateDeck(deck.id, p); setSaving(false); setEditing(false); }} onCancel={() => setEditing(false)} onCreateTag={onCreateTag} saving={saving} />
                        </div>
                    ) : (
                        <div style={{ padding: 22 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                                        <div style={{ width: 50, height: 50, borderRadius: 14, background: deck.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{deck.emoji || "📚"}</div>
                                        <div>
                                            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{deck.title}</h1>
                                            {deck.description && <p style={{ margin: "3px 0 0", fontSize: 13, color: "#64748b" }}>{deck.description}</p>}
                                        </div>
                                    </div>
                                    {deck.tags?.length > 0 && <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>{deck.tags.map(t => <TagPill key={t.id} tag={t} />)}</div>}
                                </div>
                                <div style={{ display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap" }}>
                                    <Btn variant="secondary" size="sm" onClick={() => setEditing(true)}>✏️ Edit</Btn>
                                    <Btn variant="danger" size="sm" onClick={handleDelete}>🗑 Delete</Btn>
                                    {questions.length > 0 && <Btn size="sm" color={deck.color} onClick={onStudy}>▶ Study</Btn>}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div style={{ marginBottom: 12 }}>
                    <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "#0f172a" }}>Questions <span style={{ color: "#94a3b8", fontWeight: 500 }}>({questions.length})</span></h2>
                </div>
                {questions.length === 0 && !showAdd && (
                    <div style={{ textAlign: "center", padding: "40px 24px", background: "#fff", borderRadius: 14, border: "2px dashed #e2e8f0", color: "#94a3b8", marginBottom: 14 }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>🃏</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#475569", marginBottom: 3 }}>No questions yet</div>
                        <div style={{ fontSize: 12 }}>Add your first question below</div>
                    </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 14 }}>
                    {questions.map(q => <QuestionRow key={q.id} question={q} progress={progress} isEditing={editingQ === q.id} onEdit={() => setEditingQ(editingQ === q.id ? null : q.id)} onCancelEdit={() => setEditingQ(null)} onSave={async p => { await onUpdateQuestion(q.id, p); setEditingQ(null); }} onDelete={() => onDeleteQuestion(q.id)} />)}
                </div>
                {showAdd
                    ? <AddQuestionForm deckColor={deck.color} onSave={async p => { await onAddQuestion(deck.id, p); setShowAdd(false); }} onCancel={() => setShowAdd(false)} />
                    : <button onClick={() => setShowAdd(true)} style={{ width: "100%", padding: "12px", background: "#fff", border: `2px dashed ${deck.color}88`, borderRadius: 13, fontSize: 14, fontWeight: 700, cursor: "pointer", color: deck.color, fontFamily: "inherit", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"} onMouseLeave={e => e.currentTarget.style.background = "#fff"}>+ Add Question</button>}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// STUDY VIEW
// ─────────────────────────────────────────────
function StudyView({ deck, questions, progress, onBack, onUpdateProgress }) {
    const [diffFilter, setDiffFilter] = useState("all");
    const [started, setStarted] = useState(false);
    const [cards, setCards] = useState([]); const [idx, setIdx] = useState(0);
    const [flipped, setFlipped] = useState(false); const [sessP, setSessP] = useState({}); const [done, setDone] = useState(false);
    const filtered = diffFilter === "all" ? questions : questions.filter(q => q.difficulty === diffFilter);
    const start = () => { setCards([...filtered].sort(() => Math.random() - 0.5)); setIdx(0); setFlipped(false); setSessP({}); setDone(false); setStarted(true); };
    const answer = async (status) => {
        const card = cards[idx];
        await onUpdateProgress(card.id, status);
        setSessP(p => ({ ...p, [card.id]: status }));
        if (idx + 1 >= cards.length) setDone(true);
        else { setIdx(i => i + 1); setFlipped(false); }
    };
    const known = Object.values(sessP).filter(s => s === "known").length;
    const learning = Object.values(sessP).filter(s => s === "learning").length;
    const pct = cards.length ? Math.round((Object.keys(sessP).length / cards.length) * 100) : 0;

    const shell = (content) => (
        <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Sora','DM Sans',sans-serif", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "0 24px", height: 54, display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={onBack} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "6px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>← Back</button>
                <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>{deck.emoji} {deck.title}</span>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>{content}</div>
        </div>
    );

    if (!started) return shell(
        <div style={{ background: "#fff", borderRadius: 24, padding: 40, maxWidth: 400, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
            <div style={{ width: 70, height: 70, borderRadius: 20, background: deck.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, margin: "0 auto 16px" }}>{deck.emoji || "📚"}</div>
            <h2 style={{ margin: "0 0 6px", fontSize: 21, fontWeight: 800, color: "#0f172a" }}>{deck.title}</h2>
            <p style={{ margin: "0 0 26px", color: "#64748b", fontSize: 13 }}>{filtered.length} card{filtered.length !== 1 ? "s" : ""} in session</p>
            <div style={{ marginBottom: 26, textAlign: "left" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Filter by difficulty</p>
                <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {["all", "easy", "medium", "hard"].map(d => <button key={d} onClick={() => setDiffFilter(d)} style={{ padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${diffFilter === d ? "#0f172a" : "#e2e8f0"}`, background: diffFilter === d ? "#0f172a" : "#fff", color: diffFilter === d ? "#fff" : "#64748b", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "capitalize", fontFamily: "inherit" }}>{d === "all" ? "All" : d}</button>)}
                </div>
            </div>
            <Btn fullWidth size="lg" color={deck.color} disabled={filtered.length === 0} onClick={start}>{filtered.length === 0 ? "No cards match" : "Start Studying →"}</Btn>
        </div>
    );

    if (done) return shell(
        <div style={{ background: "#fff", borderRadius: 24, padding: 48, maxWidth: 380, width: "100%", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 10 }}>🎉</div>
            <h2 style={{ margin: "0 0 4px", fontSize: 24, fontWeight: 800, color: "#0f172a" }}>Done!</h2>
            <p style={{ margin: "0 0 26px", color: "#64748b", fontSize: 14 }}>{cards.length} cards reviewed</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 26 }}>
                <div style={{ flex: 1, background: "#dcfce7", borderRadius: 14, padding: "14px 10px" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#166534" }}>{known}</div>
                    <div style={{ fontSize: 12, color: "#166534", fontWeight: 700, marginTop: 2 }}>✅ Mastered</div>
                </div>
                <div style={{ flex: 1, background: "#fef9c3", borderRadius: 14, padding: "14px 10px" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "#854d0e" }}>{learning}</div>
                    <div style={{ fontSize: 12, color: "#854d0e", fontWeight: 700, marginTop: 2 }}>📖 Still Learning</div>
                </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" fullWidth onClick={start}>🔄 Again</Btn>
                <Btn color={deck.color} fullWidth onClick={onBack}>← Back</Btn>
            </div>
        </div>
    );

    const card = cards[idx];
    return (
        <div style={{ minHeight: "100vh", background: `linear-gradient(160deg,${deck.color}12 0%,#f8fafc 55%)`, fontFamily: "'Sora','DM Sans',sans-serif", display: "flex", flexDirection: "column" }}>
            <div style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "10px 24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <button onClick={onBack} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#374151" }}>← Back</button>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b" }}>Card {idx + 1} / {cards.length}</span>
                </div>
                <div style={{ background: "#f1f5f9", borderRadius: 999, height: 5, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: deck.color, borderRadius: 999, width: `${pct}%`, transition: "width 0.4s ease" }} />
                </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px" }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 16 }}>
                    <DiffBadge difficulty={card.difficulty} />
                    {card.topic && <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>{card.topic}</span>}
                </div>
                <div onClick={() => setFlipped(!flipped)} style={{ width: "100%", maxWidth: 520, height: 250, cursor: "pointer", perspective: "1200px", marginBottom: 26 }}>
                    <div style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d", transition: "transform 0.55s cubic-bezier(0.4,0.2,0.2,1)", transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}>
                        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", background: "#fff", borderRadius: 22, boxShadow: "0 8px 40px rgba(0,0,0,0.09)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 30, border: `1.5px solid ${deck.color}33` }}>
                            <p style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "#0f172a", textAlign: "center", lineHeight: 1.5 }}>{card.question_text}</p>
                            <span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: "0.05em", fontWeight: 600, textTransform: "uppercase" }}>tap to reveal</span>
                        </div>
                        <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)", background: "#fff", borderRadius: 22, boxShadow: "0 8px 40px rgba(0,0,0,0.09)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 30, border: `2px solid ${deck.color}` }}>
                            {card.answers?.length > 1 && <p style={{ margin: "0 0 12px", fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>All of the following are valid</p>}
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", alignItems: "center" }}>
                                {card.answers?.map((a, i) => (
                                    <div key={a.id} style={{ background: deck.color + "18", borderRadius: 10, padding: "10px 20px", fontSize: 15, fontWeight: 700, color: "#0f172a", textAlign: "center", width: "100%", maxWidth: 320 }}>
                                        {card.answers.length > 1 && <span style={{ color: deck.color, marginRight: 7 }}>{i + 1}.</span>}
                                        {a.answer_text}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                    <button onClick={() => { if (idx > 0) { setIdx(i => i - 1); setFlipped(false); } }} disabled={idx === 0} style={{ background: "#f1f5f9", border: "none", borderRadius: 10, padding: "9px 14px", cursor: idx === 0 ? "default" : "pointer", opacity: idx === 0 ? 0.35 : 1, fontSize: 17, color: "#374151" }}>←</button>
                    <button onClick={() => answer("learning")} style={{ padding: "12px 24px", background: "#fef9c3", border: "2px solid #fde047", borderRadius: 13, fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#854d0e", fontFamily: "inherit", transition: "transform 0.1s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>😅 Still Learning</button>
                    <button onClick={() => answer("known")} style={{ padding: "12px 24px", background: "#dcfce7", border: "2px solid #86efac", borderRadius: 13, fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#166534", fontFamily: "inherit", transition: "transform 0.1s" }} onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>✅ Got It</button>
                    <button onClick={() => { if (idx < cards.length - 1) { setIdx(i => i + 1); setFlipped(false); } }} disabled={idx === cards.length - 1} style={{ background: "#f1f5f9", border: "none", borderRadius: 10, padding: "9px 14px", cursor: idx === cards.length - 1 ? "default" : "pointer", opacity: idx === cards.length - 1 ? 0.35 : 1, fontSize: 17, color: "#374151" }}>→</button>
                </div>
                {!flipped && <p style={{ marginTop: 12, fontSize: 11, color: "#94a3b8", textAlign: "center", fontWeight: 500 }}>Flip the card first, then mark your answer</p>}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────
export default function App() {
    const [user, setUser] = useState(null);
    const [view, setView] = useState("home");
    const [decks, setDecks] = useState([]); const [tags, setTags] = useState([]);
    const [selectedDeck, setSelectedDeck] = useState(null); const [deckQuestions, setDeckQuestions] = useState([]);
    const [progress, setProgress] = useState([]); const [activeTagFilter, setActiveTagFilter] = useState(null);
    const [appLoading, setAppLoading] = useState(false);
    // Maps deck_id → Set of question_ids so DeckCard can calculate per-deck mastery
    const [deckQuestionIds, setDeckQuestionIds] = useState({});

    const loadData = useCallback(async (tag) => {
        const [d, t, p] = await Promise.all([api.listDecks(null, tag || undefined), api.listTags(), api.listProgress()]);
        setDecks(d); setTags(t); setProgress(p);
        // Build deck → questionIds map for mastery % on cards
        const map = {};
        await Promise.all(d.map(async deck => {
            const qs = await api.listQuestions(deck.id);
            map[deck.id] = new Set(qs.map(q => q.id));
        }));
        setDeckQuestionIds(map);
    }, []);

    const handleLogin = async (u) => {
        setAppLoading(true); setUser(u);
        await loadData();
        setAppLoading(false);
    };

    const handleSignOut = () => {
        api.logout();
        setUser(null); setView("home"); setDecks([]); setTags([]);
        setProgress([]); setSelectedDeck(null); setActiveTagFilter(null); setDeckQuestionIds({});
    };

    const handleTagFilter = async (tag) => { setActiveTagFilter(tag); const d = await api.listDecks(null, tag || undefined); setDecks(d); };
    const handleSelectDeck = async (deck) => { setSelectedDeck(deck); setDeckQuestions(await api.listQuestions(deck.id)); setView("deckDetail"); };
    const handleCreateDeck = async (p) => { await api.createDeck(p); await loadData(activeTagFilter); };
    const handleUpdateDeck = async (id, p) => { await api.updateDeck(id, p); setSelectedDeck(await api.getDeck(id)); await loadData(activeTagFilter); };
    const handleDeleteDeck = async (id) => { await api.deleteDeck(id); await loadData(activeTagFilter); };
    const handleCreateTag = async (name) => { const t = await api.createTag(name); await loadData(activeTagFilter); return t; };
    const handleAddQuestion = async (deckId, p) => {
        const q = await api.createQuestion(deckId, p);
        setDeckQuestions(prev => [...prev, q]);
        setSelectedDeck(await api.getDeck(deckId));
        await loadData(activeTagFilter);
    };
    const handleUpdateQuestion = async (id, p) => { const q = await api.updateQuestion(id, p); setDeckQuestions(prev => prev.map(x => x.id === id ? q : x)); };
    const handleDeleteQuestion = async (id) => {
        await api.deleteQuestion(id);
        setDeckQuestions(prev => prev.filter(q => q.id !== id));
        if (selectedDeck) { setSelectedDeck(await api.getDeck(selectedDeck.id)); await loadData(activeTagFilter); }
    };
    const handleUpdateProgress = async (qId, status) => {
        const p = await api.upsertProgress(qId, status);
        setProgress(prev => prev.some(x => x.question_id === qId) ? prev.map(x => x.question_id === qId ? p : x) : [...prev, p]);
    };

    const globalStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes popIn { from { opacity:0; transform:scale(0.95) translateY(6px); } to { opacity:1; transform:scale(1) translateY(0); } }
  `;

    if (!user) return <><style>{globalStyles}</style><AuthScreen onLogin={handleLogin} /></>;

    if (appLoading) return (
        <><style>{globalStyles}</style>
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8fafc", fontFamily: "'Sora','DM Sans',sans-serif" }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ width: 38, height: 38, border: "3px solid #e2e8f0", borderTop: "3px solid #6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
                    <div style={{ color: "#64748b", fontSize: 13, fontWeight: 600 }}>Loading…</div>
                </div>
            </div></>
    );

    return (
        <>
            <style>{globalStyles}</style>
            {view === "home" && <HomeView user={user} decks={decks} tags={tags} progress={progress} deckQuestionIds={deckQuestionIds} activeTagFilter={activeTagFilter} setActiveTagFilter={handleTagFilter} onSelectDeck={handleSelectDeck} onCreateDeck={handleCreateDeck} onDeleteDeck={handleDeleteDeck} onCreateTag={handleCreateTag} onSignOut={handleSignOut} />}
            {view === "deckDetail" && selectedDeck && <DeckDetailView deck={selectedDeck} questions={deckQuestions} tags={tags} progress={progress} onBack={() => setView("home")} onStudy={() => setView("study")} onUpdateDeck={handleUpdateDeck} onDeleteDeck={handleDeleteDeck} onAddQuestion={handleAddQuestion} onUpdateQuestion={handleUpdateQuestion} onDeleteQuestion={handleDeleteQuestion} onCreateTag={handleCreateTag} />}
            {view === "study" && selectedDeck && <StudyView deck={selectedDeck} questions={deckQuestions} progress={progress} onBack={() => setView("deckDetail")} onUpdateProgress={handleUpdateProgress} />}
        </>
    );
}