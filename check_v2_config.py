with open('node_modules/@polymarket/clob-client-v2/dist/config.cjs') as f:
    text = f.read()
    idx = text.find('getContractConfig')
    print(text[idx:idx+400])
