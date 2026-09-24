const mongoose = require("mongoose");

async function connectDatabase() {
  const configured = Boolean(process.env.MONGO_URI?.trim());
  console.log("MONGO_URI configured:", configured);
  if (!configured) throw new Error("MONGO_URI is not configured");
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("MongoDB connected");
  } catch {
    // Driver error messages may contain credentials or the connection string.
    throw new Error("Database connection failed. Check backend configuration and database availability.");
  }
}
module.exports = connectDatabase;
