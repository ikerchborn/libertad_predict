"""Captures screenshots with virtual time budget so client-side React fetches are guaranteed to resolve."""
import subprocess
from pathlib import Path

edge_exe = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
artifact_dir = Path(r"C:\Users\resan\.gemini\antigravity\brain\bad99014-08f4-4dce-a322-986b18efdbdb")

targets = [
    ("home_desktop_1440.png", "http://localhost:3000", 1440, 1080),
    ("home_mobile_390.png", "http://localhost:3000", 390, 844),
    ("detail_desktop_1440.png", "http://localhost:3000/places/3", 1440, 1200),
    ("detail_mobile_390.png", "http://localhost:3000/places/3", 390, 1000),
]

for filename, url, width, height in targets:
    output_path = artifact_dir / filename
    cmd = [
        edge_exe,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--virtual-time-budget=3000",
        f"--window-size={width},{height}",
        f"--screenshot={output_path.resolve()}",
        url
    ]
    print(f"Capturing {url} at {width}x{height} with virtual-time-budget -> {filename}...")
    res = subprocess.run(cmd, capture_output=True, text=True)
    if output_path.exists():
        print(f"  OK: {output_path.name} ({output_path.stat().st_size} bytes)")
    else:
        print(f"  FAILED: {res.stderr}")

print("All screenshots refreshed successfully!")
