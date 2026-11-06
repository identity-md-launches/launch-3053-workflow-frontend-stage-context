# SqueekBoard implemented design

## Overview

A compact community app for badge minting and daily check-ins. The existing warm cream/brown palette, hamster artwork, sentence-case copy and bordered white surfaces are preserved. The action card follows the introduction immediately on narrow screens; on desktop the introduction/artwork and action card form two columns. Source: `web/src/styles.css`, `web/src/App.tsx` and `web/src/wallet/ConnectSheet.tsx`.

This file is under `docs/` because the assignment explicitly restricts normal writes to `web/`, `dist/` and `docs/`.

## Colors

All component colors use the semantic CSS properties in `web/src/styles.css:2`. Primitives remain in hex; no additional theme or unused ramp was added.

| Semantic token | Primitive / resolved value | Use |
| --- | --- | --- |
| `--color-bg` | `--cream-50` / `#fffaf2` | Page |
| `--color-surface` | `--white` / `#ffffff` | Cards, secondary controls, dialog |
| `--color-surface-tint` | `--cream-100` / `#fff1d9` | Highlighted board row, warning, hover |
| `--color-border` | `--sand-200` / `#ecd9bd` | Structural separators |
| `--color-border-strong` | `--sand-300` / `#dcc29d` | Neutral control outlines |
| `--color-text`, `--color-focus` | `--brown-900` / `#3b2412` | Main text, focus outline |
| `--color-text-secondary` | `--brown-600` / `#7a4f26` | Supporting text |
| `--color-accent-solid`, `--color-link` | `--rust-600` / `#9c4510` | Current primary action, links |
| `--color-accent-hover` | `--rust-700` / `#82380b` | Primary hover |
| `--color-accent-pressed` | `--rust-800` / `#6b2e09` | Primary press |
| `--color-on-accent` | `--white` / `#ffffff` | Primary button label |
| `--color-success` | `--green-700` / `#2f6b2f` | Completed actions with checkmark/text |
| `--color-danger` | `--red-700` / `#a3242f` | Inline error text |

The dialog backdrop is `rgb(59 36 18 / 0.45)`. Contrast coverage and its limits are in [VALIDATION.md](VALIDATION.md); no dark-mode implementation is implied.

## Typography

`--font-sans` uses the platform UI stack (system-ui, Apple/Segoe UI/Roboto/Helvetica/Arial fallbacks). `--font-mono` is reserved for addresses. There are no fetched font files.

| Token | Value | Role |
| --- | --- | --- |
| `--text-sm` | `0.8125rem` (13px at the default root size) | Captions, table details, status notes |
| `--text-base` | `1rem` | Body and controls |
| `--text-lg` | `1.25rem` | Section/step headings and brand |
| `--text-xl` | `1.5rem` | Stat values |
| `--text-display` | `clamp(2rem, 1.4rem + 2.6vw, 2.75rem)` | Only the main headline |

Weights are 400, 600 and 700; the headline uses 700. Body line height is 1.5, headline 1.1 with `-0.02em` tracking, section/step headings 1.2. Headings balance; descriptive text uses pretty wrapping. Numeric values use tabular digits. Address text uses `.mono` (`0.9375em`), and complete contract addresses wrap with `overflow-wrap: anywhere`. The lede is capped at 36rem. These are CSS stack requests, not a claim that a particular font loaded on every platform.

## Layout

Spacing tokens are 4, 8, 12, 16, 24, 32 and 48px (`--space-1` through `--space-7`). `.shell` centers content with `--content-max: 1080px` and 16px inline padding. Cards use 16px padding, rising to 24px from 30rem.

- `.hero` is one column with 24px gaps by default. At 60rem it uses `minmax(0, 0.9fr) minmax(0, 1.1fr)`, a 48px gap and larger block padding. Artwork is hidden below 60rem to keep actions near the top.
- `.stats` is a two-column grid of `minmax(0, 1fr)` cells with wrap-safe values. `.step` uses wrapping flex rows rather than a fixed height.
- `.facts` becomes two columns at 45rem. `.table-wrap` owns any table scrolling; complete addresses are separately available through contract/leaderboard links.
- `.sheet` has a 420px maximum width on desktop and becomes a bottom sheet at 40rem and below, with safe-area-aware bottom padding.

Production screenshots at 320, 390 and 1440 and zero-overflow stress tests confirm the reviewed layouts. Other viewport/font combinations remain subject to browser behavior.

## Elevation & Depth

Surfaces are flat: white cards use a 1px structural border and no shadow. The native modal dialog supplies the top layer and a translucent backdrop. Artwork and wallet icons have a low-opacity black 1px outline inset by 1px. Do not add nested card/shadow decoration to a routine read/retry state.

## Shapes

`--radius-control: 10px` for buttons, warnings and wallet rows; `--radius-card: 16px` for cards/dialog. Stats use a 3px leading border. Desktop artwork uses a 28px radius; icons and the close control use 8px. The bottom sheet removes its bottom corner rounding.

## Components

- `ConnectSheet` (`web/src/wallet/ConnectSheet.tsx`) exposes `size="small" | "large"`. It renders connection, switching, short-address/disconnect and native-dialog states. Named injected connectors remain selectable on mobile; only the unavailable generic row is suppressed. The dialog uses native focus trapping, Escape/close/backdrop dismissal and focus return. Open in rows remain links.
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-quiet`, `.btn-large` (`styles.css`) share a 44px minimum height (large: 48px), 16px inline padding, hover/pressed/focus/disabled states. The primary action follows readiness: connect, switch, mint, then spin. The supply retry uses the secondary style.
- `Stat`, `Done`, `TxNote` (`App.tsx`) are local patterns for loading numeric values, checkmark/text completion and persistent transaction feedback with explorer links.
- `Leaderboard` (`App.tsx`) renders loading/error/empty/table states, has its own retry and highlights the connected wallet. Public supply/totals use a separate read query and separate retry; available values stay visible after refresh failure with a disclosure.
- `ContractLink` (`App.tsx`) shows the full wrapping address and descriptive explorer destination. Explorer/network configuration comes from the loaded deployment manifest.
- `web/public/badge.svg` and `favicon.svg` are the existing brand assets. `og.png` is the 1200 × 630 sharing asset, reproduced by `web/scripts/share-card.mjs` using the same palette/artwork.

Buttons transition only background, border, color and scale over 150ms with `--ease: cubic-bezier(0.2, 0, 0, 1)`. Press scale is 0.96. Reduced motion removes scale changes. Global `:focus-visible` uses a 2px focus-token outline with 2px offset. Wallet rows have 48px minimum height; the close button is 32px.

## Do's and Don'ts

Reuse `.shell`, the semantic color tokens, existing type scale and flat `.card` treatment for another section. Use a sentence-case heading, put instructions beside the action, and use a neutral retry with an explicit pending/error state. Keep the main action in the first mobile screen and retain full-address access. Never substitute stale data with a loading message after failure or introduce a second deployment map. Check narrow widths and re-run build/manifest verification after changing exported assets.
