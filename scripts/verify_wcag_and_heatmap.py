"""Calculates WCAG 2.1 relative luminance and contrast ratios, and simulates color vision deficiency."""

def hex_to_srgb(hex_code: str) -> tuple[float, float, float]:
    hex_code = hex_code.lstrip("#")
    r = int(hex_code[0:2], 16) / 255.0
    g = int(hex_code[2:4], 16) / 255.0
    b = int(hex_code[4:6], 16) / 255.0
    return r, g, b

def srgb_channel_to_linear(c: float) -> float:
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4

def relative_luminance(hex_code: str) -> float:
    r, g, b = hex_to_srgb(hex_code)
    r_lin = srgb_channel_to_linear(r)
    g_lin = srgb_channel_to_linear(g)
    b_lin = srgb_channel_to_linear(b)
    return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin

def contrast_ratio(hex1: str, hex2: str) -> float:
    l1 = relative_luminance(hex1)
    l2 = relative_luminance(hex2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)

# Verification of user observation: #787268 on #F6F4EE
canvas = "#F6F4EE"
old_muted = "#787268"
print(f"Old muted {old_muted} on {canvas}: {contrast_ratio(old_muted, canvas):.2f}:1")

# Palette tokens to test against canvas
palette = [
    ("--color-ink-primary", "#1A1815", canvas),
    ("--color-ink-secondary", "#58534A", canvas),
    ("--color-ink-muted (candidate: #686257)", "#686257", canvas),
    ("--color-ink-muted (candidate: #645F54)", "#645F54", canvas),
    ("--color-adobe", "#96532B", canvas),
    ("--color-adobe (darker: #8C4B25)", "#8C4B25", canvas),
    ("--color-pacific", "#1D3D4D", canvas),
    ("--color-sol-ochre", "#875A12", canvas),
    ("--color-surface", "#ECE7DB", canvas),
    ("--color-border", "#D3CBBF", canvas),
]

print("\n--- PALETTE CONTRAST RESULTS ---")
for token, fg, bg in palette:
    ratio = contrast_ratio(fg, bg)
    passes_aa = "PASS AA" if ratio >= 4.5 else "FAIL AA"
    passes_aaa = "PASS AAA" if ratio >= 7.0 else "---"
    print(f"{token:<40} | FG: {fg} BG: {bg} | Ratio: {ratio:5.2f}:1 | {passes_aa} | {passes_aaa}")

# Heatmap step redesign:
# User note:
# "los fondos actuales son demasiado pálidos y los escalones Crítico/Desfavorable y Regular/canvas casi no se distinguen.
# Redefine los 5 escalones con fondos planos claramente diferenciables entre sí y contra el canvas,
# verifica contraste del texto interno, y comprueba que la escala sea distinguible para daltonismo (rojo-verde) simulándola."

# Let's design 5 solid, clearly distinct, saturated-yet-sober steps that are:
# 1. Distinct from canvas (#F6F4EE) - difference in luminance and saturation
# 2. Distinct from each adjacent step in both normal vision AND deuteranopia/protanopia
# 3. High internal text contrast (>= 4.5:1, preferably >= 7.0:1)

# Step 1: Critico (0-39) -> Terracota arcilla oscura / teja quemada
# Step 2: Desfavorable (40-54) -> Ocre o Canela Moche / tostado
# Step 3: Regular (55-69) -> Mostaza arena / Pajizo dorado
# Step 4: Favorable (70-84) -> Verde junco / totora seco litoral
# Step 5: Optimo (85-100) -> Azul litoral / Pacifico profundo

# Notice for red-green colorblindness (deuteranopia / protanopia):
# If step 1 is red and step 4 is green with similar luminance, a colorblind person cannot distinguish them!
# To make it universally distinguishable for colorblindness:
# The steps MUST monotonicly vary in luminance or have distinct brightness/shade levels,
# OR use a color palette that is safe for daltonism (e.g. Purple/Dark Red -> Ochre -> Muted Green/Khaki -> Light Cyan/Teal -> Deep Pacific Blue, or distinct Lightness steps: L1 < L2 < L3 etc.).
# Let's test a sequence of candidate steps.

candidate_steps = [
    # (Level, Name, Range, BG, FG, Border)
    (1, "Critico", "0-39", "#F2C4BC", "#6E1B10", "#A8382A"),       # Lighter terracotta, dark brick text
    (2, "Desfavorable", "40-54", "#FAD8A8", "#784408", "#B56B16"), # Warm amber/ochre
    (3, "Regular", "55-69", "#E8DFB8", "#544C16", "#8F8236"),     # Golden reed / totora
    (4, "Favorable", "70-84", "#CFE3D5", "#134D2E", "#327D54"),   # Crisp coastal reed green
    (5, "Optimo", "85-100", "#BFE0ED", "#0D4259", "#246C8C"),     # Crisp Pacific coast blue
]

print("\n--- HEATMAP STEPS EVALUATION ---")
print(f"Canvas reference: {canvas} (Luminance: {relative_luminance(canvas):.3f})")
for lvl, name, rng, bg, fg, border in candidate_steps:
    bg_lum = relative_luminance(bg)
    fg_lum = relative_luminance(fg)
    bg_vs_canvas = contrast_ratio(bg, canvas)
    text_vs_bg = contrast_ratio(fg, bg)
    print(f"[{lvl}] {name:<14} ({rng:<6}) | BG: {bg} (L={bg_lum:.3f}) | FG: {fg} | Text-BG: {text_vs_bg:.2f}:1 (AA: {text_vs_bg>=4.5}) | BG-Canvas: {bg_vs_canvas:.2f}:1")
