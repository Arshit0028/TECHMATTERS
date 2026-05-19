require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

async function fixRoles() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await User.updateMany(
    { accessLevel: { $exists: false } },
    { $set: { accessLevel: "super-admin" } },
  );
  console.log(`✅ Updated ${result.modifiedCount} users with role.`);
  process.exit();
}
fixRoles();
