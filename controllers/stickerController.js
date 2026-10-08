const Sticker = require("../models/Sticker");

const makeUrl = (filename) => `/uploads/${filename}`;

const DEFAULT_STICKERS = [
  { name: "Rose", slug: "rose", cost: 20, imageUrl: makeUrl("Rose.png") },
  { name: "Balloon", slug: "balloon", cost: 20, imageUrl: makeUrl("Ballon.png") },
  { name: "Heart", slug: "heart", cost: 30, imageUrl: makeUrl("Heart.png") },
  { name: "Cupids", slug: "cupids", cost: 50, imageUrl: makeUrl("Cupids.png") }
];

async function ensureDefaults() {
  const count = await Sticker.countDocuments();

  // 🔥 IMPORTANT: reset if old wrong data exists
  if (count > 0) {
    const sample = await Sticker.findOne();
    if (sample.imageUrl.startsWith("utils")) {
      await Sticker.deleteMany({});
    } else {
      return;
    }
  }

  await Sticker.insertMany(
    DEFAULT_STICKERS.map((s) => ({ ...s, isCustom: false }))
  );
}

exports.listStickers = async (req, res) => {
  try {
    await ensureDefaults();

    const stickers = await Sticker.find().sort({
      isCustom: 1,
      cost: 1,
      name: 1
    });

    res.json({ stickers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/** Admin-only: create a sticker (slug unique). */
exports.createSticker = async (req, res) => {
  try {
    const { name, slug, cost, isCustom } = req.body;

    if (!name || !slug || cost === undefined) {
      return res.status(400).json({ message: "name, slug, cost required" });
    }

    const normalizedSlug = slug
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");

    let imageUrl = "";

    // ✅ If file uploaded
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    const sticker = await Sticker.create({
      name,
      slug: normalizedSlug,
      cost: Number(cost),
      imageUrl,
      isCustom: Boolean(isCustom ?? true)
    });

    res.status(201).json({ sticker });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.deleteSticker = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Sticker ID is required." });
    }

    const sticker = await Sticker.findById(id);
    if (!sticker) {
      return res.status(404).json({ message: "Sticker not found." });
    }

    await Sticker.deleteOne({ _id: id });

    return res.status(200).json({ message: "Sticker deleted successfully." });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};