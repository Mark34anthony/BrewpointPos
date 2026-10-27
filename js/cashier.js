import { auth, db } from "./firebase-config.js";
import { peso, showMessage, setupNavigation, protectPage, setupLogout } from "./common.js";
import {
    collection,
    addDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    doc,
    runTransaction,
    Timestamp,
    deleteDoc,
    updateDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let currentUser = null;
let currentProfile = null;
let products = [];
let cart = [];
let currentCategory = "All";
let currentOrders = [];
let lastReceiptData = null;

function renderCategories() {
    const container = document.getElementById("categoryButtons");
    if (!container) return;

    const categorySet = new Set(["All"]);
    products.forEach((product) => {
        if (product && product.category && String(product.category).trim() !== "") {
            categorySet.add(String(product.category).trim());
        }
    });

    const categories = Array.from(categorySet);
    if (!categories.includes(currentCategory)) {
        currentCategory = "All";
    }

    container.innerHTML = "";
    categories.forEach((category) => {
        const button = document.createElement("button");
        button.textContent = category;
        button.className = "category-btn" + (category === currentCategory ? " active" : "");
        button.addEventListener("click", () => {
            currentCategory = category;
            renderCategories();
            renderProducts();
        });
        container.appendChild(button);
    });
}

function renderProducts() {
    const productGrid = document.getElementById("productGrid");
    const searchInput = document.getElementById("productSearch");
    if (!productGrid) return;

    const search = searchInput ? searchInput.value.trim().toLowerCase() : "";
    productGrid.innerHTML = "";

    const filteredProducts = products.filter((product) => {
        if (!product) return false;
        const prodCat = String(product.category || "").trim().toLowerCase();
        const selectedCat = currentCategory.trim().toLowerCase();
        const categoryMatch = selectedCat === "all" || prodCat === selectedCat;
        const searchMatch = !search || String(product.name || "").toLowerCase().includes(search);
        const statusStr = String(product.status || "active").toLowerCase();
        const isActive = statusStr !== "inactive" && statusStr !== "disabled";
        return categoryMatch && searchMatch && isActive;
    });

    if (filteredProducts.length === 0) {
        productGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666; font-size: 1.1rem;">
                ${products.length === 0 ? "No products found in Firestore database." : "No products match selected category or search filter."}
            </div>`;
        return;
    }

    filteredProducts.forEach((product) => {
        const card = document.createElement("div");
        card.className = "product-card";

        const image = product.image && String(product.image).trim() !== ""
            ? product.image
            : "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80";

        const stockNum = Number(product.stock ?? 0);
        const priceNum = Number(product.price ?? 0);
        const unavailable = stockNum <= 0;

        card.innerHTML = `
            <img src="${image}" alt="${product.name || "Product"}">
            <div class="product-info">
                <h3>${product.name || "Unnamed Item"}</h3>
                <div class="price">${peso(priceNum)}</div>
                <div class="stock">${unavailable ? "Out of Stock" : "Stock: " + stockNum}</div>
                <button ${unavailable ? "disabled" : ""} class="add-btn">${unavailable ? "Out of Stock" : "Add to Order"}</button>
            </div>
        `;

        const btn = card.querySelector("button");
        if (btn && !unavailable) {
            btn.addEventListener("click", () => addToCart(product));
        }

        productGrid.appendChild(card);
    });
}

function addToCart(product) {
    const existing = cart.find((item) => item.productId === product.id);
    const currentStock = Number(product.stock || 0);

    if (existing) {
        if (existing.quantity >= currentStock) {
            showMessage("cashierMessage", "Not enough stock for " + (product.name || "this item"));
            return;
        }
        existing.quantity += 1;
    } else {
        cart.push({
            productId: product.id,
            productName: product.name || "Unnamed Item",
            price: Number(product.price || 0),
            quantity: 1
        });
    }

    renderCart();
}

function renderCart() {
    const container = document.getElementById("cartItems");
    if (!container) return;
    container.innerHTML = "";

    cart.forEach((item) => {
        const matchedProduct = products.find((p) => p.id === item.productId);
        if (matchedProduct) {
            item.price = Number(matchedProduct.price || 0);
            item.productName = matchedProduct.name || item.productName;
        }
    });

    cart.forEach((item) => {
        const div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML = `
            <div>
                <h4>${item.productName}</h4>
                <div>${peso(item.price)} each</div>
            </div>
            <div class="qty-controls">
                <button class="minus">−</button>
                <strong>${item.quantity}</strong>
                <button class="plus">+</button>
                <button class="remove-btn">×</button>
            </div>
        `;

        div.querySelector(".minus").addEventListener("click", () => {
            item.quantity -= 1;
            if (item.quantity <= 0) cart = cart.filter((x) => x !== item);
            renderCart();
        });

        div.querySelector(".plus").addEventListener("click", () => {
            const product = products.find((p) => p.id === item.productId);
            if (product && item.quantity >= Number(product.stock || 0)) {
                showMessage("cashierMessage", "Maximum available stock reached.");
                return;
            }
            item.quantity += 1;
            renderCart();
        });

        div.querySelector(".remove-btn").addEventListener("click", () => {
            cart = cart.filter((x) => x !== item);
            renderCart();
        });

        container.appendChild(div);
    });

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const subtotalEl = document.getElementById("cartSubtotal");
    const totalEl = document.getElementById("cartTotal");
    if (subtotalEl) subtotalEl.textContent = peso(total);
    if (totalEl) totalEl.textContent = peso(total);
}

function clearCart() {
    cart = [];
    renderCart();
}

function openPayment() {
    if (cart.length === 0) {
        showMessage("cashierMessage", "Add at least one product.");
        return;
    }

    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    document.getElementById("paymentTotal").textContent = peso(total);
    document.getElementById("paymentModal").classList.remove("hidden");
    document.getElementById("cashReceived").value = "";
    document.getElementById("changeAmount").textContent = peso(0);
    const customerNameInput = document.getElementById("customerName");
    if (customerNameInput) customerNameInput.value = "";
    const orderTypeSelect = document.getElementById("orderType");
    if (orderTypeSelect) orderTypeSelect.value = "Dine In";

    const paymentError = document.getElementById("paymentError");
    if (paymentError) {
        paymentError.textContent = "";
        paymentError.classList.add("hidden");
    }
}

function closePayment() {
    document.getElementById("paymentModal").classList.add("hidden");
}

async function savePaidOrder() {
    const method = document.getElementById("paymentMethod").value;
    const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const cash = Number(document.getElementById("cashReceived").value || 0);
    const paymentError = document.getElementById("paymentError");

    if (method === "Cash" && cash < total) {
        if (paymentError) {
            paymentError.textContent = "Payment failed: cash received is not enough.";
            paymentError.className = "message";
            paymentError.classList.remove("hidden");
        }
        showMessage("cashierMessage", "Payment failed: cash received is not enough.");
        return;
    }

    if (paymentError) {
        paymentError.textContent = "";
        paymentError.classList.add("hidden");
    }

    const orderNumber = "BP-" + Math.floor(100000 + Math.random() * 900000);
    const cashierName = (currentProfile && currentProfile.name) || (currentUser && currentUser.email) || "Cashier";
    const customerName = (document.getElementById("customerName")?.value || "").trim() || "Walk-in";
    const orderType = document.getElementById("orderType")?.value || "Dine In";
    const currentCartSnapshot = [...cart];
    let createdOrderId = null;

    try {
        await runTransaction(db, async (transaction) => {
            const productRefs = currentCartSnapshot.map((item) => doc(db, "products", item.productId));
            const productSnaps = [];

            for (const ref of productRefs) {
                const snap = await transaction.get(ref);
                productSnaps.push(snap);
            }

            productSnaps.forEach((snap, index) => {
                if (!snap.exists()) throw new Error("Product no longer exists.");
                const currentStock = Number(snap.data().stock || 0);
                if (currentStock < currentCartSnapshot[index].quantity) {
                    throw new Error("Insufficient stock for " + snap.data().name);
                }
            });

            productSnaps.forEach((snap, index) => {
                const ref = productRefs[index];
                transaction.update(ref, {
                    stock: Number(snap.data().stock) - currentCartSnapshot[index].quantity,
                    updatedAt: Timestamp.now()
                });
            });

            const orderRef = doc(collection(db, "orders"));
            createdOrderId = orderRef.id;
                        transaction.set(orderRef, {
                orderNumber: orderNumber,
                cashierId: currentUser ? currentUser.uid : "unknown",
                cashierName: cashierName,
                adminId: (currentProfile && currentProfile.adminId) || null,
                items: currentCartSnapshot,
                subtotal: total,
                total: total,
                cashReceived: method === "Cash" ? cash : total,
                changeAmount: method === "Cash" ? cash - total : 0,
                paymentMethod: method,
                paymentStatus: "Paid",
                orderStatus: "Pending",
                customerName: customerName,
                orderType: orderType,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            });
        });

        await addDoc(collection(db, "sales"), {
            orderNumber: orderNumber,
            total: total,
            paymentMethod: method,
            cashierId: currentUser ? currentUser.uid : "unknown",
            cashierName: cashierName,
            adminId: (currentProfile && currentProfile.adminId) || null,
            createdAt: Timestamp.now()
        });

        closePayment();
        clearCart();
        showMessage("cashierMessage", "Payment successful. Order " + orderNumber + " sent to Barista.", true);
        showReceiptModal({
            orderId: createdOrderId,
            orderNumber,
            total,
            method,
            items: currentCartSnapshot,
            cash,
            cashierName,
            customerName,
            orderType
        });
    } catch (error) {
        console.error("Order processing error:", error);
        showMessage("cashierMessage", error.message || "Payment failed.");
    }
}

// Epson TM-U220 optimized – prints via hidden iframe (no Edge tab)
function printReceipt(orderNumber, total, method, items, cash, cashierName = "Cashier", dateStr = null) {
    const change = method === "Cash" ? Math.max(0, Number(cash || 0) - Number(total || 0)) : 0;
    const orderDate = dateStr || new Date().toLocaleString("en-PH", {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit"
    });

    let itemsRowsHtml = "";
    (items || []).forEach((item) => {
        const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
        const name = (item.productName || "Item").substring(0, 22);
        itemsRowsHtml += `
            <tr>
                <td class="item-name">
                    <div class="name">${name}</div>
                    <div class="unit">${peso(item.price)} × ${item.quantity}</div>
                </td>
                <td class="item-amt">${peso(lineTotal)}</td>
            </tr>`;
    });

    const receiptContent = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>BrewPoint Receipt - ${orderNumber}</title>
<style>
@page { size: 76mm auto; margin: 2mm 3mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: "Courier New", Courier, "Lucida Console", monospace;
    font-size: 12px; line-height: 1.35; color: #111; background: #fff;
    width: 72mm; max-width: 280px; margin: 0 auto; padding: 8px 6px 16px;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.header { text-align: center; margin-bottom: 6px; }
.logo { font-size: 22px; line-height: 1; margin-bottom: 2px; }
.brand { font-size: 16px; font-weight: 900; letter-spacing: 1.5px; text-transform: uppercase; color: #1A120B; }
.tagline { font-size: 9px; letter-spacing: 1.2px; text-transform: uppercase; color: #5C3A22; margin-top: 1px; }
.badge { display: inline-block; margin-top: 5px; padding: 2px 8px; font-size: 9px; font-weight: 700;
    letter-spacing: 0.8px; text-transform: uppercase; border: 1.5px solid #1A120B; border-radius: 3px; }
.divider { border: none; border-top: 1px dashed #444; margin: 8px 0; }
.divider-solid { border: none; border-top: 1.5px solid #222; margin: 8px 0; }
.meta { width: 100%; font-size: 11px; }
.meta td { padding: 1px 0; vertical-align: top; }
.meta .label { color: #555; width: 38%; }
.meta .value { font-weight: 700; text-align: right; }
.items { width: 100%; border-collapse: collapse; margin: 2px 0; }
.items thead th { font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
    color: #333; padding: 3px 0 4px; border-bottom: 1px solid #333; text-align: left; }
.items thead th.amt { text-align: right; }
.items tbody td { padding: 5px 0 4px; vertical-align: top; border-bottom: 1px dotted #bbb; }
.item-name .name { font-weight: 700; font-size: 12px; color: #111; }
.item-name .unit { font-size: 10px; color: #555; margin-top: 1px; }
.item-amt { text-align: right; font-weight: 700; font-size: 12px; white-space: nowrap; padding-left: 6px; vertical-align: top; }
.summary { width: 100%; border-collapse: collapse; margin-top: 2px; }
.summary td { padding: 2px 0; font-size: 11px; }
.summary .label { color: #444; }
.summary .value { text-align: right; font-weight: 600; }
.summary .total-row td { font-size: 15px; font-weight: 900; padding-top: 6px; padding-bottom: 4px; border-top: 1.5px solid #222; }
.summary .total-row .value { color: #1A120B; }
.footer { text-align: center; margin-top: 10px; font-size: 10px; color: #444; }
.footer .thanks { font-weight: 700; font-size: 11px; color: #1A120B; margin-bottom: 2px; }
.footer .barcode { font-family: monospace; font-size: 14px; letter-spacing: 2px; margin: 8px 0 4px; color: #222; }
.footer .cut { margin-top: 10px; font-size: 9px; color: #888; letter-spacing: 1px; }
@media print { body { width: 72mm; max-width: none; padding: 0; margin: 0; } }
</style></head>
<body>
<div class="receipt">
    <div class="header">
        <div class="logo">☕</div>
        <div class="brand">BrewPoint</div>
        <div class="tagline">Coffee Shop</div>
        <div class="badge">Official Receipt</div>
    </div>
    <hr class="divider">
    <table class="meta">
        <tr><td class="label">Order No</td><td class="value">${orderNumber}</td></tr>
        <tr><td class="label">Date</td><td class="value">${orderDate}</td></tr>
        <tr><td class="label">Cashier</td><td class="value">${cashierName}</td></tr>
    </table>
    <hr class="divider-solid">
    <table class="items">
        <thead><tr><th>Item</th><th class="amt">Amount</th></tr></thead>
        <tbody>${itemsRowsHtml}</tbody>
    </table>
    <hr class="divider">
    <table class="summary">
        <tr class="total-row"><td class="label">TOTAL</td><td class="value">${peso(total)}</td></tr>
        <tr><td class="label">Payment</td><td class="value">${method}</td></tr>
        ${method === "Cash" ? `
        <tr><td class="label">Cash Tendered</td><td class="value">${peso(cash)}</td></tr>
        <tr><td class="label">Change</td><td class="value">${peso(change)}</td></tr>` : ""}
    </table>
    <hr class="divider">
    <div class="footer">
        <div class="thanks">Thank you for visiting BrewPoint!</div>
        <div>Please come again & have a great day.</div>
        <div class="barcode">||| | ||||| ||| ||||</div>
        <div class="cut">—  Epson TM-U220  —</div>
    </div>
</div>
</body></html>`;

    let frame = document.getElementById("silentPrintFrame");
    if (!frame) {
        frame = document.createElement("iframe");
        frame.id = "silentPrintFrame";
        frame.style.cssText = "position:fixed;width:0;height:0;border:0;left:-9999px;top:0;";
        document.body.appendChild(frame);
    }

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(receiptContent);
    doc.close();

    setTimeout(() => {
        try {
            frame.contentWindow.focus();
            frame.contentWindow.print();
        } catch (err) {
            console.error("Print error:", err);
            showMessage("cashierMessage", "Could not open print dialog. Please allow printing.");
        }
    }, 250);
}

function renderOrders() {
    const container = document.getElementById("cashierOrderList");
    const receipts = document.getElementById("receiptList");
    if (!container || !receipts) return;

    container.innerHTML = "";
    receipts.innerHTML = "";

    // Only last 24 hours
    const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
    const recentOrders = currentOrders.filter((order) => {
        if (!order.createdAt || typeof order.createdAt.toDate !== "function") return false;
        return order.createdAt.toDate().getTime() >= oneDayAgo;
    });

    if (recentOrders.length === 0) {
        const emptyMsg = `<div style="padding: 30px; text-align: center; color: #777;">No recent transactions found.</div>`;
        container.innerHTML = emptyMsg;
        receipts.innerHTML = emptyMsg;
        return;
    }

    recentOrders.forEach((order) => {
        const dateStr = order.createdAt && typeof order.createdAt.toDate === "function"
            ? order.createdAt.toDate().toLocaleString()
            : "";

        const card = document.createElement("div");
        card.className = "order-card";

        let itemHtml = "";
        (order.items || []).forEach((item) => {
            const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
            itemHtml += `<div class="order-item-line"><span>${item.productName} x${item.quantity}</span><span>${peso(lineTotal)}</span></div>`;
        });

        card.innerHTML = `
            <h3>${order.orderNumber}</h3>
            <div class="order-meta">${dateStr}</div>
            <div class="order-items">${itemHtml}</div>
            <p style="margin-top:8px;"><strong>Total: ${peso(order.total)}</strong></p>
            <span class="status ${String(order.orderStatus).toLowerCase()}">${order.orderStatus}</span>
        `;
        container.appendChild(card);

        const receiptCard = document.createElement("div");
        receiptCard.className = "order-card receipt-card";
        receiptCard.style.cssText = "background: #fff; border: 1px dashed #ccc; border-radius: 8px; padding: 15px; margin-bottom: 15px; font-family: monospace;";

        receiptCard.innerHTML = `
            <div style="text-align: center; font-weight: bold; font-size: 1.1rem; text-transform: uppercase;">☕ BrewPoint Coffee Shop</div>
            <div style="text-align: center; font-size: 0.85rem; color: #555; margin-bottom: 10px;">Receipt #${order.orderNumber}</div>
            <div style="font-size: 0.8rem; color: #666; border-bottom: 1px dashed #aaa; padding-bottom: 5px; margin-bottom: 8px;">
                <div>Date: ${dateStr}</div>
                <div>Cashier: ${order.cashierName || "Cashier"}</div>
                <div>Payment: ${order.paymentMethod || "Cash"}</div>
            </div>
            <div style="margin-bottom: 10px;">${itemHtml}</div>
            <div style="border-top: 1px dashed #aaa; padding-top: 5px; text-align: right; font-size: 1rem; font-weight: bold;">
                Total: ${peso(order.total)}
            </div>
            <button class="primary-btn print-again-btn" style="width: 100%; margin-top: 10px; font-size: 0.85rem;">🖨️ Print Receipt</button>
        `;

        receiptCard.querySelector(".print-again-btn")?.addEventListener("click", () => {
            showReceiptModal({
                orderId: order.id,
                orderNumber: order.orderNumber,
                total: order.total,
                method: order.paymentMethod || "Cash",
                items: order.items || [],
                cash: order.cashReceived || order.total,
                cashierName: order.cashierName || "Cashier",
                customerName: order.customerName || "Walk-in",
                orderType: order.orderType || "Dine In"
            }, { allowUpdate: false });
        });

        receipts.appendChild(receiptCard);
    });
}

function showReceiptModal(data, options = {}) {
    const allowUpdate = options.allowUpdate !== false;
    lastReceiptData = data;

    const printBtn = document.getElementById("printReceiptBtn");
    if (printBtn) {
        printBtn.dataset.done = "0";
        printBtn.disabled = false;
        printBtn.innerHTML = "🖨️ Print Receipt";
        printBtn.style.opacity = "1";
    }

    const updateBtn = document.getElementById("updateOrderBtn");
    if (updateBtn) {
        updateBtn.disabled = false;
        updateBtn.textContent = "Update Order";
        updateBtn.style.display = allowUpdate ? "" : "none";
    }

    const modal = document.getElementById("receiptModal");
    const orderEl = document.getElementById("receiptOrderNumber");
    const preview = document.getElementById("receiptPreview");
    if (!modal || !preview) return;

    if (orderEl) orderEl.textContent = data.orderNumber || "—";

    const change = data.method === "Cash"
        ? Math.max(0, Number(data.cash || 0) - Number(data.total || 0))
        : 0;

    let itemsRows = "";
    (data.items || []).forEach((item) => {
        const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
        const name = (item.productName || "Item").substring(0, 22);
        itemsRows += `
            <tr>
                <td>
                    <div class="name">${name}</div>
                    <div class="unit">${peso(item.price)} × ${item.quantity}</div>
                </td>
                <td class="amt">${peso(lineTotal)}</td>
            </tr>`;
    });

    preview.innerHTML = `
        <div class="rp-logo">☕</div>
        <div class="rp-brand">BrewPoint</div>
        <div class="rp-tagline">Coffee Shop</div>
        <div class="rp-badge">Official Receipt</div>
        <hr class="rp-dash">
        <table class="rp-meta">
            <tr><td class="label">Order No</td><td class="value">${data.orderNumber || "—"}</td></tr>
            <tr><td class="label">Customer</td><td class="value">${data.customerName || "Walk-in"}</td></tr>
            <tr><td class="label">Type</td><td class="value">${data.orderType || "Dine In"}</td></tr>
            <tr><td class="label">Cashier</td><td class="value">${data.cashierName || "Cashier"}</td></tr>
            <tr><td class="label">Payment</td><td class="value">${data.method || "Cash"}</td></tr>
        </table>
        <hr class="rp-solid">
        <table class="rp-items">
            <thead><tr><th>Item</th><th class="amt">Amount</th></tr></thead>
            <tbody>${itemsRows}</tbody>
        </table>
        <hr class="rp-dash">
        <table class="rp-summary">
            <tr class="total-row"><td class="label">TOTAL</td><td class="value">${peso(data.total)}</td></tr>
            ${data.method === "Cash" ? `
            <tr><td class="label">Cash Tendered</td><td class="value">${peso(data.cash)}</td></tr>
            <tr><td class="label">Change</td><td class="value">${peso(change)}</td></tr>` : ""}
        </table>
        <div class="rp-thanks">Thank you for visiting BrewPoint!</div>
        <div class="rp-subthanks">Please come again & have a great day.</div>
    `;

    modal.classList.remove("hidden");
}

function closeReceiptModal() {
    const modal = document.getElementById("receiptModal");
    if (modal) modal.classList.add("hidden");
    lastReceiptData = null;
}

function setupEventListeners() {
    document.getElementById("productSearch")?.addEventListener("input", renderProducts);
    document.getElementById("clearCartBtn")?.addEventListener("click", clearCart);
    document.getElementById("checkoutBtn")?.addEventListener("click", openPayment);
    document.getElementById("closePayment")?.addEventListener("click", closePayment);
    document.getElementById("confirmPaymentBtn")?.addEventListener("click", savePaidOrder);

    document.getElementById("paymentMethod")?.addEventListener("change", function () {
        const cashMode = this.value === "Cash";
        document.getElementById("cashPaymentFields")?.classList.toggle("hidden", !cashMode);
        document.getElementById("cardPaymentFields")?.classList.toggle("hidden", cashMode);
    });

    document.getElementById("cashReceived")?.addEventListener("input", function () {
        const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const cash = Number(this.value || 0);
        document.getElementById("changeAmount").textContent = peso(Math.max(0, cash - total));

        const paymentError = document.getElementById("paymentError");
        if (paymentError) {
            paymentError.textContent = "";
            paymentError.classList.add("hidden");
        }
    });

    document.getElementById("printReceiptBtn")?.addEventListener("click", () => {
        const btn = document.getElementById("printReceiptBtn");
        if (!btn) return;

        if (btn.dataset.done === "1") {
            closeReceiptModal();
            return;
        }

        btn.dataset.done = "1";
        btn.disabled = false;
        btn.innerHTML = "✓ Print Done";
        btn.style.opacity = "0.85";
    });

    document.getElementById("updateOrderBtn")?.addEventListener("click", async () => {
        if (!lastReceiptData) {
            closeReceiptModal();
            return;
        }

        const data = lastReceiptData;
        const btn = document.getElementById("updateOrderBtn");
        if (btn) {
            btn.disabled = true;
            btn.textContent = "Loading…";
        }

        try {
            for (const item of (data.items || [])) {
                if (!item.productId) continue;
                const productRef = doc(db, "products", item.productId);
                const snap = await getDoc(productRef);
                if (snap.exists()) {
                    const currentStock = Number(snap.data().stock || 0);
                    await updateDoc(productRef, {
                        stock: currentStock + Number(item.quantity || 0),
                        updatedAt: Timestamp.now()
                    });
                }
            }

            if (data.orderId) {
                await deleteDoc(doc(db, "orders", data.orderId));
            }

            cart = (data.items || []).map((item) => ({
                productId: item.productId,
                productName: item.productName,
                price: Number(item.price || 0),
                quantity: Number(item.quantity || 1)
            }));
            renderCart();

            closeReceiptModal();

            const newOrderNav = document.querySelector('.nav-btn[data-section="newOrder"]');
            if (newOrderNav) newOrderNav.click();

            showMessage("cashierMessage", "Order loaded for editing. Update items then checkout again.", true);
        } catch (err) {
            console.error("Update order error:", err);
            showMessage("cashierMessage", "Failed to load order for editing: " + (err.message || err));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Update Order";
            }
        }
    });

    document.getElementById("closeReceiptModal")?.addEventListener("click", closeReceiptModal);
}

function startRealtimeListeners() {
    onSnapshot(collection(db, "products"), (snapshot) => {
        products = [];
        snapshot.forEach((docSnap) => {
            products.push({ id: docSnap.id, ...docSnap.data() });
        });

        products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        renderCategories();
        renderProducts();
        renderCart();
    }, (error) => {
        console.error("Firestore Product Listener Error:", error);
        showMessage("cashierMessage", "Error connecting to products database: " + error.message);
    });

    onSnapshot(
        query(collection(db, "orders"), orderBy("createdAt", "desc")),
        (snapshot) => {
            const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
            currentOrders = [];
            snapshot.forEach((docSnap) => {
                const data = { id: docSnap.id, ...docSnap.data() };
                if (data.createdAt && typeof data.createdAt.toDate === "function") {
                    if (data.createdAt.toDate().getTime() >= oneDayAgo) {
                        currentOrders.push(data);
                    }
                }
            });
            renderOrders();
        },
        (error) => {
            console.warn("Firestore Orders Listener Error:", error);
            showMessage("cashierMessage", "Error loading orders: " + (error.message || error));
        }
    );
}

async function init() {
    if (typeof setupNavigation === "function") setupNavigation();
    if (typeof setupLogout === "function") setupLogout();
    setupEventListeners();

    startRealtimeListeners();

    if (typeof protectPage === "function") {
        try {
                       const access = await protectPage("cashier");
            if (access) {
                currentUser = access.user;
                currentProfile = access.profile || {};

                // Always refresh adminId from Firestore so sales get tagged correctly
                try {
                    const uid = currentUser && currentUser.uid;
                    if (uid) {
                        const snap = await getDoc(doc(db, "users", uid));
                        if (snap.exists()) {
                            const fresh = snap.data();
                            currentProfile = { ...currentProfile, ...fresh, uid };
                        }
                    }
                } catch (e) {
                    console.warn("Could not refresh cashier profile:", e);
                }

                const userInfo = document.getElementById("userInfo");
                if (userInfo) {
                    userInfo.textContent = `${(currentProfile && currentProfile.name) || "Cashier"} (${currentUser.email})`;
                }
            }
        } catch (err) {
            console.warn("Authentication protection skipped/failed:", err);
        }
    }
}

init();