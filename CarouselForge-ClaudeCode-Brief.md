# CarouselForge — Claude Code Brief

## Apa ini?
Dokumen ini berisi semua konteks project CarouselForge supaya Claude Code bisa langsung lanjut development tanpa kehilangan konteks dari diskusi sebelumnya.

---

## Project Overview

**CarouselForge** adalah web app mobile-first untuk membuat konten carousel microblog (Instagram/TikTok). Filosofinya: kesederhanaan dan fokus — menghilangkan kompleksitas tool desain generik seperti Canva, memberikan workflow streamlined: tulis → edit → export.

**Tech Stack:**
- Vite + React (client-side only, no backend)
- JSZip (npm package untuk zip download)
- Lucide React (icons)
- Google Fonts (loaded dynamically)
- Canvas 2D API (untuk PNG export)
- localStorage (Brand Kit & custom templates)
- Deployed di Vercel, repo di GitHub

**Repo:** github.com/eleitch/carouselforge

---

## Current App Structure

### Screen Flow
```
Home (template picker + Brand Kit gear icon)
  → Write (text area + slide counter)
    → Preview (swipe slides + action buttons)
      → Edit Slide (bottom sheet)
      → Style Settings (bottom sheet)
      → Watermark (bottom sheet)
      → Reorder (bottom sheet)
      → Export (bottom sheet)
```

### Layout: Single Focus + Toggle (Layout C)
- Mobile-first, dark mode
- FAB (Floating Action Button) untuk navigasi antar mode
- Bottom sheets untuk semua panels
- Swipe horizontal untuk navigasi slide di preview

### 7 Built-in Templates
1. **Notebook** — ruled paper + Kalam handwriting font
2. **Cream** — warm dark, Cormorant Garamond + Karla
3. **Story** — text box putih semi-transparan di atas background hijau (mirip style IG story)
4. **Gradient** — bold gradient (ungu→pink) + Montserrat uppercase headline
5. **Magazine** — editorial bar merah + Playfair Display serif
6. **Minimal Line** — clean putih, thin line accent
7. **Blackboard** — chalk border, kuning accent, Fraunces serif

### Content Input System
- Separator `---` (pada baris baru) untuk split antar slide
- `# teks` untuk heading (baris dimulai dengan # spasi)
- Baris tanpa # = body text
- Jumlah slide fleksibel

### Current Features (sudah implemented)

**Phase 1 — Core:**
- Content input & auto-split
- Auto font sizing (berdasarkan panjang teks)
- Slide preview dengan swipe horizontal
- Slide editor (text, font size override)

**Phase 2 — Visual:**
- Template system (7 built-in)
- Background image (none / same for all / per-slide)
- Background overlay (color + opacity slider)
- Background color picker
- Watermark (logo + username, 4 corner positions, opacity slider, font size slider)
- Slide image upload dengan posisi (top/middle/bottom)

**Phase 3 — Personalization:**
- Brand Kit (warna accent/bg/fg, heading font, body font, logo)
  - Multi Brand Kit support
  - Export/Import JSON
  - Auto-apply override ke template yang dipilih
  - Persist di localStorage
- Custom Template creator (nama, warna, fonts, decoration style)
  - Persist di localStorage
  - Bisa dihapus

**Phase 4 — Export:**
- PNG export via Canvas 2D API (1080px resolution)
- Multi-ratio: 1:1 (1080×1080), 4:5 (1080×1350), 9:16 (1080×1920)
- Multi-export: generate semua rasio sekaligus → ZIP
- Single ratio single slide → direct PNG download
- Progress bar saat rendering
- Drag & drop slide reorder (via ↑↓ buttons)

**Additional Features:**
- Preview ratio toggle (switch 1:1/4:5/9:16 di preview)
- Global font size controls (heading + body, terpisah) di Style Settings
- Per-slide font size override (heading + body) di Edit Slide
- Numbering toggle (on/off + adjustable font size)
- Font colors: global (heading + body) + per-slide override
- Google Fonts: 20 font options loaded dynamically

---

## Architecture Notes (PENTING)

### React Component Pattern
- **Screens** (HomeScreen, WriteScreen, PreviewScreen) didefinisikan sebagai arrow functions INSIDE komponen utama, tapi di-render sebagai `{HomeScreen()}` (function call), BUKAN `<HomeScreen />` (component syntax). Ini untuk menghindari re-mount saat parent re-render.
- **EXCEPTION:** `EditPanel` dan `BKEditor` HARUS dirender sebagai `<EditPanel key={...} />` (component syntax dengan key) karena mereka punya useState yang bergantung pada props. Key memastikan remount saat slide/bk berubah.
- **Semua BottomSheet** ditaruh di ROOT render level, bukan di dalam screen functions. Ini mencegah hook violation saat switch screen.

### Export Renderer
- Pakai Canvas 2D API murni (bukan SVG foreignObject — itu blank di browser)
- Semua elemen (background, teks, overlay, watermark, numbering) digambar langsung ke canvas
- Font rendering pakai `ctx.fillText` dengan manual word wrap
- Image rendering pakai `ctx.drawImage` dengan cover crop
- Scale factor = exportWidth / 340 (340 = preview size)
- PENTING: Semua styling (font sizes, colors, watermark size, numbering) harus konsisten antara preview (React) dan export (Canvas). Setiap perubahan di SlideCard harus di-mirror di renderSlideToBlob.

### Data Persistence
- Built-in templates: hardcoded di app
- Custom templates: localStorage key `cf_custom_templates`
- Brand Kits: localStorage key `cf_brand_kits`
- Active Brand Kit: localStorage key `cf_active_brand_kit`
- Konten, images, settings: in-memory (session only)

---

## MAJOR UPDATE — Yang Harus Di-Build

### 1. Text Markers (di Write mode)
User bisa pakai marker di dalam teks:
- `*teks*` → render sebagai **bold**
- `==teks==` → render sebagai highlight (background warna stabilo di belakang teks)
- `# teks` → heading (sudah ada, tetap)

Markers harus:
- Diparse dan dirender di SlideCard (preview)
- Diparse dan dirender di Canvas export
- Marker syntax (`*`, `==`) tidak ditampilkan di output
- Bold dan highlight bisa di dalam body text maupun heading
- Bisa nested: `*==bold + highlight==*` (nice to have, bukan wajib)

**Contoh input:**
```
# 5 Kesalahan *Fatal* Branding
Brand yang kuat ==bukan soal logo==.
Tapi soal *konsistensi* yang kebanyakan orang skip.
```

**Render output:**
- "5 Kesalahan **Fatal** Branding" (heading, "Fatal" bold)
- "Brand yang kuat [bukan soal logo] (highlighted). Tapi soal **konsistensi** yang kebanyakan orang skip."

### 2. Font Picker (Global)
- Heading font dan body font bisa dipilih terpisah
- Apply ke semua slide sekaligus
- Dropdown/select dari daftar Google Fonts yang tersedia
- Letakkan di Style Settings panel, section "Typography" paling atas
- Saat font berubah, load Google Font dynamically

### 3. Text Styling Controls (Global, di Style Settings)
Semua control pakai **COMBO PATTERN: slider + input angka** (lihat UI Spec di bawah)

Controls yang dibutuhkan:
- **Heading size** — slider + input (range: 10-56px)
- **Body size** — slider + input (range: 8-40px)
- **Font weight** — slider + input (range: 300-900, step 100)
- **Line height** — slider + input (range: 1.0-2.5, step 0.1)
- **Letter spacing** — slider + input (range: -1px - 5px, step 0.5)
- **Highlight color** — color picker (warna stabilo untuk ==highlight==)

### 4. Background Options (existing, pastikan tetap berfungsi)
- Polos (warna bisa diganti) — sudah ada
- Upload photo (semua slide atau per-slide) — sudah ada
- Overlay color + opacity — sudah ada

### 5. Watermark Positioning Update
Posisi watermark sekarang 4 (corners). Update ke 6 posisi (grid 3×2):

```
[ ↖ top-left    ] [ ↑ center-top    ] [ ↗ top-right    ]
[ ↙ bottom-left ] [ ↓ center-bottom ] [ ↘ bottom-right ]
```

- **center-top**: di tengah horizontal, di atas konten, menempel ke content edge (bukan mepet page edge)
- **center-bottom**: di tengah horizontal, di bawah konten, menempel ke content edge
- Corner positions tetap sama seperti sekarang (mepet sudut halaman)

### 6. Image Insertion di Write Mode
Saat ini image disisipkan di Edit Slide panel. User request supaya bisa menyisipkan image saat menulis teks di Write mode. Pertimbangkan approach yang mobile-friendly — misalnya tombol "insert image" yang menaruh marker di teks, atau inline upload button.

---

## UI/UX Spec untuk Major Update

### Combo Control Pattern (slider + input angka)
Dipakai untuk SEMUA size/value controls. Layout:

```
[Label]                              
[====slider====] [input] [unit]
```

- Slider di kiri (flex: 1), input box di kanan (width: 56px), unit label optional (px, dll)
- Dua-duanya SYNC: geser slider → angka di input update. Ketik angka → slider ikut geser
- Input box: background #111125, border 1px solid #252540, border-radius 8px, text-align center, font-size 14px, font-weight 500, color #e8e6f0
- Apply ke: heading size, body size, font weight, line height, letter spacing, watermark font size, watermark opacity, numbering font size, overlay opacity

### Style Settings Panel Layout (bottom sheet)
Urutan sections dari atas ke bawah:

```
[Sheet Handle]
[Title: "Style Settings"]

── TYPOGRAPHY (new) ──────────────────
  Heading font     [dropdown select]
  Body font        [dropdown select]
  Heading size     [====slider====] [28] px
  Body size        [====slider====] [16] px
  Font weight      [====slider====] [600]
  Line height      [====slider====] [1.6]
  Letter spacing   [====slider====] [0.5] px
  Note: "Per-slide override in Edit Slide"

── COLORS ────────────────────────────
  Heading color    [color picker] #7c6ef0
  Body color       [color picker] #e8e6f0
  Highlight color  [color picker] #f5d97a  (new)

── BACKGROUND ────────────────────────
  BG color         [color picker] #0f0f1a
  BG image         [None] [All slides] [Per slide]
  (if image) Overlay color + opacity

── NUMBERING ─────────────────────────
  Show numbers     [toggle on/off]
  (if on) Size     [====slider====] [11] px

[Done button]
```

### Watermark Panel Layout (bottom sheet)
```
[Sheet Handle]
[Title: "Watermark / Branding"]

  Enable           [toggle on/off]
  
  (if enabled):
  Logo             [Upload button / preview]
  Username         [text input]
  
  Position (grid 3×2):
  [↖ top-left   ] [↑ center-top   ] [↗ top-right   ]
  [↙ bottom-left] [↓ center-bottom] [↘ bottom-right]
  Note: "Center positions stick close to content"
  
  Opacity          [====slider====] [50] %
  Font size        [====slider====] [12] px

[Done button]
```

### Write Mode — Marker Syntax Helper
Di Write screen, di bawah instruksi "Use # for headings, --- to split slides", tambahkan hint kecil:

```
Formatting: *bold*  ==highlight==
```

Warna hint: muted (#555), font-size: 11px

---

## Design Decisions Log

1. **Stateless core** — app functional di device/browser manapun tanpa setup
2. **No AI** — user ingin full kontrol atas tulisan
3. **No Unsplash API** — user upload sendiri semua gambar
4. **No chart library** — data viz ditunda ke V2
5. **1 layout, scale/fit per rasio** — bukan re-layout
6. **localStorage + JSON export/import** untuk portabilitas Brand Kit
7. **Canvas 2D untuk export** — SVG foreignObject blank di browser
8. **Function call `Screen()` bukan `<Screen />`** — mencegah re-mount/cursor reset
9. **EditPanel & BKEditor pakai `<Component key={} />`** — karena punya useState dari props
10. **BottomSheet di root level** — mencegah hook violation
11. **Combo control (slider + input)** — untuk semua size/value controls, slider untuk quick adjust, input untuk exact value, keduanya sync
12. **Text markers** — `*bold*` dan `==highlight==` di teks, parsed saat render, syntax tidak ditampilkan di output
13. **Watermark 6 posisi** — grid 3×2, center-top dan center-bottom menempel ke content edge bukan page edge
14. **Highlight = stabilo** — background warna di belakang teks, warna bisa dikustomisasi via highlight color picker

---

## Monetization Plan (untuk implementasi nanti)

**Model: Freemium + One-time Purchase (Rp 69k-99k)**

Free tier:
- Semua built-in templates
- Export PNG unlimited
- Watermark "CarouselForge" kecil di corner (branding)
- 1 Brand Kit
- Rasio 1:1 saja

Pro tier (one-time purchase):
- Hapus watermark CarouselForge
- Multi-ratio export (4:5, 9:16)
- Unlimited Brand Kit + export/import
- Custom template creation
- Background image + overlay

(Belum diimplementasi — untuk nanti setelah market validation)

---

## File Structure
```
carouselforge/
├── index.html
├── package.json
├── vite.config.js
├── .gitignore
└── src/
    ├── main.jsx
    └── CarouselForge.jsx  ← semua code di sini (single file component)
```

---

## Cara Mulai

```bash
cd carouselforge
npm install
npm run dev
# Buka http://localhost:5173

# Setelah selesai edit:
git add .
git commit -m "Major update: text markers, font picker, styling controls"
git push
# Vercel auto-deploy
```

---

## Known Issues / Bugs yang Sudah Di-Fix
- Cursor reset saat ketik di textarea/input → fix: render screen sebagai function call bukan component
- Blank screen saat switch screen → fix: BottomSheet di root level
- EditPanel blank saat klik Edit → fix: pakai <EditPanel key={} /> dengan component syntax
- Export PNG blank putih → fix: Canvas 2D API, bukan SVG foreignObject
- Watermark/numbering font size tidak match export → fix: pakai state values * scale, bukan hardcoded
- Teks terpotong di slide panjang → fix: calcFontSize lebih konservatif
