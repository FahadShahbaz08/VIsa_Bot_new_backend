const mongoose = require("mongoose");

const userDevicesSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true,
  },
  devices: [
    {
      macAddress: String,
      addedAt: {
        type: Date,
        default: Date.now,
      },
    },
  ],
});

module.exports = mongoose.model("UserDevices", userDevicesSchema);
