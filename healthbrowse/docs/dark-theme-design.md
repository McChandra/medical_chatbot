# HealthBrowse AI: dark theme and Account Settings specification

This specification applies to the Account Settings workspace and the shared HealthBrowse dark theme, including authentication, the research desk, search suggestions, and Buddy. It retains the brand's green identity using muted mint actions and neutral charcoal surfaces. Light mode remains available. Theme changes do not change authentication, evidence retrieval, or model behavior.

The implementation uses plain CSS custom properties; Tailwind is not required. The source of truth is [theme.css](../dist/theme.css), with layout in [settings.css](../dist/settings.css), markup in [account.html](../dist/account.html), and section navigation in [settings-ui.js](../dist/settings-ui.js).

## Component hierarchy and layout

| Layer | Contents | Layout and behavior |
| --- | --- | --- |
| Global header | HealthBrowse wordmark, research navigation, theme selection, sign out | Wordmark at the left. At narrow widths, navigation, theme selection, and sign out stay inside the existing menu. |
| Page introduction | Account Settings title and short explanatory text | One page heading; normal document flow above the workspace. |
| Desktop navigation | Profile; Security & Authentication; Notifications; Preferences; Data & Privacy; Chats; Saved; Help | 228px sidebar, sticky 24px from the top. The selected link uses `aria-current="page"`, a mint background, and dark text. |
| Mobile navigation | Labeled settings-section selector | At 760px and below, replaces the sidebar and sits above the active section. Minimum height 48px. |
| Main content | One active settings section | Flexible `minmax(0, 1fr)` column. Hidden sections are removed from layout and keyboard navigation. |
| Section card | Heading, explanation, grouped controls, status, save action | Level 1 surface, 20–32px padding, 16px corner radius (12px on mobile). Card height follows its content. |
| Field group | Visible label, field, helper/error copy | Labels remain above inputs. First/last name use paired columns on desktop and one column on mobile. Placeholder text never replaces a label. |
| Save row | Supporting text and primary button | Normal document flow, separated by a divider. At mobile widths, the button spans the available width. It does not cover content as a fixed footer. |
| Sensitive actions | History deletion and explanatory account-status copy | Soft coral border and descriptive labels; destructive actions use the existing confirmation dialog. |
| Transient feedback | Toast, dialog, Buddy prompt, autocomplete | Elevated surfaces distinguish overlays. Visible status text carries meaning without relying on color. Dialogs retain their existing focus/close behavior. |

Profile editing, email verification, password controls, preferences, exports, and saved-workspace actions retain their existing behavior. The theme does not add notification delivery, MFA enrollment, account closure, billing, or a new clinical permission system. Any unavailable capability continues to be described honestly in the interface.

## Semantic palette

Use tokens rather than hard-coded colors in components. Hex values below are opaque sRGB colors.

| CSS variable | Hex | Intended use |
| --- | --- | --- |
| `--paper` | `#121819` | Level 0 page background; editable-field background |
| `--surface` | `#1D2729` | Level 1 cards and navigation controls |
| `--elevated` | `#2B383B` | Level 2 dialogs, autocomplete, Buddy overlay |
| `--panel` | `#263336` | Grouped/inset content and disabled controls |
| `--wash` | `#1A2224` | Search and background sections |
| `--tag` | `#344448` | Compact category surfaces |
| `--hover` | `#354649` | Hovered secondary controls and suggestion rows |
| `--ink` | `#E0E6E7` | Primary text and headings |
| `--dim` | `#ADBABC` | Secondary text, helper copy, placeholders |
| `--disabled` | `#98A6A8` | Disabled-field text on `--panel` |
| `--line` | `#3D4B4E` | Decorative card borders and separators only |
| `--control-border` | `#84969B` | Identifiable input and secondary-button boundaries |
| `--link`, `--accent`, `--muted-green` | `#A7CBB8` | Links, status accents, meaningful highlights |
| `--action` | `#A7CBB8` | Primary action and selected navigation fill |
| `--action-hover` | `#BDDCCB` | Brighter primary-action hover fill |
| `--on-action` | `#142720` | Text on mint action/selected backgrounds |
| `--focus` | `#99C8EB` | Keyboard focus outline |
| `--danger` | `#E8A0AC` | Errors and destructive labels/borders |
| `--danger-bg` | `#38282F` | Destructive-action group background |

Primary text uses a soft off-white. No dark page, card, or elevated surface uses pure black or pure white. Increased surface luminance communicates elevation; overlays do not rely on shadows. Comfort varies by person and lighting, so the user can switch themes.

### Calculated contrast

These are token-pair calculations, not a claim that the entire application has passed an accessibility audit. Ratios are rounded here only for display; automated pass/fail comparisons use unrounded values.

| Foreground | Page `#121819` | Card `#1D2729` | Elevated `#2B383B` | Intended minimum |
| --- | ---: | ---: | ---: | ---: |
| Primary text `#E0E6E7` | 14.22:1 | 12.11:1 | 9.61:1 | 4.5:1 |
| Secondary text `#ADBABC` | 8.99:1 | 7.66:1 | 6.08:1 | 4.5:1 |
| Links `#A7CBB8` | 10.15:1 | 8.64:1 | 6.86:1 | 4.5:1 |
| Control border `#84969B` | 5.82:1 | 4.96:1 | 3.94:1 | 3:1 |
| Focus outline `#99C8EB` | 10.10:1 | 8.60:1 | 6.82:1 | 3:1 |

Primary-button text on mint is 8.86:1. The tests also check text, links, and error copy across inset, tag, hover, and danger surfaces; meaningful control boundaries and focus outlines meet 3:1 across those surfaces. Disabled text is checked on its actual disabled-control surface. The subtle divider token is **not** suitable as the sole visible boundary of a form control.

## Spacing, sizing, and typography

Use a 4px spacing scale for new components: 4, 8, 12, 16, 20, 24, 32, 36, and 48px. The corresponding `--space-*` variables use rem units so the spacing can grow with the root font size. Existing components retain small optical adjustments where they already work.

| Element | Specification |
| --- | --- |
| Workspace width | Maximum 1240px including padding; width 100% |
| Outer horizontal padding | `clamp(16px, 4vw, 44px)` |
| Desktop columns | `228px minmax(0, 1fr)`; 36px gap |
| Workspace top spacing | 32px desktop; 24px mobile |
| Card padding | `clamp(20px, 3vw, 32px)` |
| Paired-field gap | 16px; collapse into one column at 760px |
| Settings actions | Minimum 44px height; labels can wrap |
| Settings inputs | Minimum 46px height; 10px vertical / 12px horizontal padding |
| Body typography | System sans-serif, 16px, weight 400, 1.6 line height, `.01em` tracking |
| Explanatory paragraphs | 1.65 line height in dark mode |
| Page heading | 32–44px on settings; existing serif brand typography retained |
| Section headings | System sans-serif, 23–29px, weight 650, 1.25 line height |
| Labels / secondary copy | Generally 14px; labels weight 600; helper copy 12–14px |
| Focus | 3px solid `--focus`, 3px offset |

The 44px target is a product comfort target, not a claim that every existing control in the application meets WCAG's enhanced target-size criterion. Avoid fixed text-container heights and truncation of instructions. Use `min-width: 0`, wrapping, and content-driven heights so long names, translations, and zoom do not force page-wide horizontal scrolling. Tables may scroll within their own labeled region when their structure requires it.

## CSS implementation reference

The full implementation is in the linked stylesheets. The following extract describes the reusable token and layout contract; component selectors in `theme.css` also handle the existing authentication and Buddy styles.

```css
:root[data-theme="dark"] {
  color-scheme: dark;
  --paper: #121819;
  --surface: #1d2729;
  --elevated: #2b383b;
  --panel: #263336;
  --wash: #1a2224;
  --tag: #344448;
  --hover: #354649;
  --ink: #e0e6e7;
  --dim: #adbabc;
  --disabled: #98a6a8;
  --line: #3d4b4e;
  --control-border: #84969b;
  --link: #a7cbb8;
  --accent: #a7cbb8;
  --muted-green: #a7cbb8;
  --action: #a7cbb8;
  --action-hover: #bddccb;
  --on-action: #142720;
  --focus: #99c8eb;
  --danger: #e8a0ac;
  --danger-bg: #38282f;
}

#settingsShell {
  display: grid;
  grid-template-columns: 228px minmax(0, 1fr);
  gap: var(--space-9); /* 2.25rem / 36px at the default root size */
  align-items: start;
  margin-top: var(--space-8);
}
.settings-content { min-width: 0; }
.settings-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}
@media (max-width: 760px) {
  #settingsShell { display: block; margin-top: 24px; }
  .settings-sidebar { display: none; }
  .mobile-section-label, .mobile-section-select {
    display: block;
    width: 100%;
  }
  .settings-fields { grid-template-columns: minmax(0, 1fr); gap: 0; }
}
```

## Interaction and accessibility rules

- **Rest:** visible labels, readable secondary text, and stronger boundaries on inputs. Neutral dividers separate content without competing with it.
- **Hover:** lighten the surface to `--hover`. Primary actions lighten to `--action-hover` and keep `--on-action` text. Disabled controls do not gain an enabled appearance.
- **Focus:** show a 3px outline outside the control with a 3px gap. Preserve native focus behavior, logical tab order, and visible focus for the avatar upload's associated label. Do not use `outline: none` without an equivalent replacement.
- **Selected:** mint fill, dark text, and semantic `aria-current` or `aria-pressed`; never infer selection from color alone.
- **Error:** use `aria-invalid`, a coral border, and a nearby explanation of the correction needed. The error selector takes precedence over the neutral input boundary. Do not add validation based only on color.
- **Disabled:** use the `--panel` background and `--disabled` text at full opacity; explain unavailable actions in visible text. Inactive controls are exempt from WCAG contrast requirements, but this theme still aims to keep their text readable.
- **Links:** underline links in substantive answer and settings content, with a small underline offset. Navigation uses its existing semantic and active-state treatment.
- **Overlays:** use `--elevated`, a visible boundary, and a dark translucent backdrop where appropriate. Keep close controls available, scroll long content inside the existing dialog, and return focus on close.
- **Motion and forced colors:** respect reduced-motion preferences and preserve system-color focus indicators in forced-colors mode. Do not disable the browser's forced-color adjustments.
- **Text adaptation:** allow user overrides of line height, paragraph spacing, letter spacing, and word spacing without clipping or lost controls. WCAG text-spacing values are override tests, not mandatory default typography.

## Verification and remaining review

Run `node --test tests/theme-contrast.test.mjs` for the sRGB luminance checks, then `npm test` and `npm run build` for repository validation. The contrast tests intentionally cover semantic foreground/background combinations rather than matching CSS strings or assuming that decorative borders must meet a control-boundary threshold.

This change was checked with calculated palette contrast and repository tests/builds. The managed visual preview was unavailable for the current Worker hosting manifest, so rendered browser, screen-reader, and device acceptance are still required. Do not describe these calculations as full WCAG conformance or a medical claim about eye strain.

Manual acceptance checklist:

1. At 320px, 375px, 768px, and desktop widths, check sign-in, every settings section, research results, autocomplete, and Buddy in both themes. Verify no page-wide horizontal overflow or obscured action buttons.
2. At 200% text resize and 400% browser zoom, check labels, help text, dialogs, and the mobile section selector. Test text-spacing overrides: 1.5 line height, 2em paragraph spacing, `.12em` letter spacing, `.16em` word spacing.
3. Use keyboard-only navigation through the menu, theme control, settings selector, forms, upload control, dialogs, and Buddy. Verify visible focus, Escape behavior, focus return, and no keyboard trap.
4. Check actual rendered styles for normal, hover, selected, disabled, autofill, invalid, and focus states. Recalculate contrast if opacity, gradients, images, or additional CSS change the effective colors.
5. With a screen reader, verify section labels, error/status announcements, and selected navigation. With forced colors and reduced motion, verify controls remain understandable and operable.

## Standards references

- [WCAG 2.2 — Contrast (Minimum), 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html): 4.5:1 for normal text, 3:1 for large text; large means at least 24 CSS px regular or about 18.67 CSS px bold. This palette aims for 4.5:1 even for headings.
- [WCAG 2.2 — Non-text Contrast, 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html): 3:1 for visual information needed to identify controls and states against adjacent colors.
- [WCAG 2.2 — Text Spacing, 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html): user spacing overrides must not cause loss of content or functionality.

References guide the design targets; the implementation status above distinguishes automated evidence from pending human review.
