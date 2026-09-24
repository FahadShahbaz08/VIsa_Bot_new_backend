const express = require("express");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json({ limit: "16kb" }));
// Liveness endpoint. Startup does not listen until the database connects.
app.get("/", (req, res) => res.json({ status: "ok", message: "System is up and running" }));
app.use("/auth", require("./routes/auth.route"));
app.use("/admin", require("./routes/admin.route"));
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") return res.status(400).json({ message: "Invalid JSON body" });
  if (err.type === "entity.too.large") return res.status(413).json({ message: "Request body too large" });
  console.error("Request failed");
  res.status(500).json({ message: "Server error" });
});
module.exports = app;
