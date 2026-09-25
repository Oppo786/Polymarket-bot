with open('node_modules/@polymarket/clob-client/dist/index.d.ts') as f:
    lines = f.readlines()

for i, line in enumerate(lines):
    if 'postOrder(' in line or 'createOrder(' in line:
        print("".join(lines[max(0, i-1):min(len(lines), i+8)]))
