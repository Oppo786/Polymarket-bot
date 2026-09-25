import os
for root, dirs, files in os.walk('node_modules/@polymarket/clob-client/dist'):
    for file in files:
        if file.endswith('.d.ts'):
            p = os.path.join(root, file)
            with open(p) as f:
                content = f.read()
                if 'interface CreateOrderOptions' in content or 'type CreateOrderOptions' in content:
                    print("Found in", p)
                    start = content.find('CreateOrderOptions')
                    print(content[start:start+400])
