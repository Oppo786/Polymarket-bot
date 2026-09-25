require('dotenv').config();
const { ClobClient, Side, OrderType, SignatureTypeV2 } = require('@polymarket/clob-client-v2');
const { createWalletClient, http } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');
const { polygon } = require('viem/chains');

async function test() {
  let pk = process.env.POLYMARKET_PRIVATE_KEY;
  if (!pk.startsWith('0x')) pk = '0x' + pk;
  
  const account = privateKeyToAccount(pk);
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http()
  });

  const funder = process.env.POLYMARKET_FUNDER_ADDRESS;

  // SignatureTypeV2.POLY_1271 = 3 (Deposit Wallet flow)
  const client = new ClobClient({
    host: 'https://clob.polymarket.com',
    chain: 137,
    signer: walletClient,
    signatureType: SignatureTypeV2.POLY_1271,
    funderAddress: funder
  });

  console.log("Generating fresh API key for deposit wallet...");
  const apiCreds = await client.createOrDeriveApiKey();
  client.creds = apiCreds;

  const slug = 'btc-updown-5m-' + (Math.floor(Date.now() / 300000) * 300);
  const res = await fetch('https://gamma-api.polymarket.com/events?slug=' + slug);
  const events = await res.json();
  const token = JSON.parse(events[0]?.markets[0].clobTokenIds)[0];

  console.log('Testing Token:', token);

  const order = await client.createOrder({
    tokenID: token,
    price: 0.10,
    side: Side.BUY,
    size: 5
  });

  console.log("Posting order to Polymarket...");
  const result = await client.postOrder(order, OrderType.GTC);
  console.log('>>> FINAL ORDER SUCCESS RESULT:', result);
}

test().catch(err => {
  console.error("Test Error:", err.message || err);
  if (err.response?.data) console.error("API Response Data:", err.response.data);
});
