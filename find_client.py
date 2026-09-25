import os, glob

for root, dirs, files in os.walk('node_modules/@polymarket/clob-client/dist'):
    for file in files:
        if file.endswith('.d.ts'):
            path = os.path.join(root, file)
            with open(path) as f:
                content = f.read()
                if 'postOrder' in content:
                    print("Found in:", path)
                    for line in content.splitlines():
                        if 'postOrder' in line or 'createOrder' in line:
                            print("  ", line.strip())
