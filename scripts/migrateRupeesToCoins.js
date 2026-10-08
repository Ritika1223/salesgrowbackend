require("dotenv").config();

const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(uri);

  const factor = 10;
  const migrationName = "2026-04-23_rupees_to_coins_x10";

  const migrations = mongoose.connection.db.collection("migrations");
  const alreadyRan = await migrations.findOne({ name: migrationName });
  if (alreadyRan) {
    console.log(`Migration already applied: ${migrationName}`);
    return;
  }

  const users = mongoose.connection.db.collection("users");
  const stickers = mongoose.connection.db.collection("stickers");
  const messages = mongoose.connection.db.collection("messages");
  const walletTransactions = mongoose.connection.db.collection("wallettransactions");

  const [uRes, sRes, mRes, wtRes] = await Promise.all([
    users.updateMany(
      { walletBalance: { $type: "number" } },
      { $mul: { walletBalance: factor } }
    ),
    stickers.updateMany(
      { cost: { $type: "number" } },
      { $mul: { cost: factor } }
    ),
    messages.updateMany(
      { cost: { $type: "number" } },
      { $mul: { cost: factor } }
    ),
    walletTransactions.updateMany(
      { amount: { $type: "number" } },
      { $mul: { amount: factor } }
    )
  ]);

  await migrations.insertOne({
    name: migrationName,
    factor,
    appliedAt: new Date(),
    results: {
      users: { matched: uRes.matchedCount, modified: uRes.modifiedCount },
      stickers: { matched: sRes.matchedCount, modified: sRes.modifiedCount },
      messages: { matched: mRes.matchedCount, modified: mRes.modifiedCount },
      walletTransactions: { matched: wtRes.matchedCount, modified: wtRes.modifiedCount }
    }
  });

  console.log("Migration applied.");
  console.log({
    users: { matched: uRes.matchedCount, modified: uRes.modifiedCount },
    stickers: { matched: sRes.matchedCount, modified: sRes.modifiedCount },
    messages: { matched: mRes.matchedCount, modified: mRes.modifiedCount },
    walletTransactions: { matched: wtRes.matchedCount, modified: wtRes.modifiedCount }
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (_) {
      // ignore
    }
  });

