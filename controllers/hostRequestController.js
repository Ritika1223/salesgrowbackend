const HostRequest = require("../models/HostRequest");
const User = require("../models/User");
const mailer = require("../helper/mailer");

function tokenUserId(req) {
  const u = req.user;
  if (!u) return null;
  return u.sub || u.id || u._id || null;
}

exports.createHostRequest = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.hostApproved || user.profileMode === "host") {
      if (!user.hostApproved) {
        user.hostApproved = true;
        await user.save();
      }
      return res.status(400).json({
        message: "You already have host access. You can switch profile anytime.",
        hostApproved: true,
      });
    }

    const pending = await HostRequest.findOne({ userId, status: "pending" });
    if (pending) {
      return res.status(409).json({
        message:
          "Your host request is already pending. Admin typically confirms within 20 minutes.",
        data: pending,
      });
    }

    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const transactionId = String(req.body.transactionId || "").trim();
    const upiId = String(req.body.upiId || "").trim();
    const amount = Number(req.body.amount);

    if (!name) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!email) {
      return res.status(400).json({ message: "Email ID is mandatory" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Enter a valid amount" });
    }
    if (!transactionId && !upiId) {
      return res.status(400).json({
        message: "Transaction ID or UPI ID is required",
      });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Payment screenshot is required" });
    }

    const request = await HostRequest.create({
      userId,
      name,
      email,
      amount,
      transactionId,
      upiId,
      attachment: `/uploads/${req.file.filename}`,
      status: "pending",
    });

    await Promise.allSettled([
      mailer.notifyAdminNewHostRequest(request),
      mailer.notifyUserHostRequestReceived(email, name),
    ]);

    return res.status(201).json({
      message:
        "Admin will contact you as soon as possible. Confirmation time is maximum 20 minutes.",
      data: request,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.getMyHostRequest = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const latest = await HostRequest.findOne({ userId }).sort({ createdAt: -1 });
    return res.json({ data: latest || null });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.listHostRequests = async (req, res) => {
  try {
    const requests = await HostRequest.find()
      .populate("userId", "name email phone profileMode hostApproved")
      .sort({ createdAt: -1 });
    return res.json({ data: requests });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.updateHostRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = String(req.body.status || "").toLowerCase();
    const adminNote = req.body.adminNote;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or rejected" });
    }

    const request = await HostRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({
        message: `This request is already ${request.status}`,
      });
    }

    request.status = status;
    if (adminNote !== undefined) request.adminNote = String(adminNote);
    request.reviewedAt = new Date();
    await request.save();

    const user = await User.findById(request.userId);

    if (status === "approved" && user) {
      user.hostApproved = true;
      user.profileMode = "host";
      await user.save();
      await mailer.notifyUserHostApproved(request.email, request.name);
    } else {
      await mailer.notifyUserHostRejected(
        request.email,
        request.name,
        request.adminNote
      );
    }

    const populated = await HostRequest.findById(id).populate(
      "userId",
      "name email phone profileMode hostApproved"
    );

    return res.json({
      message:
        status === "approved"
          ? "Payment verified. User is now a host."
          : "Request rejected. User has been emailed.",
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
