import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/firebase";
import "./POS.css";

const money = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

export default function POS() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [discount, setDiscount] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [amountReceived, setAmountReceived] = useState("");
  const [customerName, setCustomerName] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        data.sort((a, b) =>
          String(a.productName || "").localeCompare(
            String(b.productName || "")
          )
        );

        setProducts(data);
        setLoading(false);
      },
      (err) => {
        console.error("Products loading error:", err);
        setError("Unable to load products.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const filteredProducts = useMemo(
    () =>
      products.filter((product) =>
        `${product.productName || ""} ${product.details || ""}`
          .toLowerCase()
          .includes(search.toLowerCase())
      ),
    [products, search]
  );

  const addToCart = (product) => {
    setError("");
    setSuccess("");

    setCart((previous) => {
      const existing = previous.find(
        (item) => item.id === product.id
      );

      if (existing) {
        return previous.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...previous,
        {
          id: product.id,
          productName: product.productName,
          price: Number(product.price),
          quantity: 1,
        },
      ];
    });
  };

  const updateCartQuantity = (id, change) => {
    setCart((previous) =>
      previous
        .map((item) =>
          item.id === id
            ? {
                ...item,
                quantity: Math.max(0, item.quantity + change),
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
    setSuccess("");
  };

  const removeFromCart = (id) => {
    setCart((previous) =>
      previous.filter((item) => item.id !== id)
    );
    setSuccess("");
  };

  const discountPercent = Math.min(
    100,
    Math.max(0, Number(discount) || 0)
  );

  const subtotalCents = cart.reduce(
    (total, item) =>
      total + Math.round(item.price * 100) * item.quantity,
    0
  );

  const discountCents = Math.round(
    (subtotalCents * discountPercent) / 100
  );

  const totalCents = subtotalCents - discountCents;
  const subtotal = subtotalCents / 100;
  const discountAmount = discountCents / 100;
  const total = totalCents / 100;

  const receivedCents = Math.round(
    Number(amountReceived || 0) * 100
  );

  const change =
    paymentMethod === "Cash"
      ? Math.max(0, receivedCents - totalCents) / 100
      : 0;

  const resetSale = () => {
    setCart([]);
    setDiscount("0");
    setPaymentMethod("Cash");
    setAmountReceived("");
    setCustomerName("");
  };

  const handleSold = async () => {
    if (saving) return;

    setError("");
    setSuccess("");

    if (cart.length === 0) {
      setError("Please add at least one product.");
      return;
    }

    if (
      discount === "" ||
      !Number.isFinite(Number(discount)) ||
      Number(discount) < 0 ||
      Number(discount) > 100
    ) {
      setError("Discount must be between 0% and 100%.");
      return;
    }

    if (paymentMethod === "Loan" && !customerName.trim()) {
      setError("Customer name is required for loan sales.");
      return;
    }

    if (
      paymentMethod === "Cash" &&
      (!Number.isFinite(Number(amountReceived)) ||
        amountReceived.trim() === "" ||
        receivedCents < totalCents)
    ) {
      setError("Cash received must cover the payable amount.");
      return;
    }

    if (
      paymentMethod === "GCash" &&
      !window.confirm(
        "Confirm that the GCash payment was received?"
      )
    ) {
      return;
    }

    if (
      paymentMethod === "Loan" &&
      !window.confirm(
        "Record this sale as an unpaid customer loan?"
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const transactionRef = doc(collection(db, "transactions"));

      await runTransaction(db, async (transaction) => {
        // READ ALL PRODUCTS BEFORE WRITING
        const productSnapshots = await Promise.all(
          cart.map((item) =>
            transaction.get(doc(db, "products", item.id))
          )
        );

        const saleItems = [];
        const ingredientRequirements = new Map();
        let currentSubtotalCents = 0;

        productSnapshots.forEach((snapshot, index) => {
          if (!snapshot.exists()) {
            throw new Error(
              `A product in the cart no longer exists.`
            );
          }

          const product = snapshot.data();
          const cartItem = cart[index];
          const saleQuantity = cartItem.quantity;
          const price = Number(product.price);

          if (
            !Number.isSafeInteger(saleQuantity) ||
            saleQuantity <= 0 ||
            !Number.isFinite(price) ||
            price < 0
          ) {
            throw new Error("Invalid product price or quantity.");
          }

          const ingredients = product.ingredients || [];

          if (!Array.isArray(ingredients) || ingredients.length === 0) {
            throw new Error(
              `${product.productName} has no ingredients configured.`
            );
          }

          const priceCents = Math.round(price * 100);
          const lineTotalCents = priceCents * saleQuantity;
          currentSubtotalCents += lineTotalCents;

          saleItems.push({
            productId: snapshot.id,
            productName: product.productName,
            price: priceCents / 100,
            quantity: saleQuantity,
            lineTotal: lineTotalCents / 100,
            ingredients: ingredients.map((ingredient) => ({
              id: ingredient.id,
              itemName: ingredient.itemName || "",
              quantity: Number(ingredient.quantity),
              quantityType: ingredient.quantityType,
            })),
          });

          ingredients.forEach((ingredient) => {
            const requiredQuantity =
              Number(ingredient.quantity) * saleQuantity;

            if (
              !ingredient.id ||
              !Number.isFinite(requiredQuantity) ||
              requiredQuantity <= 0
            ) {
              throw new Error(
                `Invalid ingredient recipe for ${product.productName}.`
              );
            }

            const previous = ingredientRequirements.get(
              ingredient.id
            );

            if (
              previous &&
              previous.quantityType !== ingredient.quantityType
            ) {
              throw new Error(
                `Conflicting units for ${ingredient.itemName}.`
              );
            }

            ingredientRequirements.set(ingredient.id, {
              quantity:
                (previous?.quantity || 0) + requiredQuantity,
              quantityType: ingredient.quantityType,
            });
          });
        });

        // READ ALL INVENTORY DOCUMENTS BEFORE WRITING
        const inventoryEntries = await Promise.all(
          [...ingredientRequirements.entries()].map(
            async ([itemId, requirement]) => {
              const itemRef = doc(db, "inventoryItems", itemId);
              const snapshot = await transaction.get(itemRef);

              return { itemId, itemRef, snapshot, requirement };
            }
          )
        );

        const stockMovements = [];

        inventoryEntries.forEach(
          ({ itemId, itemRef, snapshot, requirement }) => {
            if (!snapshot.exists()) {
              throw new Error("An ingredient no longer exists.");
            }

            const inventory = snapshot.data();

            if (
              inventory.quantityType !== requirement.quantityType
            ) {
              throw new Error(
                `Unit mismatch for ${inventory.itemName}.`
              );
            }

            const previousQuantity = Number(inventory.quantity);
            const usedQuantity = round2(requirement.quantity);

            if (
              !Number.isFinite(previousQuantity) ||
              previousQuantity < usedQuantity
            ) {
              throw new Error(
                `Insufficient stock for ${inventory.itemName}. ` +
                  `Available: ${previousQuantity} ` +
                  `${inventory.quantityType}, ` +
                  `required: ${usedQuantity}.`
              );
            }

            stockMovements.push({
              itemId,
              itemRef,
              itemName: inventory.itemName,
              quantityType: inventory.quantityType,
              previousQuantity,
              usedQuantity,
              newQuantity: round2(previousQuantity - usedQuantity),
            });
          }
        );

        // WRITE ONLY AFTER ALL READS AND VALIDATIONS
        const currentDiscountCents = Math.round(
          (currentSubtotalCents * discountPercent) / 100
        );
        const currentTotalCents =
          currentSubtotalCents - currentDiscountCents;

        if (
          paymentMethod === "Cash" &&
          receivedCents < currentTotalCents
        ) {
          throw new Error(
            "The payable amount changed. Please review the sale."
          );
        }

        const isLoan = paymentMethod === "Loan";

        transaction.set(transactionRef, {
          items: saleItems,
          subtotal: currentSubtotalCents / 100,
          discountPercent,
          discountAmount: currentDiscountCents / 100,
          totalAmount: currentTotalCents / 100,
          paymentMethod,
          paymentStatus: isLoan ? "UNPAID" : "PAID",
          amountPaid: isLoan ? 0 : currentTotalCents / 100,
          balanceDue: isLoan ? currentTotalCents / 100 : 0,
          amountReceived:
            paymentMethod === "Cash"
              ? receivedCents / 100
              : null,
          change:
            paymentMethod === "Cash"
              ? (receivedCents - currentTotalCents) / 100
              : 0,
          customerName: customerName.trim(),
          status: "SOLD",
          createdAt: serverTimestamp(),
        });

        stockMovements.forEach((movement) => {
          transaction.update(movement.itemRef, {
            quantity: movement.newQuantity,
            updatedAt: serverTimestamp(),
          });

          const movementRef = doc(
            collection(db, "inventoryMovementLogs")
          );

          transaction.set(movementRef, {
            itemId: movement.itemId,
            itemName: movement.itemName,
            quantityType: movement.quantityType,
            type: "SALE_DEDUCTION",
            transactionId: transactionRef.id,
            previousQuantity: movement.previousQuantity,
            usedQuantity: movement.usedQuantity,
            newQuantity: movement.newQuantity,
            createdAt: serverTimestamp(),
          });
        });
      });

      resetSale();
      setSuccess(
        `Sale completed successfully! Transaction ID: ${transactionRef.id}`
      );
    } catch (err) {
      console.error("POS sale error:", err);
      setError(err.message || "Unable to complete sale.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="pos-page">
      <div className="pos-header">
        <h1>Point of Sale</h1>
        <p>Select products and process customer orders.</p>
      </div>

      {error && <div className="pos-alert pos-error">{error}</div>}
      {success && (
        <div className="pos-alert pos-success">{success}</div>
      )}

      <div className="pos-layout">
        <section className="pos-products-section">
          <div className="pos-section-header">
            <h2>Products</h2>
            <input
              type="search"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loading ? (
            <p className="pos-empty">Loading products...</p>
          ) : filteredProducts.length === 0 ? (
            <p className="pos-empty">No products found.</p>
          ) : (
            <div className="pos-products-grid">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="pos-product-card"
                  onClick={() => addToCart(product)}
                  disabled={saving}
                >
                  <h3>{product.productName}</h3>
                  <p>{product.details || "Coffee shop product"}</p>
                  <strong>{money(product.price)}</strong>
                  <span className="pos-add-label">+ Add to Cart</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="pos-cart-section">
          <div className="pos-section-header">
            <h2>Current Order</h2>
            <span>{cart.reduce((sum, item) => sum + item.quantity, 0)} items</span>
          </div>

          {cart.length === 0 ? (
            <div className="pos-empty">
              <div className="pos-empty-icon">🛒</div>
              <p>Your cart is empty.</p>
            </div>
          ) : (
            <div className="pos-cart-list">
              {cart.map((item) => (
                <div className="pos-cart-item" key={item.id}>
                  <div className="pos-cart-item-info">
                    <strong>{item.productName}</strong>
                    <small>{money(item.price)} each</small>
                    <b>{money(item.price * item.quantity)}</b>
                  </div>

                  <div className="pos-cart-controls">
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.id, -1)}
                      disabled={saving}
                    >
                      −
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(item.id, 1)}
                      disabled={saving}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="pos-remove-btn"
                      onClick={() => removeFromCart(item.id)}
                      disabled={saving}
                      title="Remove item"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pos-checkout">
            <div className="pos-field">
              <label>Discount (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="pos-total-row">
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>

            <div className="pos-total-row">
              <span>Discount ({discountPercent}%)</span>
              <strong>−{money(discountAmount)}</strong>
            </div>

            <div className="pos-total-row pos-grand-total">
              <span>Amount Payable</span>
              <strong>{money(total)}</strong>
            </div>

            <div className="pos-field">
              <label>Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => {
                  setPaymentMethod(e.target.value);
                  setAmountReceived("");
                }}
                disabled={saving}
              >
                <option value="Cash">Cash</option>
                <option value="GCash">GCash</option>
                <option value="Loan">Loan</option>
              </select>
            </div>

            {(paymentMethod === "Loan" ||
              paymentMethod === "GCash") && (
              <div className="pos-field">
                <label>
                  Customer Name
                  {paymentMethod === "Loan" ? " *" : " (Optional)"}
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                  disabled={saving}
                />
              </div>
            )}

            {paymentMethod === "Cash" && (
              <>
                <div className="pos-field">
                  <label>Cash Received (₱)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    placeholder="Enter cash received"
                    disabled={saving}
                  />
                </div>
                <div className="pos-total-row">
                  <span>Change</span>
                  <strong>{money(change)}</strong>
                </div>
              </>
            )}

            {paymentMethod === "GCash" && (
              <p className="pos-payment-note">
                Verify the customer's GCash payment before confirming.
              </p>
            )}

            {paymentMethod === "Loan" && (
              <p className="pos-payment-note">
                This order will be recorded as unpaid and the full
                amount will be saved as a customer balance.
              </p>
            )}

            <button
              type="button"
              className="pos-sold-btn"
              onClick={handleSold}
              disabled={saving || cart.length === 0}
            >
              {saving ? "Processing Sale..." : `Sold — ${money(total)}`}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
