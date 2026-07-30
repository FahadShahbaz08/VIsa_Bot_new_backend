const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    allowedDevicesCount: {
      type: Number,
      default: 2,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    lastLoginAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
