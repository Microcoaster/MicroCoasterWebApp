const express = require("express");
const { verifyAccessCode, testConnection } = require("../models/database");
const router = express.Router();

function requireAuth(req, res, next) {
  if (req.session.user_id) {
    next();
  } else {
    res.redirect("/login");
  }
}

router.get("/login", (req, res) => {
  if (req.session.user_id) {
    return res.redirect("/dashboard");
  }
  res.render("login", { 
    error: null,
    title: "MicroCoaster WebApp - Login" 
  });
});

router.post("/login", async (req, res) => {
  const { code } = req.body;
  let error = null;
  
  try {
    if (!code || code.trim() === "") {
      error = "Please enter your access code.";
    } else {
      const user = await verifyAccessCode(code.trim());
      if (user) {
        req.session.user_id = user.id;
        req.session.code = user.code;
        req.session.nickname = user.name;
        console.log("User authenticated:", user.name);
        return res.redirect("/dashboard");
      } else {
        error = "Invalid code. Please try again.";
      }
    }
  } catch (err) {
    console.error("Login error:", err);
    error = "Database connection error. Please try again later.";
  }
  
  res.render("login", { 
    error,
    title: "MicroCoaster WebApp - Login" 
  });
});

router.get("/logout", (req, res) => {
  const userName = req.session.nickname || "User";
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destroy error:", err);
    }
    console.log("User logged out:", userName);
    res.redirect("/login");
  });
});

router.get("/", (req, res) => {
  if (req.session.user_id) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/login");
  }
});

router.get("/test-db", async (req, res) => {
  const isConnected = await testConnection();
  res.json({ 
    database: isConnected ? "Connected" : "Disconnected",
    timestamp: new Date().toISOString() 
  });
});

module.exports = { router, requireAuth };
