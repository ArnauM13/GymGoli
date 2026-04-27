# GymGoli Design System

A practical reference for building new pages so the look-and-feel stays
consistent. Distilled from the train, library and settings pages.

The vibe: **clean white cards on a soft background, rounded corners,
subtle shadows, color used purposefully (per category / per sport),
mobile-first touch targets**.

---

## 1. Design Tokens

### Colors

| Token              | Value      | Use                                   |
| ------------------ | ---------- | ------------------------------------- |
| `--brand-teal`     | `#006874`  | Primary actions, brand accents        |
| `--brand-teal-hover` | `#005a63` | Primary button hover                  |
| `--cat-push`       | `#e57373`  | Push (red)                            |
| `--cat-pull`       | `#64b5f6`  | Pull (blue)                           |
| `--cat-legs`       | `#81c784`  | Legs (green)                          |
| `--text-primary`   | `#1a1a1a`  | Headings, item names                  |
| `--text-secondary` | `#555`     | Body copy                             |
| `--text-muted`     | `#888`     | Section titles, descriptions          |
| `--text-faint`     | `#999`     | Item details, counts                  |
| `--text-disabled`  | `#ccc`     | Inactive icons                        |
| `--surface`        | `#ffffff`  | Cards                                 |
| `--page-bg`        | `#f5f5f7`  | Page background (body)                |
| `--border-subtle`  | `#efefef`  | Item card border                      |
| `--border-soft`    | `#e0e0e0`  | Filter chips, inputs                  |
| `--border-divider` | `#f0f0f0`  | Internal dividers                     |

> **Use `color-mix()` for tinted variants**, never hard-code lighter shades:
> `background: color-mix(in srgb, var(--ic) 7%, white);`

### Spacing

- **Page horizontal margin:** `16px`
- **Section vertical gap:** `12px` (between sections)
- **Inside section padding:** `14px 14px 16px`
- **Inside item card padding:** `10px 10px`
- **Bottom safe area:** `padding-bottom: 84px` on `.page` (clears tab bar + FAB)

### Radius

- **Section card:** `18px`
- **Item card:** `14px`
- **Button (rectangle):** `10px`
- **Pill / chip:** `20px`
- **Round button:** `50%`

### Shadows

- **Resting card:** `0 2px 10px rgba(0, 0, 0, 0.07)`
- **Hover card:** `0 2px 8px rgba(0, 0, 0, 0.08)`
- **Floating bar (FAB / bottom bar):** `0 8px 28px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.1)`

### Typography

| Role             | Size  | Weight | Color   | Notes                          |
| ---------------- | ----- | ------ | ------- | ------------------------------ |
| Page title       | 20px  | 700–800 | #1a1a1a | `letter-spacing: -0.2px`       |
| Section title    | 14px  | 700    | #555    | `letter-spacing: 0.2px`        |
| Section title (uppercase variant) | 13px | 700 | #888 | `letter-spacing: 0.3px; text-transform: uppercase` |
| Item name        | 13px  | 700    | #1a1a1a | `truncate with ellipsis`       |
| Item detail      | 11px  | 500    | #999    | `truncate with ellipsis`       |
| Body copy        | 13px  | 500    | #555    | Line height 1.4                |
| Small / hint     | 12px  | 500    | #666    | Line height 1.4                |
| Button label     | 13px  | 700    | varies  |                                |

---

## 2. Page Shell

Every page lives inside a `.page` wrapper:

```scss
.page {
  padding: 0 0 84px;          /* full-bleed top, leave room for tab bar */
  /* OR for centered text-heavy pages: */
  /* padding: 0 16px 84px; max-width: 540px; margin: 0 auto; */
}
```

### 2a. Page header (title + action)

```html
<header class="page-header">
  <h1>Page title</h1>
  <button class="header-add" (click)="add()" aria-label="Afegir">
    <span class="material-symbols-outlined">add</span>
  </button>
</header>
```

```scss
.page-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 16px 8px;
  h1 { margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.2px; }
}
.header-add {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: #006874; color: white; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, transform 0.1s; touch-action: manipulation;
  .material-symbols-outlined { font-size: 20px; }
  &:hover  { background: #005a63; }
  &:active { transform: scale(0.94); }
}
```

### 2b. Page header with back button (sub-page)

```html
<div class="page-header">
  <button class="back-btn" (click)="back()" title="Tornar">
    <span class="material-symbols-outlined">arrow_back_ios</span>
  </button>
  <h1 class="page-title">Sub-page</h1>
</div>
```

Use `Location.back()` from `@angular/common`.

---

## 3. Section Card

The fundamental container. Everything sits inside a section card:

```html
<div class="card-section">
  <div class="section-header">
    <span class="material-symbols-outlined section-icon">fitness_center</span>
    <h2 class="section-title">Title</h2>
    <span class="section-count">{{ items.length }}</span>   <!-- optional -->
  </div>

  <!-- content / items -->
</div>
```

```scss
.card-section {
  margin: 12px 16px 0;
  padding: 14px 14px 16px;
  background: white;
  border-radius: 18px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.07);
}

.section-header {
  display: flex; align-items: center; gap: 7px;
  margin-bottom: 12px;
}
.section-icon {
  font-size: 18px; color: #888;
  font-variation-settings: 'FILL' 0, 'wght' 300;
}
.section-title {
  margin: 0; flex: 1;
  font-size: 14px; font-weight: 700; color: #555; letter-spacing: 0.2px;
}
.section-count {
  font-size: 11px; font-weight: 700; color: #999;
  background: #f0f0f0; border-radius: 10px; padding: 2px 8px;
}
```

> **Don't** add multiple wrapping cards inside a card-section. One layer
> only — items inside a section card use the `.item-card` pattern (which
> has a thin border, no shadow).

---

## 4. Item Card

The list-item pattern: thin border, **5px colored accent bar** on the left,
content in the middle, action buttons on the right.

```html
<div class="item-card">
  <div class="ic-bar" [style.background]="item.color"></div>
  <div class="ic-info">
    <span class="ic-name">{{ item.name }}</span>
    <span class="ic-detail">{{ item.detail }}</span>
  </div>
  <button class="ic-action" (click)="edit(item)" aria-label="Editar">
    <span class="material-symbols-outlined">edit</span>
  </button>
  <button class="ic-action ic-action--danger" (click)="delete(item)" aria-label="Eliminar">
    <span class="material-symbols-outlined">delete</span>
  </button>
</div>
```

```scss
.item-card {
  display: flex; align-items: center;
  margin-bottom: 6px;
  border: 1.5px solid #efefef; border-radius: 14px;
  background: white; overflow: hidden;
  transition: box-shadow 0.15s, border-color 0.15s;
  &:hover { box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); border-color: #ddd; }
}
.ic-bar  { width: 5px; align-self: stretch; flex-shrink: 0; }
.ic-info {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 2px;
  padding: 10px 10px;
}
.ic-name {
  font-size: 13px; font-weight: 700; color: #1a1a1a;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.ic-detail {
  font-size: 11px; color: #999;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  &:empty { display: none; }
}
.ic-action {
  width: 36px; height: 36px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; cursor: pointer;
  color: #ccc; touch-action: manipulation;
  transition: color 0.15s, background 0.15s;
  .material-symbols-outlined { font-size: 17px; }
  &:hover { color: #666; background: rgba(0, 0, 0, 0.04); }
  &.ic-action--danger:hover { color: #ef5350; background: rgba(239, 83, 80, 0.08); }
  &:last-child { margin-right: 4px; }
}
```

---

## 5. Buttons

### Primary (rectangular)

```scss
.btn-primary {
  padding: 8px 16px; border: none; border-radius: 10px;
  background: #006874; color: white;
  font-size: 13px; font-weight: 700; cursor: pointer;
  transition: background 0.15s; touch-action: manipulation;
  &:hover { background: #005a63; }
}
```

### Secondary (rectangular, outlined)

```scss
.btn-secondary {
  padding: 8px 16px; border-radius: 10px;
  border: 1.5px solid #e0e0e0; background: white; color: #666;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all 0.15s; touch-action: manipulation;
  &:hover { border-color: #bbb; color: #333; }
}
```

### Filter chip (horizontal scrollable bar)

```html
<div class="filter-bar">
  <button class="filter-chip" [class.active]="filter === null" (click)="set(null)">Tots</button>
  @for (cat of categories; track cat.value) {
    <button class="filter-chip"
            [class.active]="filter === cat.value"
            [style.--cat-color]="cat.color"
            (click)="set(cat.value)">
      <span class="material-symbols-outlined">{{ cat.icon }}</span>
      {{ cat.label }}
    </button>
  }
</div>
```

```scss
.filter-bar {
  display: flex; gap: 6px;
  padding: 4px 16px 12px;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}
.filter-chip {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 12px;
  border: 1.5px solid #e0e0e0; border-radius: 20px;
  background: white;
  font-size: 12px; font-weight: 600; color: #666;
  cursor: pointer; white-space: nowrap; touch-action: manipulation;
  transition: all 0.15s;
  .material-symbols-outlined { font-size: 15px; }
  &:hover:not(.active) { border-color: var(--cat-color, #006874); color: var(--cat-color, #006874); }
  &.active { background: var(--cat-color, #006874); border-color: var(--cat-color, #006874); color: white; }
}
```

### Round icon button (back, close)

```scss
.icon-btn {
  width: 36px; height: 36px; border-radius: 50%; border: none;
  background: transparent; cursor: pointer; color: #555;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s; touch-action: manipulation;
  .material-symbols-outlined { font-size: 20px; }
  &:hover { background: rgba(0, 0, 0, 0.06); }
}
```

---

## 6. Empty State

Place inside a `.card-section`:

```html
<div class="card-section">
  <div class="empty-state">
    <span class="material-symbols-outlined empty-icon">fitness_center</span>
    <p>No hi ha res encara</p>
    <div class="empty-actions">
      <button class="btn-primary" (click)="create()">Crea el primer</button>
      <button class="btn-secondary" (click)="seed()">Carrega per defecte</button>
    </div>
  </div>
</div>
```

```scss
.empty-state {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 28px 16px;
  text-align: center; color: #888;
  .empty-icon {
    font-size: 48px; color: #d8d8d8;
    font-variation-settings: 'FILL' 0, 'wght' 200;
  }
  p { margin: 0; font-size: 14px; font-weight: 500; }
}
.empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
```

---

## 7. Material Symbols

Always use the `material-symbols-outlined` class — never `mat-icon`.
Tune **fill** and **weight** per context with `font-variation-settings`:

```scss
/* Section header — light, outlined */
font-variation-settings: 'FILL' 0, 'wght' 300;

/* Active / selected state — filled, normal weight */
font-variation-settings: 'FILL' 1, 'wght' 400;

/* Empty state — extra light */
font-variation-settings: 'FILL' 0, 'wght' 200;
```

Common sizes: `15px` (inline), `17–18px` (action buttons / section icons),
`20–22px` (page-header buttons), `26–28px` (large nav buttons),
`48–56px` (empty-state hero).

---

## 8. Animations

```scss
/* Card entry (insights, banners) */
@keyframes ic-in {
  from { opacity: 0; transform: translateY(-6px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)    scale(1); }
}
animation: ic-in 0.25s cubic-bezier(0.34, 1.4, 0.64, 1) both;

/* Bottom-anchored bar entry */
@keyframes bar-in {
  from { transform: translateY(14px); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
animation: bar-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);

/* Skeleton shimmer */
@keyframes sk-shimmer {
  from { background-position: -300px 0; }
  to   { background-position: calc(300px + 100%) 0; }
}
.sk {
  background: linear-gradient(90deg, #f0f0f0 0%, #e8e8e8 40%, #f0f0f0 80%);
  background-size: 600px 100%;
  animation: sk-shimmer 1.5s ease-in-out infinite;
  border-radius: 8px;
}
```

Use `cubic-bezier(0.34, 1.4, 0.64, 1)` for cards (subtle overshoot) and
`cubic-bezier(0.34, 1.56, 0.64, 1)` for bottom bars (more bounce).

---

## 9. Interaction Patterns

- **Hover:** raise shadow + darken border, never change layout
- **Active / press:** `transform: scale(0.94–0.97)` on tap targets
- **Touch targets:** minimum `36×36px` (40px preferred) tap area
- **Always set:** `touch-action: manipulation;` on interactive elements
- **Truncation:** every `.ic-name` and `.ic-detail` truncates with ellipsis
  on overflow — never wrap to a second line
- **Confirm destructive actions:** `confirm("Eliminar X?")` before delete

---

## 10. Style Conventions

- **Compact grouped lines.** Flex / typography clusters go on one line:

  ```scss
  /* yes */
  display: flex; align-items: center; gap: 7px;
  font-size: 14px; font-weight: 700; color: #555;

  /* no */
  display: flex;
  align-items: center;
  gap: 7px;
  ```

- **CSS nesting** for `&:hover`, `&.active`, child selectors.
- **`color-mix()`** for tinted backgrounds tied to a CSS variable
  (`var(--ic)`, `var(--cat-color)`, `var(--sport-color)`).
- **No emojis in code** — use Material Symbols.
- **No `mat-button` / `mat-icon-button`** — write plain buttons styled per
  this guide. Material is reserved for `mat-slide-toggle`, `mat-dialog`,
  `mat-snack-bar` and form controls that need accessibility plumbing.

---

## 11. Page Starter Template

Copy-paste skeleton for a new page:

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-foo',
  standalone: true,
  imports: [],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Foo</h1>
        <button class="header-add" (click)="add()" aria-label="Afegir">
          <span class="material-symbols-outlined">add</span>
        </button>
      </header>

      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">category</span>
          <h2 class="section-title">Items</h2>
          <span class="section-count">{{ items.length }}</span>
        </div>

        @for (item of items; track item.id) {
          <div class="item-card">
            <div class="ic-bar" [style.background]="item.color"></div>
            <div class="ic-info">
              <span class="ic-name">{{ item.name }}</span>
              <span class="ic-detail">{{ item.detail }}</span>
            </div>
            <button class="ic-action" (click)="edit(item)" aria-label="Editar">
              <span class="material-symbols-outlined">edit</span>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 0 0 84px; }

    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 8px;
      h1 { margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.2px; }
    }
    .header-add {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: #006874; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover  { background: #005a63; }
      &:active { transform: scale(0.94); }
    }

    .card-section {
      margin: 12px 16px 0;
      padding: 14px 14px 16px;
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    }

    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon  { font-size: 18px; color: #888; font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: #555; letter-spacing: 0.2px; }
    .section-count {
      font-size: 11px; font-weight: 700; color: #999;
      background: #f0f0f0; border-radius: 10px; padding: 2px 8px;
    }

    .item-card {
      display: flex; align-items: center;
      margin-bottom: 6px;
      border: 1.5px solid #efefef; border-radius: 14px;
      background: white; overflow: hidden;
      transition: box-shadow 0.15s, border-color 0.15s;
      &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: #ddd; }
    }
    .ic-bar  { width: 5px; align-self: stretch; flex-shrink: 0; }
    .ic-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
      padding: 10px 10px;
    }
    .ic-name   { font-size: 13px; font-weight: 700; color: #1a1a1a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ic-detail { font-size: 11px; color: #999; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &:empty { display: none; } }
    .ic-action {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: #ccc; touch-action: manipulation;
      transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: #666; background: rgba(0,0,0,0.04); }
      &:last-child { margin-right: 4px; }
    }
  `],
})
export class FooComponent {}
```

---

## 12. Reference Pages

When in doubt, look at how it's done in:

| Page                                    | What it demonstrates                            |
| --------------------------------------- | ----------------------------------------------- |
| `features/train/train.component.ts`     | Section cards, type-grid, sport-grid, FAB, sticky topbar, skeleton screens |
| `features/library/library.component.ts` | Page header, filter chips, item cards with category color bar |
| `features/settings/settings.component.ts` | Sub-page with back button, setting row, hint banner |
| `shared/components/fitness-insights/fitness-insights.component.ts` | Color-tinted item cards with dynamic accent |
