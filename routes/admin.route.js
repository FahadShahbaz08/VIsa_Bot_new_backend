// routes/admin.js
const express = require("express");
const router = express.Router();
const User = require("../model/user.schema");
const UserDevice = require("../model/userDevices.schema");
const Payment = require("../model/payment.schema");
const bcrypt = require("bcrypt");

// NOTE: In production protect these endpoints with admin auth. For demo we keep simple.

router.post("/create-user", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      allowedDevicesCount = 1,
      status = "active",
    } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ message: "missing fields" });

    const existing = await User.findOne({ $or: [{ username }, { email }] });
    if (existing)
      return res
        .status(400)
        .json({ message: "username or email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username,
      email,
      passwordHash,
      allowedDevicesCount,
      status,
    });
    await user.save();

    // create blank UserDevice doc
    await new UserDevice({ userId: user._id, devices: [] }).save();

    res.json({ message: "User created", userId: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
});

router.post("/update-payment", async (req, res) => {
  try {
    const {
      userId,
      paymentType = "online",
      paymentDate,
      nextSubmissionDate,
      pending = false,
      notes,
    } = req.body;
    if (!userId || !paymentDate)
      return res
        .status(400)
        .json({ message: "userId and paymentDate required" });

    const p = new Payment({
      userId,
      paymentType,
      paymentDate: new Date(paymentDate),
      nextSubmissionDate: nextSubmissionDate
        ? new Date(nextSubmissionDate)
        : undefined,
      pending,
      notes,
    });
    await p.save();
    res.json({ message: "Payment record saved", paymentId: p._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
});

router.post("/add-device", async (req, res) => {
  try {
    const { userId, macAddress } = req.body;
    if (!userId || !macAddress)
      return res
        .status(400)
        .json({ message: "userId and macAddress required" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const userDevices =
      (await UserDevice.findOne({ userId })) ||
      new UserDevice({ userId, devices: [] });

    if (userDevices.devices.some((d) => d.macAddress === macAddress)) {
      return res.status(400).json({ message: "Device already registered" });
    }

    if (userDevices.devices.length >= (user.allowedDevicesCount || 0)) {
      return res.status(403).json({ message: "No space to add new device" });
    }

    userDevices.devices.push({ macAddress, addedAt: new Date() });
    await userDevices.save();
    return res.json({ message: "Device added" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
