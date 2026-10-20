require("dotenv").config();

const crypto = require("node:crypto");
const path = require("node:path");
const { spawn } = require("node:child_process");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a valid TCP port.");
}
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+[1-9]\d{7,14}$/;
const supportedLanguages = new Set([
    "as-IN", "bn-IN", "brx-IN", "doi-IN", "en-IN", "gu-IN", "hi-IN", "kn-IN",
    "ks-IN", "kok-IN", "mai-IN", "ml-IN", "mni-IN", "mr-IN", "ne-IN", "or-IN",
    "pa-IN", "sa-IN", "sat-IN", "sd-IN", "ta-IN", "te-IN", "ur-IN"
]);
const app = express();
const databasePath = process.env.YOJNA_DATABASE_PATH
    ? path.resolve(process.env.YOJNA_DATABASE_PATH)
    : path.join(__dirname, "yojnasetu.sqlite");
const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        phone TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email_verified_at INTEGER,
        phone_verified_at INTEGER,
        consent_at INTEGER,
        preferred_language TEXT NOT NULL DEFAULT 'hi-IN',
        created_at INTEGER NOT NULL
    );
`);

function migrateAccountTable() {
    const columns = db.prepare("PRAGMA table_info(accounts)").all();
    const verifiedColumns = columns.filter((column) =>
        column.name === "email_verified_at" || column.name === "phone_verified_at"
    );
    if (verifiedColumns.some((column) => column.notnull)) {
        db.transaction(() => {
            db.exec(`
                ALTER TABLE accounts RENAME TO accounts_before_consent_signup;
                CREATE TABLE accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL UNIQUE,
                    phone TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL,
                    email_verified_at INTEGER,
                    phone_verified_at INTEGER,
                    consent_at INTEGER,
                    preferred_language TEXT NOT NULL DEFAULT 'hi-IN',
                    created_at INTEGER NOT NULL
                );
                INSERT INTO accounts
                    (id, name, email, phone, password_hash, email_verified_at, phone_verified_at, created_at)
                SELECT id, name, email, phone, password_hash, email_verified_at, phone_verified_at, created_at
                FROM accounts_before_consent_signup;
                DROP TABLE accounts_before_consent_signup;
            `);
        })();
    } else {
        const columnNames = new Set(columns.map((column) => column.name));
        if (!columnNames.has("consent_at")) {
            db.exec("ALTER TABLE accounts ADD COLUMN consent_at INTEGER");
        }
        if (!columnNames.has("preferred_language")) {
            db.exec("ALTER TABLE accounts ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'hi-IN'");
        }
    }
    db.exec("DROP TABLE IF EXISTS pending_signups");
}
migrateAccountTable();

const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const sessionCookieName = "yojnasetu_session";
db.exec(`
    CREATE TABLE IF NOT EXISTS account_sessions (
        token_hash TEXT PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_sessions_expiry_idx
        ON account_sessions (expires_at);
`);

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function readSessionToken(req) {
    const cookieHeader = req.headers.cookie || "";
    const cookie = cookieHeader.split(";").map((part) => part.trim())
        .find((part) => part.startsWith(`${sessionCookieName}=`));
    const token = cookie?.slice(sessionCookieName.length + 1);
    return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

function issueSession(req, res, accountId) {
    const token = crypto.randomBytes(32).toString("hex");
    const now = Date.now();
    db.prepare("DELETE FROM account_sessions WHERE expires_at <= ?").run(now);
    db.prepare("INSERT INTO account_sessions (token_hash, account_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .run(hashSessionToken(token), accountId, now + sessionLifetimeMs, now);
    const secure = req.secure ? "; Secure" : "";
    res.setHeader(
        "Set-Cookie",
        `${sessionCookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(sessionLifetimeMs / 1000)}${secure}`
    );
}

function getSessionAccount(req) {
    const token = readSessionToken(req);
    if (!token) return null;
    const tokenHash = hashSessionToken(token);
    return db.prepare(`
        SELECT accounts.id, accounts.name, accounts.email, accounts.phone,
               accounts.preferred_language, accounts.created_at
        FROM account_sessions
        JOIN accounts ON accounts.id = account_sessions.account_id
        WHERE account_sessions.token_hash = ? AND account_sessions.expires_at > ?
    `).get(tokenHash, Date.now()) || null;
}

function sendProfile(res, account) {
    return res.json({
        id: account.id,
        accountId: `YS-${String(account.id).padStart(6, "0")}`,
        name: account.name,
        email: account.email,
        phone: account.phone,
        preferredLanguage: account.preferred_language,
        createdAt: account.created_at
    });
}

app.disable("x-powered-by");
app.use(helmet());
app.use((req, res, next) => {
    const origin = req.get("Origin");
    const isLocalDevelopmentOrigin =
        /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin || "");
    if (isLocalDevelopmentOrigin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    next();
});
app.use(express.json({ limit: "10kb" }));
app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
});

const signupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    message: { error: "Too many signup requests. Please try again in 15 minutes." }
});
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    message: { error: "Too many sign-in attempts. Please try again in 15 minutes." }
});
const indicMatcherLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    message: { error: "Please wait before searching again." }
});

const asyncHandler = (handler) => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
};

const pages = new Map([
    ["/signup.html", "signup.html"],
    ["/yojnasetu.css", "yojnasetu.css"],
    ["/yojnasetu.js", "yojnasetu.js"],
    ["/yojnasetu-logo.png", "yojnasetu-logo.png"]
]);
app.get("/", (req, res) => {
    return res.redirect(getSessionAccount(req) ? "/business-schemes.html" : "/yojnasetu.html");
});
app.get("/yojnasetu.html", (req, res) => {
    if (getSessionAccount(req)) return res.redirect("/business-schemes.html");
    return res.sendFile(path.join(__dirname, "yojnasetu.html"));
});
app.get("/business-schemes.html", (req, res) => {
    if (!getSessionAccount(req)) {
        return res.redirect("/yojnasetu.html?next=business-schemes.html");
    }
    return res.sendFile(path.join(__dirname, "business-schemes.html"));
});
app.get("/api/session", (req, res) => {
    const account = getSessionAccount(req);
    if (!account) return res.status(401).json({ error: "Please sign in to continue." });
    return sendProfile(res, account);
});
app.post("/api/login", loginLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!emailPattern.test(email) || !password || password.length > 128) {
        return res.status(400).json({ error: "Enter a valid email address and password." });
    }

    const account = db.prepare(`
        SELECT id, name, email, phone, password_hash, preferred_language, created_at
        FROM accounts
        WHERE email = ?
    `).get(email);
    if (!account || !await bcrypt.compare(password, account.password_hash)) {
        return res.status(401).json({ error: "Email or password is incorrect." });
    }

    issueSession(req, res, account.id);
    return sendProfile(res, account);
}));
app.post("/api/logout", (req, res) => {
    const token = readSessionToken(req);
    if (token) {
        db.prepare("DELETE FROM account_sessions WHERE token_hash = ?").run(hashSessionToken(token));
    }
    const secure = req.secure ? "; Secure" : "";
    res.setHeader("Set-Cookie", `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    return res.json({ signedOut: true });
});
for (const [url, filename] of pages) {
    app.get(url, (req, res) => res.sendFile(path.join(__dirname, filename)));
}

app.post("/api/indic-scheme-match", indicMatcherLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const language = typeof body.language === "string" ? body.language : "";
    if (text.length > 2000) {
        return res.status(400).json({ error: "Please keep your description under 2,000 characters." });
    }
    if (!/^(as|bn|brx|doi|en|gu|hi|kn|ks|kok|mai|ml|mni|mr|ne|or|pa|sa|sat|sd|ta|te|ur)-IN$/.test(language)) {
        return res.status(400).json({ error: "Choose a supported Indian language." });
    }

    const matcherPath = path.join(__dirname, "indic_scheme_matcher.py");
    const python = process.env.PYTHON_BIN || "python";
    const outcome = await new Promise((resolve) => {
        const child = spawn(python, [matcherPath], {
            cwd: __dirname,
            windowsHide: true,
            stdio: ["pipe", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, 8000);
        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
            stdout += chunk;
            if (stdout.length > 16000) child.kill();
        });
        child.stderr.on("data", (chunk) => {
            stderr = (stderr + chunk).slice(-2000);
        });
        child.once("error", (error) => {
            clearTimeout(timer);
            resolve({ error: error.message });
        });
        child.once("close", (code) => {
            clearTimeout(timer);
            resolve({ code, stdout, stderr, timedOut });
        });
        child.stdin.end(JSON.stringify({ text, language }));
    });

    if (outcome.error || outcome.code !== 0 || outcome.timedOut) {
        const reason = outcome.error || (outcome.timedOut ? "Python matcher timed out." : outcome.stderr.trim());
        console.error(`Indic scheme matcher unavailable: ${reason || "unknown error"}`);
        return res.status(503).json({
            error: "Language matching is temporarily unavailable. Your answers stay on this device; try again or use the business choices."
        });
    }

    try {
        const result = JSON.parse(outcome.stdout);
        if (!Array.isArray(result.tags) || !result.tags.every((tag) => typeof tag === "string")) {
            throw new Error("Matcher returned an invalid tag list.");
        }
        return res.json(result);
    } catch (error) {
        console.error(`Indic scheme matcher returned invalid output: ${error.message}`);
        return res.status(503).json({
            error: "Language matching is temporarily unavailable. Your answers stay on this device; try again or use the business choices."
        });
    }
}));

app.post("/api/signup", signupLimiter, asyncHandler(async (req, res) => {
    const body = req.body || {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const language = typeof body.language === "string" ? body.language : "";

    if (!name || name.length > 100) {
        return res.status(400).json({ error: "Enter a name of 1 to 100 characters." });
    }
    if (email.length > 254 || !emailPattern.test(email)) {
        return res.status(400).json({ error: "Enter a valid email address." });
    }
    if (!phonePattern.test(phone)) {
        return res.status(400).json({ error: "Enter a valid phone number with its country code, such as +919876543210." });
    }
    if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ error: "Your password must be between 8 and 128 characters." });
    }
    if (!supportedLanguages.has(language)) {
        return res.status(400).json({ error: "Choose a supported preferred language." });
    }
    if (body.consent !== true) {
        return res.status(400).json({ error: "Please review and accept the data-use consent before creating your account." });
    }

    const existingAccount = db.prepare("SELECT 1 FROM accounts WHERE email = ? OR phone = ?").get(email, phone);
    if (existingAccount) {
        return res.status(409).json({ error: "An account already exists for that email or phone number." });
    }

    const now = Date.now();
    const passwordHash = await bcrypt.hash(password, 12);
    try {
        db.prepare(`
            INSERT INTO accounts
                (name, email, phone, password_hash, consent_at, preferred_language, created_at)
            VALUES
                (?, ?, ?, ?, ?, ?, ?)
        `).run(name, email, phone, passwordHash, now, language, now);
    } catch (error) {
        if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return res.status(409).json({ error: "An account already exists for that email or phone number." });
        }
        throw error;
    }

    const account = db.prepare(`
        SELECT id, name, email, phone, preferred_language, created_at
        FROM accounts
        WHERE email = ?
    `).get(email);
    issueSession(req, res, account.id);
    return res.status(201).json({
        accountCreated: true,
        preferredLanguage: language,
        accountId: `YS-${String(account.id).padStart(6, "0")}`
    });
}));

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError && Object.hasOwn(error, "body")) {
        return res.status(400).json({ error: "Request body must contain valid JSON." });
    }
    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Request body must contain valid JSON." });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ error: "Request body is too large." });
    }
    console.error(`Request failed: ${error.message}`);
    return res.status(500).json({ error: "The server could not complete your request. Please try again." });
});

app.listen(port, "127.0.0.1", () => {
    console.log(`Yojna Setu is running at http://localhost:${port}`);
});
