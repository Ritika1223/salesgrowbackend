const BankDetails = require('../models/BankDetails');

// Add new bank (payment) detail
exports.addBankDetail = async (req, res) => {
  try {
    const { upi } = req.body;

    if (!upi) {
      return res.status(400).json({ message: "UPI is required." });
    }

    let qrCodeUrl = "";

    // Handle QR code image upload if present (similar to stickerController)
    if (req.file) {
      qrCodeUrl = `/uploads/${req.file.filename}`;
    } else {
      return res.status(400).json({ message: "QR code image file is required." });
    }

    const bankDetail = await BankDetails.create({
      upi,
      qrCode: qrCodeUrl,
    });

    res.status(201).json({ message: "Bank detail added successfully.", data: bankDetail });
  } catch (err) {
    res.status(500).json({ message: "Failed to add bank detail.", error: err.message });
  }
};

// Get all payment details (optionally filter by active/inactive)
exports.getBankDetails = async (req, res) => {
  try {
    // Accept optional query param: isActive (true/false)
    let filter = {};
    if (req.query.isActive === "true") filter.isActive = true;
    if (req.query.isActive === "false") filter.isActive = false;

    const bankDetails = await BankDetails.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ data: bankDetails });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch bank details.", error: err.message });
  }
};

// Delete a bank detail (by id)
exports.deleteBankDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const bankDetail = await BankDetails.findByIdAndDelete(id);

    if (!bankDetail) {
      return res.status(404).json({ message: "Bank detail not found." });
    }

    res.status(200).json({ message: "Bank detail deleted successfully." });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete bank detail.", error: err.message });
  }
};

// Set a bank detail as active/inactive
exports.setBankDetailStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: "isActive (boolean) is required in body." });
    }

    const bankDetail = await BankDetails.findByIdAndUpdate(id, { isActive }, { new: true });
    if (!bankDetail) {
      return res.status(404).json({ message: "Bank detail not found." });
    }

    res.status(200).json({ message: "Bank detail status updated.", data: bankDetail });
  } catch (err) {
    res.status(500).json({ message: "Failed to update status.", error: err.message });
  }
};



exports.getActiveBankDetail = async (req, res) => {
    try {
      // Find the first bank detail where isActive is true, ordered by creation date (most recent first)
      const activeBankDetail = await BankDetails.findOne({ isActive: true }).sort({ createdAt: -1 });
  
      if (!activeBankDetail) {
        return res.status(404).json({ message: "No active bank detail found." });
      }
  
      res.status(200).json({ data: activeBankDetail });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch active bank detail.", error: err.message });
    }
  };