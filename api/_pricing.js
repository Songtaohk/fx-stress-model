const prices = {
  current: { RMB: 13, HKD: 15, USD: 2 },
  full: { RMB: 50, HKD: 55, USD: 8 },
};

const stripeCurrencies = {
  RMB: "cny",
  HKD: "hkd",
  USD: "usd",
};

function getPrice(kind, currency) {
  const exportKind = kind === "full" ? "full" : "current";
  const paymentCurrency = ["RMB", "HKD", "USD"].includes(currency) ? currency : "RMB";
  return {
    kind: exportKind,
    currency: paymentCurrency,
    amount: prices[exportKind][paymentCurrency],
    stripeCurrency: stripeCurrencies[paymentCurrency],
    stripeAmount: prices[exportKind][paymentCurrency] * 100,
  };
}

export { getPrice, prices };
