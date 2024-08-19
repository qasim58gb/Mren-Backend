const User = require("../Model/userModel");
const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");

const protect = asyncHandler(async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      res.status(401);
      throw new Error("Unauthorized user, please log in");
    }

    const verified = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(verified.id).select("-password");

    if (!user) {
      res.status(404);
      throw new Error("User not found");
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    throw new Error("Unauthorized user, please log in");
  }
});

const adminOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorize user as a admin");
  }
});

const authorOnly = asyncHandler(async (req, res, next) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    next();
  } else {
    res.status(401);
    throw new Error("Not authorize user as a author");
  }
});

const isVerifiedOnly = asyncHandler(async (req, res, next) => {
  if (req.user && req.user.isVerified) {
    next();
  } else {
    res.status(401);
    throw new Error("account is not verified");
  }
});

module.exports = {
  protect,
  adminOnly,
  authorOnly,
  isVerifiedOnly,
};
