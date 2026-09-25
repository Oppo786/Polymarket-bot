require("dotenv").config();
const { ClobClient, Side, SignatureType } = require("@polymarket/clob-client");
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

  const client = new ClobClient("https://clob.polymarket.com", 137, signer, creds, SignatureType.POLY_GNOSIS_SAFE, funder);

  const slug = "btc-updown-5m-" + (Math.floor(Date.now() / 300000) * 300);
  const res = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
  const events = await res.json();
  const market = events[0]?.markets[0];
  const tokenIds = JSON.parse(market?.clobTokenIds || "[]");

  const order = await client.createOrder({
    tokenID: tokenIds[0],
    price: 0.10,
    side: Side.BUY,
    size: 5
  }, {
    tickSize: "0.01",
    negRisk: false
  });

  console.log("SIGNED ORDER STRUCT:");
  console.dir(order, { depth: null });
}

main().catch(console.error);
