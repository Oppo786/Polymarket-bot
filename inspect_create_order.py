path = 'node_modules/@polymarket/clob-client/dist/client.js'
with open(path) as f:
    text = f.read()

idx = text.find('async createOrder(')
if idx == -1:
    idx = text.find('createOrder(')
print(text[idx:idx+800])
