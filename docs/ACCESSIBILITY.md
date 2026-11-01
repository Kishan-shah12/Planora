# Accessibility

Target: **WCAG 2.1 AA**, checked automatically in a real browser on every push.

## Structure and navigation

- `lang="en-IN"`, one `h1`, `header` and `main` landmarks, a skip link as the first focusable element.
- The four sections are a WAI-ARIA tablist: `tab`, `tabpanel`, `aria-selected`, `aria-controls`, roving `tabindex`, and Left, Right, Home and End keys.
- After a plan is created, focus moves to the plan title so keyboard and screen-reader users land on the result.

## Forms

- Every control has a visible label (or an accessible name for icon buttons); hints are linked with `aria-describedby`.
- A failed submit shows an **error summary** that takes focus, says how many things need fixing and links to each field. Each field also shows its own message and sets `aria-invalid`.
- The budget field accepts many spellings ("8 lakh", "8L", "8,00,000") and confirms what it understood.

## Visual design

- Text contrast is at least 4.5:1 in **both light and dark themes**. `tests/ui/theme.test.tsx` parses the real colour tokens and checks every text pairing; Playwright runs axe (including colour contrast) on every tab in both themes.
- Information is never shown by colour alone: over budget, at risk, overdue and verified are always written in words with an icon.
- Visible 3 px focus rings; 44 px minimum touch targets; no horizontal scrolling from 320 px wide.
- `prefers-reduced-motion` removes animation; `prefers-contrast: more` strengthens secondary text and borders; forced-colours mode keeps borders and the category key visible.
- The theme follows the system setting, can be toggled, and is applied before first paint to avoid a flash.

## Dynamic content

- Budget warnings, toasts, AI results and the assistant conversation are `aria-live` regions (the conversation is a `role="log"`).
- AI calls show a skeleton with status text immediately; failures are announced with a retry button, and the rest of the app keeps working.
- All text from the AI or a share link is rendered as text, never as HTML.

## How it is verified

| Check                                                                         | Where                     |
| ----------------------------------------------------------------------------- | ------------------------- |
| axe in jsdom on every tab and state                                           | `tests/ui/a11y.test.tsx`  |
| axe with colour contrast in real Chromium, light and dark, desktop and mobile | `e2e/app.spec.ts`         |
| Token contrast for every text pair, both themes; contrast-mode CSS present    | `tests/ui/theme.test.tsx` |
| Keyboard tabs, error summary focus and links, focus after creation            | `tests/ui/*.test.tsx`     |
| No horizontal scroll on any tab (Pixel 7 and desktop)                         | `e2e/app.spec.ts`         |

Worth repeating by hand before a release: the whole flow with a keyboard only, a screen reader (NVDA or VoiceOver) through the form and the assistant, 200% and 400% zoom, and Windows high-contrast mode.
