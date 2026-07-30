const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    paymentType: {
      type: String,
      enum: ["online", "cash"],
      required: true,
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    nextSubmissionDate: {
      type: Date,
    },
    pending: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
