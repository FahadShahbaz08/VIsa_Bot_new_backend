require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const app = express();
app.use(cors());
app.use(express.json({ limit: "16kb" }));
// Liveness only: this can succeed while the database is unavailable.
app.get("/", (req, res) => res.json({ status: "ok", message: "System is up and running" }));

// Vercel imports this app directly, so database startup cannot rely on server.js.
app.use(["/auth", "/admin"], async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database unavailable:", error.code);
    res.set("Cache-Control", "no-store");
    res.status(503).json({ code: error.code, message: error.message });
  }
});
app.use("/auth", require("./routes/auth.route"));
app.use("/admin", require("./routes/admin.route"));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request body too large" });
  console.error("Request failed");
  res.status(500).json({ message: "Server error" });
});
module.exports = app;
