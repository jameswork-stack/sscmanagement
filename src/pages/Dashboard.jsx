
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { db } from "../firebase/firebase";
import "./Dashboard.css";

const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toDate = (value) => {
  if (!value) return null;

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
};

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const isWithinPeriod = (timestamp, period, now) => {
  const date = toDate(timestamp);
  if (!date) return false;

  if (period === "today") {
    return sameDay(date, now);
  }

  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth()
  );
};

export default function Dashboard() {
  const [transactions, setTransactions] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [period, setPeriod] = useState("today");
  const [now, setNow] = useState(() => new Date());
  const [inventory, setInventory] = useState([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState("");

  const [salesLoading, setSalesLoading] = useState(true);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [salesError, setSalesError] = useState("");
  const [expensesError, setExpensesError] = useState("");

  useEffect(() => {
    const refreshClock = () => setNow(new Date());
    const timer = window.setInterval(refreshClock, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribeSales = onSnapshot(
      collection(db, "transactions"),
      (snapshot) => {
        setTransactions(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setSalesLoading(false);
        setSalesError("");
      },
      (error) => {
        console.error("Dashboard sales error:", error);
        setSalesError("Unable to load sales records.");
        setSalesLoading(false);
      }
    );

   const unsubscribeInventory = onSnapshot(
  collection(db, "inventoryItems"),
  (snapshot) => {
    const data = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data(),
    }));

    setInventory(data);
    setInventoryLoading(false);
    setInventoryError("");
  },
  (error) => {
    console.error("Dashboard inventory error:", error);

    setInventoryError(error.message);
    setInventoryLoading(false);
  }
);

    const unsubscribeExpenses = onSnapshot(
      collection(db, "expenses"),
      (snapshot) => {
        setExpenses(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setExpensesLoading(false);
        setExpensesError("");
      },
      (error) => {
        console.error("Dashboard expenses error:", error);
        setExpensesError("Unable to load expense records.");
        setExpensesLoading(false);
      }
    );

    return () => {
  unsubscribeSales();
  unsubscribeExpenses();
  unsubscribeInventory();
};
  }, []);

  const report = useMemo(() => {
    const sales = transactions.filter(
      (item) =>
        item.status === "SOLD" &&
        isWithinPeriod(item.createdAt, period, now)
    );

    const periodExpenses = expenses.filter((item) =>
      isWithinPeriod(item.createdAt, period, now)
    );

    const totalSales = sales.reduce(
      (sum, item) => sum + Number(item.totalAmount || 0),
      0
    );

    
const inventoryMap = new Map(
  inventory.map((item) => [item.id, item])
);

// Estimate the total quantity used by recorded sales.
// This helps reconstruct the quantity before sales deductions.
const allUsage = new Map();

transactions
  .filter((transaction) => transaction.status === "SOLD")
  .forEach((transaction) => {
    (transaction.items || []).forEach((product) => {
      const productQuantity = Number(product.quantity || 0);

      (product.ingredients || []).forEach((ingredient) => {
        if (!ingredient.id) return;

        const used =
          Number(ingredient.quantity || 0) * productQuantity;

        allUsage.set(
          ingredient.id,
          (allUsage.get(ingredient.id) || 0) + used
        );
      });
    });
  });

let estimatedCogs = 0;
let missingCogsCount = 0;

sales.forEach((sale) => {
  // Prefer actual COGS when a transaction already has it.
  if (
    typeof sale.cogs === "number" &&
    Number.isFinite(sale.cogs) &&
    sale.cogs >= 0
  ) {
    estimatedCogs += sale.cogs;
    return;
  }

  let saleCost = 0;
  let canCalculate = true;

  (sale.items || []).forEach((product) => {
    const productQuantity = Number(product.quantity || 0);

    (product.ingredients || []).forEach((ingredient) => {
      const stock = inventoryMap.get(ingredient.id);

      if (!stock) {
        canCalculate = false;
        return;
      }

      const currentQuantity = Number(stock.quantity);
      const totalInventoryCost = Number(stock.cost);

      // Approximate original quantity before recorded sales.
      const estimatedQuantity =
        currentQuantity + (allUsage.get(ingredient.id) || 0);

      if (
        !Number.isFinite(currentQuantity) ||
        !Number.isFinite(totalInventoryCost) ||
        estimatedQuantity <= 0 ||
        totalInventoryCost < 0
      ) {
        canCalculate = false;
        return;
      }

      const unitCost = totalInventoryCost / estimatedQuantity;

      const usedQuantity =
        Number(ingredient.quantity || 0) * productQuantity;

      saleCost += unitCost * usedQuantity;
    });
  });

  if (canCalculate && (sale.items || []).length > 0) {
    estimatedCogs += saleCost;
  } else {
    missingCogsCount++;
  }
});

const totalCogs =
  missingCogsCount === 0
    ? Math.round(estimatedCogs * 100) / 100
    : null;

    const totalExpenses = periodExpenses.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0
    );

    const grossProfit =
      totalCogs === null ? null : totalSales - totalCogs;

    const netIncome =
      grossProfit === null
        ? null
        : grossProfit - totalExpenses;

    const daysInMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0
    ).getDate();

    const graph = Array.from(
      { length: period === "today" ? 24 : daysInMonth },
      (_, index) => ({
        key: index,
        label:
          period === "today"
            ? `${String(index).padStart(2, "0")}:00`
            : String(index + 1),
        sales: 0,
      })
    );

    sales.forEach((item) => {
      const date = toDate(item.createdAt);
      if (!date) return;

      const index =
        period === "today"
          ? date.getHours()
          : date.getDate() - 1;

      graph[index].sales += Number(item.totalAmount || 0);
    });

    return {
      totalSales,
      totalCogs,
      grossProfit,
      totalExpenses,
      netIncome,
      missingCogsCount,
      transactionCount: sales.length,
      graph,
    };
  }, [transactions, expenses, inventory, period, now]);

  const cards = [
    {
      label: "Sales",
      value: report.totalSales,
      description: `${report.transactionCount} sales`,
    },
    {
      label: "Cost (COGS)",
      value: report.totalCogs,
      description: "Direct inventory cost",
    },
    {
      label: "Gross Profit",
      value: report.grossProfit,
      description: "Sales − COGS",
    },
    {
      label: "Expenses",
      value: report.totalExpenses,
      description: "Recorded business expenses",
    },
    {
      label: "Net Income",
      value: report.netIncome,
      description: "Gross Profit − Expenses",
      highlight: true,
    },
  ];

  const loading = salesLoading || expensesLoading;

      const hasError = Boolean(salesError || expensesError);

      const cogsLoading = inventoryLoading;
      const cogsError = Boolean(inventoryError);

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p>
            Financial overview for{" "}
            {period === "today" ? "today" : "the current month"}.
          </p>
        </div>

        <div className="dashboard-period-filter">
          <button
            type="button"
            className={period === "today" ? "active" : ""}
            onClick={() => setPeriod("today")}
          >
            Today
          </button>

          <button
            type="button"
            className={period === "month" ? "active" : ""}
            onClick={() => setPeriod("month")}
          >
            This Month
          </button>
        </div>
      </div>

      {hasError && (
        <div className="dashboard-alert">
          {salesError || expensesError}
        </div>
      )}

      {!loading &&
  !hasError &&
  !cogsLoading &&
  !cogsError &&
  report.missingCogsCount > 0 && (
    <div className="dashboard-alert">
      {report.missingCogsCount} transaction(s) have incomplete
      inventory cost data. Gross Profit and Net Income cannot
      be calculated accurately.
    </div>
  )}

      <div className="dashboard-cards">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`dashboard-card ${
              card.highlight ? "dashboard-card-highlight" : ""
            }`}
          >
            <span>{card.label}</span>

                  <strong>
        {loading
          ? "Loading..."
          : hasError
          ? "Unavailable"
          : ["Cost (COGS)", "Gross Profit", "Net Income"].includes(
              card.label
            ) && cogsLoading
          ? "Loading..."
          : ["Cost (COGS)", "Gross Profit", "Net Income"].includes(
              card.label
            ) && cogsError
          ? "Unavailable"
          : card.value === null
          ? "Unavailable"
          : money(card.value)}
      </strong>

            <small>{card.description}</small>
          </div>
        ))}
      </div>

      <div className="dashboard-chart-card">
        <div className="dashboard-chart-header">
          <div>
            <h2>Sales Overview</h2>
            <p>
              {period === "today"
                ? "Sales grouped by hour"
                : "Sales grouped by day"}
            </p>
          </div>

          <div className="dashboard-chart-total">
            <span>Total Sales</span>
            <strong>
              {loading || hasError
                ? "—"
                : money(report.totalSales)}
            </strong>
          </div>
        </div>

        <div className="dashboard-chart">
          {loading ? (
            <div className="dashboard-chart-message">
              Loading sales data...
            </div>
          ) : hasError ? (
            <div className="dashboard-chart-message">
              Unable to display sales data.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={report.graph}
                margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#eee6dc"
                />

                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#8b8178" }}
                  interval={period === "today" ? 3 : 4}
                  tickLine={false}
                  axisLine={false}
                />

                <YAxis
                  tick={{ fontSize: 11, fill: "#8b8178" }}
                  tickFormatter={(value) =>
                    value >= 1000
                      ? `${(value / 1000).toFixed(1)}k`
                      : value
                  }
                  tickLine={false}
                  axisLine={false}
                  width={48}
                />

                <Tooltip
                  formatter={(value) => [
                    money(value),
                    "Sales",
                  ]}
                  labelFormatter={(label) =>
                    period === "today"
                      ? `Hour: ${label}`
                      : `Day ${label}`
                  }
                />

                <Bar
                  dataKey="sales"
                  fill="#6f4e37"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={38}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
