import re
with open('node_modules/@polymarket/clob-client/dist/order-utils/exchange.order.builder.js') as f:
    text = f.read()

matches = [m.start() for m in re.finditer('buildOrderTypedData', text)]
for m in matches:
    print("Match at", m)
    print(text[m:m+300])
    print("="*40)
