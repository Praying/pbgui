#!/usr/bin/env python3
"""PBGui frontend type-scale codemod.

Snaps font sizes onto the canonical ladder defined in src/styles/tailwind.css
(`@theme`) and folds the legacy --fs-* size aliases onto --text-*.

Five passes:

  alias     var(--fs-sm)          -> var(--text-sm)
  css       font-size: 13.5px     -> font-size: var(--text-compact)
  utility   text-[13.5px]         -> text-compact
  tracking  tracking-[0.04em]     -> tracking-label
  weight    font-extrabold        -> font-bold

The tracking and weight passes fold the ad-hoc spellings onto the
three-value tracking contract and the four-value weight contract documented
in src/styles/tailwind.css. Values outside their mapping tables are left
alone and reported rather than guessed at.

Snapping rule (thresholds, not nearest-neighbour, so the result is auditable
and reproducible). The upper bound of each step is exclusive of the next:

  <= 11.5px  micro     <= 12.4px  xs       <= 13.5px  compact
  <= 14.4px  sm        <= 15.5px  base     <= 17.5px  md
  <= 21px    lg        <= 24.5px  xl       <= 30px    2xl
  above      -> 3xl

`rem` values are resolved against the 15px root the base layer pins
(html { font-size: 15px }), so 0.8rem snaps as 12px and 0.72rem as 10.8px.
`em` and `clamp()` values are REPORTED but never rewritten: an em is relative
to its own context and a clamp is intentionally fluid, so both need a human
decision.

Usage: codemod_type_scale.py [--write] [--pass alias|css|utility] [--report]
                             [files...]
Default (no --write) is a dry run printing per-file replacement counts.
--report additionally lists every `em`/`clamp()` font size left untouched.
"""
from __future__ import annotations

import os
import re
import sys

FRONTEND = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(FRONTEND, "src")

# The 15px root the base layer pins; rem literals resolve against this.
ROOT_PX = 15.0

# (upper bound in px, step name) - ordered, last entry is the open-ended top.
LADDER: list[tuple[float, str]] = [
    (11.5, "micro"),
    (12.4, "xs"),
    (13.5, "compact"),
    (14.4, "sm"),
    (15.5, "base"),
    (17.5, "md"),
    (21.0, "lg"),
    (24.5, "xl"),
    (30.0, "2xl"),
    (float("inf"), "3xl"),
]

# `var(--fs-sm)` and friends. The alias definitions themselves
# (`--fs-sm: var(--text-sm);`) do not match this - they are not var() reads.
ALIAS_RE = re.compile(r"var\(--fs-(xs|sm|base|md|lg|xl)\)")

# CSS declaration value. Only the value is replaced, so a trailing
# `!important` or comment survives untouched.
CSS_FONT_SIZE_RE = re.compile(
    r"(font-size\s*:\s*)(\d+(?:\.\d+)?)(px|rem)\b"
)

# Tailwind arbitrary font-size utility, incl. variant prefixes
# (`md:text-[13px]`): the variant is outside the capture and never rewritten.
UTILITY_TEXT_SIZE_RE = re.compile(
    r"(?<![\w-])text-\[(\d+(?:\.\d+)?)(px|rem)\]"
)

# Reported-but-untouched forms.
EM_RE = re.compile(r"font-size\s*:\s*[\d.]+em\b")
CLAMP_RE = re.compile(r"font-size\s*:\s*clamp\(")

# ── Tracking: collapse onto the three-value contract ────────────────
# Call sites were read individually before assigning these buckets. Every
# LABEL value sits on an uppercase micro-label, a pill/badge, or a mono role
# marker. tracking-[0.01em] is the lone exception - it sits on bold 16px
# headings, so it joins the heading cut rather than the label cut.
LABEL_TRACKING = (
    "0.02em", "0.04em", "0.045em", "0.05em", "0.06em", "0.08em", "0.09em",
    "0.1em", "0.12em", "0.13em", "0.14em", "0.16em", "0.5px",
    "wide", "wider", "widest",
)
TIGHT_TRACKING = ("0.01em", "-0.01em", "-0.02em")
DISPLAY_TRACKING = ("-0.035em",)

UTILITY_TRACKING_RE = re.compile(
    r"(?<![\w-])tracking-\[(-?[\d.]+(?:px|em))\](?![\w-])"
)
UTILITY_TRACKING_NAMED_RE = re.compile(r"(?<![\w-])tracking-(wide|wider|widest)(?![\w-])")

CSS_TRACKING_RE = re.compile(r"(letter-spacing\s*:\s*)([^;{}]+)(;)")

# Raw `letter-spacing` declarations (they carry no uppercase context, so the
# mapping is explicit per observed value).
CSS_TRACKING_MAP = {
    "0.01em": "normal",
    "0.02em": "var(--tracking-label)",
    "0.03em": "var(--tracking-label)",
    "0.035em": "var(--tracking-label)",
    "0.04em": "var(--tracking-label)",
    "0.045em": "var(--tracking-label)",
    "0.05em": "var(--tracking-label)",
    "0.06em": "var(--tracking-label)",
    "0.07em": "var(--tracking-label)",
    "0.08em": "var(--tracking-label)",
    "0.13em": "var(--tracking-label)",
    "-0.01em": "var(--tracking-tight)",
    "-0.015em": "var(--tracking-tight)",
    "-0.02em": "var(--tracking-tight)",
    "-0.035em": "var(--tracking-display)",
}

# ── Weight: collapse onto the four-value contract ───────────────────
# 650/750/550/800 render as faux-bold on the static CJK fallback faces
# (PingFang SC, Microsoft YaHei) even though Space Grotesk is variable.
UTILITY_WEIGHT_RE = re.compile(
    r"(?<![\w-])font-(extrabold|black|light|thin)(?![\w-])"
)
UTILITY_WEIGHT_MAP = {
    "extrabold": "bold",
    "black": "bold",
    "light": "normal",
    "thin": "normal",
}

ALLOWED_WEIGHTS = {400, 500, 600, 700}

# Single-number declarations only: `font-weight: 300 700;` (the @font-face
# variable range) holds two numbers and must survive untouched.
CSS_WEIGHT_RE = re.compile(r"(font-weight\s*:\s*)((?:\d+\s*)+)(;)")

CSS_WEIGHT_MAP = {
    "300": "400",
    "550": "600",
    "650": "600",
    "750": "700",
    "800": "700",
    "900": "700",
}


def snap_to_step(pixels: float) -> str:
    """Return the ladder step a px value belongs to."""
    for upper_bound, step in LADDER:
        if pixels <= upper_bound:
            return step
    raise AssertionError("unreachable: LADDER must end with an open bound")


def resolve_px(value: str, unit: str) -> float:
    """Resolve a px/rem literal to px against the pinned 15px root."""
    amount = float(value)
    return amount if unit == "px" else amount * ROOT_PX


def target_paths(cli_files: list[str]) -> list[str]:
    """All frontend/src .vue/.ts/.css files, or just the CLI-listed ones."""
    if cli_files:
        return cli_files

    found: list[str] = []
    for directory, _subdirs, names in os.walk(SRC):
        for name in sorted(names):
            if name.endswith((".vue", ".ts", ".css")):
                found.append(os.path.join(directory, name))
    return sorted(found)


def rewrite_alias(text: str) -> tuple[str, int]:
    def replace(match: re.Match[str]) -> str:
        return f"var(--text-{match.group(1)})"

    return ALIAS_RE.subn(replace, text)


def rewrite_css(text: str) -> tuple[str, int]:
    def replace(match: re.Match[str]) -> str:
        prefix, value, unit = match.groups()
        step = snap_to_step(resolve_px(value, unit))
        return f"{prefix}var(--text-{step})"

    return CSS_FONT_SIZE_RE.subn(replace, text)


def rewrite_utility(text: str) -> tuple[str, int]:
    def replace(match: re.Match[str]) -> str:
        value, unit = match.groups()
        step = snap_to_step(resolve_px(value, unit))
        return f"text-{step}"

    return UTILITY_TEXT_SIZE_RE.subn(replace, text)


def tracking_token(value: str) -> str | None:
    """Map one tracking spelling onto its contract token."""
    if value in LABEL_TRACKING:
        return "label"
    if value in TIGHT_TRACKING:
        return "tight"
    if value in DISPLAY_TRACKING:
        return "display"
    return None


def rewrite_tracking(text: str) -> tuple[str, int]:
    replaced = 0

    def replace_utility(match: re.Match[str]) -> str:
        nonlocal replaced
        token = tracking_token(match.group(1))
        if token is None:
            return match.group(0)
        replaced += 1
        return f"tracking-{token}"

    def replace_named(match: re.Match[str]) -> str:
        nonlocal replaced
        replaced += 1
        return "tracking-label"

    def replace_css(match: re.Match[str]) -> str:
        nonlocal replaced
        prefix, value, terminator = match.groups()
        # Normalize the leading-dot shorthand (`.03em`) onto the map keys.
        lookup = value.strip()
        if lookup.startswith("."):
            lookup = f"0{lookup}"
        mapped = CSS_TRACKING_MAP.get(lookup)
        if mapped is None:
            return match.group(0)
        replaced += 1
        return f"{prefix}{mapped}{terminator}"

    text = UTILITY_TRACKING_RE.sub(replace_utility, text)
    text = UTILITY_TRACKING_NAMED_RE.sub(replace_named, text)
    return CSS_TRACKING_RE.sub(replace_css, text), replaced


def rewrite_weight(text: str) -> tuple[str, int]:
    replaced = 0

    def replace_utility(match: re.Match[str]) -> str:
        nonlocal replaced
        replaced += 1
        return f"font-{UTILITY_WEIGHT_MAP[match.group(1)]}"

    def replace_css(match: re.Match[str]) -> str:
        nonlocal replaced
        prefix, value, terminator = match.groups()
        numbers = value.split()
        if len(numbers) != 1:
            return match.group(0)
        mapped = CSS_WEIGHT_MAP.get(numbers[0])
        if mapped is None:
            return match.group(0)
        replaced += 1
        return f"{prefix}{mapped}{terminator}"

    text = UTILITY_WEIGHT_RE.sub(replace_utility, text)
    return CSS_WEIGHT_RE.sub(replace_css, text), replaced


PASSES = {
    "alias": rewrite_alias,
    "css": rewrite_css,
    "utility": rewrite_utility,
    "tracking": rewrite_tracking,
    "weight": rewrite_weight,
}

# Comments are hidden from every pass and restored verbatim. The ladder's own
# documentation says "never write text-[13px]" and names tracking-wider and
# tracking-widest - a naive sweep would rewrite that prose into nonsense.
COMMENT_PATTERNS = (
    re.compile(r"/\*[\s\S]*?\*/"),   # CSS block comment
    re.compile(r"<!--[\s\S]*?-->"),  # HTML / Vue template comment
)

MASK_RE = re.compile(r"\x00(\d+)\x00")


def mask_comments(text: str) -> tuple[str, list[str]]:
    """Hide comment bodies behind inert sentinels of any length."""
    hidden: list[str] = []

    def hide(match: re.Match[str]) -> str:
        hidden.append(match.group(0))
        return f"\x00{len(hidden) - 1}\x00"

    for pattern in COMMENT_PATTERNS:
        text = pattern.sub(hide, text)
    return text, hidden


def unmask_comments(text: str, hidden: list[str]) -> str:
    """Restore the comment bodies masked by mask_comments()."""
    return MASK_RE.sub(lambda match: hidden[int(match.group(1))], text)


def report_untouched(path: str, text: str) -> list[str]:
    """List the font sizes this codemod deliberately leaves alone."""
    notes: list[str] = []
    for number, line in enumerate(text.splitlines(), start=1):
        if EM_RE.search(line) or CLAMP_RE.search(line):
            notes.append(f"{path}:{number}: {line.strip()[:110]}")
    return notes


def main(argv: list[str]) -> int:
    write = "--write" in argv
    show_report = "--report" in argv
    selected = "all"
    if "--pass" in argv:
        selected = argv[argv.index("--pass") + 1]

    skip = {"--write", "--report", "--pass", selected}
    cli_files = [argument for argument in argv[1:] if argument not in skip]

    passes = list(PASSES) if selected == "all" else [selected]
    for name in passes:
        if name not in PASSES:
            print(f"unknown pass: {name}", file=sys.stderr)
            return 2

    total = 0
    untouched: list[str] = []
    for path in target_paths(cli_files):
        with open(path, encoding="utf-8") as handle:
            original = handle.read()

        masked, hidden = mask_comments(original)
        updated = masked
        counts: list[str] = []
        for name in passes:
            updated, replaced = PASSES[name](updated)
            if replaced:
                counts.append(f"{name}={replaced}")

        if show_report:
            untouched.extend(report_untouched(path, original))

        if updated == masked:
            continue

        total += sum(int(count.split("=")[1]) for count in counts)
        relative = os.path.relpath(path, FRONTEND)
        print(f"{relative}: {', '.join(counts)}")
        if write:
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(unmask_comments(updated, hidden))

    if untouched:
        print("\nleft for manual review (em / clamp):")
        for note in untouched:
            print(f"  {note}")

    verb = "rewrote" if write else "would rewrite"
    print(f"\n{verb} {total} font size reference(s) across passes: {', '.join(passes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
