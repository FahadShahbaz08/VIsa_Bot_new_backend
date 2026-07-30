// routes/auth.js
const express = require("express");
const router = express.Router();
const User = require("../model/user.schema");
const UserDevice = require("../model/userDevices.schema");
const Payment = require("../model/payment.schema");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "secret";

// helper to check payment pending (customize as required)
async function isPaymentPending(userId) {
  // find latest payment by createdAt
  const p = await Payment.findOne({ userId }).sort({ createdAt: -1 });
  if (!p) return false; // no payment => interpret as OK or pending? adjust per policy
  // Interpret pending if `pending` true OR nextSubmissionDate in past
  if (p.pending) return true;
  if (p.nextSubmissionDate && new Date() > p.nextSubmissionDate) return true;
  return false;
}

/**
 * Login endpoint
 * expects { usernameOrEmail, password, macAddress }
 */
router.post("/login", async (req, res) => {
  try {
    const { usernameOrEmail, password, macAddress } = req.body;
    if (!usernameOrEmail || !password || !macAddress) {
      return res
        .status(400)
        .json({ message: "usernameOrEmail, password and macAddress required" });
    }

    // find user by username or email
    const user = await User.findOne({
      $or: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
    });
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    if (user.status !== "active")
      return res.status(403).json({ message: "User is inactive" });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });

    // check payment pending
    const pending = await isPaymentPending(user._id);
    if (pending) {
      return res
        .status(403)
        .json({ message: "Payment pending. Please clear dues." });
    }

    // device logic
    let userDevices = await UserDevice.findOne({ userId: user._id });
    if (!userDevices) {
      // create entry if none exists
      userDevices = new UserDevice({ userId: user._id, devices: [] });
    }

    const macExists = userDevices.devices.some(
      (d) => d.macAddress === macAddress
    );

    if (!macExists) {
      // check allowed space
      if (userDevices.devices.length < (user.allowedDevicesCount || 0)) {
        // add device
        userDevices.devices.push({ macAddress, addedAt: new Date() });
        await userDevices.save();
      } else {
        return res.status(403).json({
          message: "Device limit reached. Cannot login from this new device.",
        });
      }
    }

    // success: create JWT
    const payload = { userId: user._id, username: user.username };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "1d" });

    user.lastLoginAt = new Date();
    await user.save();

    return res.json({ message: "Login successful", token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
