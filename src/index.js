const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const session = require("express-session"); // Import express-session
const { UserCollection } = require("./mongo");
const bcrypt = require("bcrypt");
const MongoStore = require("connect-mongo");
const crypto = require("crypto"); // For generating random tokens
const nodemailer = require("nodemailer"); // For sending emails

dotenv.config();

const app = express();
const PORT = 5002;

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Set up express-session middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET, 
        resave: false,
        saveUninitialized: true,
        store: MongoStore.create({
            mongoUrl: process.env.DATABASE_URL,
            collectionName: "sessions",
        }),
    })
);


// Connecting the api.js file
const apiRoutes = require('./api'); // Path to your api.js file
app.use('/api', apiRoutes); // Mount the API routes under /api

// Generate a reset token with expiration
const token = crypto.randomBytes(20).toString('hex');
const expiryDate = Date.now() + 3600000; // 1 hour from now


// Get the absolute path to your project's root directory.  Adjust as necessary.
const projectRoot = path.join(__dirname, '..'); // Assuming 'src' is directly under the project root.
//If your folder is directly under the project root use:
//const projectRoot = __dirname;
const successfulRegistrationPath = path.join(projectRoot, 'tempelates', 'successfulRegistration.html');
const passwordResetEmailSent = path.join(projectRoot, 'tempelates', 'passwordResetEmailSent.html');
const passwordResetSuccessful = path.join(projectRoot, 'tempelates', 'passwordResetSuccessful.html');


// Wrap the await code inside an async function
(async function updateUserToken() {
    const userEmail = 'user@example.com'; // Make sure this value is dynamically provided
    const token = crypto.randomBytes(20).toString('hex');
    const expiryDate = Date.now() + 3600000; // 1 hour from now

    // Store the token and expiry in the user record
    await UserCollection.updateOne(
        { email: userEmail },
        { 
            $set: { resetToken: token, resetTokenExpiry: expiryDate }
        }
    );

    // Handle password reset after token validation
    await UserCollection.updateOne(
        { resetToken: token, resetTokenExpiry: { $gt: Date.now() } },
        { 
            $set: { password: "hashedPassword" }, // Example hashed password, make sure to hash it first
            $unset: { resetToken: 1, resetTokenExpiry: 1 }
        }
    );
})();




const templatePath = path.join(__dirname, "../tempelates");
const publicPath = path.join(__dirname, "../public");

app.set("view engine", "hbs");
app.set("views", templatePath);
app.use(express.static(publicPath));

// Set up nodemailer transporter for Zoho
const transporter = nodemailer.createTransport({
    host: "smtp.zoho.eu", // Use the European SMTP server
    port: 465,  // SSL port
    secure: true,  // Use SSL
    auth: {
        user: process.env.EMAIL_USER,  // Your Zoho email (e.g., user@zoho.eu)
        pass: process.env.EMAIL_PASS,  // Your Zoho password or App Password (if 2FA is enabled)
    },
});

// Routes

app.get("/", (req, res) => {
    if (req.session.user) {
        res.render("home", { naming: req.session.user.username }); // Show dashboard if logged in
    } else {
        res.render("home", { showAuthButtons: true }); // Show login/register buttons if not logged in
    }
});


// Render login page (GET request)
app.get("/login", (req, res) => {
    res.render("login"); // Assuming you have a 'login.hbs' template
});

// Render register page (GET request)
app.get("/register", (req, res) => {
    res.render("register"); // Assuming you have a 'register.hbs' template
});


app.post("/register", async (req, res) => {
    try {
        const { username, email, password, confirmPassword } = req.body;

        // Ensure passwords match
        if (password !== confirmPassword) {
            return res.status(400).send("Passwords do not match");
        }

        // Check if user already exists
        const existingUser = await UserCollection.findOne({ email });
        if (existingUser) return res.status(400).send("User already registered");

        // Hash password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        // Log the hashed password for debugging
        console.log("Hashed Password:", hashedPassword); // Compare with what's saved in the database

        // Save user in UserCollection
        const newUser = new UserCollection({ username, email, password: hashedPassword });
        await newUser.save();

        res.sendFile(successfulRegistrationPath);

    } catch (error) {
        console.error(error);
        res.status(500).send("Error during registration");
    }
});



app.post("/login", async (req, res) => {
    try {
        const { name, password } = req.body; // Use 'name' from the form

        // Try finding the user by username first
        let user = await UserCollection.findOne({ username: name });

        // If not found by username, try finding by email
        if (!user) {
            user = await UserCollection.findOne({ email: name });
        }

        if (!user) return res.status(401).send("Invalid username or email"); // Indicate either is invalid

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).send("Invalid password");

        req.session.user = user;  // Store the user in session

        // Send the successful login message with redirect URL
        res.json({
            message: "Login successful",
            redirectUrl: "/"
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error during login");
    }
});





// Render password reset page (GET request)
app.get("/reset-password", (req, res) => {
    res.render("reset-password"); // This should be a form where user can enter their email
});


// Handle reset password request (POST request)
app.post("/request-reset", async (req, res) => {
    try {
        const { email } = req.body;

        const user = await UserCollection.findOne({ email });
        if (!user) {
            return res.status(400).send("No user found with that email address");
        }

        // Generate a secure reset token with expiration
        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour expiry

        // Store token in the database with an expiry time
        await UserCollection.updateOne(
            { email },
            { $set: { resetToken, resetTokenExpiry } }
        );

        const resetLink = `https://blueprint-account-manager-app-production.up.railway.app/reset-password/${resetToken}`;

        // Send reset link via email using nodemailer
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Password Reset Request",
            text: `Click the link to reset your password: ${resetLink} \nIf you received this email by mistake or you think that someone else has used your email address, \nplease feel free to contact us by replying to this message!`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
                return res.status(500).send("Error sending reset email");
            }
            console.log("Email sent: " + info.response);
            res.sendFile(passwordResetEmailSent);
        });
    } catch (error) {
        console.error(error);
        res.status(500).send("Error during password reset request");
    }
});


// Handle reset password form (GET request with token)
app.get("/reset-password/:token", async (req, res) => {
    const { token } = req.params;

    const user = await UserCollection.findOne({
        resetToken: token,
        resetTokenExpiry: { $gt: Date.now() }, // Check if token is still valid
    });

    if (!user) {
        return res.status(400).render("reset-password-form", {
            errorMessage: "Invalid or expired token",
        });
    }

    res.render("reset-password-form", { token });
});

// Handle password reset form submission (POST request with token)
app.post("/reset-password/:token", async (req, res) => {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (!newPassword || !confirmPassword) {
        return res.render("reset-password-form", {
            errorMessage: "Please enter both fields",
            token,
        });
    }

    if (newPassword !== confirmPassword) {
        return res.render("reset-password-form", {
            errorMessage: "Passwords do not match",
            token,
        });
    }

    const user = await UserCollection.findOne({
        resetToken: token,
        resetTokenExpiry: { $gt: Date.now() }, // Check if token is still valid
    });

    if (!user) {
        return res.render("reset-password-form", {
            errorMessage: "Invalid or expired token",
            token,
        });
    }

    // Hash and save the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await UserCollection.updateOne(
        { resetToken: token },
        { 
            $set: { password: hashedPassword },
            $unset: { resetToken: 1, resetTokenExpiry: 1 }, // Remove token after use
        }
    );

    res.sendFile(passwordResetSuccessful);
});



app.post("/forgot-password", async (req, res) => {
    const { email } = req.body;
    
    const user = await UserCollection.findOne({ email });

    if (!user) {
        return res.status(400).send("User with this email does not exist.");
    }

    // Generate a secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Store token in the database with an expiry time (1 hour)
    const expiryTime = Date.now() + 3600000; // 1 hour from now

    const updateResult = await UserCollection.updateOne(
        { email: email },
        { $set: { resetToken: resetToken, resetTokenExpiry: expiryTime } }
    );

    if (updateResult.modifiedCount === 0) {
        return res.status(500).send("Error saving reset token.");
    }

    // Generate the reset link
    const resetLink = `https://blueprint-account-manager-app-production.up.railway.app/reset-password/${resetToken}`;

    console.log("Reset link:", resetLink); // Debugging

    res.send(`Reset link has been generated: ${resetLink}`);
});

app.post("/change-password", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).send("Unauthorized"); // User not logged in
        }

        const { oldPassword, newPassword } = req.body;
        const user = await UserCollection.findOne({ _id: req.session.user._id }); // Use _id

        if (!user) {
            return res.status(404).send("User not found");
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(401).send("Incorrect old password");
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password
        await UserCollection.updateOne(
            { _id: req.session.user._id }, // Use _id for update
            { $set: { password: hashedPassword } }
        );

        res.send("Password updated successfully");
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).send("Error changing password");
    }
});


app.post("/delete-account", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).send("Unauthorized");
        }

        const { name } = req.body; // Get the username from the form

        // Verify the user (important before deleting!)
        if (name !== req.session.user.username) {
            return res.status(403).send("Forbidden: You can only delete your own account.");
        }

        const result = await UserCollection.deleteOne({ _id: req.session.user._id }); // Use _id

        if (result.deletedCount === 0) {
            return res.status(404).send("User not found");
        }

        // Destroy the session after successful deletion
        req.session.destroy(err => {
            if (err) return res.status(500).send('Error during logout after deletion');
            res.send("Account deleted successfully");
        });

    } catch (error) {
        console.error("Error deleting account:", error);
        res.status(500).send("Error deleting account");
    }
});


app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Logout error:", err);
            return res.status(500).send('Logout failed');
        }
        res.send('Logged out successfully'); // Or redirect: res.redirect('/');
    });
});


app.post("/update-notes", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { notes } = req.body;
        const userId = req.session.user._id;

        await UserCollection.findByIdAndUpdate(userId, { notes });

        res.json({ message: "Notes updated successfully" });
    } catch (error) {
        console.error("Error updating notes:", error);
        res.status(500).json({ message: "Error updating notes" });
    }
});


app.get("/get-user-data", async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const user = await UserCollection.findById(req.session.user._id);
        res.json({ notes: user.notes || "" });
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).json({ message: "Error fetching user data" });
    }
});


// Server Start
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
