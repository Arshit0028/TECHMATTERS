require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);

  // Update by email – CHANGE THIS EMAIL TO YOURS
  const result = await User.updateOne(
    { email: "admin@techmatters.com" }, // ❗ CHANGE THIS
    { $set: { accessLevel: "entry" } },
  );

  console.log(
    `Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`,
  );

  // Also check if the user exists
  const user = await User.findOne({ email: "admin@techmatters.com" });
  if (user) {
    console.log(
      `User found: ${user.name}, accessLevel is now "${user.accessLevel}"`,
    );
  } else {
    console.log("User not found with that email.");
  }

  process.exit();
}
fix();
