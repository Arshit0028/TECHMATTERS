require("dotenv").config();
const mongoose = require("mongoose");
const Project = require("./models/Project");

const projects = [
  {
    name: "E-commerce Platform",
    client: "Retail Corp",
    description: "Online store",
    status: "active",
  },
  {
    name: "Mobile App",
    client: "Startup XYZ",
    description: "React Native app",
    status: "active",
  },
  {
    name: "Internal CRM",
    client: "TechMatters",
    description: "Customer management",
    status: "active",
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    await Project.deleteMany({});
    await Project.insertMany(projects);
    console.log("Projects seeded successfully");
    process.exit();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

seed();
