require("dotenv").config();
const { ClobClient, Side, OrderType, SignatureType } = require("@polymarket/clob-client");
const { ethers } = require("ethers");

async function testSig(sigType, label) {
  console.log(`\n================ Testing ${label} (type: ${sigType}) ================`);
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

  const client = new ClobClient(
    "https://clob.polymarket.com", 
    137, 
    signer, 
    creds, 
    sigType, 
    sigType === SignatureType.EOA ? undefined : funder
  );

  const slug = "btc-updown-5m-" + (Math.floor(Date.now() / 300000) * 300);
  const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
  const events = await res.json();
  const market = events[0]?.markets[0];
  const tokenIds = JSON.parse(market?.clobTokenIds || "[]");

  try {
    const order = await client.createOrder({
      tokenID: tokenIds[0],
      price: 0.10,
      side: Side.BUY,
      size: 5,
      feeRateBps: 1000
    }, {
      tickSize: "0.01",
      negRisk: false
    });

    const postRes = await client.postOrder(order, OrderType.GTC);
    console.log("Response:", postRes);
    if (postRes?.orderID) {
      console.log(`\n🎉🎉🎉 SUCCESS WITH ${label}! Order ID:`, postRes.orderID);
      await client.cancelOrder({ orderID: postRes.orderID });
      console.log(">>> Order cancelled safely.");
      return true;
    }
  } catch (err) {
    console.error("Error:", err.message || err);
  }
  return false;
}

async function run() {
  if (await testSig(SignatureType.POLY_GNOSIS_SAFE, "POLY_GNOSIS_SAFE (Type 2)")) return;
  if (await testSig(SignatureType.POLY_PROXY, "POLY_PROXY (Type 1)")) return;
  if (await testSig(SignatureType.EOA, "EOA (Type 0)")) return;
}

run();
