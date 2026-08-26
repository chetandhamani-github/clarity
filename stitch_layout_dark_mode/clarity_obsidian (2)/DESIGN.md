---
name: Clarity Obsidian
colors:
  surface: '#1a1a1a'
  surface-dim: '#131313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353534'
  on-surface: '#e5e2e1'
  on-surface-variant: '#d3c4af'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#9c8f7b'
  outline-variant: '#4f4535'
  surface-tint: '#f7bd48'
  primary: '#f7bd48'
  on-primary: '#412d00'
  primary-container: '#ba880f'
  on-primary-container: '#392700'
  inverse-primary: '#7b5800'
  secondary: '#c6c6c7'
  on-secondary: '#2f3131'
  secondary-container: '#454747'
  on-secondary-container: '#b4b5b5'
  tertiary: '#c7c6c6'
  on-tertiary: '#2f3131'
  tertiary-container: '#909191'
  on-tertiary-container: '#292a2a'
  error: '#ffb4ab'
  on-error: '#ff9999'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#ffdea6'
  primary-fixed-dim: '#f7bd48'
  on-primary-fixed: '#271900'
  on-primary-fixed-variant: '#5d4200'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e3e2e2'
  tertiary-fixed-dim: '#c7c6c6'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#464747'
  background: '#131313'
  on-background: '#e5e2e1'
  surface-variant: '#353534'
  border-subtle: '#2a2a2a'
  success-muted: '#2d4d3a'
  error-muted: '#5c2b2b'
  info-muted: '#2b3e5c'
  on-success: '#8edba3'
  on-info: '#99c2ff'
typography:
  display-lg:
    fontFamily: Manrope
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  data-lg:
    fontFamily: Manrope
    fontSize: 28px
    fontWeight: '500'
    lineHeight: 32px
    letterSpacing: -0.03em
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
  label-sm:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.08em
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
  touch-target: 44px
---

## Brand & Style

The design system evolves into a high-end, "Private Banking" aesthetic through a **Minimalist** and **Tactile** dark theme. It is designed for high-net-worth users who prefer a low-light, focused environment that reduces visual noise and emphasizes financial security. The emotional response is "discreet luxury"—resembling a premium black metal credit card or a high-end timepiece.

The style moves away from flat surfaces toward **Tonal Layering**. Depth is established not by shadows, but by the subtle shift in charcoal values and thin, precise borders. The interface should feel like a single, cohesive piece of hardware where elements are etched into the surface rather than floating above it.

## Colors

The palette is a "Premium Obsidian" theme, engineered for high contrast and legibility in low-light conditions.

- **Primary (Muted Gold):** Reserved for high-value data points, primary calls to action, and active status indicators. This hex has been optimized to maintain its "gold" character without appearing muddy against charcoal.
- **Surface Strategy:** The background uses a deep charcoal (#0f0f0f) to minimize eye strain. Interactive cards and containers use a slightly elevated charcoal (#1a1a1a) to create a clear physical hierarchy.
- **Typography Tones:** Primary text uses an off-white (#f5f5f5) to prevent the "vibrating" effect of pure white on black. Secondary text and metadata use a muted gray (#a0a0a0).
- **System Colors:** Semantic colors (success, error, info) are desaturated and darkened for the background containers, while their foreground counterparts use brighter, tinted versions to ensure accessibility.

## Typography

This system continues to leverage **Manrope** for its technical precision and modern geometry.

In this dark mode variant, weight is used more intentionally than color to establish hierarchy. Large financial figures (`data-lg`) should appear crisp; consider adding a slight hint of the primary gold to these values if they represent positive growth. Section headers (`label-md`) should always be rendered in uppercase with increased letter spacing to act as structural anchors for the layout. Ensure all text meets a minimum contrast ratio of 4.5:1 against the charcoal surfaces.

## Layout & Spacing

The layout adheres to a strict **8px spacing rhythm**, ensuring mathematical harmony across all screen sizes.

On mobile, a **4-column fluid grid** is used with 20px margins. On desktop, the layout transitions to a **12-column fixed grid** with a maximum content width of 1200px. Content density should remain low to maintain the "sanctuary" feel—use `stack-lg` (32px) liberally between unrelated modules to let the data breathe. All interactive zones must respect the 44px `touch-target` to ensure the app remains functional for all users regardless of dexterity.

## Elevation & Depth

In this dark theme, elevation is communicated through **Tonal Layers** and **Low-contrast outlines** rather than shadows. Shadows are often lost in dark mode, so we rely on luminosity shifts.

1.  **Level 0 (Background):** Base layer at `#0f0f0f`.
2.  **Level 1 (Cards):** Surface layer at `#1a1a1a`. Defined by a 1px solid border of `#2a2a2a`.
3.  **Level 2 (Active/Overlays):** Surface layer at `#242424`. This slight increase in brightness denotes "interactivity" or "focus."
4.  **Glassmorphism:** For modals and navigation bars, use a 70% opacity version of the background color with a 20px backdrop blur. This maintains the premium, material feel of the "Obsidian" theme.

## Shapes

The shape language is "Refined Modern."

- **Primary Containers:** 16px corner radius for a soft but structured appearance.
- **Interactive Elements:** Buttons and inputs use a 12px radius, providing a distinct silhouette compared to the larger containers they sit within.
- **Accents:** Progress indicators and selection pills are fully rounded (pill-shaped) to provide a organic contrast to the otherwise rectangular grid.
- **Iconography:** Maintain a 2px stroke with rounded terminals to mirror the Manrope font characteristics.

## Components

### Buttons

- **Primary:** Solid Muted Gold (#B8860B) with Dark Charcoal (#0F0F0F) text for maximum legibility and "pop."
- **Secondary:** Transparent background with a 1.5px border of Off-White (#F5F5F5).
- **Tertiary:** Text-only in Muted Gold for secondary actions within cards.

### Cards & Containers

- **Standard Card:** Background #1A1A1A, 1px border #2A2A2A, 16px radius. No shadow.
- **Active Card:** Border color shifts to Primary Gold (#B8860B) at 50% opacity.

### Input Fields

- **Default:** Background #0F0F0F (creates a "hole" in the surface), 1px border #2A2A2A, 12px radius.
- **Focus:** Border shifts to Primary Gold, background remains dark. Labels should use `label-md` in Gray (#A0A0A0) above the field.

### Data Visualization

- **Charts:** Strokes should be 2px thick. Use the semantic "On-Success" and "On-Error" colors for trend lines. Area fills should use a 10% opacity vertical gradient that fades into the card background.
- **Tabs:** Use a segmented control style with a subtle #2A2A2A background and a #333333 active state pill.

### Navigation

- **Bottom Bar:** 70% #0F0F0F with heavy backdrop blur. Active icons use Primary Gold; inactive icons use Muted Gray.
