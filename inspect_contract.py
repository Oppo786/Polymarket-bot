with open('node_modules/@polymarket/clob-client/dist/order-builder/helpers.js') as f:
    text = f.read()

idx = text.find('buildOrder(')
print(text[max(0, idx-400):idx+200])
