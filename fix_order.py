import json, os, subprocess

# Package json inspect karte hain
try:
    with open('node_modules/@polymarket/clob-client/package.json') as f:
        pkg = json.load(f)
    print("Installed clob-client version:", pkg.get("version"))
except Exception as e:
    print("Error reading pkg:", e)

