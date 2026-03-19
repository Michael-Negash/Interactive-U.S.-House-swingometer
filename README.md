# Interactive-U.S.-House-swingometer
Interactive U.S. House swingometer — drag sliders to reshape the electoral map by race, turnout &amp; party split. 
<div align="center">


https://github.com/user-attachments/assets/c813d544-5581-4329-b911-bf4491ba9a84

</div>


<br><br>

# 🗳️ House Demographic Swingometer

**An interactive U.S. House swingometer that translates racial group turnout and party vote share into live seat outcomes — district by district, updated instantly as you move the sliders.**

Built for OSZ· Published here as a portfolio demo

<br>


## 🔍 What it does

- Breaks down each congressional district's **Voting-Age Population (VAP)** by racial group
- Four independent sliders per group — **Turnout %** and **Dem / Rep party split** — for White, Black, Hispanic, and Asian & Other voters
- Recalculates seat winners across all 435 districts simultaneously and renders a live **seat bar**
- Colors the **choropleth map** in real time: dark blue → strong Dem, dark red → strong Rep, light shades → marginal
- Click any district to see a **per-race breakdown tooltip**: voters, Dem %, Rep %, and margin
- Gracefully falls back to **stub data and placeholder shapes** when real data files are absent (this repo)

### What this means

- The repository showcases **architecture, algorithm design, and frontend engineering**
- It does **not reproduce real election outcomes or full geographic accuracy**
- The provided HTML/JS/CSS files are meant to illustrate **how the system works**, not serve as a deployable data product
---

## 🛠️ Tech stack

<div align="center">

| | Technology |
|:---:|---|
| ![HTML5](https://img.shields.io/badge/-HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) | Semantic markup, no framework |
| ![CSS3](https://img.shields.io/badge/-CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) | CSS custom properties, grid, responsive layout |
| ![JavaScript](https://img.shields.io/badge/-Vanilla_JS-f7df1e?style=flat-square&logo=javascript&logoColor=black) | ES2020, zero dependencies, zero build step |

</div>

No React. No bundler. No npm install. Just three files.

---

## 📁 File structure

```
📦 house-swingometer
 ┣ 📄 index.html          — HTML shell (structure only)
 ┣ 📄 swingometer.css     — All styles and design tokens
 ┣ 📄 swingometer.js      — All logic: data loading, sliders, render, map
 ┣ 📁 assets/
 ┃ ┗ 🎬 demo.mp4          — Screen recording demo video
 ┗ 📄 README.md           — This file
```

> **Not included:** `demographic-house-swingometer-district.json` (VAP data),
> `demographic-house-swingometer-margins.json` (district margin adjustments),
> and `demographic-house-119th-map.svg` (AlbersUSA district map).
> The app detects missing files and falls back to stubs automatically.

---

## 🚀 Run locally

No install or build step needed:

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
cd YOUR_REPO_NAME

# 2a. Open directly in browser (may have fetch restrictions)
open index.html           # macOS
start index.html          # Windows

# 2b. Or spin up a tiny local server (recommended)
npx serve .
# Then visit http://localhost:3000
```

> **Tip:** Use `npx serve .` rather than opening the file directly — browsers block `fetch()` calls on `file://` URLs.

---

## 🧠 How it works

### Data pipeline

1. On load, the app fetches three external files: district VAP JSON, margin adjustment JSON, and the AlbersUSA SVG map
2. If any file is missing (as in this demo), it falls back to stub data and placeholder SVG shapes

### Seat allocation

- Each district's VAP is split into racial groups using a **Hamilton / largest-remainder** rounding method so integer totals always sum correctly
- For every slider change, the app multiplies `eligible voters × turnout % × party split %` per group, sums across groups, and calls the district for whoever has more votes

### Map colouring

Districts are coloured by **percent margin**, not raw vote totals, so small and large districts are visually comparable:

| Margin | Democrat | Republican |
|---|---|---|
| > 10 pp | `#1e40af` dark blue | `#991b1b` dark red |
| 5–10 pp | `#3b82f6` blue | `#ef4444` red |
| 0–5 pp  | `#bfe0ff` light blue | `#ffbdbd` light pink |
| Tie     | `#ffffff` white | `#ffffff` white |

### Tooltip positioning

The tooltip auto-repositions above / below / left / right of the clicked district based on available viewport space, and auto-closes after 6 seconds.

---

## 📊 Data sources (full version)

- **Voting-Age Population by race:** U.S. Census Bureau
- **Congressional district boundaries:** [SimpleMaps Congress](https://simplemaps.com/data/congress)
- **Historical vote margins:** compiled from official state election results

---

## ⚠️ Limitations & notes

- Turnout and party split sliders are **nationwide** — they do not vary by state or district in the current UI
- The full version applies per-district margin adjustments on top of the global sliders
- This is a **modelling tool**, not a forecast — outputs reflect slider inputs only

---

## 📄 License

The code in this repository is shared for **portfolio and educational viewing**.

The underlying district VAP dataset, margin adjustment files, and compiled SVG map remain proprietary to Open Source Zone. Please do not reproduce or redistribute those components.

---
