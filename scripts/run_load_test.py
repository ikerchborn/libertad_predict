"""Run Locust load test for 60s with 50 users and report latency percentiles and memory."""
import os
import subprocess
import sys
import time
import psutil

def get_uvicorn_memory_mb() -> float:
    for proc in psutil.process_iter(["pid", "name", "cmdline"]):
        try:
            cmd = proc.info.get("cmdline") or []
            if any("turismo.interfaces.api.main:app" in str(arg) for arg in cmd):
                return proc.memory_info().rss / (1024 * 1024)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return 0.0

def main() -> None:
    initial_mem = get_uvicorn_memory_mb()
    print(f"Initial API process memory: {initial_mem:.2f} MB")

    locust_cmd = [
        sys.executable,
        "-m",
        "locust",
        "-f",
        "scripts/locustfile.py",
        "--headless",
        "-u",
        "50",
        "-r",
        "10",
        "--run-time",
        "60s",
        "--host",
        "http://127.0.0.1:8000",
        "--csv",
        "scripts/locust_results",
    ]

    print("Launching Locust load test: 50 users, 60s...")
    start_time = time.time()
    proc = subprocess.Popen(locust_cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    peak_mem = initial_mem
    while proc.poll() is None:
        mem = get_uvicorn_memory_mb()
        if mem > peak_mem:
            peak_mem = mem
        time.sleep(1)

    stdout, stderr = proc.communicate()
    elapsed = time.time() - start_time
    final_mem = get_uvicorn_memory_mb()

    print(f"Load test finished in {elapsed:.1f}s.")
    print(f"Memory: Initial={initial_mem:.2f} MB, Peak={peak_mem:.2f} MB, Final={final_mem:.2f} MB")
    print("\n--- LOCUST OUTPUT ---")
    print(stdout)
    if stderr:
        print("\n--- LOCUST STDERR ---")
        print(stderr)

if __name__ == "__main__":
    main()
