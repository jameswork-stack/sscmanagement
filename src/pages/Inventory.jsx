
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  deleteDoc,
  runTransaction,
  query,
  where,
} from "firebase/firestore";


import { db } from "../firebase/firebase";
import "./Inventory.css";

export default function Inventory() {
  const [items, setItems] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeMenu, setActiveMenu] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editReason, setEditReason] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);


  const [showAddStock, setShowAddStock] = useState(false);
  const [stockItem, setStockItem] = useState(null);

  const [stockForm, setStockForm] = useState({
    quantity: "",
    cost: "",
  });

  const [stockSaving, setStockSaving] = useState(false);
  const [stockError, setStockError] = useState("");


  const [showLogs, setShowLogs] = useState(false);
  const [logItem, setLogItem] = useState(null);
  const [itemLogs, setItemLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState("");
  const [logFilter, setLogFilter] = useState("ALL");


  const initialForm = {
    itemName: "",
    details: "",
    cost: "",
    quantity: "",
    quantityType: "pcs",
    lowStockThreshold: "5",
  };

    const activeItem = items.find((item) => item.id === activeMenu);

    // OPEN ACTION MENU OUTSIDE TABLE CONTAINER
    const toggleActionMenu = (event, itemId) => {
      if (activeMenu === itemId) {
        setActiveMenu(null);
        setMenuPosition(null);
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();

      const menuWidth = 145;
      const menuHeight = 190;

      const top =
        rect.bottom + menuHeight + 8 > window.innerHeight
          ? Math.max(8, rect.top - menuHeight - 6)
          : rect.bottom + 6;

      const left = Math.max(
        8,
        Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth)
      );

      setMenuPosition({ top, left });
      setActiveMenu(itemId);
    };

  const [form, setForm] = useState(initialForm);

  // REAL-TIME FIRESTORE LISTENER
  useEffect(() => {
    const itemsRef = collection(db, "inventoryItems");

    const unsubscribe = onSnapshot(
      itemsRef,
      (snapshot) => {
        const itemList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        itemList.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || 0;
          const dateB = b.createdAt?.toMillis?.() || 0;
          return dateB - dateA;
        });

        setItems(itemList);
        setLoading(false);
      },
      (error) => {
        console.error("Inventory error:", error);
        setError("Unable to load inventory. Please check your access.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);



// LOAD LOGS FOR SELECTED INVENTORY ITEM
useEffect(() => {
  if (!showLogs || !logItem?.id) return;

  let stockLogs = [];
  let editLogs = [];

  let stockReady = false;
  let editReady = false;

  let stockError = null;
  let editError = null;

  const combineLogs = () => {
    if (!stockReady || !editReady) return;

    const combined = [...stockLogs, ...editLogs];

    combined.sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;

      return dateB - dateA;
    });

    setItemLogs(combined);
    setLogsLoading(false);

    if (stockError || editError) {
      setLogsError(
        "Some logs could not be loaded. Check Firestore permissions."
      );
    } else {
      setLogsError("");
    }
  };

  // STOCK ADDITION LOGS
  const stockQuery = query(
    collection(db, "stockLogs"),
    where("itemId", "==", logItem.id)
  );

  const unsubscribeStock = onSnapshot(
    stockQuery,
    (snapshot) => {
      stockLogs = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
        type: "ADD_STOCK",
      }));

      stockReady = true;
      stockError = null;
      combineLogs();
    },
    (error) => {
      console.error("Stock logs error:", error);

      stockReady = true;
      stockError = error;
      combineLogs();
    }
  );

  // INVENTORY EDIT LOGS
  const editQuery = query(
    collection(db, "inventoryEditLogs"),
    where("itemId", "==", logItem.id)
  );

  const unsubscribeEdit = onSnapshot(
    editQuery,
    (snapshot) => {
      editLogs = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
        type: "EDIT_ITEM",
      }));

      editReady = true;
      editError = null;
      combineLogs();
    },
    (error) => {
      console.error("Inventory edit logs error:", error);

      editReady = true;
      editError = error;
      combineLogs();
    }
  );

  return () => {
    unsubscribeStock();
    unsubscribeEdit();
  };
}, [showLogs, logItem?.id]);


  // HANDLE INPUT CHANGES
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // OPEN EDIT FORM
    const handleEdit = (item) => {
      setEditingItem(item);
      setEditReason("");

      setForm({
        itemName: item.itemName || "",
        details: item.details || "",
        cost: String(item.cost ?? ""),
        quantity: String(item.quantity ?? ""),
        quantityType: item.quantityType || "pcs",
        lowStockThreshold: String(item.lowStockThreshold ?? 5),
      });

      setActiveMenu(null);
      setMenuPosition(null);
      setError("");
      setShowForm(true);
    };

// REMOVE ITEM
const handleRemove = async (item) => {
  const confirmed = window.confirm(
    `Are you sure you want to remove "${item.itemName}"?`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "inventoryItems", item.id));
    setActiveMenu(null);
    setError("");
  } catch (error) {
    console.error("Remove item error:", error);
    setError("Failed to remove item. Please try again.");
  }
};


// OPEN ADD STOCK FORM
const handleOpenAddStock = (item) => {
  setStockItem(item);

  setStockForm({
    quantity: "",
    cost: "",
  });

  setStockError("");
  setActiveMenu(null);
  setMenuPosition(null);
  setShowAddStock(true);
};

// CLOSE ADD STOCK FORM
const handleCloseAddStock = () => {
  if (stockSaving) return;

  setShowAddStock(false);
  setStockItem(null);
  setStockForm({ quantity: "", cost: "" });
  setStockError("");
};


// OPEN ITEM LOG HISTORY
const handleViewLogs = (item) => {
  setLogItem(item);
  setItemLogs([]);
  setLogsError("");
  setLogFilter("ALL");
  setLogsLoading(true);
  setActiveMenu(null);
  setMenuPosition(null);
  setShowLogs(true);
};

// CLOSE ITEM LOG HISTORY
const handleCloseLogs = () => {
  setShowLogs(false);
  setLogItem(null);
  setItemLogs([]);
  setLogsError("");
  setLogFilter("ALL");
};

// FORMAT LOG DATE
const formatLogDate = (timestamp) => {
  if (!timestamp?.toDate) {
    return "Date unavailable";
  }

  return timestamp.toDate().toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

// FORMAT CHANGED FIELD NAME
const formatFieldName = (field) => {
  const labels = {
    itemName: "Item Name",
    details: "Details",
    cost: "Cost",
    quantity: "Quantity",
    quantityType: "Quantity Type",
    lowStockThreshold: "Low Stock Threshold",
  };

  return labels[field] || field;
};


  // FORMAT OLD / NEW VALUES
  const formatLogValue = (field, value) => {
    if (value === null || value === undefined || value === "") {
      return "Empty";
    }

    if (field === "cost") {
      return formatCost(value);
    }

    return String(value);
  };

  // FILTER ITEM LOGS
  const filteredItemLogs = itemLogs.filter((log) => {
    if (logFilter === "ALL") return true;
    return log.type === logFilter;
  });

  // TOTAL QUANTITY ADDED THROUGH ADD STOCK
  const totalStockAdded = itemLogs
    .filter((log) => log.type === "ADD_STOCK")
    .reduce(
      (total, log) => total + Number(log.addedQuantity || 0),
      0
    );

  // TOTAL COST OF STOCK ADDITIONS
  const totalStockCost = itemLogs
    .filter((log) => log.type === "ADD_STOCK")
    .reduce(
      (total, log) => total + Number(log.addedCost || 0),
      0
    );

// SAVE STOCK AND LOG IN ONE TRANSACTION
const handleSaveStock = async (e) => {
  e.preventDefault();

  if (!stockItem || stockSaving) return;

  const addedQuantity = Number(stockForm.quantity);
  const addedCost = Number(stockForm.cost);

  if (
    stockForm.quantity.trim() === "" ||
    stockForm.cost.trim() === "" ||
    !Number.isFinite(addedQuantity) ||
    !Number.isFinite(addedCost) ||
    addedQuantity <= 0 ||
    addedCost < 0
  ) {
    setStockError(
      "Enter a quantity greater than zero and a valid non-negative cost."
    );
    return;
  }

  // Pieces must be whole numbers.
  if (
    stockItem.quantityType === "pcs" &&
    !Number.isInteger(addedQuantity)
  ) {
    setStockError("Pieces must have a whole-number quantity.");
    return;
  }

  setStockSaving(true);
  setStockError("");

  try {
    const itemRef = doc(db, "inventoryItems", stockItem.id);
    const logRef = doc(collection(db, "stockLogs"));

    await runTransaction(db, async (transaction) => {
      const itemSnapshot = await transaction.get(itemRef);

      if (!itemSnapshot.exists()) {
        throw new Error("This inventory item no longer exists.");
      }

      const currentItem = itemSnapshot.data();

      const previousQuantity = Number(currentItem.quantity);
      const previousCost = Number(currentItem.cost);

      if (
        !Number.isFinite(previousQuantity) ||
        !Number.isFinite(previousCost)
      ) {
        throw new Error("The current inventory values are invalid.");
      }

      const newQuantity = previousQuantity + addedQuantity;
      const newCost = Math.round(
        (previousCost + addedCost) * 100
      ) / 100;

        // UPDATE INVENTORY
        transaction.update(itemRef, {
          quantity: newQuantity,
          cost: newCost,
          updatedAt: serverTimestamp(),
        });

        // CREATE PERMANENT STOCK ADDITION LOG
        transaction.set(logRef, {
          itemId: stockItem.id,
          itemName: currentItem.itemName,
          quantityType: currentItem.quantityType || "pcs",

          addedQuantity,
          addedCost,

          previousQuantity,
          previousCost,

          newQuantity,
          newCost,

          type: "ADD_STOCK",
          createdAt: serverTimestamp(),
        });
      });

      setShowAddStock(false);
      setStockItem(null);
      setStockForm({ quantity: "", cost: "" });
      setStockError("");

    } catch (error) {
      console.error("Add stock error:", error);

      setStockError(
        error.message || "Failed to add stock. Please try again."
      );
    } finally {
      setStockSaving(false);
    }
  };


  // SAVE ITEM TO FIRESTORE
  

const handleSave = async (e) => {
  e.preventDefault();

  if (
    !form.itemName.trim() ||
    form.cost === "" ||
    form.quantity === "" ||
    form.lowStockThreshold === ""
  ) {
    setError("Please complete all required fields.");
    return;
  }

  const cost = Number(form.cost);
  const quantity = Number(form.quantity);
  const lowStockThreshold = Number(form.lowStockThreshold);

  if (
    !Number.isFinite(cost) ||
    !Number.isFinite(quantity) ||
    !Number.isFinite(lowStockThreshold) ||
    cost < 0 ||
    quantity < 0 ||
    lowStockThreshold < 0
  ) {
    setError("Please enter valid non-negative numbers.");
    return;
  }

  if (form.quantityType === "pcs" && !Number.isInteger(quantity)) {
    setError("Pieces must have a whole-number quantity.");
    return;
  }

  // REASON IS REQUIRED ONLY WHEN EDITING
  if (editingItem && !editReason.trim()) {
    setError("Please enter a reason for editing this item.");
    return;
  }

  setSaving(true);
  setError("");

  const itemData = {
    itemName: form.itemName.trim(),
    details: form.details.trim(),
    cost,
    quantity,
    quantityType: form.quantityType,
    lowStockThreshold,
    updatedAt: serverTimestamp(),
  };

  try {
    if (editingItem) {
      // UPDATE INVENTORY AND SAVE EDIT LOG ATOMICALLY
      const itemRef = doc(db, "inventoryItems", editingItem.id);
      const logRef = doc(collection(db, "inventoryEditLogs"));

      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(itemRef);

        if (!snapshot.exists()) {
          throw new Error("Inventory item no longer exists.");
        }

        const previousData = snapshot.data();

        const fields = [
          "itemName",
          "details",
          "cost",
          "quantity",
          "quantityType",
          "lowStockThreshold",
        ];

        const changes = {};

        fields.forEach((field) => {
          const oldValue = previousData[field] ?? null;
          const newValue = itemData[field];

          if (oldValue !== newValue) {
            changes[field] = {
              from: oldValue,
              to: newValue,
            };
          }
        });

        if (Object.keys(changes).length === 0) {
          throw new Error("No changes were made to this item.");
        }

        transaction.update(itemRef, itemData);

        transaction.set(logRef, {
          itemId: editingItem.id,
          itemName: itemData.itemName,
          previousItemName: previousData.itemName || "",
          type: "EDIT_ITEM",
          reason: editReason.trim(),
          changes,
          previousValues: {
            itemName: previousData.itemName ?? "",
            details: previousData.details ?? "",
            cost: previousData.cost ?? 0,
            quantity: previousData.quantity ?? 0,
            quantityType: previousData.quantityType ?? "pcs",
            lowStockThreshold:
              previousData.lowStockThreshold ?? 5,
          },
          updatedValues: {
            itemName: itemData.itemName,
            details: itemData.details,
            cost: itemData.cost,
            quantity: itemData.quantity,
            quantityType: itemData.quantityType,
            lowStockThreshold: itemData.lowStockThreshold,
          },
          createdAt: serverTimestamp(),
        });
      });
    } else {
      // ADD NEW INVENTORY ITEM
      await addDoc(collection(db, "inventoryItems"), {
        ...itemData,
        createdAt: serverTimestamp(),
      });
    }

    setForm(initialForm);
    setEditingItem(null);
    setEditReason("");
    setShowForm(false);
    setActiveMenu(null);
    setMenuPosition(null);
    setError("");
  } catch (error) {
    console.error("Save inventory error:", error);

    setError(
      error.message || "Failed to save inventory item."
    );
  } finally {
    setSaving(false);
  }
};


  // SEARCH ITEMS
  const filteredItems = items.filter((item) =>
    [
      item.itemName,
      item.details,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  // STOCK SUMMARY
  const totalItems = items.length;

  const lowStock = items.filter(
  (item) =>
    Number(item.quantity) <= Number(item.lowStockThreshold ?? 5)
).length;

const availableItems = totalItems - lowStock;

  const formatCost = (value) =>
    `₱${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="inventory-page">

      {/* PAGE HEADER */}
      <div className="inventory-header">
        <div>
          <h1>Inventory</h1>
          <p>Manage your coffee shop supplies and ingredients.</p>
        </div>

        <button
          className="add-item-btn"
          
          onClick={() => {
            setForm(initialForm);
            setEditingItem(null);
            setEditReason("");
            setActiveMenu(null);
            setMenuPosition(null);
            setError("");
            setShowForm(true);
          }}

        >
          + Add New Item
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {error && (
        <div className="inventory-error">
          {error}
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div className="inventory-summary">

        <div className="summary-card">
          <span>Total Items</span>
          <h2>{totalItems}</h2>
          <small>Registered inventory items</small>
        </div>

        <div className="summary-card">
          <span>Available Items</span>
          <h2>{availableItems}</h2>
          <small>Items above their low stock threshold</small>
        </div>

        <div className="summary-card">
          <span>Low Stock</span>
          <h2>{lowStock}</h2>
          <small>Items at or below their alert threshold</small>
        </div>

      </div>

      {/* INVENTORY LIST */}
      <div className="inventory-list-container">

        <div className="inventory-list-header">
          <div>
            <h2>Inventory List</h2>
            <p>All your registered supplies and ingredients.</p>
          </div>

          <input
            type="text"
            className="inventory-search"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="inventory-empty">
            Loading inventory...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="inventory-empty">
            <div className="empty-icon">☕</div>
            <h3>No items found</h3>
            <p>
              {search
                ? "Try searching for another item."
                : "Start by adding your first inventory item."}
            </p>
          </div>
        ) : (

          <div className="inventory-table-wrapper">
            <table className="inventory-table">
              
              <thead>
                <tr>
                  <th className="col-item">Item Name</th>
                  <th className="col-cost">Cost</th>
                  <th className="col-quantity">Quantity</th>
                  <th className="col-status">Stock Status</th>
                  <th className="col-action">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredItems.map((item) => {
                  const threshold = Number(item.lowStockThreshold ?? 5);
                  const isLowStock = Number(item.quantity) <= threshold;

                  return (
                    <tr key={item.id}>

                      <td>
                        <div className="item-name">
                          {item.itemName}
                        </div>
                        <small className="item-details">
                          {item.details || "No details"}
                        </small>
                      </td>

                      <td>{formatCost(item.cost)}</td>

                      <td>
                        <div>{item.quantity} {item.quantityType}</div>
                        <small className="item-details">
                          Alert at: {threshold} {item.quantityType}
                        </small>
                      </td>

                      <td>
                        <span
                          className={
                            isLowStock
                              ? "stock-badge low-stock"
                              : "stock-badge available-stock"
                          }
                        >
                          {isLowStock ? "Low Stock" : "Available"}
                        </span>
                      </td>

                      <td className="col-action">
                          <div className="action-menu-container">
                            <button
                              type="button"
                              className="action-menu-btn"
                              onClick={(event) => toggleActionMenu(event, item.id)}
                              aria-label={`Actions for ${item.itemName}`}
                              aria-expanded={activeMenu === item.id}
                            >
                              ⋮
                            </button>
                          </div>
                        </td>

                    </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        )}

      </div>

      {/* ADD ITEM MODAL */}
      {/* ACTION DROPDOWN PORTAL */}
        {activeMenu && activeItem && menuPosition &&
          createPortal(
            <div
              className="action-dropdown action-dropdown-portal"
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
              }}
            > 
            
              <button
                type="button"
                onClick={() => handleOpenAddStock(activeItem)}
              >
                <span>＋</span>
                Add Stock
              </button>

              <button
                type="button"
                onClick={() => handleEdit(activeItem)}
              >
                <span>✎</span>
                Edit
              </button>

              <button
                type="button"
                onClick={() => handleViewLogs(activeItem)}
              >
                <span>◷</span>
                View Logs
              </button>

              <button
                type="button"
                className="delete-action"
                onClick={() => handleRemove(activeItem)}
              >
                <span>⌫</span>
                Remove
              </button>

            </div>,
            document.body
          )
        }
      {showForm && (
        <div
          className="inventory-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setShowForm(false);
              setError("");
            }
          }}
        >

          <div className="inventory-modal">

            <div className="modal-header">
              <div>
                <h2>{editingItem ? "Edit Item" : "Add New Item"}</h2>
                <p>Enter the details of your inventory item.</p>
              </div>

              <button
                type="button"
                className="modal-close"
                
              onClick={(e) => {
                if (e.target === e.currentTarget && !saving) {
                  setShowForm(false);
                  setEditingItem(null);
                  setEditReason("");
                  setForm(initialForm);
                  setError("");
                }
              }}

                disabled={saving}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>

              <div className="modal-form-group">
                <label>Item Name *</label>
                <input
                  type="text"
                  name="itemName"
                  placeholder="e.g. Arabica Coffee Beans"
                  value={form.itemName}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="modal-form-group">
                <label>Details</label>
                <textarea
                  name="details"
                  placeholder="Enter item description..."
                  value={form.details}
                  onChange={handleChange}
                  rows="3"
                />
              </div>

              <div className="modal-form-row">

                <div className="modal-form-group">
                  <label>Cost (₱) *</label>
                  <input
                    type="number"
                    name="cost"
                    placeholder="0.00"
                    value={form.cost}
                    onChange={handleChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div className="modal-form-group">
                  <label>Quantity *</label>
                  <input
                    type="number"
                    name="quantity"
                    placeholder="0"
                    value={form.quantity}
                    onChange={handleChange}
                    min="0"
                    step="any"
                    required
                  />
                </div>

              </div>

              <div className="modal-form-group">
                <label>Quantity Type *</label>

                <select
                  name="quantityType"
                  value={form.quantityType}
                  onChange={handleChange}
                  required
                >
                  <option value="g">Grams (g)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="pcs">Pieces (pcs)</option>
                </select>
              </div>

              <div className="modal-form-group">
                  <label>Low Stock Alert Threshold *</label>

                  <input
                    type="number"
                    name="lowStockThreshold"
                    placeholder="e.g. 10"
                    value={form.lowStockThreshold}
                    onChange={handleChange}
                    min="0"
                    step="any"
                    required
                  />

                  <small className="item-details">
                    You will receive a low-stock status when the quantity
                    reaches this amount or below.
                  </small>
                </div>


                {/* REASON FOR EDIT */}
                {editingItem && (
                  <div className="modal-form-group">
                    <label htmlFor="inventory-edit-reason">
                      Reason for Edit *
                    </label>

                    <textarea
                      id="inventory-edit-reason"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Explain why you are updating this item..."
                      rows={3}
                      maxLength={500}
                      required
                    />

                    <small className="item-details">
                      Required for audit history. This reason will be saved
                      with the previous and updated values.
                    </small>
                  </div>
                )}


              <div className="modal-form-actions">

                
                  <button
                    type="button"
                    className="cancel-btn"
                    
                    onClick={(e) => {
                      if (e.target === e.currentTarget && !saving) {
                        setShowForm(false);
                        setEditingItem(null);
                        setEditReason("");
                        setForm(initialForm);
                        setError("");
                      }
                    }}

                    disabled={saving}
                  >
                    Cancel
                  </button>


                <button
                  type="submit"
                  className="save-item-btn"
                  disabled={saving}
                >
                  {saving
                  ? "Saving..."
                  : editingItem
                    ? "Update Item"
                    : "Save Item"}

                </button>

              </div>

            </form>

          </div>

        </div>
      )}


{/* ADD STOCK MODAL */}
{showAddStock && stockItem && (
  <div
    className="inventory-modal-overlay"
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        handleCloseAddStock();
      }
    }}
  >
    <div className="inventory-modal add-stock-modal">

      <div className="modal-header">
        <div>
          <h2>Add Stock</h2>
          <p>{stockItem.itemName}</p>
        </div>

        <button
          type="button"
          className="modal-close"
          onClick={handleCloseAddStock}
          disabled={stockSaving}
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSaveStock}>

        <div className="stock-current-info">
          <div>
            <span>Current Quantity</span>
            <strong>
              {stockItem.quantity} {stockItem.quantityType}
            </strong>
          </div>

          <div>
            <span>Current Total Cost</span>
            <strong>{formatCost(stockItem.cost)}</strong>
          </div>
        </div>

        {stockError && (
          <div className="inventory-error">
            {stockError}
          </div>
        )}

        <div className="modal-form-group">
          <label>
            Quantity to Add ({stockItem.quantityType}) *
          </label>

          <input
            type="number"
            min={stockItem.quantityType === "pcs" ? "1" : "0.001"}
            step={stockItem.quantityType === "pcs" ? "1" : "any"}
            placeholder="Enter additional quantity"
            value={stockForm.quantity}
            onChange={(e) =>
              setStockForm((prev) => ({
                ...prev,
                quantity: e.target.value,
              }))
            }
            required
          />
        </div>

        <div className="modal-form-group">
          <label>Additional Stock Cost (₱) *</label>

          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Enter total cost of new stock"
            value={stockForm.cost}
            onChange={(e) =>
              setStockForm((prev) => ({
                ...prev,
                cost: e.target.value,
              }))
            }
            required
          />
        </div>

        <div className="stock-preview">
          <div>
            <span>Updated Quantity</span>
            <strong>
              {Number(stockItem.quantity || 0) +
                Number(stockForm.quantity || 0)}
              {" "}{stockItem.quantityType}
            </strong>
          </div>

          <div>
            <span>Updated Total Cost</span>
            <strong>
              {formatCost(
                Number(stockItem.cost || 0) +
                Number(stockForm.cost || 0)
              )}
            </strong>
          </div>
        </div>

        <div className="modal-form-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={handleCloseAddStock}
            disabled={stockSaving}
          >
            Cancel
          </button>

          <button
            type="submit"
            className="save-item-btn"
            disabled={stockSaving}
          >
            {stockSaving ? "Adding Stock..." : "Confirm Add Stock"}
          </button>
        </div>

      </form>
    </div>
  </div>
)}



{/* VIEW INVENTORY LOGS MODAL */}
{showLogs && logItem && (
  <div
    className="inventory-modal-overlay"
    onClick={(e) => {
      if (e.target === e.currentTarget) {
        handleCloseLogs();
      }
    }}
  >
    <div className="inventory-modal inventory-logs-modal">

      <div className="modal-header">
        <div>
          <h2>Inventory Movement History</h2>
          <p>{logItem.itemName}</p>
        </div>

        <button
          type="button"
          className="modal-close"
          onClick={handleCloseLogs}
          aria-label="Close logs"
        >
          ×
        </button>
      </div>

      {/* SUMMARY */}
      <div className="inventory-log-summary">
        <div className="inventory-log-summary-card">
          <span>Total Logs</span>
          <strong>{itemLogs.length}</strong>
        </div>

        <div className="inventory-log-summary-card">
          <span>Stock Added</span>
          <strong>
            {totalStockAdded.toLocaleString("en-PH")}{" "}
            {logItem.quantityType}
          </strong>
        </div>

        <div className="inventory-log-summary-card">
          <span>Stock Purchase Cost</span>
          <strong>{formatCost(totalStockCost)}</strong>
        </div>
      </div>

      {/* FILTER */}
      <div className="inventory-log-filter">
        <label htmlFor="inventory-log-type">
          Filter Activity
        </label>

        <select
          id="inventory-log-type"
          value={logFilter}
          onChange={(e) => setLogFilter(e.target.value)}
        >
          <option value="ALL">All Activities</option>
          <option value="ADD_STOCK">Stock Added</option>
          <option value="EDIT_ITEM">Item Edited</option>
        </select>
      </div>

      {/* LOG CONTENT */}
      <div className="inventory-log-list">

        {logsLoading ? (
          <div className="inventory-log-empty">
            Loading item history...
          </div>
        ) : (
          <>
            {logsError && (
              <div className="inventory-error">
                {logsError}
              </div>
            )}

            {filteredItemLogs.length === 0 ? (
              <div className="inventory-log-empty">
                <h3>No logs found</h3>
                <p>
                  No recorded activity is available for
                  this item and selected filter.
                </p>
              </div>
            ) : (
              filteredItemLogs.map((log) => (
                <div
                  key={`${log.type}-${log.id}`}
                  className="inventory-log-entry"
                >
                  <div className="inventory-log-entry-header">
                    <span
                      className={`inventory-log-type ${
                        log.type === "ADD_STOCK"
                          ? "log-stock"
                          : "log-edit"
                      }`}
                    >
                      {log.type === "ADD_STOCK"
                        ? "＋ Stock Added"
                        : "✎ Item Edited"}
                    </span>

                    <small>
                      {formatLogDate(log.createdAt)}
                    </small>
                  </div>

                  {log.type === "ADD_STOCK" ? (
                    <div className="inventory-log-details">
                      <div>
                        <span>Quantity Added</span>
                        <strong>
                          +{log.addedQuantity}{" "}
                          {log.quantityType}
                        </strong>
                      </div>

                      <div>
                        <span>Additional Cost</span>
                        <strong>
                          {formatCost(log.addedCost)}
                        </strong>
                      </div>

                      <div>
                        <span>Quantity Movement</span>
                        <strong>
                          {log.previousQuantity} →{" "}
                          {log.newQuantity}{" "}
                          {log.quantityType}
                        </strong>
                      </div>

                      <div>
                        <span>Cost Movement</span>
                        <strong>
                          {formatCost(log.previousCost)} →{" "}
                          {formatCost(log.newCost)}
                        </strong>
                      </div>
                    </div>
                  ) : (
                    <div className="inventory-edit-log-content">

                      <div className="inventory-log-reason">
                        <strong>Reason for Edit</strong>
                        <p>
                          {log.reason || "No reason recorded"}
                        </p>
                      </div>

                      <strong className="inventory-changes-heading">
                        Changes Made
                      </strong>

                      <div className="inventory-log-changes">
                        {Object.entries(log.changes || {}).map(
                          ([field, change]) => (
                            <div
                              key={field}
                              className="inventory-log-change"
                            >
                              <span>
                                {formatFieldName(field)}
                              </span>

                              <div>
                                <span className="log-old-value">
                                  {formatLogValue(
                                    field,
                                    change.from
                                  )}
                                </span>

                                <span className="log-arrow">→</span>

                                <span className="log-new-value">
                                  {formatLogValue(
                                    field,
                                    change.to
                                  )}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </>
        )}
      </div>

      <div className="modal-form-actions">
        <button
          type="button"
          className="cancel-btn"
          onClick={handleCloseLogs}
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
