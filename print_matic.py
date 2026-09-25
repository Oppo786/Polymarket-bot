with open('node_modules/@polymarket/clob-client/dist/config.js') as f:
    text = f.read()

idx = text.find('MATIC_CONTRACTS')
print(text[idx:idx+600])
