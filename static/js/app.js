const tradeForm = document.getElementById("trade-form");
const formMessage = document.getElementById("form-message");
const tickerSelect = document.getElementById("ticker-select");
const manualTickerInput = document.getElementById("manual-ticker");
const tickerMessage = document.getElementById("ticker-message");
const tradesTableBody = document.querySelector("#trades-table tbody");
const loadTickerButton = document.getElementById("load-ticker");

let chart;

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const message = detail.errors ? detail.errors.join(" ") : detail.error || "Request failed.";
    throw new Error(message);
  }
  return response.json();
}

async function loadTickers() {
  try {
    const data = await fetchJson("/api/tickers");
    tickerSelect.innerHTML = '<option value="">-- Choose a ticker --</option>';
    data.tickers.forEach((ticker) => {
      const option = document.createElement("option");
      option.value = ticker;
      option.textContent = ticker;
      tickerSelect.appendChild(option);
    });
  } catch (error) {
    tickerMessage.textContent = error.message;
    tickerMessage.classList.add("error");
  }
}

async function handleAddTrade(event) {
  event.preventDefault();
  formMessage.textContent = "";
  formMessage.classList.remove("error");

  const payload = {
    ticker: document.getElementById("ticker").value,
    buy_date: document.getElementById("buy_date").value,
    buy_price: document.getElementById("buy_price").value,
    quantity: document.getElementById("quantity").value,
  };

  try {
    await fetchJson("/api/trades", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    formMessage.textContent = "Trade saved.";
    tradeForm.reset();
    await loadTickers();
  } catch (error) {
    formMessage.textContent = error.message;
    formMessage.classList.add("error");
  }
}

function renderTrades(trades) {
  tradesTableBody.innerHTML = "";
  trades.forEach((trade) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${trade.buy_date}</td>
      <td>${formatCurrency(trade.buy_price)}</td>
      <td>${trade.quantity}</td>
    `;
    tradesTableBody.appendChild(row);
  });
}

function renderChart(prices, trades, ticker) {
  const ctx = document.getElementById("price-chart").getContext("2d");
  const labels = prices.map((point) => point.date);

  const tradePoints = trades.map((trade) => ({
    x: trade.buy_date,
    y: trade.buy_price,
    r: 6,
    quantity: trade.quantity,
  }));

  const datasets = [
    {
      label: `${ticker} close price`,
      data: prices.map((point) => ({ x: point.date, y: point.close })),
      borderColor: "#2563eb",
      backgroundColor: "rgba(37, 99, 235, 0.2)",
      tension: 0.2,
    },
    {
      label: "Trades",
      data: tradePoints,
      type: "scatter",
      backgroundColor: "#ef4444",
      borderColor: "#ef4444",
      pointRadius: 6,
      pointHoverRadius: 8,
    },
  ];

  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      interaction: {
        mode: "nearest",
        intersect: false,
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.dataset.label === "Trades") {
                const point = tradePoints[context.dataIndex];
                return `Buy: ${point.x} @ ${formatCurrency(point.y)} (${point.quantity})`;
              }
              return `${formatCurrency(context.parsed.y)}`;
            },
          },
        },
        legend: {
          position: "top",
        },
        title: {
          display: true,
          text: `${ticker} price history`,
        },
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: "month",
            tooltipFormat: "yyyy-MM-dd",
          },
        },
        y: {
          beginAtZero: false,
          ticks: {
            callback: (value) => formatCurrency(value),
          },
        },
      },
    },
  });
}

async function loadTickerData(ticker) {
  tickerMessage.textContent = "";
  tickerMessage.classList.remove("error");
  if (!ticker) {
    tickerMessage.textContent = "Please select or enter a ticker.";
    tickerMessage.classList.add("error");
    return;
  }

  try {
    const [priceResponse, tradesResponse] = await Promise.all([
      fetchJson(`/api/prices/${ticker}`),
      fetchJson(`/api/trades/${ticker}`),
    ]);

    renderTrades(tradesResponse.trades);
    if (!priceResponse.prices.length) {
      tickerMessage.textContent = "No price data available for this ticker.";
      renderChart([], tradesResponse.trades, ticker);
      return;
    }
    renderChart(priceResponse.prices, tradesResponse.trades, ticker);
  } catch (error) {
    tickerMessage.textContent = error.message;
    tickerMessage.classList.add("error");
  }
}

tradeForm.addEventListener("submit", handleAddTrade);

loadTickerButton.addEventListener("click", () => {
  const ticker = manualTickerInput.value.trim().toUpperCase() || tickerSelect.value;
  loadTickerData(ticker);
});

document.addEventListener("DOMContentLoaded", () => {
  loadTickers();
});
