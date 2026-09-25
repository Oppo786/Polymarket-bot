import os
for root, dirs, files in os.walk('node_modules/@polymarket/clob-client/dist'):
    for file in files:
        if file.endswith('.js'):
            p = os.path.join(root, file)
            with open(p) as f:
                content = f.read()
                if 'getContractConfig' in content and 'negRiskExchange' in content:
                    print("Found in", p)
                    start = content.find('getContractConfig')
                    print(content[start:start+500])
