const mongoose = require("mongoose");
require("dotenv").config();

mongoose.set("strictQuery", false);

mongoose
    .connect(process.env.DATABASE_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => {
        console.log("Mongoose connected");
    })
    .catch((e) => {
        console.error("Database connection failed:", e);
    });

    const userSchema = new mongoose.Schema({
        username: {
            type: String,
            required: true,
            unique: true
        },
        email: {
            type: String,
            required: true,
            unique: true
        },
        password: {
            type: String,
            required: true
        },
        resetToken: {
            type: String, // Store the token
            default: null
        },
        resetTokenExpiry: {
            type: Date, // Store the expiry time
            default: null
        },
        notes: { 
            type: String, 
            default: "" 
        }  // New field for user notes
    });

const UserCollection = mongoose.model("UserCollection", userSchema);

    // Schema for test users (separate collection)
    const testUserSchema = new mongoose.Schema({
        username: {
            type: String,
            required: true,
            unique: true,
        },
        password: { // Store the hashed password
            type: String,
            required: true,
        }
    });
    

    const TestUserCollection = mongoose.model("TestUserCollection", testUserSchema); 

    module.exports = { UserCollection, TestUserCollection };


