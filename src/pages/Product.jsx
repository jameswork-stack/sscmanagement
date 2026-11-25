import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  collection,
  addDoc,
  onSnapshot,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";

import { db } from "../firebase/firebase";
import "./Product.css";


export default function Product() {
  const [products, setProducts] = useState([]);
  const [productSearch, setProductSearch] = useState("");
  const [inventoryItems, setInventoryItems] = useState([]);

  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [ingredientSearch, setIngredientSearch] = useState("");
  const [showIngredients, setShowIngredients] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState([]);

    const [editingProductId, setEditingProductId] = useState(null);
    const [activeMenu, setActiveMenu] = useState(null);
    const [menuPosition, setMenuPosition] = useState(null);


  const initialForm = {
    productName: "",
    details: "",
    price: "",
  };

  const [form, setForm] = useState(initialForm);

  // LOAD INVENTORY ITEMS
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "inventoryItems"),
      (snapshot) => {
        const itemList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        itemList.sort((a, b) =>
          (a.itemName || "").localeCompare(b.itemName || "")
        );

        setInventoryItems(itemList);
      },
      (error) => {
        console.error("Inventory loading error:", error);
        setError("Unable to load inventory ingredients.");
      }
    );

    return () => unsubscribe();
  }, []);

  // LOAD PRODUCTS
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "products"),
      (snapshot) => {
        const productList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        productList.sort((a, b) => {
          const dateA = a.createdAt?.toMillis?.() || 0;
          const dateB = b.createdAt?.toMillis?.() || 0;
          return dateB - dateA;
        });

        setProducts(productList);
        setLoading(false);
      },
      (error) => {
        console.error("Products loading error:", error);
        setError("Unable to load products. Please check your access.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // HANDLE FORM INPUTS
  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // FILTER INGREDIENTS
  const filteredIngredients = inventoryItems.filter((item) => {
    const matchesSearch = (item.itemName || "")
      .toLowerCase()
      .includes(ingredientSearch.trim().toLowerCase());

    const alreadySelected = selectedIngredients.some(
      (selected) => selected.id === item.id
    );

    return matchesSearch && !alreadySelected;
  });

  // SELECT INGREDIENT
  
        const handleSelectIngredient = (item) => {
        setSelectedIngredients((prev) => [
            ...prev,
            {
            id: item.id,
            itemName: item.itemName,
            quantityType: item.quantityType || "pcs",
            quantity: "",
            excludeWhenDineIn: false,
            },
        ]);

        setIngredientSearch("");
        setShowIngredients(false);
        };


const handleIngredientQuantityChange = (ingredientId, value) => {
  setSelectedIngredients((prev) =>
    prev.map((ingredient) =>
      ingredient.id === ingredientId
        ? { ...ingredient, quantity: value }
        : ingredient
    )
  );
};



  // REMOVE SELECTED INGREDIENT
  const handleRemoveIngredient = (ingredientId) => {
    setSelectedIngredients((prev) =>
      prev.filter((item) => item.id !== ingredientId)
    );
  };

  // RESET FORM
  const resetForm = () => {
    setForm(initialForm);
    setSelectedIngredients([]);
    setIngredientSearch("");
    setShowIngredients(false);
    setError("");
  };

  // OPEN ADD PRODUCT FORM
  
    const handleOpenForm = () => {
    resetForm();
    setEditingProductId(null);
    setActiveMenu(null);
    setMenuPosition(null);
    setShowForm(true);
    };



// OPEN / CLOSE ACTION MENU
const toggleActionMenu = (e, productId) => {
  e.stopPropagation();

  if (activeMenu === productId) {
    setActiveMenu(null);
    setMenuPosition(null);
    return;
  }

  const rect = e.currentTarget.getBoundingClientRect();

  const menuWidth = 150;
  const menuHeight = 95;

  const left = Math.max(
    8,
    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)
  );

  const top =
    rect.bottom + menuHeight + 8 > window.innerHeight
      ? rect.top - menuHeight - 5
      : rect.bottom + 5;

  setMenuPosition({ top, left });
  setActiveMenu(productId);
};

// EDIT PRODUCT
const handleEditProduct = (product) => {
  resetForm();

  setEditingProductId(product.id);

  setForm({
    productName: product.productName || "",
    details: product.details || "",
    price: String(product.price ?? ""),
  });

  setSelectedIngredients(
    (product.ingredients || []).map((ingredient) => ({
      id: ingredient.id,
      itemName: ingredient.itemName,
      quantityType: ingredient.quantityType || "pcs",
      quantity: String(ingredient.quantity ?? ""),
      excludeWhenDineIn: ingredient.excludeWhenDineIn === true,
    }))
  );

  setActiveMenu(null);
  setMenuPosition(null);
  setShowForm(true);
};

// REMOVE PRODUCT
const handleRemoveProduct = async (product) => {
  setActiveMenu(null);
  setMenuPosition(null);

  const confirmed = window.confirm(
    `Are you sure you want to remove "${product.productName}"?`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "products", product.id));
  } catch (error) {
    console.error("Remove product error:", error);
    setError("Failed to remove product. Please try again.");
  }
};


  
        // SAVE PRODUCT
        
    const handleSave = async (e) => {
    e.preventDefault();

    if (!form.productName.trim() || form.price === "") {
        setError("Please complete all required fields.");
        return;
    }

    const price = Number(form.price);

    if (!Number.isFinite(price) || price < 0) {
        setError("Please enter a valid product price.");
        return;
    }

    if (selectedIngredients.length === 0) {
        setError("Please select at least one ingredient.");
        return;
    }

    const invalidIngredient = selectedIngredients.find(
        (ingredient) =>
        ingredient.quantity === "" ||
        !Number.isFinite(Number(ingredient.quantity)) ||
        Number(ingredient.quantity) <= 0
    );

    if (invalidIngredient) {
        setError(
        `Please enter a valid quantity for ${invalidIngredient.itemName}.`
        );
        return;
    }

    setSaving(true);
    setError("");

    const productData = {
        productName: form.productName.trim(),
        details: form.details.trim(),
        price,
        ingredients: selectedIngredients.map((ingredient) => ({
        id: ingredient.id,
        itemName: ingredient.itemName,
        quantityType: ingredient.quantityType,
        quantity: Number(ingredient.quantity),
        excludeWhenDineIn: ingredient.excludeWhenDineIn === true,
        })),
        updatedAt: serverTimestamp(),
    };

    try {
        if (editingProductId) {
        // UPDATE EXISTING PRODUCT
        await updateDoc(
            doc(db, "products", editingProductId),
            productData
        );
        } else {
        // ADD NEW PRODUCT
        await addDoc(collection(db, "products"), {
            ...productData,
            createdAt: serverTimestamp(),
        });
        }

        resetForm();
        setEditingProductId(null);
        setShowForm(false);
    } catch (error) {
        console.error("Save product error:", error);
        setError("Failed to save product. Please try again.");
    } finally {
        setSaving(false);
    }
    };


  // FILTER PRODUCTS BY SEARCH
  const filteredProducts = products.filter((product) => {
    const search = productSearch.trim().toLowerCase();

    return (
      (product.productName || "")
        .toLowerCase()
        .includes(search) ||
      (product.details || "")
        .toLowerCase()
        .includes(search)
    );
  });



  // FORMAT PRICE
  const formatPrice = (value) =>
    `₱${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="product-page">

      {/* PAGE HEADER */}
      <div className="product-header">
        <div>
          <h1>Products</h1>
          <p>Manage your coffee shop products and ingredients.</p>
        </div>

        <button
          type="button"
          className="add-product-btn"
          onClick={handleOpenForm}
        >
          + Add Product
        </button>
      </div>

      {/* ERROR MESSAGE */}
      {error && !showForm && (
        <div className="product-error">
          {error}
        </div>
      )}

      {/* PRODUCT SUMMARY */}
      <div className="product-summary">
        <div className="product-summary-card">
          <span>Total Products</span>
          <h2>{products.length}</h2>
          <small>Registered products</small>
        </div>
      </div>

      {/* PRODUCT LIST */}
      <div className="product-list-container">
        
        <div className="product-list-header">
        <div>
            <h2>Product List</h2>
            <p>All your registered coffee shop products.</p>
        </div>

        <div className="product-search-box">
            <span className="product-search-icon">⌕</span>

            <input
            type="text"
            placeholder="Search product..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            />

            {productSearch && (
            <button
                type="button"
                className="product-search-clear"
                onClick={() => setProductSearch("")}
                aria-label="Clear search"
            >
                ×
            </button>
            )}
        </div>
        </div>
        
        {loading ? (
        <div className="product-empty">
            Loading products...
        </div>
        ) : products.length === 0 ? (
        <div className="product-empty">
            <div className="product-empty-icon">☕</div>
            <h3>No products yet</h3>
            <p>Start by adding your first product.</p>
        </div>
        ) : filteredProducts.length === 0 ? (
        <div className="product-empty">
            <h3>No matching products</h3>
            <p>Try searching with a different product name.</p>
        </div>
        ) : (
            
          <div className="product-table-wrapper">
            <table className="product-table">
              <thead>
                <tr>
                  <th>Product Name</th>
                  <th>Details</th>
                  <th>Ingredients</th>
                  <th>Price</th>
                  <th className="product-action-column">Action</th>
                </tr>
              </thead>

              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <strong>{product.productName}</strong>
                    </td>

                    <td>
                      {product.details || "No details"}
                    </td>

                    <td>
                      <div className="product-ingredient-list">
                        {product.ingredients?.length > 0
                          ? product.ingredients.map((ingredient) => (
                              <span key={ingredient.id}>
                                {ingredient.itemName}
                                {ingredient.excludeWhenDineIn === true && " (Take Out only)"}
                                {ingredient.quantity != null &&
                                    ingredient.quantity !== "" &&
                                    ` - ${ingredient.quantity} ${ingredient.quantityType}`}
                                </span>
                            ))
                          : "No ingredients"}
                      </div>
                    </td>

                    
                    <td className="product-price">
                    {formatPrice(product.price)}
                    </td>

                    <td className="product-action-cell">
                    <button
                        type="button"
                        className="product-action-btn"
                        onClick={(e) => toggleActionMenu(e, product.id)}
                        aria-label={`Actions for ${product.productName}`}
                        aria-expanded={activeMenu === product.id}
                        aria-haspopup="menu"
                    >
                        ⋮
                    </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PRODUCT ACTION DROPDOWN */}
{activeMenu &&
  menuPosition &&
  createPortal(
    <>
      <div
        className="product-menu-backdrop"
        onClick={() => {
          setActiveMenu(null);
          setMenuPosition(null);
        }}
      />

      <div
        className="product-action-dropdown"
        style={{
          top: menuPosition.top,
          left: menuPosition.left,
        }}
        role="menu"
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            const product = products.find(
              (item) => item.id === activeMenu
            );

            if (product) {
              handleEditProduct(product);
            }
          }}
        >
          Edit
        </button>

        <button
          type="button"
          role="menuitem"
          className="product-remove-option"
          onClick={() => {
            const product = products.find(
              (item) => item.id === activeMenu
            );

            if (product) {
              handleRemoveProduct(product);
            }
          }}
        >
          Remove
        </button>
      </div>
    </>,
    document.body
  )}



      {/* ADD PRODUCT MODAL */}
      {showForm && (
        <div
          className="product-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) {
              setShowForm(false);
              resetForm();
            }
          }}
        >

          <div className="product-modal">

            {/* MODAL HEADER */}
            <div className="product-modal-header">
              <div>
                <h2>{editingProductId ? "Edit Product" : "Add New Product"}</h2>
                <p>Enter product information and select its ingredients.</p>
              </div>

              <button
                type="button"
                className="product-modal-close"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                disabled={saving}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>

              {error && (
                <div className="product-error">
                  {error}
                </div>
              )}

              {/* PRODUCT NAME */}
              <div className="product-form-group">
                <label>Product Name *</label>

                <input
                  type="text"
                  name="productName"
                  placeholder="e.g. Iced Spanish Latte"
                  value={form.productName}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* PRODUCT DETAILS */}
              <div className="product-form-group">
                <label>Product Details</label>

                <textarea
                  name="details"
                  placeholder="Enter product description..."
                  value={form.details}
                  onChange={handleChange}
                  rows="3"
                />
              </div>

              {/* INGREDIENT SELECTOR */}
              <div className="product-form-group">
                <label>Ingredients</label>

                <div className="ingredient-selector">

                  <input
                    type="text"
                    placeholder="Search inventory ingredients..."
                    value={ingredientSearch}
                    onFocus={() => setShowIngredients(true)}
                    onChange={(e) => {
                      setIngredientSearch(e.target.value);
                      setShowIngredients(true);
                    }}
                  />

                  {showIngredients && (
                    <div className="ingredient-dropdown">

                      {filteredIngredients.length > 0 ? (
                        filteredIngredients.map((item) => (
                          <button
                            type="button"
                            key={item.id}
                            className="ingredient-option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectIngredient(item)}
                          >
                            <span>{item.itemName}</span>
                            <small>
                              {item.quantityType || "pcs"}
                            </small>
                          </button>
                        ))
                      ) : (
                        <div className="ingredient-no-result">
                          {inventoryItems.length === 0
                            ? "No inventory items available."
                            : "No matching ingredients found."}
                        </div>
                      )}

                    </div>
                  )}
                </div>

                
                {/* SELECTED INGREDIENTS */}
                {selectedIngredients.length > 0 && (
                <div className="selected-ingredients">
                    <label>Selected Ingredients</label>

                    <div className="selected-ingredient-list">
                    {selectedIngredients.map((ingredient) => (
                        <div
                        className="selected-ingredient"
                        key={ingredient.id}
                        >
                        <div className="ingredient-info">
                            <span>{ingredient.itemName}</span>
                            <small>
                            Enter required quantity per product
                            </small>
                            <label className="ingredient-dine-in-option">
                              <input type="checkbox"
                                checked={ingredient.excludeWhenDineIn === true}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setSelectedIngredients((prev) => prev.map((entry) =>
                                    entry.id === ingredient.id
                                      ? { ...entry, excludeWhenDineIn: checked }
                                      : entry
                                  ));
                                }}
                                disabled={saving}
                              />
                              Exclude when Dine In
                            </label>
                        </div>

                        <div className="ingredient-quantity-control">
                            <input
                            type="number"
                            min="0.001"
                            step="any"
                            placeholder="0"
                            value={ingredient.quantity}
                            onChange={(e) =>
                                handleIngredientQuantityChange(
                                ingredient.id,
                                e.target.value
                                )
                            }
                            required
                            />

                            <span className="ingredient-unit">
                            {ingredient.quantityType}
                            </span>
                        </div>

                        <button
                            type="button"
                            className="remove-ingredient-btn"
                            onClick={() =>
                            handleRemoveIngredient(ingredient.id)
                            }
                            aria-label={`Remove ${ingredient.itemName}`}
                        >
                            ×
                        </button>
                        </div>
                    ))}
                    </div>
                </div>
                )}


                <small className="product-helper-text">
                  Search and select one or more ingredients from your inventory.
                </small>
              </div>

              {/* PRODUCT PRICE */}
              <div className="product-form-group">
                <label>Price (₱) *</label>

                <input
                  type="number"
                  name="price"
                  placeholder="0.00"
                  value={form.price}
                  onChange={handleChange}
                  min="0"
                  step="0.01"
                  required
                />
              </div>

              {/* FORM ACTIONS */}
              <div className="product-form-actions">

                <button
                  type="button"
                  className="product-cancel-btn"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="product-save-btn"
                  disabled={saving}
                >
                  {saving
                    ? "Saving..."
                    : editingProductId
                    ? "Update Product"
                    : "Save Product"}
                </button>

              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}