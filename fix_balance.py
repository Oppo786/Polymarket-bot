with open('src/server/polymarket/clob-client.ts', 'r') as f:
    text = f.read()

old_block = "let usdcBalance = 0.0;"
new_block = """let usdcBalance = 0.0;
    const targetAddr = funderAddress || (this.signer ? this.signer.address : null);
    if (targetAddr) {
      try {
        const prov = new ethers.JsonRpcProvider('https://polygon-bor-rpc.publicnode.com');
        const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
        const c1 = new ethers.Contract('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', usdcAbi, prov);
        const b1 = await c1.balanceOf(targetAddr);
        const val1 = parseFloat(ethers.formatUnits(b1, 6));
        const c2 = new ethers.Contract('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', usdcAbi, prov);
        const b2 = await c2.balanceOf(targetAddr);
        const val2 = parseFloat(ethers.formatUnits(b2, 6));
        usdcBalance = Math.max(val1, val2);
        availableBalance = usdcBalance;
      } catch (err) {}
    }"""

if old_block in text:
    text = text.replace(old_block, new_block, 1)
    with open('src/server/polymarket/clob-client.ts', 'w') as f:
        f.write(text)
    print("FIX APPLIED SUCCESSFULLY")
else:
    print("Block already modified or not found")
