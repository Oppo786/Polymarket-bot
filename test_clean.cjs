
require('dotenv').config();
const { ClobClient, Side, OrderType, SignatureType } = require('@polymarket/clob-client');
const { ethers } = require('ethers');

async function run() {
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  const signer = new ethers.Wallet(pk);
  signer._signTypedData = (d, t, v) => signer.signTypedData(d, t, v);
  signer.account = { address: signer.address };

  const funder = process.env.POLYMARKET_FUNDER_ADDRESS;
  const creds = {
    key: process.env.POLYMARKET_API_KEY,
    secret: process.env.POLYMARKET_API_SECRET,
    passphrase: process.env.POLYMARKET_API_PASSPHRASE
  };

  const client = new ClobClient('https://clob.polymarket.com', 137, signer, creds, SignatureType.POLY_GNOSIS_SAFE, funder);

  const slug = 'btc-updown-5m-' + (Math.floor(Date.now() / 300000) * 300);
  const mRes = await fetch('https://gamma-api.polymarket.com/events?slug=' + slug);
  const events = await mRes.json();
  const market = events[0]?.markets[0];
  const token = JSON.parse(market.clobTokenIds)[0];

  console.log('Testing Token:', token);

  // Introspect postOrder URL and body to see what CLOB is receiving
  const origPost = client.postOrder.bind(client);
  client.postOrder = async (order, oType) => {
    console.log('Order payload to be sent:', JSON.stringify(order, null, 2));
    return origPost(order, oType);
  };

  const order = await client.createOrder({
    tokenID: token,
    price: 0.10,
    side: Side.BUY,
    size: 5,
    feeRateBps: 1000
  }, {
    tickSize: '0.01',
    negRisk: true
  });

  const res = await client.postOrder(order, OrderType.GTC);
  console.log('Result:', res);
}

run().catch(console.error);
