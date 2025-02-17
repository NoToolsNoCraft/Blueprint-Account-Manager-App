const express = require('express');
const router = express.Router(); // Router created FIRST
const { TestUserCollection, UserCollection } = require('./mongo'); // Combined requires
const bcrypt = require('bcrypt');
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const path = require("path");

const projectRoot = path.join(__dirname, '..'); // Assuming 'src' is directly under the project root.
router.use(express.json());  // Middleware applied to the router
router.use(express.urlencoded({ extended: true })); // Middleware applied to the router


// Set up nodemailer transporter for Zoho (put this outside the routes)
const transporter = nodemailer.createTransport({
    host: "smtp.zoho.eu",
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});


//Middleware
router.use(async (req, res, next) => {
    console.log("Session User:", req.session?.user);
    if (req.session && req.session.user) {
        req.user = await UserCollection.findById(req.session.user._id);
        console.log("Attached User:", req.user);
    } else {
        const authHeader = req.header('X-Test-Auth');
        if (authHeader) {
            const [username, password] = authHeader.split(':');
            const user = await TestUserCollection.findOne({ username });
            if (user && user.password === password) {
                req.user = user;
                console.log("Test Auth User:", req.user);
            }
        }
    }
    next();
});




// Registration API
router.post('/register', async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        const existingUser = await UserCollection.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(400).json({ message: "User already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // *** THIS IS THE CRUCIAL LOGGING STEP ***
        console.log("Hashed Password (Registration):", hashedPassword);

        const newUser = new UserCollection({ username, email, password: hashedPassword });
        await newUser.save();

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        console.error("Registration Error:", error); // More descriptive error message
        res.status(500).json({ message: "Error during registration" });
    }
});



router.post("/login", async (req, res) => {
    try {
        const { name, password } = req.body;

        // ✅ Check for missing fields and return 400
        if (!name) {
            return res.status(400).json({ message: "Username or email is required" });
        }
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }

        let user = await UserCollection.findOne({ $or: [{ username: name }, { email: name }] });

        if (!user) {
            return res.status(401).json({ message: "Invalid username or email" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid password" });
        }

        req.session.user = { _id: user._id, username: user.username, email: user.email };
        res.json({ message: "Login successful", user: { username: user.username, email: user.email } });

    } catch (error) {
        res.status(500).json({ message: "Error during login" });
    }
});



// Forgot Password API
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await UserCollection.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "User with this email does not exist." });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const expiryTime = Date.now() + 3600000;

        await UserCollection.updateOne({ email }, { $set: { resetToken, resetTokenExpiry: expiryTime } });

        const resetLink = `http://localhost:5001/reset-password/${resetToken}`; // Use your port

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Password Reset Request",
            html: `<p>Click the link to reset your password: <a href="<span class="math-inline">\{resetLink\}"\></span>{resetLink}</a></p><p>If you received this email by mistake or you think that someone else has used your email address, please feel free to contact us by replying to this message!</p>`, // HTML email
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
                return res.status(500).json({ message: "Error sending reset email" });
            }
            console.log("Email sent: " + info.response);
            res.json({ message: "Password reset email sent." });
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error during password reset request" });
    }
});



// Protected Routes

router.get('/users', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const users = await UserCollection.find({}, { username: 1, email: 1, _id: 0 }); // Projection
        res.json(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users" });
    }
});

router.post('/reset-password/:token', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    try {
        if (!newPassword || !confirmPassword || newPassword !== confirmPassword) {
            return res.status(400).json({ message: "Invalid password data" });
        }

        const user = await UserCollection.findOne({ resetToken: token, resetTokenExpiry: { $gt: Date.now() } });
        if (!user) {
            return res.status(400).json({ message: "Invalid or expired token" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await UserCollection.updateOne(
            { resetToken: token },
            { $set: { password: hashedPassword }, $unset: { resetToken: 1, resetTokenExpiry: 1 } }
        );

        res.json({ message: "Password reset successful" });
    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({ message: "Error resetting password" });
    }
});

router.post('/change-password', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    const { oldPassword, newPassword } = req.body;

    try {
        const user = await UserCollection.findById(req.user._id);
        if (!user || !(await bcrypt.compare(oldPassword, user.password))) {
          return res.status(401).json({ message: 'Invalid old password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await UserCollection.updateOne({ _id: req.user._id }, { $set: { password: hashedPassword } });

        res.json({ message: "Password changed successfully" });
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({ message: "Error changing password" });
    }
});


router.post('/delete-account', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    try {
        const result = await UserCollection.deleteOne({ _id: req.user._id });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        req.session.destroy((err) => {
            if (err) {
                console.error("Error destroying session:", err);
                return res.status(500).json({ message: 'Error during logout after deletion' });
            }
            res.json({ message: "Account deleted successfully" });
        });
    } catch (error) {
        console.error("Error deleting account:", error);
        res.status(500).json({ message: "Error deleting account" });
    }
});




router.post('/update-notes', async (req, res) => {
    console.log("Session User in /update-notes:", req.session?.user);

    // Ensure req.user is correctly set from the session user
    if (!req.user && req.session?.user?._id) {
        req.user = await UserCollection.findById(req.session.user._id);
        console.log("Manually retrieved user from session:", req.user);
    }

    // Edge case: If still no valid user, prevent updates
    if (!req.user || !req.user._id) {
        return res.status(401).json({ message: "Unauthorized: No valid user session" });
    }

    const { notes } = req.body;
    
    // Validate input
    if (!notes || typeof notes !== "string") {
        return res.status(400).json({ message: "Invalid request: 'notes' field is required and must be a string" });
    }

    try {
        // Ensure the update only applies to the logged-in user
        const updatedUser = await UserCollection.findByIdAndUpdate(
            req.user._id, 
            { notes }, 
            { new: true } // Return the updated document
        );

        if (!updatedUser) {
            return res.status(500).json({ message: "Failed to update notes: User not found" });
        }

        res.json({
            message: "Notes updated successfully",
            updatedFor: {
                username: updatedUser.username,
                email: updatedUser.email || "No email on record", // Ensure email always exists
            },
            notes: updatedUser.notes,
        });

    } catch (error) {
        console.error("Error updating notes:", error);
        res.status(500).json({ message: "Error updating notes" });
    }
});






router.get('/get-user-data', async (req, res) => {
    if (!req.user) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    try {
        const user = await UserCollection.findById(req.user._id);
        res.json({ notes: user.notes || "" });
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ message: "Error fetching user data" });
    }
});

module.exports = router;