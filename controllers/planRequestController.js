const PlanRequest = require("../models/PlanRequest");
const User = require("../models/User");
const mailer = require("../helper/mailer");
const { PLANS } = require("../helper/rules");
const { activatePlanPurchase } = require("./packageController");

function tokenUserId(req) {
  const u = req.user;
  if (!u) return null;
  return u.sub || u.id || u._id || null;
}

exports.createPlanRequest = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isActive) {
      return res.status(400).json({
        message: "You already have an active plan.",
        isActive: true,
        plan: user.plan,
      });
    }

    const pending = await PlanRequest.findOne({ userId, status: "pending" });
    if (pending) {
      return res.status(409).json({
        message:
          "Your plan request is already pending. Admin typically confirms within 20 minutes.",
        data: pending,
      });
    }

    const planName = String(req.body.planName || "").trim().toUpperCase();
    const plan = PLANS[planName];
    if (!plan) {
      return res.status(400).json({ message: "Invalid plan" });
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
    if (Number(plan.price) !== amount) {
      return res.status(400).json({
        message: `Amount must be ₹${plan.price} for ${planName}`,
      });
    }
    if (!transactionId && !upiId) {
      return res.status(400).json({
        message: "Transaction ID or UPI ID is required",
      });
    }
    if (!req.file) {
      return res.status(400).json({ message: "Payment screenshot is required" });
    }

    const request = await PlanRequest.create({
      userId,
      planName,
      name,
      email,
      amount,
      transactionId,
      upiId,
      attachment: `/uploads/${req.file.filename}`,
      status: "pending",
    });

    await Promise.allSettled([
      mailer.notifyAdminNewPlanRequest(request),
      mailer.notifyUserPlanRequestReceived(email, name, planName),
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

exports.getMyPlanRequest = async (req, res) => {
  try {
    const userId = tokenUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    const latest = await PlanRequest.findOne({ userId }).sort({ createdAt: -1 });
    return res.json({ data: latest || null });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.listPlanRequests = async (req, res) => {
  try {
    const requests = await PlanRequest.find()
      .populate("userId", "name email phone plan isActive hostApproved")
      .sort({ createdAt: -1 });
    return res.json({ data: requests });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};

exports.updatePlanRequestStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = String(req.body.status || "").toLowerCase();
    const adminNote = req.body.adminNote;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be approved or rejected" });
    }

    const request = await PlanRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }
    if (request.status !== "pending") {
      return res.status(400).json({
        message: `This request is already ${request.status}`,
      });
    }

    if (status === "approved") {
      const activated = await activatePlanPurchase(request.userId, request.planName);
      if (!activated.success) {
        return res.status(400).json({
          message: activated.message || "Could not activate plan",
        });
      }
    }

    request.status = status;
    if (adminNote !== undefined) request.adminNote = String(adminNote);
    request.reviewedAt = new Date();
    await request.save();

    if (status === "approved") {
      await mailer.notifyUserPlanApproved(
        request.email,
        request.name,
        request.planName
      );
    } else {
      await mailer.notifyUserPlanRejected(
        request.email,
        request.name,
        request.adminNote
      );
    }

    const populated = await PlanRequest.findById(id).populate(
      "userId",
      "name email phone plan isActive hostApproved"
    );

    return res.json({
      message:
        status === "approved"
          ? "Payment verified. Plan is now active and host privilege is unlocked."
          : "Request rejected. User has been emailed.",
      data: populated,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message || "Server error" });
  }
};
