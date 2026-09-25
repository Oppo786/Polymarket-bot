require("dotenv").config();
const { ClobClient, Side, OrderType, SignatureType } = require("@polymarket/clob-client");
const { ethers } = require("ethers");

async function main() {
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

  // 1. Initialize client
  const client = new ClobClient(
    "https://clob.polymarket.com",
    137,
    signer,
    creds,
    SignatureType.POLY_GNOSIS_SAFE,
    funder
  );

  // 2. Fetch current BTC 5M Market
  const slug = "btc-updown-5m-" + (Math.floor(Date.now() / 300000) * 300);
  const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
  const events = await res.json();
  const event = events[0];
  const market = event?.markets?.[0];
  const tokenIds = JSON.parse(market?.clobTokenIds || "[]");
  const tokenId = tokenIds[0];

  console.log("Testing with Market:", market?.slug);
  console.log("Token ID:", tokenId);

  // 3. Create Order using Polymarket's explicit market parameters
  const order = await client.createOrder({
    tokenID: tokenId,
    price: 0.10,
    side: Side.BUY,
    size: 5,
    feeRateBps: 1000
  }, {
    tickSize: market?.orderPriceMinTickSize ? String(market.orderPriceMinTickSize) : "0.01",
    negRisk: market?.negRisk ?? true
  });

  console.log("Posting order to CLOB...");
  const postRes = await client.postOrder(order, OrderType.GTC);
  console.log("Result:", JSON.stringify(postRes, null, 2));

  if (postRes?.orderID) {
    console.log("SUCCESS! Cancelling test order...");
    await client.cancelOrder({ orderID: postRes.orderID });
    console.log("All done!");
  }
}

main().catch(console.error);
