import json

with open("scripts/lighthouse_report.json", "r", encoding="utf-8") as f:
    data = json.load(f)

categories = data.get("categories", {})
print("=" * 45)
print("       REPORTE OFICIAL DE LIGHTHOUSE        ")
print("=" * 45)
for cat_id, cat_info in categories.items():
    title = cat_info.get("title", cat_id)
    score = cat_info.get("score")
    score_pct = int(score * 100) if score is not None else "N/A"
    print(f"  {title:<22}: {score_pct} / 100")
print("=" * 45)
