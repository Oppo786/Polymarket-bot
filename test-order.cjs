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

  const slug = "btc-updown-5m-" + (Math.floor(Date.now() / 300000) * 300);
  const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
  const events = await res.json();
  const event = events[0];
  const market = event?.markets[0];
  const tokenIds = JSON.parse(market?.clobTokenIds || "[]");
  const tokenId = tokenIds[0];

  const isNegRisk = Boolean(event?.negRisk || market?.negRisk);
  const tickSize = String(market?.orderPriceMinTickSize || "0.01");

  console.log("Market:", market?.slug);
  console.log("Token ID:", tokenId);
  console.log("NegRisk:", isNegRisk, "TickSize:", tickSize);

  const sigType = funder && funder.toLowerCase() !== signer.address.toLowerCase() 
    ? SignatureType.POLY_GNOSIS_SAFE 
    : SignatureType.EOA;

  const client = new ClobClient("https://clob.polymarket.com", 137, signer, creds, sigType, funder);

  // Try standard order creation with negRisk passed
  const order = await client.createOrder({
    tokenID: tokenId,
    price: 0.10,
    side: Side.BUY,
    size: 5
  }, {
    tickSize: tickSize,
    negRisk: isNegRisk
  });

  console.log("Order signed!");
  const postRes = await client.postOrder(order, OrderType.GTC);
  console.log("\n>>> ORDER RESPONSE:", postRes);

  if (postRes?.orderID) {
    console.log("\n>>> SUCCESS! Order ID:", postRes.orderID);
    await client.cancelOrder({ orderID: postRes.orderID });
    console.log(">>> Order cancelled!");
  }
}

main().catch(console.error);
