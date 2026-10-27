import { auth, db } from "./firebase-config.js";
import { peso, showMessage, setupNavigation, protectPage, setupLogout } from "./common.js";
import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let currentUser = null;
let currentProfile = null;
let activeOrders = [];

function renderBaristaOrders() {
    const orderGrid = document.getElementById("baristaOrderGrid");
    if (!orderGrid) return;

    orderGrid.innerHTML = "";

    if (activeOrders.length === 0) {
        orderGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #666; font-size: 1.1rem;">
                No active orders in the queue.
            </div>`;
        return;
    }

    activeOrders.forEach((order, index) => {
        const card = document.createElement("div");
        card.className = `order-card status-${String(order.orderStatus || "pending").toLowerCase()}`;

        let itemsListHtml = "";
        (order.items || []).forEach((item) => {
            itemsListHtml += `
                <div class="order-item-row" style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
                    <span><strong>${item.quantity}x</strong> ${item.productName}</span>
                    <span>${peso(item.price * item.quantity)}</span>
                </div>`;
        });

        const timeStr = order.createdAt && typeof order.createdAt.toDate === "function"
            ? order.createdAt.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";

        const status = String(order.orderStatus || "Pending");

        // Can start this order only if every previous order has already been started
        const canStart = activeOrders
            .slice(0, index)
            .every((prev) => String(prev.orderStatus || "Pending") !== "Pending");

        let actionHtml = "";
        let isLocked = false;

        if (status === "Pending") {
            isLocked = !canStart;
            actionHtml = `<button class="action-btn prepare-btn primary-btn" data-id="${order.id}" data-next="Preparing" ${isLocked ? 'style="opacity:0.55;cursor:not-allowed;"' : ""}>Preparing</button>`;
        } else if (status === "Preparing") {
            actionHtml = `<button class="action-btn ready-btn primary-btn" data-id="${order.id}" data-next="Ready">Mark Ready</button>`;
        } else if (status === "Ready") {
            actionHtml = `<button class="action-btn complete-btn secondary-btn" data-id="${order.id}" data-next="Completed">Complete</button>`;
        } else {
            actionHtml = `<button class="action-btn secondary-btn" disabled>Completed</button>`;
        }

        const customerName = order.customerName || "Walk-in";
        const orderType = order.orderType || "Dine In";

        card.innerHTML = `
            <div class="order-card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <h3 style="margin: 0; font-size: 1.1rem;">${order.orderNumber || "BP-0000"}</h3>
                <span class="time-badge" style="font-size: 0.8rem; color: #666;">${timeStr}</span>
            </div>
            <div class="order-meta" style="margin-bottom: 10px;">
                <small style="color: #555;">Customer: <strong>${customerName}</strong></small><br>
                <small style="color: #555;">Type: <strong>${orderType}</strong></small><br>
                <small style="color: #555;">Cashier: ${order.cashierName || "POS"}</small>
                ${isLocked ? `<div style="margin-top:4px;font-size:12px;color:#B53A2E;font-weight:600;">🔒 Waiting for previous order to be started</div>` : ""}
            </div>
            <div class="order-items-container" style="max-height: 150px; overflow-y: auto; margin-bottom: 12px;">
                ${itemsListHtml}
            </div>
            <div class="order-card-footer" style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #ddd; padding-top: 8px;">
                <span class="status-badge ${status.toLowerCase()}" style="font-weight: bold;">${status}</span>
                <div class="action-btns">
                    ${actionHtml}
                </div>
            </div>
        `;

        const btn = card.querySelector(".action-btn");
        if (btn && !btn.disabled) {
            btn.addEventListener("click", () => {
                if (status === "Pending" && !canStart) {
                    alert("pls do the first order first");
                    showMessage("baristaMessage", "Please click Preparing on the first order first.");
                    return;
                }

                const next = btn.dataset.next;
                if (next) {
                    updateOrderStatus(order.id, next);
                }
            });
        }

        orderGrid.appendChild(card);
    });
}

async function updateOrderStatus(orderId, newStatus) {
    try {
        const orderRef = doc(db, "orders", orderId);
        await updateDoc(orderRef, {
            orderStatus: newStatus,
            updatedAt: Timestamp.now()
        });
        showMessage("baristaMessage", `Order marked as ${newStatus}`, true);
    } catch (error) {
        console.error("Error updating order status:", error);
        showMessage("baristaMessage", "Failed to update order status.");
    }
}

function startRealtimeListeners() {
    const q = query(
        collection(db, "orders"),
        where("orderStatus", "in", ["Pending", "Preparing", "Ready"])
    );

    onSnapshot(q, (snapshot) => {
        activeOrders = [];
        snapshot.forEach((docSnap) => {
            activeOrders.push({ id: docSnap.id, ...docSnap.data() });
        });

        activeOrders.sort((a, b) => {
            const timeA = a.createdAt && typeof a.createdAt.toMillis === "function" ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt && typeof b.createdAt.toMillis === "function" ? b.createdAt.toMillis() : 0;
            return timeA - timeB;
        });

        renderBaristaOrders();
    }, (error) => {
        console.error("Firestore Barista Orders Listener Error:", error);
        showMessage("baristaMessage", "Error fetching incoming orders: " + error.message);
    });
}

async function init() {
    if (typeof setupNavigation === "function") setupNavigation();
    if (typeof setupLogout === "function") setupLogout();

    startRealtimeListeners();

    if (typeof protectPage === "function") {
        try {
            const access = await protectPage("barista");
            if (access) {
                currentUser = access.user;
                currentProfile = access.profile;
                const userInfo = document.getElementById("userInfo");
                if (userInfo) {
                    userInfo.textContent = `${(currentProfile && currentProfile.name) || "Barista"} (${currentUser.email})`;
                }
            }
        } catch (err) {
            console.warn("Barista page authentication protection check failed/skipped:", err);
        }
    }
}

init();