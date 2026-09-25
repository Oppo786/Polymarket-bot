import dotenv from "dotenv";
dotenv.config();
import { ClobClient, Side, OrderType, SignatureType } from "@polymarket/clob-client";
import { ethers } from "ethers";

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

  const client = new ClobClient(
    "https://clob.polymarket.com",
    137,
    signer,
    creds,
    SignatureType.POLY_GNOSIS_SAFE,
    funder
  );

  // Non-NegRisk test market (US Election ya koi standard binary market) check karte hain
  // taake pata chale standard market par order place hota hai ya nahi
  const mRes = await fetch("https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=1&order=volume24hr&ascending=false");
  const markets = await mRes.json();
  const sampleMarket = markets[0];
  const token = JSON.parse(sampleMarket.clobTokenIds)[0];

  console.log("Testing on standard market:", sampleMarket.question);
  console.log("negRisk:", sampleMarket.negRisk);

  try {
    const order = await client.createOrder({
      tokenID: token,
      price: 0.05,
      side: Side.BUY,
      size: 5,
      feeRateBps: 0
    }, {
      tickSize: sampleMarket.orderPriceMinTickSize || "0.01",
      negRisk: sampleMarket.negRisk || false
    });

    const res = await client.postOrder(order, OrderType.GTC);
    console.log("ORDER RESPONSE:", res);
    if (res?.orderID) {
      console.log("SUCCESS! Test order created:", res.orderID);
      await client.cancelOrder({ orderID: res.orderID });
      console.log("Order cancelled.");
    }
  } catch (e) {
    console.error("Order error:", e.message || e);
  }
}

main();
