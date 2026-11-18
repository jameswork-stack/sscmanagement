import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";

import {
  addDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  doc,
  getDoc,
  deleteDoc,
} from "firebase/firestore";

import { db } from "../firebase/firebase";
import "./Expense.css";

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
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

const initialForm = {
  expenseName: "",
  details: "",
  amount: "",
};

export default function Expense() {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  const [activeMenu, setActiveMenu] = useState(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoading, setRoleLoading] = useState(true);

  const menuRef = useRef(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "expenses"),
      (snapshot) => {
        const data = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        }));

        data.sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) -
            (a.createdAt?.toMillis?.() || 0)
        );

        setExpenses(data);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Expense loading error:", err);
        setError("Unable to load expenses. Please check your permissions.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredExpenses = useMemo(() => {
    const keyword = search.toLowerCase().trim();

    return expenses.filter((expense) =>
      `${expense.expenseName || ""} ${expense.details || ""}`
        .toLowerCase()
        .includes(keyword)
    );
  }, [expenses, search]);

  const totalExpenses = expenses.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0
  );

  const openModal = () => {
    setForm(initialForm);
    setFormError("");
    setShowModal(true);
  };

  const closeModal = () => {
    if (saving) return;

    setShowModal(false);
    setForm(initialForm);
    setFormError("");
  };

  const handleChange = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));
  };

  const handleSave = async (event) => {
    event.preventDefault();

    if (saving) return;

    setFormError("");

    const expenseName = form.expenseName.trim();
    const details = form.details.trim();
    const amount = Number(form.amount);

    if (!expenseName) {
      setFormError("Please enter an expense name.");
      return;
    }

    if (!details) {
      setFormError("Please enter expense details.");
      return;
    }

    if (
      form.amount.trim() === "" ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      setFormError("Please enter a valid amount greater than zero.");
      return;
    }

    if (!/^\d+(\.\d{1,2})?$/.test(form.amount.trim())) {
      setFormError("Amount must have at most 2 decimal places.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "expenses"), {
        expenseName,
        details,
        amount,
        createdAt: serverTimestamp(),
      });

      setShowModal(false);
      setForm(initialForm);
      setFormError("");
    } catch (err) {
      console.error("Save expense error:", err);
      setFormError(
        err.code === "permission-denied"
          ? "Missing or insufficient permissions. Check your Firestore rules."
          : "Failed to save expense. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };


/* CHECK LOGGED-IN USER ROLE */
useEffect(() => {
  const auth = getAuth();

  const unsubscribe = onAuthStateChanged(auth, async (user) => {
    setIsAdmin(false);
    setRoleLoading(true);

    if (!user) {
      setRoleLoading(false);
      return;
    }

    try {
      const userSnapshot = await getDoc(doc(db, "users", user.uid));

      if (userSnapshot.exists()) {
        const role = String(userSnapshot.data().role || "")
          .trim()
          .toLowerCase();

        setIsAdmin(role === "admin");
      }
    } catch (error) {
      console.error("Expense admin verification error:", error);
      setIsAdmin(false);
    } finally {
      setRoleLoading(false);
    }
  });

  return () => unsubscribe();
}, []);

/* CLOSE ACTION MENU */
const closeActionMenu = () => {
  setActiveMenu(null);
  setMenuPosition(null);
};

/* TOGGLE THREE-DOT MENU */
const toggleActionMenu = (event, expenseId) => {
  if (activeMenu === expenseId) {
    closeActionMenu();
    return;
  }

  const rect = event.currentTarget.getBoundingClientRect();

  const menuWidth = 165;
  const menuHeight = isAdmin ? 100 : 55;

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
  setActiveMenu(expenseId);
};

/* CLOSE MENU ON OUTSIDE CLICK, SCROLL OR ESCAPE */
useEffect(() => {
  if (!activeMenu) return;

  const handleOutsideClick = (event) => {
    if (
      menuRef.current &&
      !menuRef.current.contains(event.target) &&
      !event.target.closest(".expense-action-btn")
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

/* VIEW EXPENSE DETAILS */
const handleViewExpense = (expenseId) => {
  const expense = expenses.find((item) => item.id === expenseId);

  if (!expense) {
    setError("Expense record not found.");
    closeActionMenu();
    return;
  }

  setSelectedExpense(expense);
  closeActionMenu();
};

/* REMOVE EXPENSE - ADMIN ONLY */
const handleRemoveExpense = async (expenseId) => {
  if (!isAdmin || removingId) return;

  const expense = expenses.find((item) => item.id === expenseId);

  if (!expense) {
    setError("Expense record not found.");
    return;
  }

  const confirmed = window.confirm(
    `Are you sure you want to permanently remove "${expense.expenseName}"?\n\nThis action cannot be undone.`
  );

  if (!confirmed) return;

  setRemovingId(expenseId);
  setError("");
  closeActionMenu();

  try {
    const user = getAuth().currentUser;

    if (!user) {
      throw new Error("You must be logged in.");
    }

    // Verify role again before requesting deletion.
    const userSnapshot = await getDoc(doc(db, "users", user.uid));

    if (
      !userSnapshot.exists() ||
      String(userSnapshot.data().role || "")
        .trim()
        .toLowerCase() !== "admin"
    ) {
      throw new Error("Only administrators can remove expenses.");
    }

    await deleteDoc(doc(db, "expenses", expenseId));

    setSelectedExpense((current) =>
      current?.id === expenseId ? null : current
    );
  } catch (error) {
    console.error("Remove expense error:", error);

    setError(
      error.code === "permission-denied"
        ? "Permission denied. Only administrators can remove expenses."
        : error.message || "Unable to remove expense."
    );
  } finally {
    setRemovingId(null);
  }
};


  return (
    <div className="expense-page">
      <div className="expense-header">
        <div>
          <h1>Expense Management</h1>
          <p>Record and monitor your business expenses.</p>
        </div>

        <button
          type="button"
          className="expense-add-btn"
          onClick={openModal}
        >
          + Add Expense
        </button>
      </div>

      {error && <div className="expense-error">{error}</div>}

      <div className="expense-summary">
        <div className="expense-summary-card">
          <span>Total Expenses</span>
          <strong>{formatMoney(totalExpenses)}</strong>
          <small>All recorded expenses</small>
        </div>

        <div className="expense-summary-card">
          <span>Expense Records</span>
          <strong>{expenses.length}</strong>
          <small>Total number of entries</small>
        </div>
      </div>

      <div className="expense-content">
        <div className="expense-toolbar">
          <div>
            <h2>Expense List</h2>
            <p>All saved business expenses</p>
          </div>

          <input
            type="search"
            placeholder="Search expenses..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="expense-table-wrapper">
          <table className="expense-table">
            <thead>
              <tr>
                <th>Expense Name</th>
                <th>Details</th>
                <th>Amount</th>
                <th>Date & Time</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="4" className="expense-empty">
                    Loading expenses...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan="4" className="expense-empty">
                    {search
                      ? "No matching expenses found."
                      : "No expenses recorded yet."}
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <td className="expense-name">
                      {expense.expenseName}
                    </td>

                    <td className="expense-details">
                      {expense.details}
                    </td>

                    <td className="expense-amount">
                      {formatMoney(expense.amount)}
                    </td>

                    <td className="expense-date">
                      {formatDate(expense.createdAt)}
                    </td>

                    <td className="expense-action-cell">
                      <button
                        type="button"
                        className="expense-action-btn"
                        onClick={(event) =>
                          toggleActionMenu(event, expense.id)
                        }
                        aria-label={`Actions for ${expense.expenseName}`}
                        aria-expanded={activeMenu === expense.id}
                        disabled={removingId === expense.id}
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

        <div className="expense-footer">
          Showing {filteredExpenses.length} of {expenses.length} expenses
        </div>
      </div>


{/* EXPENSE ACTION MENU */}
{activeMenu &&
  menuPosition &&
  createPortal(
    <div
      ref={menuRef}
      className="expense-action-dropdown"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
      }}
    >
      <button
        type="button"
        onClick={() => handleViewExpense(activeMenu)}
      >
        <span>◉</span>
        View Details
      </button>

      {!roleLoading && isAdmin && (
        <button
          type="button"
          className="expense-action-remove"
          disabled={removingId !== null}
          onClick={() => handleRemoveExpense(activeMenu)}
        >
          <span>⌫</span>
          Remove
        </button>
      )}
    </div>,
    document.body
  )}


      {showModal && (
        <div
          className="expense-modal-overlay"
          onClick={closeModal}
        >
          <div
            className="expense-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="expense-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="expense-modal-header">
              <div>
                <h2 id="expense-modal-title">Add New Expense</h2>
                <p>Enter the details of your business expense.</p>
              </div>

              <button
                type="button"
                className="expense-modal-x"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close expense form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>
              {formError && (
                <div className="expense-error">{formError}</div>
              )}

              <div className="expense-form-group">
                <label htmlFor="expenseName">Expense Name *</label>
                <input
                  id="expenseName"
                  type="text"
                  name="expenseName"
                  value={form.expenseName}
                  onChange={handleChange}
                  placeholder="e.g. Electricity Bill"
                  maxLength={120}
                  required
                  disabled={saving}
                />
              </div>

              <div className="expense-form-group">
                <label htmlFor="expenseDetails">Details *</label>
                <textarea
                  id="expenseDetails"
                  name="details"
                  value={form.details}
                  onChange={handleChange}
                  placeholder="Enter expense description..."
                  rows={4}
                  required
                  disabled={saving}
                />
              </div>

              <div className="expense-form-group">
                <label htmlFor="expenseAmount">Amount (₱) *</label>
                <input
                  id="expenseAmount"
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                  required
                  disabled={saving}
                />
              </div>

              <div className="expense-modal-actions">
                <button
                  type="button"
                  className="expense-cancel-btn"
                  onClick={closeModal}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="expense-save-btn"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


{/* VIEW EXPENSE DETAILS MODAL */}
{selectedExpense && (
  <div
    className="expense-modal-overlay"
    onClick={() => setSelectedExpense(null)}
  >
    <div
      className="expense-modal expense-view-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-view-title"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="expense-modal-header">
        <div>
          <h2 id="expense-view-title">Expense Details</h2>
          <p>View recorded business expense information.</p>
        </div>

        <button
          type="button"
          className="expense-modal-x"
          onClick={() => setSelectedExpense(null)}
          aria-label="Close expense details"
        >
          ×
        </button>
      </div>

      <div className="expense-view-details">
        <div className="expense-view-field">
          <span>Expense Name</span>
          <strong>{selectedExpense.expenseName}</strong>
        </div>

        <div className="expense-view-field">
          <span>Details</span>
          <p>{selectedExpense.details}</p>
        </div>

        <div className="expense-view-field">
          <span>Date & Time</span>
          <strong>{formatDate(selectedExpense.createdAt)}</strong>
        </div>

        <div className="expense-view-field expense-view-total">
          <span>Total Amount</span>
          <strong>{formatMoney(selectedExpense.amount)}</strong>
        </div>
      </div>

      <div className="expense-modal-actions">
        <button
          type="button"
          className="expense-save-btn"
          onClick={() => setSelectedExpense(null)}
        >
          Close
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}
