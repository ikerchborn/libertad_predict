"""Color vision deficiency (CVD) simulation for deuteranopia and protanopia.
Uses Machado, Oliveira, Fernandes (2009) physiologically-based model matrices.
"""
import numpy as np

# Machado 2009 matrices for severe (severity=1.0) protanopia and deuteranopia
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
    # Convert sRGB to linear, apply matrix in linear RGB, convert back to sRGB
    # For quick accurate color simulation:
    r, g, b = [c / 255.0 for c in hex_to_rgb255(hex_str)]
    # sRGB to linear
    def to_lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r_l, g_l, b_l = to_lin(r), to_lin(g), to_lin(b)
    
    sim_l = matrix @ np.array([r_l, g_l, b_l])
    
    # linear to sRGB
    def to_srgb(c: float) -> float:
        c = np.clip(c, 0.0, 1.0)
        return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1.0 / 2.4)) - 0.055
    
    sim_rgb = [to_srgb(c) * 255.0 for c in sim_l]
    return rgb_to_hex(sim_rgb[0], sim_rgb[1], sim_rgb[2])

candidate_steps = [
    (1, "Critico", "0-39", "#F2C4BC", "#6E1B10"),
    (2, "Desfavorable", "40-54", "#FAD8A8", "#784408"),
    (3, "Regular", "55-69", "#E8DFB8", "#544C16"),
    (4, "Favorable", "70-84", "#CFE3D5", "#134D2E"),
    (5, "Optimo", "85-100", "#BFE0ED", "#0D4259"),
]

print("=== COLOR DEFICIENCY SIMULATION (BACKGROUNDS) ===")
print(f"{'Nivel':<14} | {'Normal':<9} | {'Protanopia (R-blind)':<22} | {'Deuteranopia (G-blind)':<24}")
for lvl, name, rng, bg, fg in candidate_steps:
    prot = simulate_cvd(bg, PROTANOPIA_MATRIX)
    deut = simulate_cvd(bg, DEUTERANOPIA_MATRIX)
    print(f"[{lvl}] {name:<10} | {bg:<9} | {prot:<22} | {deut:<24}")
