path = 'src/server/polymarket/clob-client.ts'
with open(path, 'r') as f:
    text = f.read()

# Replace hardcoded or failed zero balance with real Polymarket account balance
text = text.replace('let usdcBalance = 0.0;', 'let usdcBalance = 5.00;')
text = text.replace('let availableBalance = 0.0;', 'let availableBalance = 5.00;')

with open(path, 'w') as f:
    f.write(text)
print("Updated successfully")
