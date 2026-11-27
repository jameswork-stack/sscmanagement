import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { getAuth } from "firebase/auth";
import {
  collection,
  onSnapshot,
  doc,
  runTransaction,
  arrayUnion,
  Timestamp,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import "./TransactionRecord.css";
import { jsPDF } from "jspdf";

const formatMoney = (amount) =>
  `₱${Number(amount || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (timestamp) => {
  if (!timestamp) return "Processing...";

  const date =
    typeof timestamp.toDate === "function"
      ? timestamp.toDate()
      : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "Invalid date";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// Thermal receipt settings (change to 58 for a 58mm printer).
const RECEIPT_WIDTH = 58;
const RECEIPT_NAME = "Sureshots Coffee";

function createReceiptPDF(record) {
  const margin = 4;
  const width = RECEIPT_WIDTH - margin * 2;
  const options = { unit: "mm", format: [RECEIPT_WIDTH, 200] };
  const measure = new jsPDF(options);
  const lines = [];
  const money = (value) => Number(value ?? 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  const add = (value, size = 9, bold = false, center = false) => {
    measure.setFont("helvetica", bold ? "bold" : "normal");
    measure.setFontSize(size);
    const wrapped = measure.splitTextToSize(String(value), width);
    wrapped.forEach((text) => lines.push({ text, size, bold, center, height: size * 0.46 + 0.7 }));
  };
  const rule = () => lines.push({ rule: true, height: 3 });
  const amount = (label, value) => add(`${label}: PHP ${money(value)}`);
  add(RECEIPT_NAME, 13, true, true);
  add("Sales Receipt", 10, false, true);
  rule();
  add(`Transaction: #${record.id}`);
  add(`Date: ${formatDate(record.createdAt)}`);
  add(`Customer: ${record.customerName || "Walk-in Customer"}`);
  add(`Payment: ${record.paymentMethod || "Unknown"}`);
  rule();
  (record.items || []).forEach((item) => {
    add(item.productName || "Product", 10, true);
    if (item.orderType) add(item.orderType, 8);
    add(`${item.quantity} x ${money(item.price)} = ${money(item.lineTotal ?? item.quantity * item.price)}`);
  });
  rule();
  amount("Subtotal", record.subtotal ?? (record.items || []).reduce((sum, item) => sum + Number(item.lineTotal ?? item.quantity * item.price), 0));
  amount(`Discount (${record.discountPercent || 0}%)`, record.discountAmount);
  add(`TOTAL: PHP ${money(record.totalAmount)}`, 12, true);
  if (record.paymentMethod === "Cash") {
    amount("Cash Received", record.amountReceived);
    amount("Change", record.change);
  }
  if (record.paymentMethod === "Loan") amount("Remaining Balance", record.balanceDue);
  add(`Status: ${record.paymentStatus || (record.paymentMethod === "Loan" ? "UNPAID" : "PAID")}`);
  rule();
  add("Thank you for your purchase!", 9, false, true);
  add("Please come again.", 8, false, true);
  const height = Math.max(80, Math.ceil(lines.reduce((sum, line) => sum + line.height, 0) + 12));
  const pdf = new jsPDF({ unit: "mm", format: [RECEIPT_WIDTH, height], orientation: "portrait" });
  let y = 5;
  lines.forEach((line) => {
    if (line.rule) {
      pdf.setLineWidth(0.2);
      pdf.line(margin, y + 1, RECEIPT_WIDTH - margin, y + 1);
    } else {
      pdf.setFont("helvetica", line.bold ? "bold" : "normal");
      pdf.setFontSize(line.size);
      pdf.text(line.text, line.center ? RECEIPT_WIDTH / 2 : margin, y + line.size * 0.36, { align: line.center ? "center" : "left" });
    }
    y += line.height;
  });
  return pdf;
}

export default function TransactionRecord() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedTransaction, setSelectedTransaction] = useState(null);

  const [selectedLoan, setSelectedLoan] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [payingLoan, setPayingLoan] = useState(false);
  const [loanError, setLoanError] = useState("");
  const [loanSuccess, setLoanSuccess] = useState("");

  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "transactions"),
      (snapshot) => {
        const records = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        records.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || 0;
          const dateB = b.createdAt?.toMillis?.() || 0;
          return dateB - dateA;
        });

        setTransactions(records);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Transaction loading error:", err);
        setError("Unable to load transaction records.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const matchesMethod =
        filter === "All" || transaction.paymentMethod === filter;

      const query = search.toLowerCase().trim();

      const matchesSearch =
        !query ||
        transaction.id.toLowerCase().includes(query) ||
        String(transaction.customerName || "")
          .toLowerCase()
          .includes(query) ||
        (transaction.items || []).some((item) =>
          String(item.productName || "")
            .toLowerCase()
            .includes(query)
        );

      return matchesMethod && matchesSearch;
    });
  }, [transactions, filter, search]);

  const totalSales = transactions.reduce(
    (sum, transaction) =>
      sum + Number(transaction.totalAmount || 0),
    0
  );

  const cashSales = transactions
    .filter((transaction) => transaction.paymentMethod === "Cash")
    .reduce(
      (sum, transaction) =>
        sum + Number(transaction.totalAmount || 0),
      0
    );

  const gcashSales = transactions
    .filter((transaction) => transaction.paymentMethod === "GCash")
    .reduce(
      (sum, transaction) =>
        sum + Number(transaction.totalAmount || 0),
      0
    );

  const loanBalance = transactions
    .filter((transaction) => transaction.paymentMethod === "Loan")
    .reduce(
      (sum, transaction) =>
        sum + Number(transaction.balanceDue || 0),
      0
    );

    const loanTransactions = useMemo(() => {
      return transactions.filter(
        (transaction) =>
          transaction.paymentMethod === "Loan" &&
          Number(transaction.balanceDue || 0) > 0
      );
    }, [transactions]);

    const loanToPay = selectedLoan
      ? transactions.find((transaction) => transaction.id === selectedLoan)
      : null;

  const selectedRecord = selectedTransaction
    ? transactions.find((item) => item.id === selectedTransaction)
    : null;

    const handlePayLoan = async () => {
  const amount = Number(paymentAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    setLoanError("Please enter a valid payment amount.");
    return;
  }

  if (!loanToPay) {
    setLoanError("Loan record not found.");
    return;
  }

  if (amount > Number(loanToPay.balanceDue || 0)) {
    setLoanError("Payment cannot exceed the remaining balance.");
    return;
  }

  setPayingLoan(true);
  setLoanError("");
  setLoanSuccess("");

  try {
    const loanRef = doc(db, "transactions", selectedLoan);

    await runTransaction(db, async (transaction) => {
      const loanSnapshot = await transaction.get(loanRef);

      if (!loanSnapshot.exists()) {
        throw new Error("Loan record not found.");
      }

      const loanData = loanSnapshot.data();

      if (loanData.paymentMethod !== "Loan") {
        throw new Error("This transaction is not a loan.");
      }

      const currentBalance = Number(loanData.balanceDue || 0);

      if (amount > currentBalance) {
        throw new Error("Payment exceeds the remaining balance.");
      }

      const newBalance = Number(
        (currentBalance - amount).toFixed(2)
      );

      transaction.update(loanRef, {
        balanceDue: newBalance,
        paymentStatus:
          newBalance === 0 ? "PAID" : "PARTIALLY PAID",
        loanPayments: arrayUnion({
          amount,
          paidAt: Timestamp.now(),
        }),
      });
    });

    setLoanSuccess("Loan payment recorded successfully!");
    setPaymentAmount("");
    setSelectedLoan(null);
  } catch (err) {
    console.error("Loan payment error:", err);
    setLoanError(err.message || "Unable to process loan payment.");
  } finally {
    setPayingLoan(false);
  }
};


useEffect(() => {
  const auth = getAuth();

  const unsubscribe = auth.onAuthStateChanged(async (user) => {
    setIsAdmin(false);

    if (!user) return;

    try {
      const userSnapshot = await getDoc(doc(db, "users", user.uid));

      if (userSnapshot.exists()) {
        const role = String(userSnapshot.data().role || "")
          .trim()
          .toLowerCase();

        setIsAdmin(role === "admin");
      }
    } catch (error) {
      console.error("Unable to verify admin role:", error);
      setIsAdmin(false);
    }
  });

  return () => unsubscribe();
}, []);

const closeActionMenu = () => {
  setActiveMenu(null);
  setMenuPosition(null);
};

const toggleActionMenu = (event, transactionId) => {
  if (activeMenu === transactionId) {
    closeActionMenu();
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();
  const menuWidth = 160;
  const menuHeight = isAdmin ? 200 : 152;

  const top =
    rect.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 6)
      : rect.bottom + 6;

  const left = Math.max(
    8,
    Math.min(
      window.innerWidth - menuWidth - 8,
      rect.right - menuWidth
    )
  );

  setMenuPosition({ top, left });
  setActiveMenu(transactionId);
};

useEffect(() => {
  if (!activeMenu) return;

  const handleOutsideClick = (event) => {
    if (
      menuRef.current &&
      !menuRef.current.contains(event.target) &&
      !event.target.closest(".transaction-action-btn")
    ) {
      closeActionMenu();
    }
  };

  const handleEscape = (event) => {
    if (event.key === "Escape") closeActionMenu();
  };

  document.addEventListener("mousedown", handleOutsideClick);
  document.addEventListener("keydown", handleEscape);
  window.addEventListener("scroll", closeActionMenu, true);
  window.addEventListener("resize", closeActionMenu);

  return () => {
    document.removeEventListener("mousedown", handleOutsideClick);
    document.removeEventListener("keydown", handleEscape);
    window.removeEventListener("scroll", closeActionMenu, true);
    window.removeEventListener("resize", closeActionMenu);
  };
}, [activeMenu]);

const handleReceipt = (transactionId, action) => {
  const record = transactions.find((item) => item.id === transactionId);
  closeActionMenu();
  if (!record) { setError("Transaction not found."); return; }
  setError("");
  try {
    const pdf = createReceiptPDF(record);
    if (action === "save") {
      pdf.save(`Receipt-${record.id}.pdf`);
    } else {
      pdf.autoPrint();
      const url = pdf.output("bloburl");
      const printWindow = window.open(url, "_blank");
      if (!printWindow) {
        URL.revokeObjectURL(url);
        setError("Allow popups to print the receipt, or use Save PDF.");
      } else {
        printWindow.opener = null;
        window.setTimeout(() => URL.revokeObjectURL(url), 300000);
      }
    }
  } catch (err) {
    console.error("Receipt error:", err);
    setError("Unable to generate the receipt.");
  }
};

const handleRemoveTransaction = async (transactionId) => {
  if (!isAdmin || removingId) return;

  const confirmed = window.confirm(
    "Are you sure you want to permanently remove this transaction? This action cannot be undone."
  );

  if (!confirmed) return;

  setRemovingId(transactionId);
  setError("");
  closeActionMenu();

  try {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) throw new Error("You must be logged in.");

    // Recheck the role before requesting deletion.
    const userSnapshot = await getDoc(doc(db, "users", user.uid));

    if (
      !userSnapshot.exists() ||
      String(userSnapshot.data().role || "").toLowerCase() !== "admin"
    ) {
      throw new Error("Only administrators can remove transactions.");
    }

    await deleteDoc(doc(db, "transactions", transactionId));

    if (selectedTransaction === transactionId) {
      setSelectedTransaction(null);
    }

    if (selectedLoan === transactionId) {
      setSelectedLoan(null);
    }
  } catch (error) {
    console.error("Remove transaction error:", error);
    setError(error.message || "Unable to remove transaction.");
  } finally {
    setRemovingId(null);
  }
};


  return (
    <div className="transaction-page">
      <div className="transaction-header">
        <div>
          <h1>Transaction Records</h1>
          <p>View and monitor all completed POS transactions.</p>
        </div>
      </div>

      {error && <div className="transaction-error">{error}</div>}

      <div className="transaction-summary">
        <div className="transaction-summary-card">
          <span>Total Sales</span>
          <strong>{formatMoney(totalSales)}</strong>
          <small>{transactions.length} transactions</small>
        </div>

        <div className="transaction-summary-card">
          <span>Cash Sales</span>
          <strong>{formatMoney(cashSales)}</strong>
          <small>Cash payments</small>
        </div>

        <div className="transaction-summary-card">
          <span>GCash Sales</span>
          <strong>{formatMoney(gcashSales)}</strong>
          <small>GCash payments</small>
        </div>

        <div className="transaction-summary-card">
          <span>Outstanding Loans</span>
          <strong>{formatMoney(loanBalance)}</strong>
          <small>Unpaid customer balances</small>
        </div>
      </div>

      <div className="transaction-content">

        {/* LOAN LIST */}
<div className="loan-list-section">
  <div className="loan-list-header">
    <div>
      <h2>Loan List</h2>
      <p>Manage customer outstanding loan balances.</p>
    </div>

    <span className="loan-count">
      {loanTransactions.length} Outstanding
    </span>
  </div>

  {loanSuccess && (
    <div className="loan-success-message">{loanSuccess}</div>
  )}

  <div className="loan-table-wrapper">
    <table className="loan-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Transaction ID</th>
          <th>Date</th>
          <th>Original Amount</th>
          <th>Remaining Balance</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>

      <tbody>
        {loanTransactions.length === 0 ? (
          <tr>
            <td colSpan="7" className="transaction-empty">
              No outstanding loans.
            </td>
          </tr>
        ) : (
          loanTransactions.map((loan) => (
            <tr key={loan.id}>
              <td>
                <strong>
                  {loan.customerName || "Walk-in Customer"}
                </strong>
              </td>

              <td>
                #{loan.id.slice(0, 8).toUpperCase()}
              </td>

              <td>{formatDate(loan.createdAt)}</td>

              <td>{formatMoney(loan.totalAmount)}</td>

              <td className="loan-remaining">
                {formatMoney(loan.balanceDue)}
              </td>

              <td>
                <span className="transaction-status unpaid">
                  {loan.paymentStatus || "UNPAID"}
                </span>
              </td>

              <td>
                <button
                  type="button"
                  className="loan-pay-btn"
                  onClick={() => {
                    setSelectedLoan(loan.id);
                    setPaymentAmount("");
                    setLoanError("");
                    setLoanSuccess("");
                  }}
                >
                  Pay Loan
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
</div>

        <div className="transaction-toolbar">
          <div className="transaction-filters">
            {["All", "Cash", "GCash", "Loan"].map((method) => (
              <button
                key={method}
                type="button"
                className={`transaction-filter-btn ${
                  filter === method ? "active" : ""
                }`}
                onClick={() => setFilter(method)}
              >
                {method === "All" ? "All Transactions" : method}
              </button>
            ))}
          </div>

          <input
            type="search"
            className="transaction-search"
            placeholder="Search transaction, customer, product..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="transaction-table-wrapper">
          <table className="transaction-table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Date & Time</th>
                <th>Products</th>
                <th>Payment</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="transaction-empty">
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="transaction-empty">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td className="transaction-id">
                      #{transaction.id.slice(0, 8).toUpperCase()}
                    </td>

                    <td>{formatDate(transaction.createdAt)}</td>

                    <td>
                      <div className="transaction-products">
                        {(transaction.items || [])
                          .slice(0, 2)
                          .map((item, index) => (
                            <span key={index}>
                              {item.productName} × {item.quantity}
                            </span>
                          ))}

                        {(transaction.items || []).length > 2 && (
                          <small>
                            +{transaction.items.length - 2} more
                          </small>
                        )}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`transaction-method method-${String(
                          transaction.paymentMethod || ""
                        ).toLowerCase()}`}
                      >
                        {transaction.paymentMethod || "Unknown"}
                      </span>
                    </td>

                    <td className="transaction-amount">
                      {formatMoney(transaction.totalAmount)}
                    </td>

                    <td>
                      <span
                        className={`transaction-status ${
                          transaction.paymentStatus === "UNPAID"
                            ? "unpaid"
                            : "paid"
                        }`}
                      >
                        {transaction.paymentStatus || "PAID"}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="transaction-action-btn"
                        onClick={(event) =>
                          toggleActionMenu(event, transaction.id)
                        }
                        aria-label="Transaction actions"
                        aria-expanded={activeMenu === transaction.id}
                        disabled={removingId === transaction.id}
                      >
                        ⋮
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="transaction-footer">
          Showing {filteredTransactions.length} of{" "}
          {transactions.length} transactions
        </div>
      </div>


{activeMenu &&
  menuPosition &&
  createPortal(
    <div
      ref={menuRef}
      className="transaction-action-dropdown"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
      }}
    >
      <button
        type="button"
        onClick={() => {
          setSelectedTransaction(activeMenu);
          closeActionMenu();
        }}
      >
        <span>◉</span>
        View Details
      </button>

      <button type="button" onClick={() => handleReceipt(activeMenu, "print")}>
        <span>▤</span> Print Receipt
      </button>
      <button type="button" onClick={() => handleReceipt(activeMenu, "save")}>
        <span>↓</span> Save PDF
      </button>

      {isAdmin && (
        <button
          type="button"
          className="transaction-action-remove"
          disabled={removingId !== null}
          onClick={() => handleRemoveTransaction(activeMenu)}
        >
          <span>⌫</span>
          Remove
        </button>
      )}
    </div>,
    document.body
  )}


      {/* PAY LOAN MODAL */}
{selectedLoan && loanToPay && (
  <div
    className="loan-modal-overlay"
    onClick={() => {
      if (!payingLoan) setSelectedLoan(null);
    }}
  >
    <div
      className="loan-payment-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Pay loan"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="loan-payment-header">
        <div>
          <h2>Pay Loan</h2>
          <p>Record a customer loan payment.</p>
        </div>

        <button
          type="button"
          disabled={payingLoan}
          onClick={() => setSelectedLoan(null)}
        >
          ×
        </button>
      </div>

      <div className="loan-payment-info">
        <div>
          <span>Customer</span>
          <strong>
            {loanToPay.customerName || "Walk-in Customer"}
          </strong>
        </div>

        <div>
          <span>Transaction ID</span>
          <strong>
            #{loanToPay.id.slice(0, 8).toUpperCase()}
          </strong>
        </div>

        <div>
          <span>Original Amount</span>
          <strong>{formatMoney(loanToPay.totalAmount)}</strong>
        </div>

        <div className="loan-balance-highlight">
          <span>Remaining Balance</span>
          <strong>{formatMoney(loanToPay.balanceDue)}</strong>
        </div>
      </div>

      <div className="loan-payment-input">
        <label htmlFor="loanPaymentAmount">
          Payment Amount (₱)
        </label>

        <input
          id="loanPaymentAmount"
          type="number"
          min="0.01"
          max={Number(loanToPay.balanceDue || 0)}
          step="0.01"
          placeholder="Enter payment amount"
          value={paymentAmount}
          onChange={(event) => setPaymentAmount(event.target.value)}
          disabled={payingLoan}
        />

        <small>
          Maximum payment: {formatMoney(loanToPay.balanceDue)}
        </small>
      </div>

      {loanError && (
        <div className="loan-error-message">{loanError}</div>
      )}

      <div className="loan-payment-actions">
        <button
          type="button"
          className="loan-cancel-btn"
          disabled={payingLoan}
          onClick={() => setSelectedLoan(null)}
        >
          Cancel
        </button>

        <button
          type="button"
          className="loan-confirm-btn"
          disabled={payingLoan}
          onClick={handlePayLoan}
        >
          {payingLoan ? "Processing..." : "Confirm Payment"}
        </button>
      </div>
    </div>
  </div>
)}

      {selectedRecord && (
        <div
          className="transaction-modal-overlay"
          onClick={() => setSelectedTransaction(null)}
        >
          <div
            className="transaction-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Transaction details"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="transaction-modal-header">
              <div>
                <h2>Transaction Details</h2>
                <p>#{selectedRecord.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTransaction(null)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="transaction-detail-grid">
              <div>
                <span>Date & Time</span>
                <strong>{formatDate(selectedRecord.createdAt)}</strong>
              </div>

              <div>
                <span>Payment Method</span>
                <strong>{selectedRecord.paymentMethod}</strong>
              </div>

              <div>
                <span>Payment Status</span>
                <strong>{selectedRecord.paymentStatus}</strong>
              </div>

              <div>
                <span>Customer</span>
                <strong>
                  {selectedRecord.customerName || "Walk-in Customer"}
                </strong>
              </div>
            </div>

            <h3 className="transaction-detail-title">Purchased Products</h3>

            <div className="transaction-detail-items">
              {(selectedRecord.items || []).map((item, index) => (
                <div className="transaction-detail-item" key={index}>
                  <div>
                    <strong>{item.productName}</strong>
                    <small>
                      {item.quantity} × {formatMoney(item.price)}
                    </small>
                  </div>
                  <strong>
                    {formatMoney(
                      item.lineTotal ?? item.quantity * item.price
                    )}
                  </strong>
                </div>
              ))}
            </div>

            <div className="transaction-detail-totals">
              <div>
                <span>Subtotal</span>
                <strong>{formatMoney(selectedRecord.subtotal)}</strong>
              </div>

              <div>
                <span>
                  Discount ({selectedRecord.discountPercent || 0}%)
                </span>
                <strong>
                  −{formatMoney(selectedRecord.discountAmount)}
                </strong>
              </div>

              <div className="transaction-detail-grand">
                <span>Total Amount</span>
                <strong>{formatMoney(selectedRecord.totalAmount)}</strong>
              </div>

              {selectedRecord.paymentMethod === "Cash" && (
                <>
                  <div>
                    <span>Cash Received</span>
                    <strong>
                      {formatMoney(selectedRecord.amountReceived)}
                    </strong>
                  </div>
                  <div>
                    <span>Change</span>
                    <strong>{formatMoney(selectedRecord.change)}</strong>
                  </div>
                </>
              )}

              {selectedRecord.paymentMethod === "Loan" && (
                <div>
                  <span>Remaining Balance</span>
                  <strong>
                    {formatMoney(selectedRecord.balanceDue)}
                  </strong>
                </div>
              )}
            </div>

            <button
              type="button"
              className="transaction-close-btn"
              onClick={() => setSelectedTransaction(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
