"""Evaluates enhanced heatmap steps with luminance, contrast, and CVD simulation."""
import numpy as np

PROTANOPIA_MATRIX = np.array([
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281,  0.099216],
    [-0.003882, -0.048116, 1.051998]
])

DEUTERANOPIA_MATRIX = np.array([
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501,  0.047413],
    [-0.011820, 0.042940, 0.968881]
])

def hex_to_rgb255(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip('#')
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)

def rgb_to_hex(r: float, g: float, b: float) -> str:
    r_c = int(np.clip(round(r), 0, 255))
    g_c = int(np.clip(round(g), 0, 255))
    b_c = int(np.clip(round(b), 0, 255))
    return f"#{r_c:02X}{g_c:02X}{b_c:02X}"

def simulate_cvd(hex_str: str, matrix: np.ndarray) -> str:
    r, g, b = [c / 255.0 for c in hex_to_rgb255(hex_str)]
    def to_lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r_l, g_l, b_l = to_lin(r), to_lin(g), to_lin(b)
    sim_l = matrix @ np.array([r_l, g_l, b_l])
    def to_srgb(c: float) -> float:
        c = np.clip(c, 0.0, 1.0)
        return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1.0 / 2.4)) - 0.055
    sim_rgb = [to_srgb(c) * 255.0 for c in sim_l]
    return rgb_to_hex(sim_rgb[0], sim_rgb[1], sim_rgb[2])

def hex_to_srgb(hex_code: str) -> tuple[float, float, float]:
    hex_code = hex_code.lstrip("#")
    return int(hex_code[0:2], 16) / 255.0, int(hex_code[2:4], 16) / 255.0, int(hex_code[4:6], 16) / 255.0

def srgb_channel_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def relative_luminance(hex_code: str) -> float:
    r, g, b = hex_to_srgb(hex_code)
    return 0.2126 * srgb_channel_to_linear(r) + 0.7152 * srgb_channel_to_linear(g) + 0.0722 * srgb_channel_to_linear(b)

def contrast_ratio(hex1: str, hex2: str) -> float:
    l1, l2 = relative_luminance(hex1), relative_luminance(hex2)
    return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)

# Candidate palette with distinct, vivid yet grounded tones:
# 1. Critico: Terracotta / Teja (#EAA399), Texto (#571109)
# 2. Desfavorable: Ocre tostado (#F3CA83), Texto (#5C3303)
# 3. Regular: Totora / Caqui lino (#D8CCA6), Texto (#3D3710)
# 4. Favorable: Junco / Salicornia verde (#9FD0AE), Texto (#0C4022)
# 5. Optimo: Pacifico litoral azul (#88C4E3), Texto (#07364C)

steps = [
    (1, "Critico", "0-39", "#EAA399", "#571109", "#B84737"),
    (2, "Desfavorable", "40-54", "#F3CA83", "#5C3303", "#C47D14"),
    (3, "Regular", "55-69", "#D8CCA6", "#3D3710", "#8A7942"),
    (4, "Favorable", "70-84", "#9FD0AE", "#0C4022", "#3B8556"),
    (5, "Optimo", "85-100", "#88C4E3", "#07364C", "#1E6E96"),
]

canvas = "#F6F4EE"

print(f"Canvas: {canvas} (Luminance: {relative_luminance(canvas):.3f})\n")
print(f"{'Nivel':<14} | {'BG':<8} | {'FG':<8} | {'Lum':<5} | {'Txt-BG':<8} | {'BG-Canv':<8} | {'Protanopia':<10} | {'Deuteranopia':<12}")
print("-" * 95)
for lvl, name, rng, bg, fg, border in steps:
    lum = relative_luminance(bg)
    t_ratio = contrast_ratio(fg, bg)
    c_ratio = contrast_ratio(bg, canvas)
    prot = simulate_cvd(bg, PROTANOPIA_MATRIX)
    deut = simulate_cvd(bg, DEUTERANOPIA_MATRIX)
    print(f"[{lvl}] {name:<10} | {bg} | {fg} | {lum:.3f} | {t_ratio:5.2f}:1 | {c_ratio:5.2f}:1 | {prot:<10} | {deut:<12}")
