from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"Expected text not found in {path}: {old}")
    p.write_text(text.replace(old, new, 1))

replace_once(
    "postseason.js",
    "const seedBonus=seed=>({1:8,2:6,3:5,4:4,5:3,6:2,7:1,8:0}[Number(seed)]??0);",
    "const seedBonus=seed=>({1:10,2:8,3:7,4:5,5:4,6:3,7:2,8:0}[Number(seed)]??0);",
)
replace_once(
    "postseason.js",
    "1st +8, 2nd +6, then +5, +4, +3, +2, +1, +0.",
    "1st +10, 2nd +8, 3rd +7, 4th +5, 5th +4, 6th +3, 7th +2, 8th +0.",
)
replace_once("index.html", "postseason.js?v=4", "postseason.js?v=5")
replace_once("app_update.js", "2026.09.15.1", "2026.09.15.2")
Path("app-version.json").write_text('{"version":"2026.09.15.2"}\n')

Path("database/playoff_seed_bonus_10_8_7_5_4_3_2_0.sql").write_text("""-- One-time postseason starting bonus by final regular-season seed.\n-- Applied before the 2026 postseason begins.\ncreate or replace function private.playoff_start_bonus(seed_value integer)\nreturns integer\nlanguage sql\nimmutable\nset search_path=''\nas $$\n  select case seed_value\n    when 1 then 10\n    when 2 then 8\n    when 3 then 7\n    when 4 then 5\n    when 5 then 4\n    when 6 then 3\n    when 7 then 2\n    when 8 then 0\n    else null\n  end;\n$$;\n""")
