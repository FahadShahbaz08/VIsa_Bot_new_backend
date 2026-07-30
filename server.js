// server.js
require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const connectDB = require("./config/db");
const cors = require("cors");

const authRoutes = require("./routes/auth.route");
const adminRoutes = require("./routes/admin.route");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// const uri = process.env.MONGODB_URI;
connectDB();

app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
