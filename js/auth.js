import { auth, db } from "./firebase-config.js";

import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    setPersistence,
    browserSessionPersistence,
    signOut,
    getAuth
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    doc,
    getDoc,
    getDocs,
    setDoc,
    collection,
    query,
    where,
    Timestamp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const secondaryApp = initializeApp({
    apiKey: "AIzaSyDsVwebIk58R1awvhha9SkZK2KBFyKxnRk",
    authDomain: "brewpointpos.firebaseapp.com",
    projectId: "brewpointpos",
    storageBucket: "brewpointpos.firebasestorage.app",
    messagingSenderId: "813768738683",
    appId: "1:813768738683:web:51011f9d19ab9ec9eddfde"
}, "SecondaryAuth");
const secondaryAuth = getAuth(secondaryApp);

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const loginMessage = document.getElementById("loginMessage");
const registerMessage = document.getElementById("registerMessage");
const toggleBtn = document.getElementById("toggleAuthMode");

let isRegisterMode = false;

if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
        isRegisterMode = !isRegisterMode;
        if (isRegisterMode) {
            loginForm?.classList.add("hidden");
            registerForm?.classList.remove("hidden");
            toggleBtn.textContent = "Already have an account? Sign In";
            if (registerMessage) registerMessage.textContent = "";
        } else {
            registerForm?.classList.add("hidden");
            loginForm?.classList.remove("hidden");
            toggleBtn.textContent = "Don't have an admin account? Register";
            if (loginMessage) loginMessage.textContent = "";
        }
    });
}

function redirectByRole(role) {
    const r = (role || "").toLowerCase();
    if (r === "admin") window.location.href = "admin.html";
    else if (r === "cashier") window.location.href = "cashier.html";
    else if (r === "barista") window.location.href = "barista.html";
    else return false;
    return true;
}

function finishLogin(userData, uid) {
    if ((userData.status || "").toLowerCase() !== "active") {
        loginMessage.textContent = "This account is inactive.";
        return false;
    }
    sessionStorage.setItem("bp_session", JSON.stringify({
        uid: uid,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        status: userData.status,
        adminId: userData.adminId || null
    }));
    if (!redirectByRole(userData.role)) {
        loginMessage.textContent = "Invalid user role: " + userData.role;
        sessionStorage.removeItem("bp_session");
        return false;
    }
    return true;
}

// ===================== LOGIN =====================
if (loginForm) {
    loginForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!db) {
            loginMessage.textContent = "Firestore database is not initialized. Check firebase-config.js.";
            return;
        }

        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        loginMessage.textContent = "Signing in...";
        loginMessage.className = "message";

        try {
            await setPersistence(auth, browserSessionPersistence);

            const q = query(collection(db, "users"), where("email", "==", email));
            const snap = await getDocs(q);

            if (!snap.empty) {
                const userDoc = snap.docs[0];
                const userData = userDoc.data();
                const uid = userDoc.id;

                if (userData.password) {
                    if (userData.password !== password) {
                        loginMessage.textContent = "Invalid email or password.";
                        return;
                    }
                    try {
                        await signInWithEmailAndPassword(auth, email, password);
                        sessionStorage.removeItem("bp_session");
                    } catch (_) {}
                    finishLogin(userData, uid);
                    return;
                }
            }

            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            const userSnapshot = await getDoc(doc(db, "users", user.uid));
            if (!userSnapshot.exists()) {
                loginMessage.textContent = "User profile not found.";
                await signOut(auth);
                return;
            }

            const userData = userSnapshot.data();
            sessionStorage.removeItem("bp_session");

            if ((userData.status || "").toLowerCase() !== "active") {
                loginMessage.textContent = "This account is inactive.";
                await signOut(auth);
                return;
            }

            sessionStorage.setItem("bp_session", JSON.stringify({
                uid: user.uid,
                email: userData.email,
                name: userData.name,
                role: userData.role,
                status: userData.status,
                adminId: userData.adminId || null
            }));

            if (!redirectByRole(userData.role)) {
                loginMessage.textContent = "Invalid user role: " + userData.role;
                await signOut(auth);
                sessionStorage.removeItem("bp_session");
            }

        } catch (error) {
            console.error("Login Error:", error);
            switch (error.code) {
                case "auth/invalid-credential":
                case "auth/user-not-found":
                case "auth/wrong-password":
                    loginMessage.textContent = "Invalid email or password.";
                    break;
                case "auth/too-many-requests":
                    loginMessage.textContent = "Too many failed attempts. Try again later.";
                    break;
                case "auth/user-disabled":
                    loginMessage.textContent = "This account has been disabled.";
                    break;
                default:
                    loginMessage.textContent = "Login failed: " + (error.message || "Invalid email or password.");
                    break;
            }
        }
    });
}

// ===================== REGISTER ADMIN ONLY =====================
if (registerForm) {
    registerForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const name = document.getElementById("regName").value.trim();
        const email = document.getElementById("regEmail").value.trim();
        const password = document.getElementById("regPassword").value;
        const confirm = document.getElementById("regConfirm").value;

        if (!name || !email || !password) {
            registerMessage.textContent = "Please fill in all fields.";
            registerMessage.className = "message";
            return;
        }
        if (password.length < 8) {
            registerMessage.textContent = "Password must be at least 8 characters.";
            registerMessage.className = "message";
            return;
        }
        if (password !== confirm) {
            registerMessage.textContent = "Passwords do not match.";
            registerMessage.className = "message";
            return;
        }

        registerMessage.textContent = "Creating admin account...";
        registerMessage.className = "message";

        try {
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            const uid = cred.user.uid;
            const shortId = uid.substring(0, 8);
            const now = Timestamp.now();

            await setDoc(doc(db, "users", uid), {
                name,
                email,
                role: "admin",
                status: "active",
                password: password,
                createdAt: now,
                updatedAt: now
            });

            const cashierEmail = `cashier.${shortId}@brewpoint.com`;
            const baristaEmail = `barista.${shortId}@brewpoint.com`;
            const cashierPass = "Cashier123";
            const baristaPass = "Barista123";

            let staffCreated = true;
            try {
                const cashierCred = await createUserWithEmailAndPassword(secondaryAuth, cashierEmail, cashierPass);
                await setDoc(doc(db, "users", cashierCred.user.uid), {
                    name: name + "'s Cashier",
                    email: cashierEmail,
                    role: "cashier",
                    status: "active",
                    password: cashierPass,
                    adminId: uid,
                    createdAt: now,
                    updatedAt: now
                });
                await signOut(secondaryAuth);

                const baristaCred = await createUserWithEmailAndPassword(secondaryAuth, baristaEmail, baristaPass);
                await setDoc(doc(db, "users", baristaCred.user.uid), {
                    name: name + "'s Barista",
                    email: baristaEmail,
                    role: "barista",
                    status: "active",
                    password: baristaPass,
                    adminId: uid,
                    createdAt: now,
                    updatedAt: now
                });
                await signOut(secondaryAuth);
            } catch (staffErr) {
                console.error("Auto-create staff error:", staffErr);
                staffCreated = false;
            }

            await signOut(auth);

            if (staffCreated) {
                registerMessage.innerHTML =
                    `Admin "${name}" created!<br>` +
                    `<small style="display:block;margin-top:8px;line-height:1.6;">` +
                    `Your dedicated staff accounts:<br>` +
                    `<strong>Cashier</strong> — ${cashierEmail} / ${cashierPass}<br>` +
                    `<strong>Barista</strong> — ${baristaEmail} / ${baristaPass}</small>`;
            } else {
                registerMessage.textContent = `Admin "${name}" created, but staff failed. Add them manually after login.`;
            }
            registerMessage.className = "message good";

            document.getElementById("regName").value = "";
            document.getElementById("regEmail").value = "";
            document.getElementById("regPassword").value = "";
            document.getElementById("regConfirm").value = "";

            setTimeout(() => {
                isRegisterMode = false;
                registerForm.classList.add("hidden");
                loginForm?.classList.remove("hidden");
                if (toggleBtn) toggleBtn.textContent = "Don't have an admin account? Register";
                if (loginMessage) {
                    loginMessage.innerHTML = staffCreated
                        ? `Admin created. Sign in.<br><small>Cashier: ${cashierEmail} / ${cashierPass} · Barista: ${baristaEmail} / ${baristaPass}</small>`
                        : "Admin account created. Please sign in.";
                    loginMessage.className = "message good";
                }
            }, 4000);

        } catch (error) {
            console.error("Register Error:", error);
            let msg = error.message || "Failed to create account.";
            if (error.code === "auth/email-already-in-use") msg = "That email is already registered.";
            if (error.code === "auth/invalid-email") msg = "Invalid email address.";
            if (error.code === "auth/weak-password") msg = "Password is too weak (min 8 characters).";
            registerMessage.textContent = msg;
            registerMessage.className = "message";
        }
    });
}