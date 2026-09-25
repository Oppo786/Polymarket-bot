with open('node_modules/@polymarket/clob-client-v2/dist/clobClient.cjs') as f:
    text = f.read()
    idx = text.find('class ClobClient')
    print(text[idx:idx+700])
