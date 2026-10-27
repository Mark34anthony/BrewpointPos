import { auth, db } from "./firebase-config.js";
import {
    onAuthStateChanged,
    signOut,
    createUserWithEmailAndPassword,
    getAuth
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    orderBy,
    onSnapshot,
    Timestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { peso, showMessage, setupNavigation, setupLogout } from "./common.js";

const secondaryApp = initializeApp({
    apiKey: "AIzaSyDsVwebIk58R1awvhha9SkZK2KBFyKxnRk",
    authDomain: "brewpointpos.firebaseapp.com",
    projectId: "brewpointpos",
    storageBucket: "brewpointpos.firebasestorage.app",
    messagingSenderId: "813768738683",
    appId: "1:813768738683:web:51011f9d19ab9ec9eddfde"
}, "Secondary");
const secondaryAuth = getAuth(secondaryApp);

let products = [];
let orders = [];
let salesPeriod = "all";
let currentAdminUid = null;
let currentAdminCreatedAtMs = 0;

// CUSTOM MODALS

function showConfirmModal({ title = "Confirm Action", message = "Are you sure?", okText = "Confirm", danger = false } = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById("confirmModal");
        const titleEl = document.getElementById("confirmTitle");
        const msgEl = document.getElementById("confirmMessage");
        const okBtn = document.getElementById("confirmOkBtn");
        const cancelBtn = document.getElementById("confirmCancelBtn");

        if (!modal || !okBtn || !cancelBtn) {
            resolve(window.confirm(message));
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        okBtn.textContent = okText;
        okBtn.className = danger ? "primary-btn danger-btn" : "primary-btn";
        modal.classList.remove("hidden");

        const cleanup = (result) => {
            modal.classList.add("hidden");
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            modal.removeEventListener("click", onBackdrop);
            resolve(result);
        };

        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = (e) => { if (e.target === modal) cleanup(false); };

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        modal.addEventListener("click", onBackdrop);
    });
}

function showPromptModal({ title = "Enter value", message = "", defaultValue = "", okText = "Save", inputType = "number" } = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById("promptModal");
        const titleEl = document.getElementById("promptTitle");
        const msgEl = document.getElementById("promptMessage");
        const input = document.getElementById("promptInput");
        const okBtn = document.getElementById("promptOkBtn");
        const cancelBtn = document.getElementById("promptCancelBtn");
        const closeBtn = document.getElementById("promptCloseBtn");

        if (!modal || !input || !okBtn) {
            resolve(window.prompt(message, defaultValue));
            return;
        }

        titleEl.textContent = title;
        msgEl.textContent = message;
        okBtn.textContent = okText;
        input.type = inputType;
        input.value = defaultValue ?? "";
        modal.classList.remove("hidden");
        setTimeout(() => input.focus(), 50);

        const cleanup = (result) => {
            modal.classList.add("hidden");
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            if (closeBtn) closeBtn.removeEventListener("click", onCancel);
            input.removeEventListener("keydown", onKey);
            modal.removeEventListener("click", onBackdrop);
            resolve(result);
        };

        const onOk = () => cleanup(input.value.trim() === "" ? null : input.value.trim());
        const onCancel = () => cleanup(null);
        const onKey = (e) => {
            if (e.key === "Enter") onOk();
            if (e.key === "Escape") onCancel();
        };
        const onBackdrop = (e) => { if (e.target === modal) onCancel(); };

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        if (closeBtn) closeBtn.addEventListener("click", onCancel);
        input.addEventListener("keydown", onKey);
        modal.addEventListener("click", onBackdrop);
    });
}

function showPasswordModal({ userName = "user", userEmail = "" } = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById("passwordModal");
        const hint = document.getElementById("passwordModalHint");
        const newInput = document.getElementById("newPasswordInput");
        const confirmInput = document.getElementById("confirmPasswordInput");
        const errEl = document.getElementById("passwordModalError");
        const okBtn = document.getElementById("passwordOkBtn");
        const cancelBtn = document.getElementById("passwordCancelBtn");
        const closeBtn = document.getElementById("passwordCloseBtn");

        if (!modal || !newInput || !okBtn) {
            const p = window.prompt("Enter new password (min 6 characters):");
            resolve(p && p.length >= 6 ? p : null);
            return;
        }

        if (hint) hint.textContent = `Set a new password for ${userName}${userEmail ? " (" + userEmail + ")" : ""}.`;
        newInput.value = "";
        confirmInput.value = "";
        if (errEl) {
            errEl.textContent = "";
            errEl.classList.add("hidden");
        }
        modal.classList.remove("hidden");
        setTimeout(() => newInput.focus(), 50);

        const cleanup = (result) => {
            modal.classList.add("hidden");
            okBtn.removeEventListener("click", onOk);
            cancelBtn.removeEventListener("click", onCancel);
            if (closeBtn) closeBtn.removeEventListener("click", onCancel);
            modal.removeEventListener("click", onBackdrop);
            resolve(result);
        };

        const onOk = () => {
            const p1 = newInput.value;
            const p2 = confirmInput.value;
            if (!p1 || p1.length < 6) {
                if (errEl) {
                    errEl.textContent = "Password must be at least 6 characters.";
                    errEl.classList.remove("hidden");
                }
                return;
            }
            if (p1 !== p2) {
                if (errEl) {
                    errEl.textContent = "Passwords do not match.";
                    errEl.classList.remove("hidden");
                }
                return;
            }
            cleanup(p1);
        };
        const onCancel = () => cleanup(null);
        const onBackdrop = (e) => { if (e.target === modal) onCancel(); };

        okBtn.addEventListener("click", onOk);
        cancelBtn.addEventListener("click", onCancel);
        if (closeBtn) closeBtn.addEventListener("click", onCancel);
        modal.addEventListener("click", onBackdrop);
    });
}

function todayStart() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return Timestamp.fromDate(date);
}

// SALES PERIOD

function getOrderTime(order) {
    if (order.createdAt && typeof order.createdAt.toDate === "function") {
        return order.createdAt.toDate().getTime();
    }
    return 0;
}

function filterOrdersByPeriod(list, period) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = (() => {
        const d = new Date(now);
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        d.setDate(d.getDate() - diff);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    })();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    return list.filter((order) => {
        const t = getOrderTime(order);
        if (!t) return false;
        if (period === "daily") return t >= startOfToday;
        if (period === "weekly") return t >= startOfWeek;
        if (period === "monthly") return t >= startOfMonth;
        if (period === "yearly") return t >= startOfYear;
        return true;
    });
}

function periodLabel(period) {
    if (period === "daily") return "Showing: Today's sales";
    if (period === "weekly") return "Showing: This week's sales";
    if (period === "monthly") return "Showing: This month's sales";
    if (period === "yearly") return "Showing: This year's sales";
    return "Showing: All sales";
}

function renderSalesReports() {
    const filtered = filterOrdersByPeriod(orders, salesPeriod);

    const reportOrdersEl = document.getElementById("reportOrders");
    const reportSalesEl = document.getElementById("reportSales");
    const reportCashEl = document.getElementById("reportCash");
    const reportCardEl = document.getElementById("reportCard");
    const labelEl = document.getElementById("salesPeriodLabel");

    if (reportOrdersEl) reportOrdersEl.textContent = filtered.length;
    if (reportSalesEl) reportSalesEl.textContent = peso(filtered.reduce((s, o) => s + Number(o.total || 0), 0));
    if (reportCashEl) {
        reportCashEl.textContent = peso(
            filtered.filter((o) => o.paymentMethod === "Cash").reduce((s, o) => s + Number(o.total || 0), 0)
        );
    }
    if (reportCardEl) {
        reportCardEl.textContent = peso(
            filtered.filter((o) => o.paymentMethod === "GCash" || o.paymentMethod === "Card")
                .reduce((s, o) => s + Number(o.total || 0), 0)
        );
    }
    if (labelEl) labelEl.textContent = periodLabel(salesPeriod);

    const tbody = document.getElementById("reportsTable");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#777;">No sales for this period.</td></tr>`;
        return;
    }

    filtered.forEach((order) => {
        const row = document.createElement("tr");
        const date = order.createdAt ? order.createdAt.toDate().toLocaleString() : "N/A";
        row.innerHTML = `
            <td>${order.orderNumber || "N/A"}</td>
            <td>${date}</td>
            <td>${peso(order.total || 0)}</td>
            <td>${order.paymentMethod || "N/A"}</td>
            <td>${order.cashierName || "N/A"}</td>
            <td>
                <button class="small-btn delete-order-btn" data-id="${order.id}" data-number="${order.orderNumber || ""}" style="background: var(--danger-bg); color: var(--danger); font-weight: 600;">Delete</button>
            </td>
        `;
        tbody.appendChild(row);
    });

    tbody.querySelectorAll(".delete-order-btn").forEach((btn) => {
        btn.addEventListener("click", () => deleteOrder(btn.dataset.id, btn.dataset.number));
    });
}

// DASHBOARD

function renderDashboard() {
    const start = todayStart().toMillis();

    const totalProductsEl = document.getElementById("totalProducts");
    const lowStockEl = document.getElementById("lowStock");
    const todayOrdersEl = document.getElementById("todayOrders");
    const todaySalesEl = document.getElementById("todaySales");

    if (totalProductsEl) totalProductsEl.textContent = products.length;

    const lowStockItems = products.filter((p) => Number(p.stock) <= 5);
    if (lowStockEl) lowStockEl.textContent = lowStockItems.length;

    const todayOrders = orders.filter((o) => o.createdAt && o.createdAt.toMillis() >= start);
    if (todayOrdersEl) todayOrdersEl.textContent = todayOrders.length;
    if (todaySalesEl) todaySalesEl.textContent = peso(todayOrders.reduce((sum, o) => sum + Number(o.total || 0), 0));

    const outOfStockEl = document.getElementById("outOfStock");
    const allTimeOrdersEl = document.getElementById("allTimeOrders");
    const allTimeSalesEl = document.getElementById("allTimeSales");
    const activeProductsEl = document.getElementById("activeProducts");

    if (outOfStockEl) outOfStockEl.textContent = products.filter((p) => Number(p.stock) <= 0).length;
    if (allTimeOrdersEl) allTimeOrdersEl.textContent = orders.length;
    if (allTimeSalesEl) allTimeSalesEl.textContent = peso(orders.reduce((s, o) => s + Number(o.total || 0), 0));
    if (activeProductsEl) {
        activeProductsEl.textContent = products.filter((p) => {
            const st = String(p.status || "active").toLowerCase();
            return st !== "inactive" && st !== "disabled";
        }).length;
    }

    const lowList = document.getElementById("dashboardLowStockList");
    if (lowList) {
        if (lowStockItems.length === 0) {
            lowList.innerHTML = `<p style="color: var(--text-muted); font-size: 14px; padding: 8px 0;">All products have healthy stock.</p>`;
        } else {
            lowList.innerHTML = lowStockItems
                .sort((a, b) => Number(a.stock) - Number(b.stock))
                .map((p) => {
                    const stock = Number(p.stock || 0);
                    const badge = stock <= 0
                        ? `<span style="color:#c0392b;font-weight:700;">Out of Stock</span>`
                        : `<span style="color:#e67e22;font-weight:700;">Low (${stock})</span>`;
                    return `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                            <div>
                                <strong>${p.name || "Unnamed"}</strong>
                                <div style="font-size:12px;color:var(--text-muted);">${p.category || ""}</div>
                            </div>
                            ${badge}
                        </div>`;
                }).join("");
        }
    }

    const recentEl = document.getElementById("dashboardRecentOrders");
    if (recentEl) {
        const recent = [...orders]
            .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
            .slice(0, 8);

        if (recent.length === 0) {
            recentEl.innerHTML = `<p style="color: var(--text-muted); font-size: 14px; padding: 8px 0;">No orders yet.</p>`;
        } else {
            recentEl.innerHTML = recent.map((o) => {
                const dateStr = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : "—";
                return `
                    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                        <div>
                            <strong>${o.orderNumber || "N/A"}</strong>
                            <div style="font-size:12px;color:var(--text-muted);">${dateStr}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-weight:700;">${peso(o.total)}</div>
                            <div style="font-size:12px;color:var(--text-muted);">${o.orderStatus || "N/A"}</div>
                        </div>
                    </div>`;
            }).join("");
        }
    }
}

// USER MANAGEMENT

async function addNewUser() {
    const name = document.getElementById("newUserName")?.value.trim() || "";
    const email = document.getElementById("newUserEmail")?.value.trim() || "";
    const password = document.getElementById("newUserPassword")?.value || "";
    const role = document.getElementById("newUserRole")?.value || "cashier";

    if (!name || !email || !password) {
        showMessage("adminMessage", "Please fill in name, email, and password.");
        return;
    }
    if (password.length < 6) {
        showMessage("adminMessage", "Password must be at least 6 characters.");
        return;
    }

    try {
        showMessage("adminMessage", "Creating user…", true);

        const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
        const uid = cred.user.uid;

                await setDoc(doc(db, "users", uid), {
            name,
            email,
            role,
            status: "active",
            password: password,
            adminId: role === "admin" ? null : currentAdminUid,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now()
        });

        await signOut(secondaryAuth);

        document.getElementById("newUserName").value = "";
        document.getElementById("newUserEmail").value = "";
        document.getElementById("newUserPassword").value = "";
        document.getElementById("newUserRole").value = "cashier";

        await loadUsers();
        showMessage("adminMessage", `User "${name}" created successfully.`, true);
    } catch (err) {
        console.error("Add user error:", err);
        let msg = err.message || "Failed to create user.";
        if (err.code === "auth/email-already-in-use") msg = "That email is already registered.";
        if (err.code === "auth/invalid-email") msg = "Invalid email address.";
        if (err.code === "auth/weak-password") msg = "Password is too weak (min 6 characters).";
        showMessage("adminMessage", msg);
    }
}

async function loadUsers() {
    try {
        const snap = await getDocs(collection(db, "users"));
        const tbody = document.getElementById("usersTable");
        if (!tbody) return;
        tbody.innerHTML = "";

                       snap.forEach((item) => {
            const user = item.data();
            const role = (user.role || "").toLowerCase();
            const status = (user.status || "active").toLowerCase();

            if (role === "admin" && item.id !== currentAdminUid) {
                return;
            }

            // Staff private to this admin only
            if (role !== "admin") {
                if (!user.adminId || user.adminId !== currentAdminUid) {
                    return;
                }
            }

            const row = document.createElement("tr");
            // ... rest of the row code stays the same
            row.innerHTML = `
                <td>${user.name || "N/A"}</td>
                <td>${user.email || "N/A"}</td>
                <td>
                    <select data-id="${item.id}" class="role-select">
                        <option value="admin" ${role === "admin" ? "selected" : ""}>Admin</option>
                        <option value="cashier" ${role === "cashier" ? "selected" : ""}>Cashier</option>
                        <option value="barista" ${role === "barista" ? "selected" : ""}>Barista</option>
                    </select>
                </td>
                <td><span class="status">${status}</span></td>
                <td>
                    <button class="small-btn status-btn" data-id="${item.id}" data-status="${status === "inactive" ? "active" : "inactive"}">
                        ${status === "inactive" ? "Activate" : "Deactivate"}
                    </button>
                    <button class="small-btn reset-password-btn" data-id="${item.id}" data-name="${user.name || "user"}" data-email="${user.email || ""}" style="margin-left:6px;">
                        Set Password
                    </button>
                    <button class="small-btn delete-user-btn" data-id="${item.id}" data-name="${user.name || "this user"}" data-email="${user.email || ""}" style="margin-left:6px;background:var(--danger-bg);color:var(--danger);font-weight:600;">
                        Delete
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        document.querySelectorAll(".role-select").forEach((select) => {
            select.addEventListener("change", async () => {
                try {
                    await updateDoc(doc(db, "users", select.dataset.id), { role: select.value });
                    showMessage("adminMessage", "User role updated successfully.", true);
                } catch (err) {
                    console.error("Failed to update role:", err);
                    showMessage("adminMessage", "Failed to update user role.");
                }
            });
        });

        document.querySelectorAll(".status-btn").forEach((button) => {
            button.addEventListener("click", async () => {
                try {
                    await updateDoc(doc(db, "users", button.dataset.id), { status: button.dataset.status });
                    await loadUsers();
                    showMessage("adminMessage", "User status updated successfully.", true);
                } catch (err) {
                    console.error("Failed to update status:", err);
                    showMessage("adminMessage", "Failed to update user status.");
                }
            });
        });

        document.querySelectorAll(".reset-password-btn").forEach((button) => {
            button.addEventListener("click", async () => {
                const userId = button.dataset.id;
                const userName = button.dataset.name || "user";
                const userEmail = button.dataset.email || "";

                if (!userId) {
                    showMessage("adminMessage", "User ID not found.");
                    return;
                }

                const newPassword = await showPasswordModal({ userName, userEmail });
                if (!newPassword) return;

                try {
                    await updateDoc(doc(db, "users", userId), {
                        password: newPassword,
                        updatedAt: Timestamp.now()
                    });
                    showMessage("adminMessage", `Password for "${userName}" updated successfully. They can now log in with the new password.`, true);
                } catch (err) {
                    console.error("Set password error:", err);
                    showMessage("adminMessage", "Failed to set password: " + (err.message || err));
                }
            });
        });

        document.querySelectorAll(".delete-user-btn").forEach((button) => {
            button.addEventListener("click", async () => {
                const userId = button.dataset.id;
                const userName = button.dataset.name || "this user";
                const userEmail = button.dataset.email || "";

                if (auth.currentUser && auth.currentUser.uid === userId) {
                    showMessage("adminMessage", "You cannot delete your own account while logged in.");
                    return;
                }
                if (currentAdminUid && currentAdminUid === userId) {
                    showMessage("adminMessage", "You cannot delete your own account while logged in.");
                    return;
                }

                const confirmed = await showConfirmModal({
                    title: "Delete User",
                    message: `Are you sure you want to permanently delete "${userName}" (${userEmail})? This cannot be undone.`,
                    okText: "Delete",
                    danger: true
                });
                if (!confirmed) return;

                try {
                    await deleteDoc(doc(db, "users", userId));
                    await loadUsers();
                    showMessage("adminMessage", `User "${userName}" deleted successfully.`, true);
                } catch (err) {
                    console.error("Delete user error:", err);
                    showMessage("adminMessage", "Failed to delete user: " + (err.message || err));
                }
            });
        });
    } catch (error) {
        console.error("Error loading users:", error);
    }
}

// PRODUCTS & INVENTORY

function renderProducts() {
    const tbody = document.getElementById("productsTable");
    const inventory = document.getElementById("inventoryTable");
    if (!tbody || !inventory) return;

    tbody.innerHTML = "";
    inventory.innerHTML = "";

    products.forEach((product) => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${product.name}</td>
            <td>${product.category}</td>
            <td>${peso(product.price)}</td>
            <td>${product.stock}</td>
            <td><span class="status">${product.status || "active"}</span></td>
            <td>
                <button class="small-btn edit-product" data-id="${product.id}">Edit</button>
                <button class="small-btn delete-product" data-id="${product.id}">Delete</button>
            </td>
        `;
        tbody.appendChild(row);

        const invRow = document.createElement("tr");
        const stockNum = Number(product.stock || 0);
        let levelClass = "good";
        let levelText = "Available";
        if (stockNum <= 0) { levelClass = "low"; levelText = "Out of Stock"; }
        else if (stockNum <= 5) { levelClass = "low"; levelText = "Low Stock"; }
        const ingredients = (product.ingredients || "").trim() || "—";
        invRow.innerHTML = `
            <td>${product.name}</td>
            <td style="font-size:13px;color:var(--text-muted);max-width:280px;">${ingredients}</td>
            <td>${stockNum}</td>
            <td class="${levelClass}">${levelText}</td>
            <td><button class="small-btn adjust-stock" data-id="${product.id}">Adjust</button></td>
        `;
        inventory.appendChild(invRow);
    });

    document.querySelectorAll(".edit-product").forEach((button) => {
        button.addEventListener("click", () => {
            const product = products.find((item) => item.id === button.dataset.id);
            if (!product) return;
            document.getElementById("editingProductId").value = product.id;
            document.getElementById("productName").value = product.name;
            document.getElementById("productCategory").value = product.category;
            document.getElementById("productPrice").value = product.price;
            document.getElementById("productStock").value = product.stock;
            document.getElementById("productImage").value = product.image || "";
            const ingEl = document.getElementById("productIngredients");
            if (ingEl) ingEl.value = product.ingredients || "";
            document.getElementById("cancelProductBtn")?.classList.remove("hidden");
        });
    });

    document.querySelectorAll(".delete-product").forEach((button) => {
        button.addEventListener("click", async () => {
            const product = products.find((item) => item.id === button.dataset.id);
            const productName = product ? product.name : "this product";
            const confirmed = await showConfirmModal({
                title: "Delete Product",
                message: `Are you sure you want to delete "${productName}"? This action cannot be undone.`,
                okText: "Delete",
                danger: true
            });
            if (!confirmed) return;
            try {
                await deleteDoc(doc(db, "products", button.dataset.id));
                showMessage("adminMessage", "Product deleted successfully.", true);
            } catch (err) {
                console.error("Delete product error:", err);
                showMessage("adminMessage", "Failed to delete product.");
            }
        });
    });

    document.querySelectorAll(".adjust-stock").forEach((button) => {
        button.addEventListener("click", async () => {
            const product = products.find((item) => item.id === button.dataset.id);
            if (!product) return;
            const value = await showPromptModal({
                title: "Adjust Stock",
                message: `Update stock for "${product.name || "product"}". Current stock: ${product.stock}`,
                defaultValue: String(product.stock ?? 0),
                okText: "Update Stock",
                inputType: "number"
            });
            if (value === null || value.trim() === "" || isNaN(value) || Number(value) < 0) return;
            try {
                await updateDoc(doc(db, "products", product.id), {
                    stock: Number(value),
                    updatedAt: Timestamp.now()
                });
                showMessage("adminMessage", "Stock updated successfully.", true);
            } catch (err) {
                console.error("Adjust stock error:", err);
                showMessage("adminMessage", "Failed to update stock.");
            }
        });
    });
}

function subscribeProducts() {
    return onSnapshot(collection(db, "products"), (snapshot) => {
        products = [];
        snapshot.forEach((item) => products.push({ id: item.id, ...item.data() }));
        products.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        renderProducts();
        renderDashboard();
    });
}

function fileToBase64Image(file, maxWidth = 400, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error("Could not read image file."));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error("Invalid image file."));
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext("2d").drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL("image/jpeg", quality));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

async function saveProduct() {
    const name = document.getElementById("productName").value.trim();
    const category = document.getElementById("productCategory").value.trim();
    const price = Number(document.getElementById("productPrice").value);
    const stock = Number(document.getElementById("productStock").value);
    let image = document.getElementById("productImage").value.trim();
    const ingredients = (document.getElementById("productIngredients")?.value || "").trim();
    const id = document.getElementById("editingProductId").value;
    const fileInput = document.getElementById("productImageFile");
    const file = fileInput?.files?.[0] || null;

    if (!name || !category || isNaN(price) || price < 0 || isNaN(stock) || stock < 0) {
        showMessage("adminMessage", "Please fill in all required product details accurately.");
        return;
    }

    try {
        if (file) {
            showMessage("adminMessage", "Processing image...", true);
            image = await fileToBase64Image(file);
        }
        const data = { name, category, price, stock, image, ingredients, status: "active", updatedAt: Timestamp.now() };
        if (id) {
            await updateDoc(doc(db, "products", id), data);
            showMessage("adminMessage", "Product updated.", true);
        } else {
            data.createdAt = Timestamp.now();
            await addDoc(collection(db, "products"), data);
            showMessage("adminMessage", "Product added.", true);
        }
        clearProductForm();
    } catch (err) {
        console.error("Save product error:", err);
        showMessage("adminMessage", "Failed to save product: " + (err.message || err));
    }
}

function clearProductForm() {
    const editId = document.getElementById("editingProductId");
    if (editId) editId.value = "";
    ["productName", "productCategory", "productPrice", "productStock", "productImage", "productIngredients"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const fileInput = document.getElementById("productImageFile");
    if (fileInput) fileInput.value = "";
    const preview = document.getElementById("productImagePreview");
    if (preview) { preview.src = ""; preview.style.display = "none"; }
    document.getElementById("cancelProductBtn")?.classList.add("hidden");
}

// ORDERS / RECEIPTS

async function deleteOrder(orderId, orderNumber, options = {}) {
    const soft = options.soft === true;
    const confirmed = await showConfirmModal({
        title: soft ? "Remove Receipt" : "Delete Order",
        message: soft
            ? `Remove receipt "${orderNumber || orderId}" from Receipts? It will still appear in Sales Reports.`
            : `Are you sure you want to permanently delete order "${orderNumber || orderId}"? This cannot be undone.`,
        okText: soft ? "Remove" : "Delete",
        danger: true
    });
    if (!confirmed) return;

    try {
        if (soft) {
            await updateDoc(doc(db, "orders", orderId), { receiptDeleted: true, updatedAt: Timestamp.now() });
            showMessage("adminMessage", `Receipt ${orderNumber || ""} removed from Receipts.`, true);
        } else {
            await deleteDoc(doc(db, "orders", orderId));
            try {
                const salesSnap = await getDocs(collection(db, "sales"));
                for (const s of salesSnap.docs) {
                    if (s.data().orderNumber === orderNumber) await deleteDoc(doc(db, "sales", s.id));
                }
            } catch (e) {
                console.warn("Could not clean related sales record:", e);
            }
            showMessage("adminMessage", `Order ${orderNumber || ""} deleted successfully.`, true);
        }
    } catch (err) {
        console.error("Delete order error:", err);
        showMessage("adminMessage", "Failed to delete: " + (err.message || err));
    }
}

async function deleteAllOrders(fromLabel = "orders") {
    if (!orders.length) {
        showMessage("adminMessage", "There are no orders to delete.");
        return;
    }
    const soft = fromLabel === "receipts";
    const confirmed = await showConfirmModal({
        title: soft ? "Remove All Receipts" : "Delete All Orders",
        message: soft
            ? "Remove ALL receipts from the Receipts page? They will still appear in Sales Reports."
            : `Are you sure you want to permanently delete ALL ${orders.length} orders? This cannot be undone.`,
        okText: soft ? "Remove All" : "Delete All",
        danger: true
    });
    if (!confirmed) return;

    try {
        showMessage("adminMessage", soft ? "Removing all receipts…" : "Deleting all orders…", true);
        if (soft) {
            await Promise.all(
                orders.filter((o) => !o.receiptDeleted).map((o) =>
                    updateDoc(doc(db, "orders", o.id), { receiptDeleted: true, updatedAt: Timestamp.now() })
                )
            );
            showMessage("adminMessage", "All receipts removed from Receipts page.", true);
        } else {
            await Promise.all(orders.map((o) => deleteDoc(doc(db, "orders", o.id))));
            try {
                const salesSnap = await getDocs(collection(db, "sales"));
                await Promise.all(salesSnap.docs.map((s) => deleteDoc(doc(db, "sales", s.id))));
            } catch (e) {
                console.warn("Could not clear sales collection:", e);
            }
            showMessage("adminMessage", "All orders deleted successfully.", true);
        }
    } catch (err) {
        console.error("Delete all error:", err);
        showMessage("adminMessage", "Failed to delete all: " + (err.message || err));
    }
}

function renderAdminReceipts() {
    const container = document.getElementById("adminReceiptList");
    if (!container) return;
    container.innerHTML = "";

    const paidOrders = orders
        .filter((o) => {
            if (o.receiptDeleted === true) return false;
            const status = String(o.paymentStatus || "").toLowerCase();
            return status === "paid" || o.paymentMethod;
        })
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    if (paidOrders.length === 0) {
        container.innerHTML = `<div style="padding: 30px; text-align: center; color: #777;">No paid receipts found.</div>`;
        return;
    }

    paidOrders.forEach((order) => {
        const dateStr = order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString() : "";
        let itemHtml = "";
        (order.items || []).forEach((item) => {
            const lineTotal = Number(item.price || 0) * Number(item.quantity || 1);
            itemHtml += `<div class="order-item-line"><span>${item.productName} x${item.quantity}</span><span>${peso(lineTotal)}</span></div>`;
        });

        const card = document.createElement("div");
        card.className = "order-card receipt-card";
        card.style.cssText = "background:#fff;border:1px dashed #ccc;border-radius:8px;padding:15px;margin-bottom:15px;font-family:monospace;";
        card.innerHTML = `
            <div style="text-align:center;font-weight:bold;font-size:1.1rem;text-transform:uppercase;">☕ BrewPoint Coffee Shop</div>
            <div style="text-align:center;font-size:0.85rem;color:#555;margin-bottom:10px;">Receipt #${order.orderNumber || "N/A"}</div>
            <div style="font-size:0.8rem;color:#666;border-bottom:1px dashed #aaa;padding-bottom:5px;margin-bottom:8px;">
                <div>Date: ${dateStr}</div>
                <div>Cashier: ${order.cashierName || "Cashier"}</div>
                <div>Payment: ${order.paymentMethod || "Cash"}</div>
                <div>Status: ${order.orderStatus || "N/A"}</div>
            </div>
            <div style="margin-bottom:10px;">${itemHtml}</div>
            <div style="border-top:1px dashed #aaa;padding-top:5px;text-align:right;font-size:1rem;font-weight:bold;">Total: ${peso(order.total)}</div>
            <button class="small-btn delete-order-btn" data-id="${order.id}" data-number="${order.orderNumber || ""}" style="width:100%;margin-top:12px;background:var(--danger-bg);color:var(--danger);font-weight:600;">🗑️ Delete Receipt</button>
        `;
        card.querySelector(".delete-order-btn")?.addEventListener("click", () => {
            deleteOrder(order.id, order.orderNumber, { soft: true });
        });
        container.appendChild(card);
    });
}

function subscribeOrders() {
    return onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snapshot) => {
        orders = [];
        snapshot.forEach((item) => {
            const data = { id: item.id, ...item.data() };

            // Isolation: only this admin's sales/receipts
            if (currentAdminUid) {
                if (data.adminId) {
                    if (data.adminId !== currentAdminUid) return;
                } else {
                    // Legacy orders without adminId: show if after this admin registered
                    if (currentAdminCreatedAtMs > 0) {
                        const orderMs = data.createdAt && typeof data.createdAt.toMillis === "function"
                            ? data.createdAt.toMillis()
                            : 0;
                        if (orderMs < currentAdminCreatedAtMs) return;
                    }
                }
            }

            orders.push(data);
        });
        renderSalesReports();
        renderAdminReceipts();
        renderDashboard();
    });
}

// INIT

setupNavigation();
setupLogout();

document.querySelectorAll(".dash-goto").forEach((btn) => {
    btn.addEventListener("click", () => {
        const navBtn = document.querySelector(`.nav-btn[data-section="${btn.dataset.section}"]`);
        if (navBtn) navBtn.click();
    });
});

document.getElementById("salesPeriodButtons")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-period]");
    if (!btn) return;
    salesPeriod = btn.dataset.period;
    document.querySelectorAll("#salesPeriodButtons .category-btn").forEach((b) => {
        b.classList.toggle("active", b === btn);
    });
    renderSalesReports();
});

document.getElementById("deleteAllOrdersBtn")?.addEventListener("click", () => deleteAllOrders("orders"));
document.getElementById("deleteAllReceiptsBtn")?.addEventListener("click", () => deleteAllOrders("receipts"));
document.getElementById("addUserBtn")?.addEventListener("click", addNewUser);

async function initAdminPage(userData, email, uid) {
    currentAdminUid = uid || userData.uid || null;
    currentAdminCreatedAtMs = userData.createdAt && typeof userData.createdAt.toMillis === "function"
        ? userData.createdAt.toMillis()
        : 0;

    const userInfo = document.getElementById("userInfo");
    if (userInfo) userInfo.textContent = `${userData.name || "Admin"} (${userData.email || email || ""})`;
    await loadUsers();
    subscribeProducts();
    subscribeOrders();
}

try {
    const raw = sessionStorage.getItem("bp_session");
    if (raw) {
        const session = JSON.parse(raw);
        if ((session.role || "").toLowerCase() === "admin" && (session.status || "").toLowerCase() === "active") {
            getDoc(doc(db, "users", session.uid)).then((snap) => {
                if (snap.exists()) {
                    initAdminPage({ ...session, ...snap.data() }, session.email, session.uid);
                } else {
                    initAdminPage(session, session.email, session.uid);
                }
            }).catch(() => initAdminPage(session, session.email, session.uid));
        } else if (session.role) {
            window.location.href = session.role + ".html";
        }
    }
} catch (_) {}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        try {
            const raw = sessionStorage.getItem("bp_session");
            if (raw) {
                const session = JSON.parse(raw);
                if ((session.role || "").toLowerCase() === "admin") return;
            }
        } catch (_) {}
        window.location.href = "login.html";
        return;
    }
    try {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));
        if (!userSnapshot.exists()) {
            alert("User profile not found in Firestore.");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }
        const userData = userSnapshot.data();
        if ((userData.role || "").toLowerCase() !== "admin") {
            alert("Access denied. Admin role required.");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }
        if ((userData.status || "").toLowerCase() !== "active") {
            alert("Your account is inactive.");
            await signOut(auth);
            window.location.href = "login.html";
            return;
        }
        sessionStorage.removeItem("bp_session");
        await initAdminPage(userData, user.email, user.uid);
    } catch (error) {
        console.error("Authentication check error:", error);
    }
});

document.getElementById("saveProductBtn")?.addEventListener("click", saveProduct);
document.getElementById("cancelProductBtn")?.addEventListener("click", clearProductForm);
document.getElementById("addProductBtn")?.addEventListener("click", clearProductForm);
document.getElementById("refreshUsers")?.addEventListener("click", loadUsers);

document.getElementById("productImageFile")?.addEventListener("change", function () {
    const preview = document.getElementById("productImagePreview");
    const file = this.files?.[0];
    if (!preview) return;
    if (!file) {
        preview.src = "";
        preview.style.display = "none";
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.src = e.target.result;
        preview.style.display = "block";
    };
    reader.readAsDataURL(file);
});