// routes/admin.js
const express = require("express");
const router = express.Router();
const User = require("../model/user.schema");
const UserDevice = require("../model/userDevices.schema");
const Payment = require("../model/payment.schema");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

// Admin access is intentionally unauthenticated for this personal installation.
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

router.get("/users", async (req, res) => {
  try {
    const users = await User.find()
      .select("username email allowedDevicesCount status createdAt lastLoginAt")
      .sort({ createdAt: -1 })
      .lean();
    const deviceRecords = await UserDevice.find({
      userId: { $in: users.map((user) => user._id) },
    }).lean();
    const devicesByUser = new Map(
      deviceRecords.map((record) => [String(record.userId), record.devices || []])
    );

    res.json({
      users: users.map((user) => ({
        id: String(user._id),
        username: user.username,
        email: user.email,
        allowedDevicesCount: user.allowedDevicesCount,
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt || null,
        devices: devicesByUser.get(String(user._id)) || [],
      })),
    });
  } catch (err) {
    console.error("Admin operation failed");
    res.status(500).json({ message: "server error" });
  }
});

const createUser = async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      allowedDevicesCount = 1,
      status = "active",
    } = req.body || {};
    const name = typeof username === "string" ? username.trim() : "";
    const address = typeof email === "string" ? email.trim().toLowerCase() : "";
    const count = allowedDevicesCount;
    if (!name || name.length > 100 || address.length > 254 || !/^\S+@\S+\.\S+$/.test(address) || typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "Username, valid email, and password of at least 8 characters (maximum 72 UTF-8 bytes) required" });
    }
    if (!Number.isInteger(count) || count < 1 || count > 100 || !["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Invalid device limit or status" });
    }

    const existing = await User.findOne({ $or: [{ username: name }, { email: address }] });
    if (existing)
      return res
        .status(409)
        .json({ message: "username or email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username: name,
      email: address,
      passwordHash,
      allowedDevicesCount: count,
      status,
    });
    await user.save();

    // Login/add-device creates the device record lazily; creation stays a single write.

    res.status(201).json({ message: "User created", userId: user._id });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "username or email already exists" });
    }
    console.error("Admin operation failed");
    res.status(500).json({ message: "server error" });
  }
};

router.post("/users", createUser);
router.post("/create-user", createUser);

router.patch("/users/:id/device-limit", async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    const count = req.body?.allowedDevicesCount;
    if (!Number.isInteger(count) || count < 1 || count > 100) {
      return res.status(400).json({ message: "Device limit must be an integer from 1 to 100" });
    }
    // Only change the limit; keep registered devices and other account fields.
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { allowedDevicesCount: count } },
      { new: true, runValidators: true }
    ).select("allowedDevicesCount");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Device limit updated", userId: user._id, allowedDevicesCount: user.allowedDevicesCount });
  } catch {
    console.error("Device limit update failed");
    res.status(500).json({ message: "Unable to update device limit" });
  }
});


router.post("/users/:id/reset-devices", async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const previous = await UserDevice.findOneAndUpdate(
      { userId: user._id },
      { $set: { devices: [] } },
      { new: false }
    );
    res.json({ message: "Devices reset", userId: user._id, cleared: previous?.devices.length || 0 });
  } catch (err) {
    console.error("Admin operation failed");
    res.status(500).json({ message: "server error" });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    if (!mongoose.isObjectIdOrHexString(req.params.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    await Promise.all([
      UserDevice.deleteMany({ userId: user._id }),
      Payment.deleteMany({ userId: user._id }),
    ]);
    // Delete the user last so a failed cleanup can be retried with the same ID.
    await User.deleteOne({ _id: user._id });
    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Admin operation failed");
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
    console.error("Admin operation failed");
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
    console.error("Admin operation failed");
    res.status(500).json({ message: "server error" });
  }
});

module.exports = router;
