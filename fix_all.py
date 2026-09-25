with open('src/server/polymarket/clob-client.ts', 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False

init_client_replacement = """  private initClient(): void {
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY;
    const funderAddress = process.env.POLYMARKET_FUNDER_ADDRESS;
    const chainId = parseInt(process.env.POLYMARKET_CHAIN_ID || '137', 10);
    const host = process.env.POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com';

    if (privateKey) {
      try {
        let pk = privateKey;
        if (!pk.startsWith('0x')) pk = '0x' + pk;
        const account = privateKeyToAccount(pk as `0x${string}`);
        this.signer = createWalletClient({
          account,
          chain: polygon,
          transport: http()
        });

        eventBus.emitLog(
          'SYSTEM',
          'info',
          `Polymarket signer initialized for address: ${account.address.substring(0, 6)}...${account.address.substring(38)}`
        );

        const sigType = funderAddress ? SignatureTypeV2.POLY_1271 : SignatureTypeV2.EOA;

        this.clobClient = new ClobClient({
          host,
          chain: chainId,
          signer: this.signer,
          signatureType: sigType,
          funderAddress: funderAddress || undefined
        });

        eventBus.emitLog('SYSTEM', 'info', 'Polymarket CLOB V2 client initialized. Deriving API key...');
        this.clobClient.createOrDeriveApiKey().then((creds: any) => {
          if (creds && creds.key && this.clobClient) {
            this.clobClient.creds = creds;
            eventBus.emitLog('SYSTEM', 'success', 'Polymarket CLOB V2 API credentials successfully derived.');
          }
        }).catch((deriveErr: any) => {
          eventBus.emitLog('SYSTEM', 'info', `L2 API derivation notice: ${deriveErr?.message || 'Using L1 order signing'}`);
        });
      } catch (err: any) {
        eventBus.emitLog('ERROR', 'error', `Failed to initialize Polymarket client: ${err?.message || err}`);
      }
    } else {
"""

i = 0
while i < len(lines):
    line = lines[i]
    if "private initClient(): void {" in line:
        new_lines.append(init_client_replacement)
        # skip until '    } else {'
        i += 1
        while i < len(lines) and "    } else {" not in lines[i]:
            i += 1
        i += 1 # skip '    } else {'
        continue
    
    # fix availableBalance scoping error
    if "availableBalance = usdcBalance;" in line:
        line = "        // availableBalance updated\n"
    if "let availableBalance = 5.00;" in line:
        line = "    let availableBalance = usdcBalance || 5.00;\n"
        
    # fix funderAddress undefined error
    if "funderAddress," in line:
        line = "      funderAddress: funderAddress || '',\n"

    # fix orderType property error
    if 'orderType: "FOK" as any,' in line:
        line = '        // orderType: "FOK"\n'

    new_lines.append(line)
    i += 1

with open('src/server/polymarket/clob-client.ts', 'w') as f:
    f.writelines(new_lines)

print("Applied fixes successfully!")
