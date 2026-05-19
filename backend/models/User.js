const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const permissionSchema = new mongoose.Schema(
  {
    module: {
      type: String,
      enum: ["projects", "tasks", "invoices"],
      required: true,
    },
    actions: {
      read: { type: Boolean, default: false },
      write: { type: Boolean, default: false },
      create: { type: Boolean, default: false },
      delete: { type: Boolean, default: false },
      import: { type: Boolean, default: false },
      export: { type: Boolean, default: false },
    },
  },
  { _id: false },
);

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  employeeId: { type: String, unique: true, sparse: true },
  joiningDate: { type: Date, default: Date.now },
  email: { type: String, required: true, unique: true },
  phone: { type: String, default: "" },
  bio: { type: String, default: "" },
  department: { type: String, default: "" },
  designation: { type: String, default: "" },
  resume: { type: String, default: "" },
  reportingManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  password: { type: String, required: true },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  accessLevel: {
    type: String,
    enum: ["entry", "tech", "manager", "admin", "super-admin"],
    default: "entry",
  },
  permissions: [permissionSchema],
  createdAt: { type: Date, default: Date.now },
});

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
