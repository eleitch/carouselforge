import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import JSZip from "jszip";
import {
  ChevronLeft, ChevronRight, PenLine, X, Upload, Trash2, Image,
  Eye, Stamp, Palette, Settings, Download, Plus, Save, GripVertical, Loader, Check
} from "lucide-react";

/* ═══ 3 TEMPLATES ═══ */
const BUILTIN_TEMPLATES = [
  {
    id: "notebook", name: "Notebook", builtin: true,
    bg: "#fdf6e3", fg: "#2c2416", accent: "#2c5282",
    headingFont: "'Kalam', cursive", bodyFont: "'Kalam', cursive",
    decorStyle: "ruled-paper"
  },
  {
    id: "story", name: "Story", builtin: true,
    bg: "#2a5a3a", fg: "#1a1a1a", accent: "#ffffff",
    headingFont: "'DM Sans', sans-serif", bodyFont: "'DM Sans', sans-serif",
    decorStyle: "text-box"
  },
  {
    id: "blackboard", name: "Blackboard", builtin: true,
    bg: "#2a2d2e", fg: "#c8c4b8", accent: "#f5d97a",
    headingFont: "'Fraunces', serif", bodyFont: "'Nunito', sans-serif",
    decorStyle: "chalk-border"
  },
];

const DECOR_STYLES = ["ruled-paper", "underline-accent", "text-box", "gradient-circles", "magazine-bar", "thin-lines", "chalk-border", "corner-glow", "none"];

const FONT_OPTIONS = [
  "'Kalam', cursive", "'Playfair Display', serif", "'Montserrat', sans-serif",
  "'Cormorant Garamond', serif", "'Space Mono', monospace", "'DM Sans', sans-serif",
  "'Work Sans', sans-serif", "'Nunito', sans-serif", "'Karla', sans-serif",
  "'IBM Plex Sans', sans-serif", "'Poppins', sans-serif", "'Lora', serif",
  "'Raleway', sans-serif", "'Oswald', sans-serif", "'Merriweather', serif",
  "'Fraunces', serif", "'Bebas Neue', sans-serif", "'Outfit', sans-serif",
  "'Space Grotesk', sans-serif", "'Caveat', cursive"
];

const RATIOS = { "1:1": { w: 1080, h: 1080 }, "4:5": { w: 1080, h: 1350 }, "9:16": { w: 1080, h: 1920 } };

/* ═══ STORAGE ═══ */
function lsGet(k, fb) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch {} }

/* ═══ UTILS ═══ */
const loadedFonts = new Set();
function loadGoogleFonts(t) {
  const fonts = [t.headingFont, t.bodyFont].map(f => f.split(",")[0].replace(/'/g, "").trim()).filter(f => !loadedFonts.has(f));
  if (!fonts.length) return;
  fonts.forEach(f => loadedFonts.add(f));
  const el = document.createElement("link");
  el.href = `https://fonts.googleapis.com/css2?${fonts.map(f => `family=${f.replace(/ /g, "+")}:wght@300;400;500;600;700;800;900`).join("&")}&display=swap`;
  el.rel = "stylesheet"; document.head.appendChild(el);
}
function calcFontSize(text) {
  const l = text.length;
  if (l < 60) return 32; if (l < 120) return 26; if (l < 200) return 22;
  if (l < 350) return 18; if (l < 500) return 15; return 13;
}
function parseSlides(raw) { return raw.split(/\n---\n/).map(s => s.trim()).filter(Boolean); }
function fileToDataUrl(file) { return new Promise(r => { const rd = new FileReader(); rd.onload = e => r(e.target.result); rd.readAsDataURL(file); }); }
async function doUpload(e, cb) { const f = e.target.files?.[0]; if (!f) return; cb(await fileToDataUrl(f)); e.target.value = ""; }
function fontLabel(f) { return f.split(",")[0].replace(/'/g, "").trim(); }

async function createZip(files) {
  const zip = new JSZip();
  files.forEach(f => zip.file(f.name, f.blob));
  return await zip.generateAsync({ type: "blob" });
}

/* ═══ TEXT MARKER PARSER ═══ */
function parseMarkers(text) {
  const segments = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '*' && text[i + 1] === '=' && text[i + 2] === '=') {
      const end = text.indexOf('==*', i + 3);
      if (end !== -1) {
        segments.push({ text: text.slice(i + 3, end), bold: true, highlight: true });
        i = end + 3; continue;
      }
    }
    if (text[i] === '=' && text[i + 1] === '=' && text[i + 2] === '*') {
      const end = text.indexOf('*==', i + 3);
      if (end !== -1) {
        segments.push({ text: text.slice(i + 3, end), bold: true, highlight: true });
        i = end + 3; continue;
      }
    }
    if (text[i] === '=' && text[i + 1] === '=') {
      const end = text.indexOf('==', i + 2);
      if (end !== -1) {
        segments.push({ text: text.slice(i + 2, end), bold: false, highlight: true });
        i = end + 2; continue;
      }
    }
    if (text[i] === '*') {
      const end = text.indexOf('*', i + 1);
      if (end !== -1 && end > i + 1) {
        segments.push({ text: text.slice(i + 1, end), bold: true, highlight: false });
        i = end + 1; continue;
      }
    }
    let next = text.length;
    const nextBold = text.indexOf('*', i + 1);
    const nextHL = text.indexOf('==', i + 1);
    if (nextBold !== -1 && nextBold < next) next = nextBold;
    if (nextHL !== -1 && nextHL < next) next = nextHL;
    if (text[i] === '*' || (text[i] === '=' && text[i+1] === '=')) {
      segments.push({ text: text[i], bold: false, highlight: false });
      i++; continue;
    }
    segments.push({ text: text.slice(i, next), bold: false, highlight: false });
    i = next;
  }
  return segments;
}

function RichText({ text, style, highlightColor = "#f5d97a" }) {
  const segments = parseMarkers(text);
  return <span style={style}>{segments.map((seg, i) => {
    const s = {};
    if (seg.bold) s.fontWeight = 700;
    if (seg.highlight) { s.background = highlightColor + "55"; s.padding = "1px 3px"; s.borderRadius = 3; }
    return Object.keys(s).length ? <span key={i} style={s}>{seg.text}</span> : <span key={i}>{seg.text}</span>;
  })}</span>;
}

/* ═══ STYLES ═══ */
const LS = { color: "#9a9ab0", fontSize: 12, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 8 };
const pill = (on, acc) => ({ padding: "6px 14px", borderRadius: 20, border: on ? `2px solid ${acc}` : "1px solid #3a3a55", background: on ? acc + "20" : "#16162e", color: on ? acc : "#a0a0b8", fontSize: 12, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", fontWeight: on ? 600 : 400, transition: "all 0.15s" });
const actBtn = { padding: "10px 18px", background: "#252548", color: "#d0d0e0", border: "1px solid #404065", borderRadius: 10, fontSize: 13, fontFamily: "'DM Sans', sans-serif", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 };
const inputStyle = { width: "100%", background: "#111125", color: "#e8e6f0", border: "1px solid #333355", borderRadius: 8, padding: "10px 14px", fontSize: 14, fontFamily: "'DM Sans', sans-serif" };
const secTitle = (a) => ({ color: a, fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", marginBottom: 16, textTransform: "uppercase", letterSpacing: 1 });
const comboInputStyle = { width: 56, background: "#111125", border: "1px solid #333355", borderRadius: 8, textAlign: "center", fontSize: 14, fontWeight: 500, color: "#e8e6f0", padding: "6px 4px", fontFamily: "'DM Sans', sans-serif" };

/* ═══ COMBO CONTROL ═══ */
function ComboSlider({ label, value, min, max, step, unit, accent, onChange }) {
  return <div style={{ marginBottom: 2 }}>
    <label style={{ ...LS, marginBottom: 6 }}>{label}</label>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: accent }} />
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= min && v <= max) onChange(v); }}
        style={comboInputStyle} />
      {unit && <span style={{ color: "#9a9ab0", fontSize: 12, minWidth: 18 }}>{unit}</span>}
    </div>
  </div>;
}

/* ═══ DECORATION ═══ */
function Decoration({ style, accent, bg, fg, size = 320 }) {
  const s = size / 320;
  if (style === "ruled-paper") return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(transparent, transparent 31px, #c8dae8 31px, #c8dae8 32px)", opacity: 0.4 }} />
    <div style={{ position: "absolute", left: 48 * s, top: 0, bottom: 0, width: 1, background: "#e8a0a0", opacity: 0.5 }} />
    <div style={{ position: "absolute", left: 52 * s, top: 0, bottom: 0, width: 1, background: "#e8a0a0", opacity: 0.3 }} />
  </div>;
  if (style === "underline-accent") return <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}><div style={{ position: "absolute", bottom: 24, left: 24, width: 50, height: 3, background: accent, opacity: 0.5, borderRadius: 2 }} /></div>;
  if (style === "text-box") return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #3a7a5a 0%, #1a3a2a 100%)" }} />
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.15)" }} />
  </div>;
  if (style === "gradient-circles") return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, #667eea 0%, #e94560 100%)" }} />
    <div style={{ position: "absolute", top: 20, right: 20, width: 60 * s, height: 60 * s, border: "2px solid rgba(255,255,255,0.15)", borderRadius: "50%" }} />
    <div style={{ position: "absolute", bottom: 30, left: 20, width: 40 * s, height: 40 * s, border: "2px solid rgba(255,255,255,0.1)", borderRadius: "50%" }} />
  </div>;
  if (style === "magazine-bar") return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <div style={{ position: "absolute", top: 0, left: 0, width: 6, height: "100%", background: accent }} />
    <div style={{ position: "absolute", bottom: 20, left: 16, width: 30, height: 1, background: "#ddd" }} />
  </div>;
  if (style === "thin-lines") return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <div style={{ position: "absolute", top: 30, left: "10%", right: "10%", height: 1, background: "#e0e0e0" }} />
    <div style={{ position: "absolute", bottom: 30, left: "10%", right: "10%", height: 1, background: "#e0e0e0" }} />
  </div>;
  if (style === "chalk-border") return <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
    <div style={{ position: "absolute", inset: 6, border: "1px dashed rgba(255,255,255,0.08)", borderRadius: 2 }} />
    <div style={{ position: "absolute", top: 15, left: 15, width: 18, height: 18, borderRadius: "50%", background: "rgba(255,200,50,0.15)" }} />
  </div>;
  if (style === "corner-glow") return <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}><div style={{ position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%", background: accent, opacity: 0.12, filter: "blur(50px)" }} /></div>;
  return null;
}

/* ═══ SLIDE CARD ═══ */
const CROP_POS_MAP = { center: "center", top: "top", bottom: "bottom", left: "left", right: "right" };
function SlideCard({ text, template, fontSize, headingFontSize, slideNum, total, size = 320, ratio = "1:1", bgImage, bgColor, overlayColor, overlayOpacity, slideImage, imagePos, imageCrop, imageMode, headingColor, bodyColor, watermark, globalStyle }) {
  const ratioObj = RATIOS[ratio] || RATIOS["1:1"];
  const cardW = size;
  const cardH = Math.round(size * (ratioObj.h / ratioObj.w));
  const lines = text.split("\n");
  const hasHeadingMark = lines[0]?.startsWith("# ");
  const heading = hasHeadingMark ? lines[0].slice(2) : "";
  const bodyLines = hasHeadingMark ? lines.slice(1) : lines;
  const body = bodyLines.join("\n").trim();
  const gFontWeight = globalStyle?.fontWeight || 400;
  const gLineHeight = globalStyle?.lineHeight || 1.55;
  const gLetterSpacing = globalStyle?.letterSpacing || 0;
  const highlightColor = globalStyle?.highlightColor || "#f5d97a";
  const fs = fontSize || globalStyle?.bodySize || calcFontSize(text);
  const hs = headingFontSize || globalStyle?.headingSize || Math.round(fs * 1.35);
  const pad = size * 0.08; const hasBg = !!bgImage;
  const isStory = template.decorStyle === "text-box";
  const isGradient = template.decorStyle === "gradient-circles";
  const actualBg = bgColor || template.bg;
  const hColor = headingColor || (hasBg ? template.fg : template.accent);
  const bColor = bodyColor || template.fg;
  const cropPos = imageCrop || "center";
  const dispMode = imageMode || "fill";
  const objFit = dispMode === "fit" ? "contain" : "cover";
  const objPos = CROP_POS_MAP[cropPos] || "center";
  const imgBg = dispMode === "fit" ? (bgColor || template.bg) : "transparent";
  const imgEl = slideImage ? <div style={{ borderRadius: 8, overflow: "hidden", maxHeight: cardH * 0.35, display: "flex", background: imgBg }}><img src={slideImage} alt="" style={{ width: "100%", height: "100%", objectFit: objFit, objectPosition: objPos, borderRadius: 8 }} /></div> : null;

  const renderContent = () => {
    const tbOn = globalStyle?.textBoxEnabled || (isStory && !hasBg);
    const tbColor = globalStyle?.textBoxColor || "#ffffff";
    const tbOpacity = globalStyle?.textBoxOpacity ?? 0.9;
    const tbBodyOpacity = Math.max(0, tbOpacity - 0.05);
    const hexToRgbaLocal = (hex, a) => { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; };
    const hBoxBg = hexToRgbaLocal(tbColor, tbOpacity);
    const bBoxBg = hexToRgbaLocal(tbColor, tbBodyOpacity);
    const tbTextColor = "#1a1a1a";
    const tbBodyTextColor = "#333333";
    const effectiveHColor = tbOn ? (headingColor || tbTextColor) : hColor;
    const effectiveBColor = tbOn ? (bodyColor || tbBodyTextColor) : bColor;
    const leftPadding = template.decorStyle === "ruled-paper" ? pad + 20 : template.decorStyle === "magazine-bar" ? pad + 10 : pad;

    return <div style={{ position: "relative", zIndex: 1, padding: pad, display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, gap: 8, paddingLeft: leftPadding }}>
      {imagePos === "top" && imgEl}
      {template.decorStyle === "thin-lines" && heading && !tbOn && <div style={{ width: 40, height: 3, background: hColor, borderRadius: 2, marginBottom: 4 }} />}
      {heading && (tbOn
        ? <div style={{ background: hBoxBg, padding: "12px 16px", borderRadius: 4, alignSelf: "flex-start" }}>
            <RichText text={heading} highlightColor={highlightColor} style={{ fontFamily: template.headingFont, fontSize: hs, fontWeight: 700, color: effectiveHColor, lineHeight: 1.3, letterSpacing: gLetterSpacing }} />
          </div>
        : <div style={{ fontFamily: template.headingFont, fontSize: hs, fontWeight: 700, lineHeight: 1.2, color: hColor, letterSpacing: isGradient ? 1 : gLetterSpacing, textTransform: isGradient ? "uppercase" : "none" }}>
            <RichText text={heading} highlightColor={highlightColor} style={{}} />
          </div>
      )}
      {imagePos === "middle" && imgEl}
      {body && (tbOn
        ? <div style={{ background: bBoxBg, padding: "10px 14px", borderRadius: 4, alignSelf: "flex-start" }}>
            <RichText text={body} highlightColor={highlightColor} style={{ fontFamily: template.bodyFont, fontSize: fs, fontWeight: gFontWeight, color: effectiveBColor, lineHeight: gLineHeight, whiteSpace: "pre-wrap", letterSpacing: gLetterSpacing }} />
          </div>
        : <div style={{ fontFamily: template.bodyFont, fontSize: fs, fontWeight: gFontWeight, lineHeight: gLineHeight, opacity: 0.88, whiteSpace: "pre-wrap", color: bColor, letterSpacing: gLetterSpacing }}>
            <RichText text={body} highlightColor={highlightColor} style={{}} />
          </div>
      )}
      {(!imagePos || imagePos === "bottom") && imgEl}
    </div>;
  };

  const renderWatermark = () => {
    if (!watermark?.enabled || (!watermark.logo && !watermark.username)) return null;
    const p = watermark.position || "bottom-right";
    const wmFontSize = watermark.fontSize || 9;
    const wmLogoSize = wmFontSize * 2;
    let ps;
    if (p === "center-top") {
      ps = { top: 8, left: "50%", transform: "translateX(-50%)" };
    } else if (p === "center-bottom") {
      ps = { bottom: 8, left: "50%", transform: "translateX(-50%)" };
    } else {
      ps = { "top-left": { top: 8, left: 10 }, "top-right": { top: 8, right: 10 }, "bottom-left": { bottom: 8, left: 10 }, "bottom-right": { bottom: 8, right: 10 } }[p];
    }
    return <div style={{ position: "absolute", ...ps, zIndex: 5, display: "flex", alignItems: "center", gap: 5, opacity: watermark.opacity ?? 0.5 }}>
      {watermark.logo && <img src={watermark.logo} alt="" style={{ width: wmLogoSize, height: wmLogoSize, borderRadius: 4, objectFit: "cover" }} />}
      {watermark.username && <span style={{ fontSize: wmFontSize, fontFamily: template.bodyFont, color: template.fg, fontWeight: 600 }}>{watermark.username}</span>}
    </div>;
  };

  return (
    <div style={{ width: cardW, height: cardH, background: (isGradient && !hasBg) ? "transparent" : actualBg, color: bColor, borderRadius: 12, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden", flexShrink: 0, boxShadow: `0 4px 24px rgba(0,0,0,0.15)` }}>
      {hasBg && <div style={{ position: "absolute", inset: 0, backgroundImage: `url(${bgImage})`, backgroundSize: "cover", backgroundPosition: "center" }} />}
      {hasBg && <div style={{ position: "absolute", inset: 0, background: overlayColor || template.accent, opacity: overlayOpacity ?? 0.5 }} />}
      {!hasBg && <Decoration style={template.decorStyle} accent={template.accent} bg={template.bg} fg={template.fg} size={cardW} />}
      {renderContent()}
      {renderWatermark()}
      {(globalStyle?.paginationEnabled !== false) && (() => {
        const pp = globalStyle?.paginationPosition || "bottom-right";
        const pSize = globalStyle?.paginationSize || 11;
        const posStyle = { "top-left": { top: 10, left: 14 }, "top-right": { top: 10, right: 14 }, "bottom-left": { bottom: 10, left: 14 }, "bottom-right": { bottom: 10, right: 14 } }[pp] || { bottom: 10, right: 14 };
        return <div style={{ position: "absolute", ...posStyle, fontSize: pSize, opacity: 0.3, fontFamily: template.bodyFont, zIndex: 2, color: isGradient ? "#fff" : undefined }}>{slideNum}/{total}</div>;
      })()}
    </div>
  );
}

/* ═══ BOTTOM SHEET ═══ */
function BottomSheet({ open, onClose, children, title }) {
  if (!open) return null;
  return <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
    <div onClick={onClose} style={{ flex: 1, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(2px)" }} />
    <div style={{ background: "#1a1a2e", borderRadius: "20px 20px 0 0", padding: "20px 24px 32px", maxHeight: "80vh", overflowY: "auto", animation: "sheetUp 0.25s ease-out" }}>
      <div style={{ width: 40, height: 4, background: "#444", borderRadius: 4, margin: "0 auto 16px" }} />
      {title && <div style={{ fontSize: 16, fontWeight: 700, color: "#e8e6f0", marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>{title}</div>}
      {children}
    </div>
  </div>;
}
function ColorRow({ label, value, defaultVal, onChange, onReset }) {
  return <div><label style={LS}>{label}</label><div style={{ display: "flex", alignItems: "center", gap: 12 }}><input type="color" value={value || defaultVal} onChange={e => onChange(e.target.value)} style={{ width: 40, height: 40, borderRadius: 8, background: "none", padding: 0, border: "none", cursor: "pointer" }} /><span style={{ color: "#a0a0b8", fontSize: 12, fontFamily: "'DM Sans', sans-serif" }}>{value || defaultVal}</span>{value && <button onClick={onReset} style={{ background: "none", border: "1px solid #3a3a55", borderRadius: 6, color: "#a0a0b8", fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Reset</button>}</div></div>;
}
function FontSelect({ label, value, onChange }) {
  return <div><label style={LS}>{label}</label><select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: "pointer", appearance: "auto" }}>{FONT_OPTIONS.map(f => <option key={f} value={f}>{fontLabel(f)}</option>)}</select></div>;
}

const globalCSS = `
  @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideIn { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0c0c18; overflow-x: hidden; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }
  textarea:focus, input:focus, select:focus { outline: none; }
  input[type="color"] { -webkit-appearance: none; border: none; cursor: pointer; }
  input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
  input[type="color"]::-webkit-color-swatch { border: none; border-radius: 6px; }
  input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input[type="number"] { -moz-appearance: textfield; }
`;

/* ═══════════════════ MAIN APP ═══════════════════ */
export default function CarouselForge() {
  const [screen, setScreen] = useState("write");
  const [rawContent, setRawContent] = useState("");
  const [slideOverrides, setSlideOverrides] = useState({});
  const [editingSlide, setEditingSlide] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const touchStart = useRef(null);

  const [customTemplates, setCustomTemplates] = useState(() => lsGet("cf_custom_templates", []));
  const allTemplates = useMemo(() => [...BUILTIN_TEMPLATES, ...customTemplates], [customTemplates]);
  const [template, setTemplate] = useState(BUILTIN_TEMPLATES[0]);
  const [brandKits, setBrandKits] = useState(() => lsGet("cf_brand_kits", []));
  const [activeBrandKit, setActiveBrandKit] = useState(() => lsGet("cf_active_brand_kit", null));
  const effectiveTemplate = useMemo(() => {
    if (!activeBrandKit) return template;
    const bk = brandKits.find(b => b.id === activeBrandKit);
    if (!bk) return template;
    return { ...template, ...(bk.accent && { accent: bk.accent }), ...(bk.bg && { bg: bk.bg }), ...(bk.fg && { fg: bk.fg }), ...(bk.headingFont && { headingFont: bk.headingFont }), ...(bk.bodyFont && { bodyFont: bk.bodyFont }) };
  }, [template, activeBrandKit, brandKits]);

  const [bgMode, setBgMode] = useState("none");
  const [bgImageAll, setBgImageAll] = useState(null);
  const [bgImagesPerSlide, setBgImagesPerSlide] = useState({});
  const [bgColor, setBgColor] = useState(null);
  const [overlayColor, setOverlayColor] = useState(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [globalHeadingColor, setGlobalHeadingColor] = useState(null);
  const [globalBodyColor, setGlobalBodyColor] = useState(null);
  const [slideHeadingColors, setSlideHeadingColors] = useState({});
  const [slideBodyColors, setSlideBodyColors] = useState({});
  const [slideImages, setSlideImages] = useState({});
  const [slideImagePos, setSlideImagePos] = useState({});
  const [watermark, setWatermark] = useState({ enabled: false, logo: null, username: "", position: "bottom-right", opacity: 0.5, fontSize: 9 });
  const [slideOrder, setSlideOrder] = useState(null);
  const [showStyleSheet, setShowStyleSheet] = useState(false);
  const [showWmSheet, setShowWmSheet] = useState(false);
  const [showBrandKit, setShowBrandKit] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [showExportSheet, setShowExportSheet] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [editingBK, setEditingBK] = useState(null);
  const [exportProgress, setExportProgress] = useState(null);
  const [selectedRatios, setSelectedRatios] = useState(["1:1"]);

  // Global typography controls
  const [globalHeadingFont, setGlobalHeadingFont] = useState(null);
  const [globalBodyFont, setGlobalBodyFont] = useState(null);
  const [globalHeadingSize, setGlobalHeadingSize] = useState(null);
  const [globalBodySize, setGlobalBodySize] = useState(null);
  const [globalFontWeight, setGlobalFontWeight] = useState(400);
  const [globalLineHeight, setGlobalLineHeight] = useState(1.55);
  const [globalLetterSpacing, setGlobalLetterSpacing] = useState(0);
  const [highlightColor, setHighlightColor] = useState("#f5d97a");
  const [previewRatio, setPreviewRatio] = useState("1:1");
  const [slideImageCrop, setSlideImageCrop] = useState({});
  const [slideImageMode, setSlideImageMode] = useState({});

  // Text Box
  const [textBoxEnabled, setTextBoxEnabled] = useState(false);
  const [textBoxColor, setTextBoxColor] = useState("#ffffff");
  const [textBoxOpacity, setTextBoxOpacity] = useState(0.9);

  // Pagination
  const [paginationEnabled, setPaginationEnabled] = useState(true);
  const [paginationPosition, setPaginationPosition] = useState("bottom-right");
  const [paginationSize, setPaginationSize] = useState(11);


  const effectiveTemplateWithFonts = useMemo(() => {
    let et = effectiveTemplate;
    if (globalHeadingFont) et = { ...et, headingFont: globalHeadingFont };
    if (globalBodyFont) et = { ...et, bodyFont: globalBodyFont };
    return et;
  }, [effectiveTemplate, globalHeadingFont, globalBodyFont]);

  useEffect(() => { loadGoogleFonts(effectiveTemplateWithFonts); }, [effectiveTemplateWithFonts]);
  useEffect(() => { lsSet("cf_custom_templates", customTemplates); }, [customTemplates]);
  useEffect(() => { lsSet("cf_brand_kits", brandKits); }, [brandKits]);
  useEffect(() => { lsSet("cf_active_brand_kit", activeBrandKit); }, [activeBrandKit]);

  const parsedSlides = useMemo(() => parseSlides(rawContent), [rawContent]);
  const orderedIndices = useMemo(() => slideOrder || parsedSlides.map((_, i) => i), [slideOrder, parsedSlides]);
  const slides = useMemo(() => orderedIndices.map(i => ({ text: slideOverrides[i]?.text ?? (parsedSlides[i] || ""), fontSize: slideOverrides[i]?.fontSize ?? null, headingFontSize: slideOverrides[i]?.headingFontSize ?? null, origIdx: i })), [parsedSlides, slideOverrides, orderedIndices]);

  const prevCount = useRef(0);
  useEffect(() => { const c = parsedSlides.length; if (c !== prevCount.current) { setSlideOverrides({}); setSlideOrder(null); prevCount.current = c; } }, [parsedSlides]);

  const t = effectiveTemplateWithFonts;
  const globalStyle = useMemo(() => ({
    headingSize: globalHeadingSize,
    bodySize: globalBodySize,
    fontWeight: globalFontWeight,
    lineHeight: globalLineHeight,
    letterSpacing: globalLetterSpacing,
    highlightColor,
    textBoxEnabled,
    textBoxColor,
    textBoxOpacity,
    paginationEnabled,
    paginationPosition,
    paginationSize,
  }), [globalHeadingSize, globalBodySize, globalFontWeight, globalLineHeight, globalLetterSpacing, highlightColor, textBoxEnabled, textBoxColor, textBoxOpacity, paginationEnabled, paginationPosition, paginationSize]);

  const getBg = (i) => bgMode === "all" ? bgImageAll : bgMode === "per-slide" ? (bgImagesPerSlide[i] || null) : null;
  const getHColor = (i) => slideHeadingColors[i] || globalHeadingColor;
  const getBColor = (i) => slideBodyColors[i] || globalBodyColor;
  const onTouch = (type, e) => { if (type === "s") { touchStart.current = e.touches[0].clientX; return; } if (touchStart.current === null) return; const d = touchStart.current - e.changedTouches[0].clientX; if (Math.abs(d) > 50) { if (d > 0 && previewIndex < slides.length - 1) setPreviewIndex(i => i + 1); else if (d < 0 && previewIndex > 0) setPreviewIndex(i => i - 1); } touchStart.current = null; };
  const slideSize = typeof window !== "undefined" ? Math.min(340, window.innerWidth - 60) : 340;

  /* ── Export ── */
  const stripMarkers = (text) => text.replace(/\*==|==\*|\*|==/g, "");

  const wrapText = (ctx, text, maxW) => { const words = text.split(" "); const lines = []; let line = ""; for (const w of words) { const test = line ? line + " " + w : w; if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test; } if (line) lines.push(line); return lines; };

  const wrapTextRich = (ctx, text, maxW, baseFontStr, boldFontStr) => {
    const segments = parseMarkers(text);
    const result = [];
    let currentLine = [];
    let currentWidth = 0;

    for (const seg of segments) {
      const words = seg.text.split(" ");
      const fontStr = seg.bold ? boldFontStr : baseFontStr;
      ctx.font = fontStr;

      for (let wi = 0; wi < words.length; wi++) {
        const word = words[wi];
        const prefix = (currentLine.length > 0 || currentWidth > 0) && wi === 0 && currentWidth > 0 ? " " : (wi > 0 ? " " : "");
        const testStr = prefix + word;
        const testW = ctx.measureText(testStr).width;

        if (currentWidth + testW > maxW && currentWidth > 0) {
          result.push([...currentLine]);
          currentLine = [{ text: word, bold: seg.bold, highlight: seg.highlight }];
          ctx.font = fontStr;
          currentWidth = ctx.measureText(word).width;
        } else {
          currentLine.push({ text: (currentWidth > 0 && wi === 0 ? " " : (wi > 0 ? " " : "")) + word, bold: seg.bold, highlight: seg.highlight });
          currentWidth += testW;
        }
      }
    }
    if (currentLine.length) result.push(currentLine);
    return result;
  };

  const drawRichLine = (ctx, lineSegs, x, y, baseFontStr, boldFontStr, color, hlColor, scale) => {
    let cx = x;
    for (const seg of lineSegs) {
      ctx.font = seg.bold ? boldFontStr : baseFontStr;
      const w = ctx.measureText(seg.text).width;
      if (seg.highlight) {
        ctx.fillStyle = hlColor + "55";
        const metrics = ctx.measureText(seg.text);
        const textH = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        ctx.fillRect(cx - 2 * scale, y - metrics.actualBoundingBoxAscent - 2 * scale, w + 4 * scale, textH + 4 * scale);
      }
      ctx.fillStyle = color;
      ctx.fillText(seg.text, cx, y);
      cx += w;
    }
  };

  const loadImg = (src) => new Promise(r => { if (!src) { r(null); return; } const img = new window.Image(); img.crossOrigin = "anonymous"; img.onload = () => r(img); img.onerror = () => r(null); img.src = src; });
  const hexToRgba = (hex, a) => { if (!hex || hex[0] !== "#") return `rgba(0,0,0,${a})`; const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; };

  const renderSlideToBlob = async (slide, origIdx, displayIdx, w, h) => {
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d"); const scale = w / 340;
    const fs = slide.fontSize || globalStyle.bodySize || calcFontSize(slide.text);
    const slideHS = slide.headingFontSize || globalStyle.headingSize;
    const hs = slideHS ? Math.round(slideHS * scale) : Math.round(fs * 1.35 * scale);
    const bfs = Math.round(fs * scale);
    const fontWeight = globalStyle.fontWeight || 400;
    const lineHeight = globalStyle.lineHeight || 1.55;
    const letterSpacing = globalStyle.letterSpacing || 0;
    const hlColor = globalStyle.highlightColor || "#f5d97a";
    const pad = Math.round(w * 0.08); const contentW = w - pad * 2;
    const hasBgImg = !!getBg(origIdx); const actualBg = bgColor || t.bg;
    const hColor = getHColor(origIdx) || (hasBgImg ? t.fg : t.accent); const bColor = getBColor(origIdx) || t.fg;
    const lines = slide.text.split("\n");
    const hasHeadingMark = lines[0]?.startsWith("# ");
    const heading = hasHeadingMark ? lines[0].slice(2) : "";
    const bodyLines = hasHeadingMark ? lines.slice(1) : lines;
    const body = bodyLines.join("\n").trim();
    const hFont = fontLabel(t.headingFont); const bFont = fontLabel(t.bodyFont);

    const baseFontStr = `${fontWeight} ${bfs}px ${bFont}, sans-serif`;
    const boldFontStr = `700 ${bfs}px ${bFont}, sans-serif`;
    const headingBaseFontStr = `700 ${hs}px ${hFont}, sans-serif`;
    const headingBoldFontStr = `700 ${hs}px ${hFont}, sans-serif`;

    // Background
    if (t.decorStyle === "gradient-circles" && !hasBgImg) {
      const grd = ctx.createLinearGradient(0, 0, w, h); grd.addColorStop(0, "#667eea"); grd.addColorStop(1, "#e94560"); ctx.fillStyle = grd;
    } else { ctx.fillStyle = actualBg; }
    ctx.fillRect(0, 0, w, h);

    const bgImg = await loadImg(getBg(origIdx));
    if (bgImg) { const ir = bgImg.width / bgImg.height; const cr = w / h; let sw, sh, sx, sy; if (ir > cr) { sh = bgImg.height; sw = sh * cr; sx = (bgImg.width - sw) / 2; sy = 0; } else { sw = bgImg.width; sh = sw / cr; sx = 0; sy = (bgImg.height - sh) / 2; } ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, w, h); ctx.fillStyle = hexToRgba(overlayColor || t.accent, overlayOpacity); ctx.fillRect(0, 0, w, h); }

    // Decorations
    if (!hasBgImg) {
      const ds = t.decorStyle;
      if (ds === "ruled-paper") { ctx.strokeStyle = "rgba(200,218,232,0.4)"; ctx.lineWidth = 1; for (let y = 32 * scale; y < h; y += 32 * scale) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); } ctx.strokeStyle = "rgba(232,160,160,0.5)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(48 * scale, 0); ctx.lineTo(48 * scale, h); ctx.stroke(); }
      else if (ds === "gradient-circles") { ctx.strokeStyle = "rgba(255,255,255,0.15)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(w - 50 * scale, 50 * scale, 30 * scale, 0, Math.PI * 2); ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,0.1)"; ctx.beginPath(); ctx.arc(40 * scale, h - 50 * scale, 20 * scale, 0, Math.PI * 2); ctx.stroke(); }
      else if (ds === "magazine-bar") { ctx.fillStyle = t.accent; ctx.fillRect(0, 0, 6 * scale, h); }
      else if (ds === "thin-lines") { ctx.strokeStyle = "#e0e0e0"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(w * 0.1, 30 * scale); ctx.lineTo(w * 0.9, 30 * scale); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w * 0.1, h - 30 * scale); ctx.lineTo(w * 0.9, h - 30 * scale); ctx.stroke(); }
      else if (ds === "chalk-border") { ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.setLineDash([8, 4]); ctx.strokeRect(6 * scale, 6 * scale, w - 12 * scale, h - 12 * scale); ctx.setLineDash([]); }
      else if (ds === "underline-accent") { ctx.fillStyle = hexToRgba(t.accent, 0.5); ctx.fillRect(24 * scale, h - 27 * scale, 50 * scale, 3 * scale); }
    }

    // Content
    const sImg = await loadImg(slideImages[origIdx]);
    const iPos = slideImagePos[origIdx] || "bottom";
    const iCrop = slideImageCrop[origIdx] || "center";
    const iMode = slideImageMode[origIdx] || "fill";
    const maxImgH = h * 0.3;
    const leftPad = (!hasBgImg && (t.decorStyle === "ruled-paper")) ? pad + 20 * scale : (!hasBgImg && t.decorStyle === "magazine-bar") ? pad + 10 * scale : pad;

    ctx.font = headingBaseFontStr;
    const headingClean = stripMarkers(heading);
    const headingLines = heading ? wrapText(ctx, headingClean, w - leftPad - pad) : [];
    const headingRichLines = heading ? wrapTextRich(ctx, heading, w - leftPad - pad, headingBaseFontStr, headingBoldFontStr) : [];

    ctx.font = baseFontStr;
    const bodyRichLines = [];
    const bodyPlainLines = [];
    if (body) {
      body.split("\n").forEach(p => {
        const wr = wrapTextRich(ctx, p, w - leftPad - pad, baseFontStr, boldFontStr);
        if (!wr.length) { bodyRichLines.push([]); bodyPlainLines.push(""); }
        else wr.forEach(l => { bodyRichLines.push(l); bodyPlainLines.push(l.map(s => s.text).join("")); });
      });
    }

    const headingH = headingRichLines.length * hs * 1.2;
    const bodyH = bodyRichLines.length * bfs * lineHeight;
    const imgH = sImg ? Math.min(maxImgH, (sImg.height / sImg.width) * (w - leftPad - pad)) : 0;
    const gap = 12 * scale;
    const totalH = headingH + (bodyH ? gap + bodyH : 0) + (imgH ? gap + imgH : 0);
    let y = Math.max(pad, (h - totalH) / 2);

    const drawImg = () => {
      if (!sImg) return;
      const dw = w - leftPad - pad;
      const dh = Math.min(maxImgH, (sImg.height / sImg.width) * dw);
      ctx.save();
      ctx.beginPath(); ctx.roundRect(leftPad, y, dw, dh, 8 * scale); ctx.clip();
      if (iMode === "fit") {
        // Fill background behind image
        ctx.fillStyle = actualBg;
        ctx.fillRect(leftPad, y, dw, dh);
        // Fit: scale image to fit entirely within dw x dh
        const imgAR = sImg.width / sImg.height;
        const frameAR = dw / dh;
        let drawW, drawH;
        if (imgAR > frameAR) { drawW = dw; drawH = dw / imgAR; }
        else { drawH = dh; drawW = dh * imgAR; }
        const dx = leftPad + (dw - drawW) / 2;
        const dy = y + (dh - drawH) / 2;
        ctx.drawImage(sImg, dx, dy, drawW, drawH);
      } else {
        // Fill/cover: crop source to match destination aspect ratio
        const imgAR = sImg.width / sImg.height;
        const frameAR = dw / dh;
        let sx, sy, sw, sh;
        if (imgAR > frameAR) {
          sh = sImg.height; sw = sh * frameAR;
          sy = 0;
          if (iCrop === "left") sx = 0;
          else if (iCrop === "right") sx = sImg.width - sw;
          else sx = (sImg.width - sw) / 2;
        } else {
          sw = sImg.width; sh = sw / frameAR;
          sx = 0;
          if (iCrop === "top") sy = 0;
          else if (iCrop === "bottom") sy = sImg.height - sh;
          else sy = (sImg.height - sh) / 2;
        }
        ctx.drawImage(sImg, sx, sy, sw, sh, leftPad, y, dw, dh);
      }
      ctx.restore();
      y += dh + gap;
    };
    const tbOn = globalStyle.textBoxEnabled || (t.decorStyle === "text-box" && !hasBgImg);
    const tbColor = globalStyle.textBoxColor || "#ffffff";
    const tbOpacity = globalStyle.textBoxOpacity ?? 0.9;
    const tbBodyOpacity = Math.max(0, tbOpacity - 0.05);
    const tbHColor = getHColor(origIdx) || "#1a1a1a";
    const tbBColor = getBColor(origIdx) || "#333333";

    const drawHeading = () => {
      if (!headingRichLines.length) return;
      if (tbOn) {
        const bh = headingRichLines.length * hs * 1.2 + 24 * scale;
        ctx.fillStyle = hexToRgba(tbColor, tbOpacity); ctx.beginPath(); ctx.roundRect(leftPad, y - 12 * scale, w - leftPad - pad, bh, 4 * scale); ctx.fill();
        headingRichLines.forEach(lineSegs => { y += hs; drawRichLine(ctx, lineSegs, leftPad, y, headingBaseFontStr, headingBoldFontStr, tbHColor, hlColor, scale); });
      } else {
        headingRichLines.forEach(lineSegs => { y += hs; drawRichLine(ctx, lineSegs, leftPad, y, headingBaseFontStr, headingBoldFontStr, hColor, hlColor, scale); });
      }
      y += gap;
    };
    const drawBody = () => {
      if (!bodyRichLines.length) return;
      if (tbOn) {
        const bh = bodyRichLines.length * bfs * lineHeight + 20 * scale;
        ctx.fillStyle = hexToRgba(tbColor, tbBodyOpacity); ctx.beginPath(); ctx.roundRect(leftPad, y - 10 * scale, w - leftPad - pad, bh, 4 * scale); ctx.fill();
        ctx.globalAlpha = 0.88;
        bodyRichLines.forEach(lineSegs => { y += bfs * lineHeight; drawRichLine(ctx, lineSegs, leftPad, y, baseFontStr, boldFontStr, tbBColor, hlColor, scale); });
      } else {
        ctx.globalAlpha = 0.88;
        bodyRichLines.forEach(lineSegs => { y += bfs * lineHeight; drawRichLine(ctx, lineSegs, leftPad, y, baseFontStr, boldFontStr, bColor, hlColor, scale); });
      }
      ctx.globalAlpha = 1;
    };

    if (iPos === "top") { drawImg(); drawHeading(); drawBody(); }
    else if (iPos === "middle") { drawHeading(); drawImg(); drawBody(); }
    else { drawHeading(); drawBody(); drawImg(); }

    // Watermark
    if (watermark?.enabled && (watermark.logo || watermark.username)) {
      ctx.globalAlpha = watermark.opacity ?? 0.5;
      const wmLogo = await loadImg(watermark.logo);
      const pos = watermark.position || "bottom-right";
      const wmFontSize = (watermark.fontSize || 9) * scale;
      const wmS = wmFontSize * 2;
      const wmPX = 20 * scale; const wmPY = 16 * scale;

      if (pos === "center-top" || pos === "center-bottom") {
        let wmX = w / 2;
        let wmY = pos === "center-top" ? wmPY + wmS : h - wmPY;
        ctx.textAlign = "center";
        if (wmLogo) {
          const lx = wmX - wmS / 2 - (watermark.username ? ctx.measureText(watermark.username).width / 2 + 4 * scale : 0);
          const ly = pos === "center-top" ? wmPY : h - wmPY - wmS;
          ctx.drawImage(wmLogo, lx, ly, wmS, wmS);
          if (watermark.username) { ctx.fillStyle = t.fg; ctx.font = `600 ${wmFontSize}px ${bFont}, sans-serif`; ctx.fillText(watermark.username, wmX + wmS / 2, ly + wmS / 2 + wmFontSize / 3); }
        } else if (watermark.username) {
          ctx.fillStyle = t.fg; ctx.font = `600 ${wmFontSize}px ${bFont}, sans-serif`;
          ctx.fillText(watermark.username, wmX, wmY);
        }
        ctx.textAlign = "left";
      } else {
        let wmX = pos.includes("right") ? w - wmPX : wmPX;
        let wmY = pos.includes("bottom") ? h - wmPY : wmPY + wmS;
        if (wmLogo) {
          const lx = pos.includes("right") ? wmX - wmS : wmX;
          const ly = pos.includes("bottom") ? wmY - wmS : wmY - wmS;
          ctx.drawImage(wmLogo, lx, ly, wmS, wmS);
          if (watermark.username) { ctx.fillStyle = t.fg; ctx.font = `600 ${wmFontSize}px ${bFont}, sans-serif`; const tx = pos.includes("right") ? lx - 8 * scale : wmX + wmS + 8 * scale; ctx.textAlign = pos.includes("right") ? "right" : "left"; ctx.fillText(watermark.username, tx, ly + wmS / 2 + wmFontSize / 3); ctx.textAlign = "left"; }
        } else if (watermark.username) { ctx.fillStyle = t.fg; ctx.font = `600 ${wmFontSize}px ${bFont}, sans-serif`; ctx.textAlign = pos.includes("right") ? "right" : "left"; ctx.fillText(watermark.username, wmX, wmY - wmS / 2 + wmFontSize / 3); ctx.textAlign = "left"; }
      }
      ctx.globalAlpha = 1;
    }

    // Pagination
    if (globalStyle.paginationEnabled !== false) {
      const pp = globalStyle.paginationPosition || "bottom-right";
      const numSize = (globalStyle.paginationSize || 11) * scale;
      ctx.globalAlpha = 0.3; ctx.fillStyle = t.decorStyle === "gradient-circles" ? "#fff" : t.fg; ctx.font = `${numSize}px ${bFont}, sans-serif`;
      const pagText = `${displayIdx + 1}/${slides.length}`;
      if (pp.includes("right")) { ctx.textAlign = "right"; ctx.fillText(pagText, w - 22 * scale, pp.includes("top") ? 22 * scale + numSize : h - 16 * scale); }
      else { ctx.textAlign = "left"; ctx.fillText(pagText, 22 * scale, pp.includes("top") ? 22 * scale + numSize : h - 16 * scale); }
      ctx.textAlign = "left"; ctx.globalAlpha = 1;
    }

    return new Promise(r => canvas.toBlob(r, "image/png"));
  };

  const exportSlides = async () => {
    const ratios = selectedRatios; const totalFiles = slides.length * ratios.length;
    setExportProgress({ current: 0, total: totalFiles, done: false }); const files = []; let count = 0;
    for (const ratio of ratios) { const { w, h } = RATIOS[ratio]; for (let si = 0; si < slides.length; si++) { const slide = slides[si]; const blob = await renderSlideToBlob(slide, slide.origIdx, si, w, h); files.push({ name: `slide-${si + 1}_${ratio.replace(":", "x")}.png`, blob }); count++; setExportProgress({ current: count, total: totalFiles, done: false }); } }
    if (files.length === 1) { const url = URL.createObjectURL(files[0].blob); const a = document.createElement("a"); a.href = url; a.download = files[0].name; a.click(); URL.revokeObjectURL(url); }
    else { const zb = await createZip(files); const url = URL.createObjectURL(zb); const a = document.createElement("a"); a.href = url; a.download = "carousel-export.zip"; a.click(); URL.revokeObjectURL(url); }
    setExportProgress({ current: count, total: totalFiles, done: true }); setTimeout(() => setExportProgress(null), 2000);
  };

  /* ── BK helpers ── */
  const saveBK = (bk) => { setBrandKits(p => { const i = p.findIndex(b => b.id === bk.id); if (i >= 0) { const n = [...p]; n[i] = bk; return n; } return [...p, bk]; }); setEditingBK(null); };
  const deleteBK = (id) => { setBrandKits(p => p.filter(b => b.id !== id)); if (activeBrandKit === id) setActiveBrandKit(null); };
  const exportBKs = () => { const d = JSON.stringify({ brandKits, activeBrandKit }, null, 2); const b = new Blob([d], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "carouselforge-brandkit.json"; a.click(); URL.revokeObjectURL(u); };
  const importBKs = (e) => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = (ev) => { try { const d = JSON.parse(ev.target.result); if (d.brandKits) { setBrandKits(d.brandKits); setActiveBrandKit(d.activeBrandKit || null); } } catch {} }; r.readAsText(f); e.target.value = ""; };
  const saveCT = (ct) => { setCustomTemplates(p => { const i = p.findIndex(x => x.id === ct.id); if (i >= 0) { const n = [...p]; n[i] = ct; return n; } return [...p, ct]; }); setShowNewTemplate(false); };
  const deleteCT = (id) => { setCustomTemplates(p => p.filter(x => x.id !== id)); if (template.id === id) setTemplate(BUILTIN_TEMPLATES[0]); };
  const moveSlide = (from, to) => { const order = [...(slideOrder || parsedSlides.map((_, i) => i))]; const [item] = order.splice(from, 1); order.splice(to, 0, item); setSlideOrder(order); };

  const textareaRef = useRef(null);

  /* ════ SCREENS ════ */

  /* BK Panels */
  function BKPanel() { const iRef = useRef(null); if (editingBK) return <BKEditor key={editingBK.id} bk={editingBK} />; return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{!brandKits.length && <p style={{ color: "#777790", fontSize: 13 }}>No Brand Kits yet.</p>}{brandKits.map(bk => <div key={bk.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "#111125", borderRadius: 10, border: activeBrandKit === bk.id ? `2px solid ${bk.accent || t.accent}` : "1px solid #333355" }}><div style={{ display: "flex", gap: 4 }}>{[bk.bg, bk.accent, bk.fg].filter(Boolean).map((c, i) => <div key={i} style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid #444" }} />)}</div><span style={{ flex: 1, color: "#d0d0e0", fontSize: 13, fontWeight: 600 }}>{bk.name}</span><button onClick={() => setActiveBrandKit(activeBrandKit === bk.id ? null : bk.id)} style={{ ...pill(activeBrandKit === bk.id, t.accent), fontSize: 11, padding: "4px 10px" }}>{activeBrandKit === bk.id ? "Active" : "Use"}</button><button onClick={() => setEditingBK(bk)} style={{ background: "none", border: "none", color: "#9a9ab0", cursor: "pointer" }}><PenLine size={14} /></button><button onClick={() => deleteBK(bk.id)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}><Trash2 size={14} /></button></div>)}<button onClick={() => setEditingBK({ id: "bk_" + Date.now(), name: "", accent: t.accent, bg: "", fg: "", headingFont: "", bodyFont: "", logo: null })} style={{ ...actBtn, justifyContent: "center" }}><Plus size={14} /> New Brand Kit</button><div style={{ borderTop: "1px solid #333355", paddingTop: 16, display: "flex", gap: 10 }}><button onClick={exportBKs} disabled={!brandKits.length} style={{ ...actBtn, flex: 1, justifyContent: "center", opacity: brandKits.length ? 1 : 0.4 }}><Download size={14} /> Export</button><button onClick={() => iRef.current?.click()} style={{ ...actBtn, flex: 1, justifyContent: "center" }}><Upload size={14} /> Import</button><input ref={iRef} type="file" accept=".json" hidden onChange={importBKs} /></div></div>; }
  function BKEditor({ bk }) { const [f, sF] = useState({ ...bk }); const lRef = useRef(null); const u = (k, v) => sF(p => ({ ...p, [k]: v })); return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div><label style={LS}>Name</label><input value={f.name} onChange={e => u("name", e.target.value)} placeholder="My Brand" style={inputStyle} /></div><div style={{ display: "flex", gap: 16 }}><div style={{ flex: 1 }}><label style={LS}>Accent</label><input type="color" value={f.accent || "#7c6ef0"} onChange={e => u("accent", e.target.value)} style={{ width: 48, height: 48, borderRadius: 8 }} /></div><div style={{ flex: 1 }}><label style={LS}>BG</label><input type="color" value={f.bg || "#0f0f1a"} onChange={e => u("bg", e.target.value)} style={{ width: 48, height: 48, borderRadius: 8 }} /></div><div style={{ flex: 1 }}><label style={LS}>Text</label><input type="color" value={f.fg || "#e8e6f0"} onChange={e => u("fg", e.target.value)} style={{ width: 48, height: 48, borderRadius: 8 }} /></div></div><FontSelect label="Heading Font" value={f.headingFont || FONT_OPTIONS[0]} onChange={v => u("headingFont", v)} /><FontSelect label="Body Font" value={f.bodyFont || FONT_OPTIONS[5]} onChange={v => u("bodyFont", v)} /><div><label style={LS}>Logo</label>{f.logo ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src={f.logo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} /><button onClick={() => u("logo", null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}><Trash2 size={16} /></button></div> : <button onClick={() => lRef.current?.click()} style={{ padding: "8px 16px", background: "#16162e", border: "1px dashed #3a3a55", borderRadius: 8, color: "#9a9ab0", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Upload size={14} /> Upload</button>}<input ref={lRef} type="file" accept="image/*" hidden onChange={e => doUpload(e, url => u("logo", url))} /></div><div style={{ display: "flex", gap: 10 }}><button onClick={() => setEditingBK(null)} style={{ ...actBtn, flex: 1, justifyContent: "center" }}>Cancel</button><button onClick={() => { if (f.name.trim()) saveBK(f); }} style={{ padding: 14, flex: 2, background: t.accent, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: f.name.trim() ? 1 : 0.4 }}>Save</button></div></div>; }
  function CTPanel() { const [f, sF] = useState({ id: "ct_" + Date.now(), name: "", bg: "#0f0f1a", fg: "#e8e6f0", accent: "#7c6ef0", headingFont: FONT_OPTIONS[0], bodyFont: FONT_OPTIONS[5], decorStyle: "corner-glow", builtin: false }); const u = (k, v) => sF(p => ({ ...p, [k]: v })); return <div style={{ display: "flex", flexDirection: "column", gap: 16 }}><div><label style={LS}>Name</label><input value={f.name} onChange={e => u("name", e.target.value)} placeholder="My Template" style={inputStyle} /></div><div style={{ display: "flex", gap: 16 }}><div style={{ flex: 1 }}><label style={LS}>Accent</label><input type="color" value={f.accent} onChange={e => u("accent", e.target.value)} style={{ width: 48, height: 48, borderRadius: 8 }} /></div><div style={{ flex: 1 }}><label style={LS}>BG</label><input type="color" value={f.bg} onChange={e => u("bg", e.target.value)} style={{ width: 48, height: 48, borderRadius: 8 }} /></div><div style={{ flex: 1 }}><label style={LS}>Text</label><input type="color" value={f.fg} onChange={e => u("fg", e.target.value)} style={{ width: 48, height: 48, borderRadius: 8 }} /></div></div><FontSelect label="Heading Font" value={f.headingFont} onChange={v => u("headingFont", v)} /><FontSelect label="Body Font" value={f.bodyFont} onChange={v => u("bodyFont", v)} /><div><label style={LS}>Decoration</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{DECOR_STYLES.map(ds => <button key={ds} onClick={() => u("decorStyle", ds)} style={pill(f.decorStyle === ds, f.accent)}>{ds}</button>)}</div></div><button onClick={() => { if (f.name.trim()) saveCT(f); }} style={{ padding: 14, background: t.accent, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: f.name.trim() ? 1 : 0.4 }}>Save Template</button></div>; }

  const WriteScreen = () => {
    const count = parsedSlides.length;
    return <div style={{ minHeight: "100vh", background: "#0c0c18", display: "flex", flexDirection: "column", padding: 20, animation: "fadeIn 0.3s ease-out" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Playfair Display', serif", background: "linear-gradient(135deg, #7c6ef0, #e94560)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>CarouselForge</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {activeBrandKit && (() => { const bk = brandKits.find(b => b.id === activeBrandKit); return bk ? <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "#1a1a30", borderRadius: 14, border: "1px solid #333355" }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: bk.accent || "#7c6ef0" }} /><span style={{ color: "#a0a0b8", fontSize: 11 }}>{bk.name}</span><button onClick={() => setActiveBrandKit(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1 }}>×</button></div> : null; })()}
          <button onClick={() => { setEditingBK(null); setShowBrandKit(true); }} style={{ background: "#1a1a30", border: "1px solid #333355", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#a0a0b8" }}><Settings size={18} /></button>
        </div>
      </div>
      <div style={{ color: "#8888a0", fontSize: 12, marginBottom: 8, lineHeight: 1.5 }}>
        Write your content. Use <code style={{ background: "#1a1a30", padding: "2px 8px", borderRadius: 4, color: t.accent }}>---</code> to split slides.
      </div>
      <div style={{ color: "#777790", fontSize: 11, marginBottom: 12, lineHeight: 1.5 }}>
        Formatting: <code style={{ background: "#1a1a30", padding: "2px 6px", borderRadius: 4, color: "#b0b0c8" }}># heading</code>  <code style={{ background: "#1a1a30", padding: "2px 6px", borderRadius: 4, color: "#b0b0c8" }}>*bold*</code>  <code style={{ background: "#1a1a30", padding: "2px 6px", borderRadius: 4, color: "#b0b0c8" }}>{`==highlight==`}</code>
      </div>
      <textarea ref={textareaRef} value={rawContent} onChange={e => setRawContent(e.target.value)} placeholder={`# Slide 1 Heading\nBody text...\n\n---\n\n# Slide 2 Heading\nBody text...`} style={{ flex: 1, minHeight: 360, background: "#111125", color: "#e8e6f0", border: "1px solid #252540", borderRadius: 14, padding: 20, fontSize: 15, fontFamily: "'DM Sans', sans-serif", lineHeight: 1.7, resize: "none" }} onFocus={e => (e.target.style.borderColor = t.accent + "66")} onBlur={e => (e.target.style.borderColor = "#252540")} />
      <div style={{ marginTop: 12, textAlign: "center", color: rawContent.trim() ? t.accent : "#555566", fontSize: 14, fontWeight: 600 }}>{rawContent.trim() ? `${count} slide${count !== 1 ? "s" : ""} detected` : "Start writing"}</div>
      {slides.length > 0 && <button onClick={() => { setPreviewIndex(0); setScreen("preview"); }} style={{ position: "fixed", bottom: 28, right: 28, width: 56, height: 56, borderRadius: 16, background: t.accent, color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 24px ${t.accent}55`, cursor: "pointer", zIndex: 100 }}><Eye size={22} /></button>}
    </div>;
  };

  const PreviewScreen = () => {
    const cur = slides[previewIndex]; if (!cur) return null; const oi = cur.origIdx;
    return <div style={{ minHeight: "100vh", background: "#0c0c18", display: "flex", flexDirection: "column", alignItems: "center", padding: 20, animation: "fadeIn 0.3s ease-out" }}>
      <div style={{ width: "100%", maxWidth: 400, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <button onClick={() => setScreen("write")} style={{ background: "none", border: "none", color: "#9a9ab0", fontSize: 14, cursor: "pointer" }}>← Write</button>
        <span style={{ color: "#b0b0c8", fontSize: 14, fontWeight: 600 }}>Preview</span>
        <div style={{ width: 48 }} />
      </div>
      <div onTouchStart={e => onTouch("s", e)} onTouchEnd={e => onTouch("e", e)} style={{ display: "flex", justifyContent: "center", width: "100%", maxWidth: 400 }}>
        <div style={{ animation: "slideIn 0.2s ease-out" }} key={previewIndex + previewRatio}>
          <SlideCard text={cur.text} template={t} fontSize={cur.fontSize} headingFontSize={cur.headingFontSize} slideNum={previewIndex + 1} total={slides.length} size={slideSize} ratio={previewRatio} bgImage={getBg(oi)} bgColor={bgColor} overlayColor={overlayColor || t.accent} overlayOpacity={overlayOpacity} slideImage={slideImages[oi]} imagePos={slideImagePos[oi] || "bottom"} imageCrop={slideImageCrop[oi]} imageMode={slideImageMode[oi]} headingColor={getHColor(oi)} bodyColor={getBColor(oi)} watermark={watermark} globalStyle={globalStyle} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>{Object.keys(RATIOS).map(r => <button key={r} onClick={() => setPreviewRatio(r)} style={{ padding: "5px 14px", borderRadius: 16, border: previewRatio === r ? `2px solid ${t.accent}` : "1px solid #333", background: previewRatio === r ? t.accent + "20" : "#111125", color: previewRatio === r ? t.accent : "#888", fontSize: 12, fontWeight: previewRatio === r ? 700 : 400, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>{r}</button>)}</div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>{slides.map((_, i) => <button key={i} onClick={() => setPreviewIndex(i)} style={{ width: i === previewIndex ? 24 : 8, height: 8, borderRadius: 4, background: i === previewIndex ? t.accent : "#333", border: "none", cursor: "pointer", transition: "all 0.2s" }} />)}</div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, alignItems: "center" }}>
        <button onClick={() => setPreviewIndex(i => Math.max(0, i - 1))} disabled={previewIndex === 0} style={{ width: 40, height: 40, borderRadius: 12, background: previewIndex === 0 ? "#16162e" : "#252548", color: previewIndex === 0 ? "#3a3a55" : "#c0c0d8", border: "1px solid " + (previewIndex === 0 ? "#252540" : "#404065"), cursor: previewIndex === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronLeft size={20} /></button>
        <span style={{ color: "#9a9ab0", fontSize: 14, fontWeight: 500, minWidth: 60, textAlign: "center" }}>{previewIndex + 1} / {slides.length}</span>
        <button onClick={() => setPreviewIndex(i => Math.min(slides.length - 1, i + 1))} disabled={previewIndex === slides.length - 1} style={{ width: 40, height: 40, borderRadius: 12, background: previewIndex === slides.length - 1 ? "#16162e" : "#252548", color: previewIndex === slides.length - 1 ? "#3a3a55" : "#c0c0d8", border: "1px solid " + (previewIndex === slides.length - 1 ? "#252540" : "#404065"), cursor: previewIndex === slides.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><ChevronRight size={20} /></button>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <button onClick={() => setEditingSlide(previewIndex)} style={actBtn}><PenLine size={14} /> Edit</button>
        <button onClick={() => setShowStyleSheet(true)} style={actBtn}><Palette size={14} /> Style</button>
        <button onClick={() => setShowWmSheet(true)} style={actBtn}><Stamp size={14} /> Watermark</button>
        <button onClick={() => setShowReorder(true)} style={actBtn}><GripVertical size={14} /> Reorder</button>
        <button onClick={() => setShowExportSheet(true)} style={{ ...actBtn, background: t.accent, color: "#fff", border: `1px solid ${t.accent}` }}><Download size={14} /> Export</button>
      </div>
      <button onClick={() => setScreen("write")} style={{ position: "fixed", bottom: 28, right: 28, width: 56, height: 56, borderRadius: 16, background: t.accent, color: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 24px ${t.accent}55`, cursor: "pointer", zIndex: 100 }}><PenLine size={22} /></button>
    </div>;
  };

  /* ── Panels ── */
  function EditPanel({ idx, slide }) {
    const [txt, setTxt] = useState(slide.text);
    const curHeadingSize = slideOverrides[idx]?.headingFontSize ?? null;
    const curBodySize = slideOverrides[idx]?.bodyFontSize ?? null;
    const autoHS = globalStyle.headingSize || 28;
    const autoBS = globalStyle.bodySize || calcFontSize(slide.text);
    const [hs, setHs] = useState(curHeadingSize || autoHS);
    const [bs, setBs] = useState(curBodySize || autoBS);
    const [autoH, setAutoH] = useState(!curHeadingSize);
    const [autoB, setAutoB] = useState(!curBodySize);
    const iRef = useRef(null);
    const upd = u => setSlideOverrides(p => ({ ...p, [idx]: { ...p[idx], ...u } }));
    return <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div><label style={LS}>Text</label><textarea value={txt} onChange={e => { const v = e.target.value; setTxt(v); upd({ text: v }); if (autoB) { const a = calcFontSize(v); setBs(a); } }} rows={4} style={{ ...inputStyle, borderRadius: 10, padding: 14, lineHeight: 1.6, resize: "vertical" }} /></div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ ...LS, marginBottom: 0 }}>Heading Size: {hs}px{autoH ? " (auto)" : ""}</label>
          {!autoH && <button onClick={() => { setAutoH(true); setHs(autoHS); upd({ headingFontSize: null }); }} style={{ background: "none", border: "1px solid #3a3a55", borderRadius: 6, color: t.accent, fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Reset</button>}
        </div>
        <input type="range" min="10" max="56" value={hs} onChange={e => { const s = +e.target.value; setHs(s); setAutoH(false); upd({ headingFontSize: s }); }} style={{ width: "100%", accentColor: t.accent }} />
      </div>
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <label style={{ ...LS, marginBottom: 0 }}>Body Size: {bs}px{autoB ? " (auto)" : ""}</label>
          {!autoB && <button onClick={() => { setAutoB(true); const a = calcFontSize(txt); setBs(a); upd({ bodyFontSize: null, fontSize: null }); }} style={{ background: "none", border: "1px solid #3a3a55", borderRadius: 6, color: t.accent, fontSize: 11, padding: "4px 10px", cursor: "pointer" }}>Reset</button>}
        </div>
        <input type="range" min="8" max="40" value={bs} onChange={e => { const s = +e.target.value; setBs(s); setAutoB(false); upd({ bodyFontSize: s, fontSize: s }); }} style={{ width: "100%", accentColor: t.accent }} />
      </div>
      <div><label style={LS}>Image</label>
        {slideImages[idx] ? <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src={slideImages[idx]} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8 }} /><button onClick={() => setSlideImages(p => { const n = { ...p }; delete n[idx]; return n; })} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}><Trash2 size={16} /></button></div>
          <div><label style={{ ...LS, fontSize: 11 }}>Position</label><div style={{ display: "flex", gap: 8 }}>{[["top", "↑ Above Text"], ["bottom", "↓ Below Text"]].map(([v, l]) => <button key={v} onClick={() => setSlideImagePos(p => ({ ...p, [idx]: v }))} style={pill((slideImagePos[idx] || "bottom") === v, t.accent)}>{l}</button>)}</div></div>
          <div><label style={{ ...LS, fontSize: 11 }}>Display Mode</label><div style={{ display: "flex", gap: 8 }}>{[["fill", "Fill"], ["fit", "Fit"]].map(([v, l]) => <button key={v} onClick={() => setSlideImageMode(p => ({ ...p, [idx]: v }))} style={pill((slideImageMode[idx] || "fill") === v, t.accent)}>{l}</button>)}</div></div>
          <div><label style={{ ...LS, fontSize: 11 }}>Crop Position</label><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{[["center", "Center"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"]].map(([v, l]) => <button key={v} onClick={() => setSlideImageCrop(p => ({ ...p, [idx]: v }))} style={pill((slideImageCrop[idx] || "center") === v, t.accent)}>{l}</button>)}</div></div>
        </div> : <button onClick={() => iRef.current?.click()} style={{ padding: "10px 20px", background: "#16162e", border: "1px dashed #3a3a55", borderRadius: 8, color: "#9a9ab0", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Upload size={14} /> Upload</button>}
        <input ref={iRef} type="file" accept="image/*" hidden onChange={e => doUpload(e, url => setSlideImages(p => ({ ...p, [idx]: url })))} />
      </div>
      <div><label style={LS}>Color Override</label><div style={{ display: "flex", gap: 16 }}><div style={{ flex: 1 }}><label style={{ ...LS, fontSize: 10, marginBottom: 4 }}>Heading</label><div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="color" value={slideHeadingColors[idx] || globalHeadingColor || t.accent} onChange={e => setSlideHeadingColors(p => ({ ...p, [idx]: e.target.value }))} style={{ width: 32, height: 32, borderRadius: 6 }} />{slideHeadingColors[idx] && <button onClick={() => setSlideHeadingColors(p => { const n = { ...p }; delete n[idx]; return n; })} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}>×</button>}</div></div><div style={{ flex: 1 }}><label style={{ ...LS, fontSize: 10, marginBottom: 4 }}>Body</label><div style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="color" value={slideBodyColors[idx] || globalBodyColor || t.fg} onChange={e => setSlideBodyColors(p => ({ ...p, [idx]: e.target.value }))} style={{ width: 32, height: 32, borderRadius: 6 }} />{slideBodyColors[idx] && <button onClick={() => setSlideBodyColors(p => { const n = { ...p }; delete n[idx]; return n; })} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}>×</button>}</div></div></div></div>
      <button onClick={() => setEditingSlide(null)} style={{ padding: 14, background: t.accent, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 4 }}>Done</button>
    </div>;
  }

  function StylePanel() {
    const aRef = useRef(null); const pRef = useRef(null);
    return <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* TEMPLATE PICKER */}
      <div style={{ borderBottom: "1px solid #252540", paddingBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={secTitle(t.accent)}>Template</div>
          <button onClick={() => { setShowStyleSheet(false); setShowNewTemplate(true); }} style={{ background: "none", border: "1px solid #3a3a55", borderRadius: 8, color: "#a0a0b8", fontSize: 11, padding: "4px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}><Plus size={12} /> Custom</button>
        </div>
        <div style={{ overflowX: "auto", display: "flex", gap: 12, paddingBottom: 8, scrollSnapType: "x mandatory", marginLeft: -4, marginRight: -4, paddingLeft: 4, paddingRight: 4 }}>
          {allTemplates.map(tp => { const on = tp.id === template.id; return (
            <div key={tp.id} onClick={() => setTemplate(tp)} style={{ flexShrink: 0, width: 100, scrollSnapAlign: "start", cursor: "pointer" }}>
              <div style={{ width: 100, height: 100, background: tp.decorStyle === "gradient-circles" ? "linear-gradient(135deg, #667eea 0%, #e94560 100%)" : tp.bg, borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", justifyContent: "center", position: "relative", overflow: "hidden", border: on ? `2px solid ${tp.accent}` : "2px solid transparent", boxShadow: on ? `0 0 12px ${tp.accent}30` : "0 2px 8px rgba(0,0,0,0.3)" }}>
                {tp.decorStyle !== "gradient-circles" && <Decoration style={tp.decorStyle} accent={tp.accent} bg={tp.bg} fg={tp.fg} size={100} />}
                {tp.decorStyle === "text-box" ? <div style={{ position: "relative", zIndex: 1 }}><div style={{ background: "rgba(255,255,255,0.9)", padding: "3px 5px", borderRadius: 2, marginBottom: 3, display: "inline-block" }}><span style={{ fontFamily: tp.headingFont, fontSize: 9, fontWeight: 700, color: "#1a1a1a" }}>Heading</span></div><div style={{ background: "rgba(255,255,255,0.8)", padding: "2px 4px", borderRadius: 2, display: "inline-block" }}><span style={{ fontFamily: tp.bodyFont, fontSize: 7, color: "#333" }}>Body</span></div></div>
                : <div style={{ position: "relative", zIndex: 1, paddingLeft: tp.decorStyle === "ruled-paper" ? 10 : tp.decorStyle === "magazine-bar" ? 8 : 0 }}><div style={{ fontFamily: tp.headingFont, fontSize: 9, fontWeight: 700, color: tp.accent, marginBottom: 3, textTransform: tp.decorStyle === "gradient-circles" ? "uppercase" : "none" }}>Heading</div><div style={{ fontFamily: tp.bodyFont, fontSize: 7, color: tp.fg, opacity: 0.6 }}>Body</div></div>}
              </div>
              <div style={{ textAlign: "center", marginTop: 6, fontSize: 10, fontWeight: on ? 700 : 400, color: on ? tp.accent : "#9a9ab0", display: "flex", alignItems: "center", justifyContent: "center", gap: 3 }}>{tp.name}{!tp.builtin && <button onClick={e => { e.stopPropagation(); deleteCT(tp.id); }} style={{ background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12 }}>×</button>}</div>
            </div>); })}
        </div>
      </div>

      {/* TYPOGRAPHY */}
      <div style={{ borderBottom: "1px solid #252540", paddingBottom: 20 }}>
        <div style={secTitle(t.accent)}>Typography</div>
        <FontSelect label="Heading Font" value={globalHeadingFont || t.headingFont} onChange={v => { setGlobalHeadingFont(v); loadGoogleFonts({ headingFont: v, bodyFont: t.bodyFont }); }} />
        <div style={{ height: 12 }} />
        <FontSelect label="Body Font" value={globalBodyFont || t.bodyFont} onChange={v => { setGlobalBodyFont(v); loadGoogleFonts({ headingFont: t.headingFont, bodyFont: v }); }} />
        <div style={{ height: 16 }} />
        <ComboSlider label="Heading Size" value={globalHeadingSize || 28} min={10} max={56} step={1} unit="px" accent={t.accent} onChange={v => setGlobalHeadingSize(v)} />
        <div style={{ height: 8 }} />
        <ComboSlider label="Body Size" value={globalBodySize || 16} min={8} max={40} step={1} unit="px" accent={t.accent} onChange={v => setGlobalBodySize(v)} />
        <div style={{ height: 8 }} />
        <ComboSlider label="Font Weight" value={globalFontWeight} min={300} max={900} step={100} unit="" accent={t.accent} onChange={v => setGlobalFontWeight(v)} />
        <div style={{ height: 8 }} />
        <ComboSlider label="Line Height" value={globalLineHeight} min={1.0} max={2.5} step={0.1} unit="" accent={t.accent} onChange={v => setGlobalLineHeight(Math.round(v * 10) / 10)} />
        <div style={{ height: 8 }} />
        <ComboSlider label="Letter Spacing" value={globalLetterSpacing} min={-1} max={5} step={0.5} unit="px" accent={t.accent} onChange={v => setGlobalLetterSpacing(Math.round(v * 10) / 10)} />
        <div style={{ marginTop: 10, color: "#777790", fontSize: 11 }}>Per-slide override in Edit Slide</div>
      </div>

      {/* COLORS */}
      <div style={{ borderBottom: "1px solid #252540", paddingBottom: 20 }}>
        <div style={secTitle(t.accent)}>Colors</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <ColorRow label="Heading" value={globalHeadingColor} defaultVal={t.accent} onChange={setGlobalHeadingColor} onReset={() => setGlobalHeadingColor(null)} />
          <ColorRow label="Body" value={globalBodyColor} defaultVal={t.fg} onChange={setGlobalBodyColor} onReset={() => setGlobalBodyColor(null)} />
          <ColorRow label="Highlight" value={highlightColor} defaultVal="#f5d97a" onChange={setHighlightColor} onReset={() => setHighlightColor("#f5d97a")} />
        </div>
      </div>

      {/* BACKGROUND */}
      <div style={{ borderBottom: "1px solid #252540", paddingBottom: 20 }}>
        <div style={secTitle(t.accent)}>Background</div>
        <ColorRow label="BG Color" value={bgColor} defaultVal={t.bg} onChange={setBgColor} onReset={() => setBgColor(null)} />
        <div style={{ marginTop: 16 }}><label style={LS}>BG Image</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>{[["none", "None"], ["all", "All Slides"], ["per-slide", "Per Slide"]].map(([v, l]) => <button key={v} onClick={() => setBgMode(v)} style={pill(bgMode === v, t.accent)}>{l}</button>)}</div></div>
        {bgMode === "all" && <div>{bgImageAll ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src={bgImageAll} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} /><button onClick={() => setBgImageAll(null)} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}><Trash2 size={16} /></button></div> : <button onClick={() => aRef.current?.click()} style={{ padding: "10px 20px", background: "#16162e", border: "1px dashed #3a3a55", borderRadius: 8, color: "#9a9ab0", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Upload size={14} /> Upload</button>}<input ref={aRef} type="file" accept="image/*" hidden onChange={e => doUpload(e, setBgImageAll)} /></div>}
        {bgMode === "per-slide" && <div>{bgImagesPerSlide[previewIndex] ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src={bgImagesPerSlide[previewIndex]} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} /><button onClick={() => setBgImagesPerSlide(p => { const n = { ...p }; delete n[previewIndex]; return n; })} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}><Trash2 size={16} /></button></div> : <button onClick={() => pRef.current?.click()} style={{ padding: "10px 20px", background: "#16162e", border: "1px dashed #3a3a55", borderRadius: 8, color: "#9a9ab0", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Upload size={14} /> Slide {previewIndex + 1}</button>}<input ref={pRef} type="file" accept="image/*" hidden onChange={e => doUpload(e, url => setBgImagesPerSlide(p => ({ ...p, [previewIndex]: url })))} /></div>}
        {bgMode !== "none" && <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
          <ColorRow label="Overlay" value={overlayColor} defaultVal={t.accent} onChange={setOverlayColor} onReset={() => setOverlayColor(null)} />
          <ComboSlider label="Overlay Opacity" value={Math.round(overlayOpacity * 100)} min={0} max={100} step={1} unit="%" accent={t.accent} onChange={v => setOverlayOpacity(v / 100)} />
        </div>}
      </div>

      {/* TEXT BOX */}
      <div style={{ borderBottom: "1px solid #252540", paddingBottom: 20 }}>
        <div style={secTitle(t.accent)}>Text Box</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <label style={{ ...LS, marginBottom: 0 }}>Text Box</label>
          <button onClick={() => setTextBoxEnabled(p => !p)} style={{ width: 48, height: 28, borderRadius: 14, border: "none", background: textBoxEnabled ? t.accent : "#333", cursor: "pointer", position: "relative" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: textBoxEnabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} /></button>
        </div>
        {textBoxEnabled && <>
          <ColorRow label="Box Color" value={textBoxColor} defaultVal="#ffffff" onChange={setTextBoxColor} onReset={() => setTextBoxColor("#ffffff")} />
          <div style={{ height: 12 }} />
          <ComboSlider label="Box Opacity" value={Math.round(textBoxOpacity * 100)} min={10} max={100} step={1} unit="%" accent={t.accent} onChange={v => setTextBoxOpacity(v / 100)} />
        </>}
      </div>

      {/* PAGINATION */}
      <div>
        <div style={secTitle(t.accent)}>Pagination</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <label style={{ ...LS, marginBottom: 0 }}>Show Page Numbers</label>
          <button onClick={() => setPaginationEnabled(p => !p)} style={{ width: 48, height: 28, borderRadius: 14, border: "none", background: paginationEnabled ? t.accent : "#333", cursor: "pointer", position: "relative" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: paginationEnabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} /></button>
        </div>
        {paginationEnabled && <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ ...LS, fontSize: 11 }}>Position</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[["top-left", "↖ Top Left"], ["top-right", "↗ Top Right"], ["bottom-left", "↙ Bottom Left"], ["bottom-right", "↘ Bottom Right"]].map(([v, l]) => <button key={v} onClick={() => setPaginationPosition(v)} style={pill(paginationPosition === v, t.accent)}>{l}</button>)}
            </div>
          </div>
          <ComboSlider label="Size" value={paginationSize} min={8} max={24} step={1} unit="px" accent={t.accent} onChange={v => setPaginationSize(v)} />
        </>}
      </div>

      <button onClick={() => setShowStyleSheet(false)} style={{ padding: 14, background: t.accent, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Done</button>
    </div>;
  }

  function WmPanel() {
    const lRef = useRef(null);
    return <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <label style={{ ...LS, marginBottom: 0 }}>Enable</label>
        <button onClick={() => setWatermark(p => ({ ...p, enabled: !p.enabled }))} style={{ width: 48, height: 28, borderRadius: 14, border: "none", background: watermark.enabled ? t.accent : "#333", cursor: "pointer", position: "relative" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: watermark.enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} /></button>
      </div>
      {watermark.enabled && <>
        <div><label style={LS}>Logo</label>{watermark.logo ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}><img src={watermark.logo} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover" }} /><button onClick={() => setWatermark(p => ({ ...p, logo: null }))} style={{ background: "none", border: "none", color: "#888", cursor: "pointer" }}><Trash2 size={16} /></button></div> : <button onClick={() => lRef.current?.click()} style={{ padding: "8px 16px", background: "#16162e", border: "1px dashed #3a3a55", borderRadius: 8, color: "#9a9ab0", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><Upload size={14} /> Upload</button>}<input ref={lRef} type="file" accept="image/*" hidden onChange={e => doUpload(e, url => setWatermark(p => ({ ...p, logo: url })))} /></div>
        <div><label style={LS}>Username</label><input value={watermark.username} onChange={e => setWatermark(p => ({ ...p, username: e.target.value }))} placeholder="@you" style={inputStyle} /></div>
        <div>
          <label style={LS}>Position</label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              ["top-left", "↖ TL"], ["center-top", "↑ CT"], ["top-right", "↗ TR"],
              ["bottom-left", "↙ BL"], ["center-bottom", "↓ CB"], ["bottom-right", "↘ BR"]
            ].map(([v, l]) => <button key={v} onClick={() => setWatermark(p => ({ ...p, position: v }))} style={pill(watermark.position === v, t.accent)}>{l}</button>)}
          </div>
          <div style={{ color: "#777790", fontSize: 11, marginTop: 8 }}>Center positions stick close to content</div>
        </div>
        <ComboSlider label="Opacity" value={Math.round((watermark.opacity ?? 0.5) * 100)} min={10} max={100} step={1} unit="%" accent={t.accent} onChange={v => setWatermark(p => ({ ...p, opacity: v / 100 }))} />
        <ComboSlider label="Font Size" value={watermark.fontSize || 9} min={6} max={24} step={1} unit="px" accent={t.accent} onChange={v => setWatermark(p => ({ ...p, fontSize: v }))} />
      </>}
      <button onClick={() => setShowWmSheet(false)} style={{ padding: 14, background: t.accent, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Done</button>
    </div>;
  }

  function ReorderPanel() { return <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{slides.map((s, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#111125", borderRadius: 10, border: "1px solid #252540" }}><GripVertical size={16} color="#555" /><span style={{ flex: 1, color: "#ccc", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Slide {i + 1}: {s.text.split("\n")[0]?.substring(0, 30)}</span><button onClick={() => { if (i > 0) moveSlide(i, i - 1); }} disabled={i === 0} style={{ background: "none", border: "none", color: i === 0 ? "#333" : "#888", cursor: i === 0 ? "default" : "pointer", padding: 4 }}>↑</button><button onClick={() => { if (i < slides.length - 1) moveSlide(i, i + 1); }} disabled={i === slides.length - 1} style={{ background: "none", border: "none", color: i === slides.length - 1 ? "#333" : "#888", cursor: i === slides.length - 1 ? "default" : "pointer", padding: 4 }}>↓</button></div>)}<button onClick={() => setShowReorder(false)} style={{ padding: 14, background: t.accent, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>Done</button></div>; }

  function ExportPanel() { const toggleRatio = r => setSelectedRatios(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r]); return <div style={{ display: "flex", flexDirection: "column", gap: 20 }}><div><label style={LS}>Select Ratios</label><div style={{ display: "flex", gap: 10 }}>{Object.keys(RATIOS).map(r => <button key={r} onClick={() => toggleRatio(r)} style={{ ...pill(selectedRatios.includes(r), t.accent), flex: 1, textAlign: "center", padding: "12px 8px" }}><div style={{ fontWeight: 700, fontSize: 14 }}>{r}</div><div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>{RATIOS[r].w}×{RATIOS[r].h}</div></button>)}</div></div><div style={{ background: "#111125", borderRadius: 10, padding: 14 }}><div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>Export Summary</div><div style={{ color: "#ccc", fontSize: 14 }}>{slides.length} slide{slides.length !== 1 ? "s" : ""} × {selectedRatios.length} ratio{selectedRatios.length !== 1 ? "s" : ""} = <strong style={{ color: t.accent }}>{slides.length * selectedRatios.length} PNG{slides.length * selectedRatios.length !== 1 ? "s" : ""}</strong></div><div style={{ color: "#666", fontSize: 11, marginTop: 4 }}>{selectedRatios.length > 1 || slides.length > 1 ? "Download as ZIP" : "Download as PNG"}</div></div>{exportProgress && <div style={{ display: "flex", alignItems: "center", gap: 12 }}>{!exportProgress.done ? <Loader size={18} color={t.accent} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={18} color="#4ecdc4" />}<div style={{ flex: 1, background: "#111125", borderRadius: 8, height: 8, overflow: "hidden" }}><div style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%`, height: "100%", background: exportProgress.done ? "#4ecdc4" : t.accent, borderRadius: 8, transition: "width 0.2s" }} /></div><span style={{ color: "#888", fontSize: 12 }}>{exportProgress.current}/{exportProgress.total}</span></div>}<button onClick={exportSlides} disabled={!selectedRatios.length || exportProgress?.done === false} style={{ padding: 14, background: !selectedRatios.length ? "#333" : t.accent, color: "#fff", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: !selectedRatios.length ? "default" : "pointer", opacity: !selectedRatios.length ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Download size={18} /> Export {selectedRatios.length > 1 ? "ZIP" : "PNG"}</button></div>; }

  return <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
    <style>{globalCSS}</style>
    {screen === "write" && WriteScreen()}
    {screen === "preview" && PreviewScreen()}
    <BottomSheet open={showBrandKit} onClose={() => { setShowBrandKit(false); setEditingBK(null); }} title="Brand Kit">{BKPanel()}</BottomSheet>
    <BottomSheet open={showNewTemplate} onClose={() => setShowNewTemplate(false)} title="Custom Template">{CTPanel()}</BottomSheet>
    <BottomSheet open={editingSlide !== null} onClose={() => setEditingSlide(null)} title={`Edit Slide ${editingSlide !== null ? editingSlide + 1 : ""}`}>{editingSlide !== null && <EditPanel key={`edit-${slides[editingSlide]?.origIdx}`} idx={slides[editingSlide]?.origIdx} slide={slides[editingSlide]} />}</BottomSheet>
    <BottomSheet open={showStyleSheet} onClose={() => setShowStyleSheet(false)} title="Style Settings">{StylePanel()}</BottomSheet>
    <BottomSheet open={showWmSheet} onClose={() => setShowWmSheet(false)} title="Watermark / Branding">{WmPanel()}</BottomSheet>
    <BottomSheet open={showReorder} onClose={() => setShowReorder(false)} title="Reorder Slides">{ReorderPanel()}</BottomSheet>
    <BottomSheet open={showExportSheet} onClose={() => setShowExportSheet(false)} title="Export Carousel">{ExportPanel()}</BottomSheet>
  </div>;
}
