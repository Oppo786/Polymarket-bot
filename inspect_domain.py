with open('node_modules/@polymarket/clob-client/dist/order-utils/exchange.order.builder.js') as f:
    text = f.read()

idx = text.find('buildOrderTypedData')
if idx != -1:
    print(text[idx-50:idx+600])
else:
    idx = text.find('domain')
    print(text[idx-50:idx+600])
