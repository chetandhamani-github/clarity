---
name: Clarity Financial
colors:
  surface: '#faf9fe'
  surface-dim: '#dad9df'
  surface-bright: '#faf9fe'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f8'
  surface-container: '#eeedf3'
  surface-container-high: '#e9e7ed'
  surface-container-highest: '#e3e2e7'
  on-surface: '#1a1b1f'
  on-surface-variant: '#4f4535'
  inverse-surface: '#2f3034'
  inverse-on-surface: '#f1f0f5'
  outline: '#817563'
  outline-variant: '#d3c4af'
  surface-tint: '#7b5800'
  primary: '#785600'
  on-primary: '#ffffff'
  primary-container: '#986d00'
  on-primary-container: '#fffbff'
  inverse-primary: '#f7bd48'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#5b5c59'
  on-tertiary: '#ffffff'
  tertiary-container: '#747572'
  on-tertiary-container: '#fefcf8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdea6'
  primary-fixed-dim: '#f7bd48'
  on-primary-fixed: '#271900'
  on-primary-fixed-variant: '#5d4200'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#e3e2df'
  tertiary-fixed-dim: '#c7c7c3'
  on-tertiary-fixed: '#1b1c1a'
  on-tertiary-fixed-variant: '#464744'
  background: '#faf9fe'
  on-background: '#1a1b1f'
  surface-variant: '#e3e2e7'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Manrope
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Manrope
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Manrope
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Manrope
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-lg:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  margin-mobile: 20px
  gutter: 12px
  stack-sm: 4px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system for this premium financial app is built on a foundation of **Minimalism** with **Tactile** nuances. It targets high-net-worth individuals and young professionals seeking a sanctuary from the typical chaotic fintech aesthetic. The emotional response is one of "ordered calm"—a digital vault that feels secure, sophisticated, and effortless.

The aesthetic avoids heavy shadows or aggressive gradients, relying instead on a high-contrast palette of cream, charcoal, and muted gold. Surfaces are defined by soft, subtle borders and a hierarchy of off-white tones, creating a sense of physical layering without visual clutter.

## Colors

The palette is rooted in timeless, premium tones.

- **Primary (Muted Gold):** Used sparingly for high-intent actions, progress indicators, and active states. It should feel like an "award" or a "highlight."
- **Secondary (Charcoal):** The anchor for all content. It provides the necessary weight and authority for financial data.
- **Background & Surfaces:** A triple-layered approach using `#F7F6F2` for the base canvas, `#FFFFFF` for primary cards, and `#F0EFEA` for secondary containers or input backgrounds.
- **Charts:** Use thin 1.5pt strokes. For success/danger, use the muted semantic variants to maintain the sophisticated atmosphere.

## Typography

This design system utilizes **Manrope** for its modern, geometric construction and exceptional legibility at small sizes.

- **Financial Data:** For account balances and large figures, use `data-lg` with medium weight and tight letter-spacing to evoke a sense of precision.
- **Hierarchy:** Use `label-md` in uppercase for section headers and overlines to provide clear categorical separation without excessive font-size variance.
- **Color Application:** Primary text uses Charcoal (#1A1A1A). Secondary text uses 60% opacity of Charcoal. Tertiary/Placeholder text uses 40% opacity.

## Layout & Spacing

The layout follows a strict **8px grid** system. For mobile interfaces, a **4-column fluid grid** is used with 20px outer margins and 12px gutters.

- **Vertical Rhythm:** Elements should be grouped using 16px (stack-md) for related items and 32px (stack-lg) to separate distinct logical sections.
- **Touch Targets:** All interactive elements must maintain a minimum hit area of 44x44px, even if the visual asset is smaller.
- **Safe Areas:** Ensure content respects the top notch and bottom home indicator on modern mobile devices.

## Elevation & Depth

Depth is conveyed through **Tonal Layers** and **Low-contrast outlines** rather than heavy shadows.

1.  **Level 0 (Base):** Background color `#F7F6F2`.
2.  **Level 1 (Cards/Containers):** Pure white `#FFFFFF` with a 1px border of `#E5E4E0`. No shadow.
3.  **Level 2 (Active/Floating):** Pure white `#FFFFFF` with a very soft, diffused shadow: `0 8px 24px rgba(26, 26, 26, 0.04)`.
4.  **Scrim:** For modals, use a 40% opacity Charcoal overlay with a 10px backdrop blur to maintain the clean, "glass-like" sophisticated feel.

## Shapes

The shape language is "Soft-Modern."

- **Standard Cards/Containers:** 16px corner radius (`rounded-lg` equivalent).
- **Buttons & Inputs:** 12px corner radius for a refined, professional look.
- **Progress Bars:** Fully rounded (pill) ends to indicate fluidity and growth.
- **Icons:** Use a 2px stroke weight with rounded caps and joins to match the typography's terminal softness.

## Components

### Buttons

- **Primary:** Background Muted Gold (#B8860B), text White (#FFFFFF). 12px radius.
- **Secondary:** Background Clear, Border 1.5px Charcoal (#1A1A1A), text Charcoal.
- **Tertiary/Ghost:** No background, Gold text, for low-emphasis actions.

### Bottom Navigation

- **Structure:** 5-tab fixed bar. Background White (#FFFFFF) with a top-border of 0.5px.
- **Central FAB:** A floating gold circle for the "Add Transaction/Goal" action, positioned slightly above the bar with a soft elevation.

### Cards

- **Financial Card:** White background, 16px radius, 1px subtle border. Internal padding of 20px.
- **Information Density:** Use `label-md` for data titles and `body-lg` or `data-lg` for values.

### Input Fields

- **Default State:** Background `#F0EFEA`, no border, 12px radius.
- **Focus State:** Background White (#FFFFFF), 1.5px border of Muted Gold (#B8860B).
- **Labels:** Floating or top-aligned `label-md` in Charcoal.

### Charts & Data

- **Lines:** 1.5pt thickness. Area charts should use a very faint gradient of the line color (5% opacity) to white.
- **Empty States:** Use thin-line illustrations in Gray with a single Gold accent point. Typography should be centered with a secondary body text explanation and a primary action button.
