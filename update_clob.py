import re

with open('src/server/polymarket/clob-client.ts', 'r') as f:
    content = f.read()

# Replace import
content = content.replace(
    "import { ClobClient, Side, OrderType } from '@polymarket/clob-client';",
    "import { ClobClient, Side, OrderType, SignatureTypeV2 } from '@polymarket/clob-client-v2';\nimport { createWalletClient, http } from 'viem';\nimport { privateKeyToAccount } from 'viem/accounts';\nimport { polygon } from 'viem/chains';"
)

# Replace signer type
content = content.replace(
    "private signer: ethers.Wallet | null = null;",
    "private signer: any = null;"
)

# Replace initClient implementation
old_init = """    if (privateKey && privateKey.startsWith('0x') && privateKey.length === 66) {
      try {
        this.signer = new ethers.Wallet(privateKey);
        (this.signer as any).account = { address: this.signer.address };
        eventBus.emitLog(
          'SYSTEM',
          'info',
          `Polymarket signer initialized for address: ${this.signer.address.substring(0, 6)}...${this.signer.address.substring(38)}`
        );

        if (apiKey && apiSecret && apiPassphrase) {
          this.clobClient = new ClobClient(
            host,
            chainId,
            this.signer as any,
            {
              key: apiKey,
              secret: apiSecret,
              passphrase: apiPassphrase,
            },
            signatureType,
            funderAddress || undefined
          );
          eventBus.emitLog('SYSTEM', 'success', 'Polymarket CLOB client initialized with L2 API credentials.');
        } else {
          // Initialize L1 client and attempt auto-derivation of L2 API credentials using wallet signature
          this.clobClient = new ClobClient(host, chainId, this.signer as any, undefined, signatureType, funderAddress || undefined);
          eventBus.emitLog('SYSTEM', 'info', 'Polymarket CLOB client initialized with L1 wallet signer. Attempting API key derivation...');
          this.clobClient.createOrDeriveApiKey().then((creds) => {
            if (creds && creds.key && this.signer) {
              this.clobClient = new ClobClient(
                host,
                chainId,
                this.signer as any,
                creds,
                signatureType,
                funderAddress || undefined
              );
              eventBus.emitLog('SYSTEM', 'success', 'Polymarket CLOB L2 API credentials successfully derived and initialized.');
            }
          }).catch((err) => {
            eventBus.emitLog('SYSTEM', 'error', `Failed to derive Polymarket API key: ${err?.message || err}`);
          });
        }
      } catch (err: any) {
        eventBus.emitLog('SYSTEM', 'error', `Failed to initialize Polymarket CLOB client: ${err?.message || err}`);
      }
    }"""

new_init = """    if (privateKey) {
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

        // Use V2 client with SignatureTypeV2.POLY_1271 (3) for Deposit Wallet flow
        const sigType = funderAddress ? SignatureTypeV2.POLY_1271 : SignatureTypeV2.EOA;

        this.clobClient = new ClobClient({
          host,
          chain: chainId,
          signer: this.signer,
          signatureType: sigType,
          funderAddress: funderAddress || undefined
        });

        eventBus.emitLog('SYSTEM', 'info', 'Polymarket CLOB V2 client initialized. Deriving API key...');
        this.clobClient.createOrDeriveApiKey().then((creds) => {
          if (creds && creds.key && this.clobClient) {
            this.clobClient.creds = creds;
            eventBus.emitLog('SYSTEM', 'success', 'Polymarket CLOB V2 API credentials successfully derived.');
          }
        }).catch((err: any) => {
          eventBus.emitLog('SYSTEM', 'error', `Failed to derive Polymarket API key: ${err?.message || err}`);
        });
      } catch (err: any) {
        eventBus.emitLog('SYSTEM', 'error', `Failed to initialize Polymarket CLOB client: ${err?.message || err}`);
      }
    }"""

if old_init in content:
    content = content.replace(old_init, new_init)
    print("SUCCESS: initClient replaced!")
else:
    print("WARNING: Exact old_init block not matched, applying regex...")
    # fallback regex replacement
    pattern = r"if \(privateKey && privateKey\.startsWith.*?Failed to initialize Polymarket CLOB client.*?\}\n    \}"
    content = re.sub(pattern, new_init, content, flags=re.DOTALL)
    print("Regex replacement executed.")

# Now replace order placement to use V2 createOrder + postOrder
old_order_block = """      try {
        // First try Market Taker Order (allows $1 small amounts)
        response = await (this.clobClient as any).createAndPostMarketOrder({
          tokenID: tokenId,
          amount: amountUsd,
          side: pmSide,
          price: validPrice,
        }, { tickSize: '0.01', negRisk: false }, OrderType.FOK);
      } catch (marketErr: any) {
        // Fallback to Limit Order
        response = await this.clobClient.createAndPostOrder({
          tokenID: tokenId,
          price: validPrice,
          side: pmSide,
          size: shares,
        }, { tickSize: '0.01', negRisk: false }, OrderType.FOK);
      }"""

new_order_block = """      try {
        // Polymarket V2: createOrder then postOrder
        const orderToPost = await this.clobClient.createOrder({
          tokenID: tokenId,
          price: validPrice,
          side: pmSide,
          size: Math.max(1, Math.round(shares)),
        });
        response = await this.clobClient.postOrder(orderToPost, OrderType.GTC);
        if (response && response.error) {
          throw new Error(response.error);
        }
      } catch (orderErr: any) {
        throw new Error(orderErr?.message || String(orderErr));
      }"""

if old_order_block in content:
    content = content.replace(old_order_block, new_order_block)
    print("SUCCESS: Order block replaced!")
else:
    print("Trying regex for order block...")
    content = re.sub(r"try \{\s*// First try Market Taker Order.*?OrderType\.FOK\);\s*\}", new_order_block, content, flags=re.DOTALL)

with open('src/server/polymarket/clob-client.ts', 'w') as f:
    f.write(content)
print("File written successfully!")
