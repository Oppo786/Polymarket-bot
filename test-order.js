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
  const market = events[0]?.markets[0];
  const tokenIds = JSON.parse(market?.clobTokenIds || "[]");
  const tokenId = tokenIds[0];

  console.log("Found Market:", market?.slug);
  console.log("Token ID:", tokenId);

  const sigType = funder && funder.toLowerCase() !== signer.address.toLowerCase() 
    ? SignatureType.POLY_GNOSIS_SAFE 
    : SignatureType.EOA;

  console.log("Using Signature Type:", sigType, "Funder:", funder || signer.address);

  const client = new ClobClient("https://clob.polymarket.com", 137, signer, creds, sigType, funder);

  const order = await client.createOrder({
    tokenID: tokenId,
    price: 0.10,
    side: Side.BUY,
    size: 5
  }, {
    tickSize: market.orderPriceMinTickSize || "0.01",
    negRisk: market.negRisk || false
  });

  console.log("Order signed successfully!");
  const postRes = await client.postOrder(order, OrderType.GTC);
  console.log("\n>>> ORDER RESPONSE:", postRes);

  if (postRes?.orderID) {
    console.log("\n>>> SUCCESS! Order posted to Polymarket CLOB:", postRes.orderID);
    await client.cancelOrder({ orderID: postRes.orderID });
    console.log(">>> Test order cancelled cleanly.");
  }
}

main().catch(console.error);
