const COIN_OFFERS = [
  { id: "pack-500", coins: 500, amount: 50, displayCoins: 500, bonus: "50₹ Only" },
  { id: "pack-1050", coins: 1050, amount: 100, displayCoins: 1000, bonus: "+50 Extra" },
  { id: "pack-2200", coins: 2200, amount: 200, displayCoins: 2000, bonus: "+200 Extra" },
  { id: "pack-5350", coins: 5350, amount: 500, displayCoins: 5000, bonus: "+350 Extra" },
];

function findCoinOffer(offerId) {
  return COIN_OFFERS.find((item) => item.id === String(offerId || "")) || null;
}

module.exports = { COIN_OFFERS, findCoinOffer };
