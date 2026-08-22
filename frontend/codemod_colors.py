#!/usr/bin/env python3
"""PBGui frontend color/font codemod.

Maps hardcoded color literals (hex + rgba) in CSS files to the semantic
tokens defined in src/styles/tokens.css, and rewrites non-token font stacks
to var(--font-family)/var(--font-mono).

Usage: codemod_colors.py [--write] [files...]
Default (no --write) is a dry run printing per-file replacement counts.
"""
import re
import sys
import glob
import os

FRONTEND = os.path.dirname(os.path.abspath(__file__))

# ── rgba(r,g,b,a) triplet → -rgb token ────────────────────────────
RGBA_MAP = {
    # accent family
    (77, 163, 255): "--accent-rgb", (77, 166, 255): "--accent-rgb",
    (96, 165, 250): "--accent-rgb", (56, 189, 248): "--accent-rgb",
    (59, 130, 246): "--accent-rgb", (99, 179, 237): "--accent-rgb",
    (37, 99, 235): "--accent-deep-rgb", (49, 130, 206): "--accent-deep-rgb",
    (26, 106, 224): "--accent-deep-rgb",
    (125, 211, 252): "--accent-soft-rgb", (147, 197, 253): "--accent-soft-rgb",
    (191, 219, 254): "--accent-soft-rgb",
    # success family
    (33, 195, 84): "--success-rgb", (47, 189, 106): "--success-rgb",
    (52, 211, 153): "--success-rgb", (74, 222, 128): "--success-rgb",
    (34, 197, 94): "--success-rgb", (72, 187, 120): "--success-rgb",
    (22, 163, 74): "--success-deep-rgb", (21, 128, 61): "--success-deep-rgb",
    (22, 101, 52): "--success-deep-rgb", (6, 95, 70): "--success-deep-rgb",
    (134, 239, 172): "--success-soft-rgb", (110, 231, 183): "--success-soft-rgb",
    (94, 196, 143): "--success-soft-rgb", (104, 211, 145): "--success-soft-rgb",
    # warning family
    (245, 158, 11): "--warning-rgb", (251, 191, 36): "--warning-rgb",
    (232, 161, 60): "--warning-rgb", (237, 137, 54): "--warning-rgb",
    (217, 119, 6): "--warning-deep-rgb", (180, 83, 9): "--warning-deep-rgb",
    (252, 211, 77): "--warning-soft-rgb", (240, 189, 106): "--warning-soft-rgb",
    # danger family
    (239, 83, 80): "--danger-rgb", (255, 75, 75): "--danger-rgb",
    (239, 68, 68): "--danger-rgb", (248, 113, 113): "--danger-rgb",
    (220, 38, 38): "--danger-rgb",
    (185, 28, 28): "--danger-deep-rgb", (153, 27, 27): "--danger-deep-rgb",
    (127, 29, 29): "--danger-deep-rgb", (155, 44, 44): "--danger-deep-rgb",
    (252, 165, 165): "--danger-soft-rgb", (242, 139, 137): "--danger-soft-rgb",
    (254, 202, 202): "--danger-soft-rgb", (252, 129, 129): "--danger-soft-rgb",
    # neutral text / surfaces
    (148, 163, 184): "--text-secondary-rgb",
    (255, 140, 0): "--warning-rgb",
    (251, 146, 60): "--warning-rgb",
    (244, 185, 66): "--warning-soft-rgb",
    (93, 196, 255): "--accent-soft-rgb",
    (239, 106, 112): "--danger-rgb",
    (255, 200, 0): "--warning-rgb",
    (255, 255, 0): "--warning-rgb",
    (74, 222, 128): "--success-rgb",
    (15, 23, 42): "--bg-page-rgb", (6, 13, 24): "--bg-page-rgb",
    (7, 14, 25): "--bg-page-rgb", (5, 10, 18): "--bg-page-rgb",
    (2, 6, 23): "--bg-page-rgb", (14, 17, 23): "--bg-page-rgb",
    (9, 20, 35): "--bg-panel-rgb", (17, 24, 39): "--bg-panel-rgb",
    (19, 31, 49): "--bg-panel-rgb", (13, 21, 35): "--bg-panel-rgb",
    (20, 27, 40): "--bg-panel-rgb", (14, 21, 33): "--bg-panel-rgb",
    (11, 17, 27): "--bg-panel-rgb", (11, 18, 30): "--bg-panel-rgb",
    (15, 32, 53): "--bg-panel-rgb", (26, 29, 36): "--bg-panel-rgb",
}

# ── hex literal → token ───────────────────────────────────────────
HEX_MAP = {
    # accent deep
    "#3182ce": "--accent-deep", "#4299e1": "--accent-deep",
    "#3b82f6": "--accent-deep", "#2563eb": "--accent-deep",
    "#1a6ae0": "--accent-deep", "#1d4ed8": "--accent-deep",
    "#2b6cb0": "--accent-deep", "#1e40af": "--accent-deep",
    # accent
    "#4da3ff": "--accent", "#4da6ff": "--accent",
    "#60a5fa": "--accent", "#38bdf8": "--accent", "#0ea5e9": "--accent",
    # accent soft
    "#7db8f7": "--accent-soft", "#93c5fd": "--accent-soft",
    "#7dd3fc": "--accent-soft", "#63b3ed": "--accent-soft",
    "#bfdbfe": "--accent-soft",
    # text on accent fills
    "#07111f": "--accent-contrast", "#08111f": "--accent-contrast",
    "#0b1220": "--accent-contrast",
    # text
    "#e2e8f0": "--text-primary", "#f1f5f9": "--text-primary",
    "#f8fafc": "--text-primary", "#e8f0fa": "--text-primary",
    "#edf4fc": "--text-primary", "#dbeafe": "--text-primary",
    "#eff6ff": "--text-primary", "#cbd5e1": "--text-primary",
    "#bfd0e5": "--text-primary", "#b8c8db": "--text-primary",
    "#fafafa": "--text-primary",
    "#94a3b8": "--text-secondary", "#b7c6d8": "--text-secondary",
    "#a8bad0": "--text-secondary", "#9db2ca": "--text-secondary",
    "#aabbd0": "--text-secondary", "#9eb0c4": "--text-secondary",
    "#a0a4ab": "--text-secondary",
    "#64748b": "--text-muted", "#8193aa": "--text-muted",
    "#71849b": "--text-muted", "#53657b": "--text-muted",
    "#999999": "--text-muted", "#999": "--text-muted",
    "#4a5568": "--text-disabled",
    # residual warm/cool one-offs folded into the nearest semantic stop
    "#f6ad55": "--warning-soft", "#ecc94b": "--warning-soft",
    "#ffd08a": "--warning-soft", "#fef08a": "--warning-soft",
    "#fde68a": "--warning-soft", "#ffa726": "--warning",
    "#d69e2e": "--warning-deep", "#c96b00": "--warning-deep",
    "#a85c08": "--warning-deep",
    "#e53e3e": "--danger-deep", "#38a169": "--success-deep",
    "#dffaf6": "--success-soft", "#dbe6f2": "--text-primary",
    "#8fa5be": "--text-secondary", "#b0b8c4": "--text-secondary",
    "#8899aa": "--text-muted", "#666666": "--text-muted",
    "#283548": "--border-default", "#1e3a5f": "--border-default",
    "#1e2d3d": "--bg-elevated", "#1e2a3a": "--bg-elevated",
    "#1a1f2e": "--bg-panel", "#121826": "--bg-page",
    # success
    "#2fbd6a": "--success", "#34d399": "--success", "#4ade80": "--success",
    "#22c55e": "--success", "#48bb78": "--success", "#21c354": "--success",
    "#5ec48f": "--success-soft", "#86efac": "--success-soft",
    "#6ee7b7": "--success-soft", "#d1fae5": "--success-soft",
    "#68d391": "--success-soft",
    "#166534": "--success-deep", "#15803d": "--success-deep",
    "#065f46": "--success-deep", "#14532d": "--success-deep",
    # warning
    "#e8a13c": "--warning", "#fbbf24": "--warning", "#f59e0b": "--warning",
    "#ed8936": "--warning",
    "#f0bd6a": "--warning-soft", "#fcd34d": "--warning-soft",
    "#854d0e": "--warning-deep", "#b45309": "--warning-deep",
    "#d97706": "--warning-deep", "#92400e": "--warning-deep",
    "#78350f": "--warning-deep", "#713f12": "--warning-deep",
    # danger
    "#ef5350": "--danger", "#ff4b4b": "--danger", "#ef4444": "--danger",
    "#f87171": "--danger", "#dc2626": "--danger",
    "#f28b89": "--danger-soft", "#fca5a5": "--danger-soft",
    "#fc8181": "--danger-soft", "#fecaca": "--danger-soft",
    "#b91c1c": "--danger-deep", "#991b1b": "--danger-deep",
    "#9b2c2c": "--danger-deep", "#7f1d1d": "--danger-deep",
    "#742a2a": "--danger-deep", "#450a0a": "--danger-deep",
    # surfaces / borders
    "#0b0e14": "--bg-page", "#0f1724": "--bg-page", "#0d1420": "--bg-page",
    "#0b101a": "--bg-page", "#0e1117": "--bg-page", "#0f172a": "--bg-page",
    "#111827": "--surface-sidebar",
    "#1a1d24": "--bg-panel", "#131b2b": "--bg-panel",
    "#1a202c": "--bg-card",
    "#262730": "--bg-elevated", "#243047": "--bg-elevated",
    "#1f2a3a": "--bg-elevated", "#1e2533": "--bg-elevated",
    "#162235": "--bg-elevated", "#172133": "--bg-elevated",
    "#151922": "--bg-elevated", "#1a2744": "--bg-elevated",
    "#1e293b": "--bg-elevated",
    "#1e2736": "--border-subtle", "#1a2537": "--border-subtle",
    "#2a2d35": "--border-subtle",
    "#2d3748": "--border-default", "#223148": "--border-default",
    "#2c3f5b": "--border-default", "#345074": "--border-default",
    "#334155": "--border-default",
    "#4a5568": "--border-strong", "#475569": "--border-strong",
}

# ── font stacks ───────────────────────────────────────────────────
FONT_MAP = [
    ("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif", "var(--font-family)"),
    ("-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", "var(--font-family)"),
    ("-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif", "var(--font-family)"),
    ("-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", "var(--font-family)"),
    ("'Segoe UI', system-ui, 'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif", "var(--font-family)"),
    ("'Courier New', monospace", "var(--font-mono)"),
    ("'Fira Code', 'Cascadia Code', monospace", "var(--font-mono)"),
    ("'Cascadia Code', 'Fira Code', 'Consolas', monospace", "var(--font-mono)"),
    ("ui-monospace,monospace", "var(--font-mono)"),
]

RGBA_RE = re.compile(r"rgba\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3}),\s*([\d.]+)\s*\)")
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")

# base (6-digit) hexes that have an -rgb token, for RRGGBBAA folding
HEX_TO_RGB_TOKEN = {
    "#ffa726": "--warning-rgb",
    "#f59e0b": "--warning-rgb",
    "#fbbf24": "--warning-rgb",
    "#ef5350": "--danger-rgb",
    "#ff4b4b": "--danger-rgb",
    "#ef4444": "--danger-rgb",
    "#f87171": "--danger-rgb",
    "#4da3ff": "--accent-rgb",
    "#4da6ff": "--accent-rgb",
    "#60a5fa": "--accent-rgb",
    "#63b3ed": "--accent-soft-rgb",
    "#2fbd6a": "--success-rgb",
    "#4ade80": "--success-rgb",
    "#21c354": "--success-rgb",
}


def transform(text):
    counts = {"rgba": 0, "hex": 0, "font": 0}

    def rgba_sub(m):
        key = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
        token = RGBA_MAP.get(key)
        if not token:
            return m.group(0)
        counts["rgba"] += 1
        return "rgb(var(%s) / %s)" % (token, m.group(4))

    def hex_sub(m):
        raw = m.group(0).lower()
        token = HEX_MAP.get(raw)
        if token:
            counts["hex"] += 1
            return "var(%s)" % token
        # 8-digit hex (RRGGBBAA): fold into the family's -rgb token when one exists
        if len(raw) == 9:
            base, alpha_hex = raw[:7], raw[7:]
            rgb_tok = HEX_TO_RGB_TOKEN.get(base)
            if rgb_tok:
                alpha = round(int(alpha_hex, 16) / 255, 3)
                counts["hex"] += 1
                return "rgb(var(%s) / %s)" % (rgb_tok, alpha)
        return m.group(0)

    text = RGBA_RE.sub(rgba_sub, text)
    text = HEX_RE.sub(hex_sub, text)
    for old, new in FONT_MAP:
        n = text.count(old)
        if n:
            counts["font"] += n
            text = text.replace(old, new)
    return text, counts


def main():
    write = "--write" in sys.argv
    files = [a for a in sys.argv[1:] if a != "--write"]
    if not files:
        files = sorted(
            glob.glob(os.path.join(FRONTEND, "src/styles/base.css"))
            + glob.glob(os.path.join(FRONTEND, "src/styles/components.css"))
            + glob.glob(os.path.join(FRONTEND, "css/*.css"))
            + glob.glob(os.path.join(FRONTEND, "src/pages/*/styles/*.css"))
        )
    total = {"rgba": 0, "hex": 0, "font": 0}
    changed = 0
    for path in files:
        with open(path, encoding="utf-8") as f:
            src = f.read()
        out, counts = transform(src)
        n = sum(counts.values())
        for k in total:
            total[k] += counts[k]
        if n == 0:
            continue
        changed += 1
        rel = os.path.relpath(path, FRONTEND)
        print(f"{rel}: rgba={counts['rgba']} hex={counts['hex']} font={counts['font']}")
        if write:
            with open(path, "w", encoding="utf-8") as f:
                f.write(out)
    print("---")
    print(f"files changed: {changed}, total replacements: {sum(total.values())} {total}")
    if not write:
        print("DRY RUN — pass --write to apply")


if __name__ == "__main__":
    main()
