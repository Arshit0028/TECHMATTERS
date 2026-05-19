require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User");

const createAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const existing = await User.findOne({ email: "admin@techmatters.com" });
    if (existing) {
      console.log("Admin already exists");
      process.exit();
    }
    const admin = new User({
      name: "Super Admin",
      email: "admin@techmatters.com",
      password: "Admin@Techmatters",
      role: "admin",
    });
    await admin.save();
    console.log("Admin user created successfully!");
    console.log("Email: admin@techmatters.com");
    console.log("Password: Admin@Techmatters");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

createAdmin();
