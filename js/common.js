import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

function peso(value) {
    return "₱" + Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showMessage(elementId, message, good = false) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = good ? "message good" : "message";
}

function setupNavigation() {
    document.querySelectorAll(".nav-btn").forEach(function (button) {
        button.addEventListener("click", function () {
            const section = button.dataset.section;

            document.querySelectorAll(".nav-btn").forEach(function (item) {
                item.classList.remove("active");
            });
            button.classList.add("active");

            document.querySelectorAll(".page-section").forEach(function (item) {
                item.classList.remove("active");
                item.classList.add("hidden");
            });

            const target = document.getElementById(section + "Section");
            if (target) {
                target.classList.remove("hidden");
                target.classList.add("active");
            }
        });
    });
}

function getSessionProfile() {
    try {
        const raw = sessionStorage.getItem("bp_session");
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function protectPage(requiredRole) {
    return new Promise(function (resolve) {
        const session = getSessionProfile();
        if (session && session.uid) {
            if ((session.status || "").toLowerCase() === "inactive") {
                alert("Your account is inactive.");
                sessionStorage.removeItem("bp_session");
                window.location.href = "login.html";
                return;
            }
            if ((session.role || "").toLowerCase() !== requiredRole) {
                alert("You do not have permission to open this dashboard.");
                window.location.href = (session.role || "login") + ".html";
                return;
            }
            const userInfo = document.getElementById("userInfo");
            if (userInfo) {
                userInfo.textContent = (session.name || session.email) + " • " + session.role;
            }
            resolve({
                user: { uid: session.uid, email: session.email },
                profile: session
            });
            return;
        }

        onAuthStateChanged(auth, async function (user) {
            if (!user) {
                window.location.href = "login.html";
                return;
            }

            const profileRef = doc(db, "users", user.uid);
            const profileSnap = await getDoc(profileRef);

            if (!profileSnap.exists()) {
                alert("Your account does not have a Firestore user profile.");
                await signOut(auth);
                window.location.href = "login.html";
                return;
            }

            const profile = profileSnap.data();

            if (profile.status === "inactive") {
                alert("Your account is inactive.");
                await signOut(auth);
                window.location.href = "login.html";
                return;
            }

            if (profile.role !== requiredRole) {
                alert("You do not have permission to open this dashboard.");
                window.location.href = profile.role + ".html";
                return;
            }

            const userInfo = document.getElementById("userInfo");
            if (userInfo) {
                userInfo.textContent = (profile.name || user.email) + " • " + profile.role;
            }

            resolve({ user: user, profile: profile });
        });
    });
}

function setupLogout() {
    const button = document.getElementById("logoutBtn");
    if (!button) return;

    button.addEventListener("click", async function () {
        sessionStorage.removeItem("bp_session");
        try {
            await signOut(auth);
        } catch (_) {}
        window.location.href = "login.html";
    });
}

export { auth, db, peso, showMessage, setupNavigation, protectPage, setupLogout };