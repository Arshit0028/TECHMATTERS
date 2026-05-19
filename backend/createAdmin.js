require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const existing = await User.findOne({ email: "admin@techmatters.com" });

    if (existing) {
      // Already exists — just fix the accessLevel
      existing.accessLevel = "super-admin";
      existing.role = "admin";
      await existing.save();
      console.log(
        "✅ Admin already existed — accessLevel updated to super-admin",
      );
      console.log(`Name: ${existing.name}`);
      console.log(`Email: ${existing.email}`);
      console.log(`accessLevel: ${existing.accessLevel}`);
      process.exit();
    }

    const admin = new User({
      name: "Super Admin",
      email: "admin@techmatters.com",
      password: "Admin@Techmatters",
      role: "admin",
      accessLevel: "super-admin",
    });

    await admin.save();
    console.log("✅ Admin user created successfully!");
    console.log("Email: admin@techmatters.com");
    console.log("Password: Admin@Techmatters");
    console.log("accessLevel: super-admin");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

createAdmin();
