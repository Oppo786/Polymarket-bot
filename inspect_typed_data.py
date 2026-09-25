with open('node_modules/@polymarket/clob-client/dist/order-utils/exchange.order.builder.js') as f:
    text = f.read()

idx = text.find('buildOrderTypedData(')
print(text[idx:idx+700])
