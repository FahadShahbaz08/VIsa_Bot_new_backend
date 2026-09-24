const mongoose = require("mongoose");

let connecting;

async function connectDatabase() {
  // Reuse a warm function's connection and share an in-flight cold-start attempt.
  if (mongoose.connection.readyState === 1) return mongoose;
  if (connecting) return connecting;
  const configured = Boolean(process.env.MONGO_URI?.trim());
  console.log("MONGO_URI configured:", configured);
  if (!configured) {
    const error = new Error("MONGO_URI is not configured on the backend.");
    error.code = "DATABASE_NOT_CONFIGURED";
    throw error;
  }
  connecting = (async () => {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
      console.log("MongoDB connected");
      return mongoose;
    } catch {
      // Raw driver errors can contain the URI or credentials.
      const error = new Error("Database connection failed. Check backend MONGO_URI and MongoDB network access.");
      error.code = "DATABASE_UNAVAILABLE";
      throw error;
    }
  })();
  try {
    return await connecting;
  } finally {
    // A failed cold start must not poison later requests; allow a fresh attempt.
    connecting = undefined;
  }
}
module.exports = connectDatabase;
