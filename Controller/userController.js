const User = require("../Model/userModel");
const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const { generateToken, hashToken } = require("../Utils/utils");
const parser = require("ua-parser-js");
const jwt = require("jsonwebtoken");
const sendEmail = require("../Utils/sendEmail");
const crypto = require("crypto");
const Token = require("../Model/tokenModel");
const Cryptr = require("cryptr");
const { uploadOnCloudinary } = require("../Utils/uploadCloudinary");

const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// generate Access and Refresh token

const generateAccessRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false });
    return { accessToken, refreshToken };
  } catch (error) {
    res.status(500);
    throw new Error(
      "Something went wrong while generating referesh and access token"
    );
  }
};

// registerUser

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  // validation
  if (!name || !email || !password) {
    console.log(name);
    res.status(400);
    throw new Error("Please fill  the all input");
  }

  if (password.length < 6) {
    res.status(400);
    throw new Error("password should be 6 character");
  }

  // check user Already exist
  const userExist = await User.findOne({ email });
  if (userExist) {
    res.status(400);
    throw new Error("User Already exist");
  }

  // user-agent

  const ua = parser(req.headers["user-agent"]);
  console.log(ua);
  const userAgent = [ua.ua];
  console.log(userAgent);

  // Create new user
  const user = await User.create({
    name,
    email,
    password,
    userAgent,
  });

  // generate token
  const token = generateToken(user._id);
  console.log(token);

  // send http-only cookie
  res.cookie("token", token, {
    path: "/",
    httpOnly: true,
    expires: new Date(Date.now() + 6000 * 86400),
    sameSite: "none",
    secure: true,
  });

  // if user create
  if (user) {
    const { _id, name, email, password, role, isVerified, phone, bio, image } =
      user;
    res.status(201).json({
      _id,
      name,
      email,
      password,
      role,
      isVerified,
      phone,
      bio,
      image,
      token,
    });
  } else {
    res.status(400);
    throw new Error("incorrect information of user");
  }
});

// login user
const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  // validation
  if (!email) {
    res.status(400);
    throw new Error("Please fill all the email");
  }

  if (!password) {
    res.status(400);
    throw new Error("Please fill all the password");
  }
  // check user found
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User ont found. Please signUp");
  }
  const isPasswordCorrect = await bcrypt.compare(password, user.password);

  if (!isPasswordCorrect) {
    res.status(400);
    throw new Error("Invalid email or password");
  }

  // triger 2FA auth
  const ua = parser(req.headers["user-agent"]);
  const userAgent = ua.ua;

  const thisUserAgent = user.userAgent.includes(userAgent);

  if (!thisUserAgent) {
    const loginCode = Math.floor(100000 + Math.random() * 900000);
    console.log(loginCode);
    const cryptr = new Cryptr(process.env.CRYPTR_KEY);
    const userToken = cryptr.encrypt(loginCode.toString());

    let token = await Token.findOne({ userId: user._id });
    if (token) {
      await token.deleteOne();
    }

    // save login token
    await new Token({
      userId: user._id,
      lToken: userToken,
      createdAt: Date.now(),
      expireAt: Date.now() + 60 * (60 * 1000),
    }).save();

    res.status(400);
    throw new Error("New device has been detected");
  }

  const token = generateToken(user._id);

  if (email && password) {
    // send http-only cookie
    res.cookie("token", token, {
      path: "/",
      httpOnly: true,
      expires: new Date(Date.now() + 6000 * 86400),
      sameSite: "none",
      secure: true,
    });

    // if user login
    if (user) {
      const { _id, name, email, role, isVerified, phone, bio, image } = user;
      res.status(201).json({
        _id,
        name,
        email,
        role,
        isVerified,
        phone,
        bio,
        image,
        token,
      });
    } else {
      res.status(500);
      throw new Error("server error");
    }
  }
});

// send Login code
const sendLoginCode = asyncHandler(async (req, res) => {
  const { email } = req.params;

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const token = await Token.findOne({
    userId: user._id,
    expireAt: { $gt: Date.now() },
  });

  if (!token) {
    res.status(404);
    throw new Error("Invalid or expire token");
  }

  const loginCode = token.lToken;
  const cryptr = new Cryptr(process.env.CRYPTR_KEY);
  const decryptLoginCode = cryptr.decrypt(loginCode);
  console.log(decryptLoginCode);

  const subject = "Six digit Login Code";
  const send_to = email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = "noreply@noreply.com";
  const template = "loginCode";
  const name = user.name;
  const link = "#";
  const p1 = "Use the below code to login to your account";
  const p2 = "This link is valid for 1 hour";
  const btn_text = `${decryptLoginCode}`;

  // send email
  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      p1,
      p2,
      btn_text,
      {
        name,
        link,
      }
    );
    res.status(200).json({
      message: `login code Email sent to ${email}`,
    });
  } catch (error) {
    console.log(error);
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
});

// Login with code
const loginWithCode = asyncHandler(async (req, res) => {
  const { email } = req.params;
  const { loginCode } = req.body;
  // console.log(email, loginCode);

  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const token = await Token.findOne({
    userId: user._id,
    expireAt: { $gt: Date.now() },
  });

  if (!token) {
    res.status(404);
    throw new Error("Invalid or expire token");
  }

  const userToken = token.lToken;
  const cryptr = new Cryptr(process.env.CRYPTR_KEY);
  const decryptLoginCode = cryptr.decrypt(userToken);

  if (decryptLoginCode !== loginCode) {
    res.status(404);
    throw new Error("Invalid or expire token");
  } else {
    const ua = parser(req.headers["user-agent"]);
    const userAgent = ua.ua;
    user.userAgent.push(userAgent);
    await user.save();
    const token = generateToken(user._id);

    // send http-only cookie
    res.cookie("token", token, {
      path: "/",
      httpOnly: true,
      expires: new Date(Date.now() + 1000 * 86400),
      sameSite: "none",
      secure: true,
    });

    // if user login
    const { _id, name, email, role, isVerified } = user;
    res.status(201).json({
      _id,
      name,
      email,
      role,
      isVerified,
      token,
    });
  }
});
// send Verification email
const sendVerificationEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (user.isVerified) {
    res.status(400);
    throw new Error("User already verified");
  }

  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }
  // generate verification token
  const verificationToken = crypto.randomBytes(32).toString("hex") + user._id;
  console.log(verificationToken);

  // hash token
  const hashedToken = hashToken(verificationToken);
  await new Token({
    userId: user._id,
    vToken: hashedToken,
    createdAt: Date.now(),
    expireAt: Date.now() + 60 * (60 * 1000),
  }).save();

  // verification Url
  const verificationUrl = `${process.env.FRONTEND_URL}/verify/${verificationToken}`;

  const subject = "Vreify your Account ";
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = "noreply@noreply.com";
  const template = "verifyEmail";
  const name = user.name;
  const link = verificationUrl;
  const p1 = "Verify your account";
  const p2 = "This link is valid for 1 hours";
  const btn_text = `${verificationUrl}`;

  // send email
  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      p1,
      p2,
      btn_text,
      {
        name,
        link,
      }
    );
    res.status(200).json({
      message: "Email sent",
    });
  } catch (error) {
    console.log(error);
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
});
// verify user
const verifyUser = asyncHandler(async (req, res) => {
  const { verificationToken } = req.params;

  const hashedToken = hashToken(verificationToken);
  const userToken = await Token.findOne({
    vToken: hashedToken,
    expireAt: { $gt: Date.now() },
  });
  console.log(userToken);
  if (!userToken) {
    res.status(404);
    throw new Error("Invalid or expire token");
  }

  const user = await User.findOne({
    _id: userToken.userId,
  });

  if (user.isVerified) {
    res.status(400);
    throw new Error("user is already verified");
  }

  user.isVerified = true;
  await user.save();

  res.status(200).json({
    message: "your account is verified",
  });
});
// logout user
const logoutUser = asyncHandler(async (req, res) => {
  res.cookie("token", "", {
    path: "/",
    httpOnly: true,
    expires: new Date(0),
    sameSite: "none",
    secure: true,
  });
  res.send("logout successful");
});

// get user
const getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  console.log(user);
  if (user) {
    const { _id, name, email, role, isVerified, image, bio, phone } = user;
    res.status(200).json({
      _id,
      name,
      email,
      role,
      isVerified,
      image,
      bio,
      phone,
    });
  } else {
    res.status(404);
    throw new Error("user not found");
  }
});
// // update user
// const updateUser = asyncHandler(async (req, res) => {
//   const user = await User.findById(req.user._id);
//   console.log(user);
//   if (user) {
//     const { name, phone, image, bio } = user;
//     user.name = req.body.name || name;
//     user.phone = req.body.phone || phone;
//     user.image = req.body.image;
//     user.bio = req.body.bio || bio;
//     const updateUser = await user.save();
//     res.status(201).json({
//       name: updateUser.name,
//       phone: updateUser.phone,
//       image: updateUser.image,
//       bio: updateUser.bio,
//     });
//   } else {
//     res.status(404);
//     throw new Error("user not found");
//   }
// });

//upload the image from backend

const updateUser = asyncHandler(async (req, res) => {
  // console.log(user);
  const { name, phone, bio } = req.body;

  if (!name) {
    res.status(400);
    throw new Error("please fill the name first");
  }

  let profileImageLocatPath;

  if (
    req.files &&
    Array.isArray(req.files.profileImage) &&
    req.files.profileImage.length > 0
  ) {
    profileImageLocatPath = req.files.profileImage[0].path;
  }

  const user = await User.findById(req.user._id);

  if (user) {
    let profileImageUrl = "";
    // console.log(profileImageLocatPath);

    if (profileImageLocatPath) {
      const profileImage = await uploadOnCloudinary(profileImageLocatPath);
      // console.log(profileImage);
      profileImageUrl = profileImage?.url || "";
      if (profileImageUrl) {
        res.send("image upload");
      }
    }

    user.name = name;
    user.phone = phone || phone;
    user.image = profileImageUrl;
    user.bio = bio || bio;
    const updateUser = await user.save();
    res.status(201).json({
      name: updateUser.name,
      phone: updateUser.phone,
      image: updateUser.image,
      bio: updateUser.bio,
    });
  } else {
    res.status(404);
    throw new Error("user not found");
  }
});

// delete user
const deleteUser = asyncHandler(async (req, res) => {
  const user = User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error("user not found");
  }

  await User.deleteOne({ _id: req.params.id });
  res.status(200).json({
    message: "user delete",
  });
});
// get users
const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find().sort("-createdAt").select("-password");
  if (!users) {
    res.status(500);
    throw new Error("something went wrong");
  }

  res.status(200).json(users);
});
//login status
const loginStatus = asyncHandler(async (req, res) => {
  const token = req.cookies.token;
  if (!token) {
    return res.json(false);
  }

  const verified = jwt.verify(token, process.env.JWT_SECRET);
  if (verified) {
    return res.json(true);
  }
  return res.json(false);
});
// change role
const upgradeRole = asyncHandler(async (req, res) => {
  const { id, role } = req.body;
  const user = await User.findById(id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  user.role = role;
  await user.save();
  res.status(200).json({
    message: `User role is upgraded to ${role}`,
  });
});
// send auto email
// const sendAutomatedEmail = asyncHandler(async (req, res) => {
//   const { subject, send_to, url } = req.body;

//   if (!subject || !send_to) {
//     res.status(500);
//     throw new Error("missing the eamil parameter");
//   }

//   const user = await User.findOne({ email: send_to });

//   if (!user) {
//     res.status(404);
//     throw new Error("user not found");
//   }

//   const sent_from = process.env.EMAIL_USER;
//   const reply_to = "noreply@noreply.com";
//   const template = "autoEmail";
//   const name = user.name;
//   const link = `${process.env.FRONTEND_URL}${url}`;
//   const p1 = `${
//     (subject === "Password Changed -" &&
//       "This it to notify that your account password has changed") ||
//     (subject === "Account Status -" &&
//       "Your account status has been changed by admin")
//   }`;
//   const p2 = "Visit your account to check";
//   const btn_text = `${
//     (url === "/forgotPassword" && "Reset password") ||
//     (url === "/login" && "Login")
//   }`;

//   try {
//     await sendEmail(
//       subject,
//       send_to,
//       sent_from,
//       reply_to,
//       template,
//       p1,
//       p2,
//       btn_text,
//       {
//         name,
//         link,
//       }
//     );
//     res.status(200).json({
//       message: "Email sent",
//     });
//   } catch (error) {
//     console.log(error);
//     res.status(500);
//     throw new Error("Email not sent, please try again");
//   }
// });

const sendAutomatedEmail = asyncHandler(async (req, res) => {
  const { subject, send_to, url } = req.body;

  if (!subject || !send_to) {
    res.status(400);
    throw new Error("Missing the email parameter.");
  }

  const user = await User.findOne({ email: send_to });

  if (!user) {
    res.status(404);
    throw new Error("User not found.");
  }

  const sent_from = process.env.EMAIL_USER;
  const reply_to = "noreply@noreply.com";
  const name = user.name;
  const link = `${process.env.FRONTEND_URL}${url}`;

  let p1 = "";
  let btn_text = "";

  if (subject.includes("Password Changed")) {
    p1 = "This is to notify that your account password has changed.";
    btn_text = "Reset Password";
  } else if (subject.includes("Account Status")) {
    p1 = "Your account status has been changed by admin.";
    btn_text = "Login";
  } else {
    p1 = "Please check the details by clicking the button below.";
    btn_text = "Visit your account";
  }

  const p2 = "Visit your account to check.";

  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      name,
      link,
      p1,
      p2,
      btn_text
    );
    res.status(200).json({ message: "Email sent successfully." });
  } catch (error) {
    console.log(error);
    res.status(500);
    throw new Error("Email not sent, please try again.");
  }
});

// send reset password email
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  let token = await Token.findOne({ userId: user._id });
  if (token) {
    await token.deleteOne();
  }
  // generate reset password token
  const resetToken = crypto.randomBytes(32).toString("hex") + user._id;
  console.log(resetToken);

  // hash token
  const hashedToken = hashToken(resetToken);
  await new Token({
    userId: user._id,
    rToken: hashedToken,
    createdAt: Date.now(),
    expireAt: Date.now() + 60 * (60 * 1000),
  }).save();

  // reset password Url
  const resetPasswordUrl = `${process.env.FRONTEND_URL}/resetPassword/${resetToken}`;

  const subject = "Reset Password Request";
  const send_to = user.email;
  const sent_from = process.env.EMAIL_USER;
  const reply_to = "qasim@gmail.com";
  const template = "forgotPassword";
  const name = user.name;
  const link = resetPasswordUrl;
  const p1 = "This it to notify that your account password has changed";
  const p2 =
    "if you did not initiate this, kindly reset your password immediately with in 1 hour";
  const btn_text = "Reset Password";

  // send email
  try {
    await sendEmail(
      subject,
      send_to,
      sent_from,
      reply_to,
      template,
      p1,
      p2,
      btn_text,
      {
        name,
        link,
      }
    );
    res.status(200).json({
      message: "Reset Password Email sent",
    });
  } catch (error) {
    console.log(error);
    res.status(500);
    throw new Error("Email not sent, please try again");
  }
});

// reset password
const resetPassword = asyncHandler(async (req, res) => {
  const { resetToken } = req.params;
  const { password } = req.body;
  console.log("reset token:", resetToken);

  const hashedToken = hashToken(resetToken);
  const userToken = await Token.findOne({
    rToken: hashedToken,
    expireAt: { $gt: Date.now() },
  });
  console.log(userToken);
  if (!userToken) {
    res.status(404);
    throw new Error("Invalid or expire token");
  }

  const user = await User.findOne({
    _id: userToken.userId,
  });

  user.password = password;
  await user.save();

  res.status(200).json({
    message: "your password has been changed",
  });
});

// change password
const changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, password } = req.body;

  const user = await User.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }
  if (!oldPassword || !password) {
    res.status(400);
    throw new Error("please enter the old and new password");
  }

  const isPasswordCorrect = await bcrypt.compare(oldPassword, user.password);

  if (user && isPasswordCorrect) {
    user.password = password;
    await user.save();

    res.status(200).json({
      message: "your password has been changed, please re-login",
    });

    // send confirmation email
    const subject = "Password has been changed! ";
    const send_to = user.email;
    const sent_from = process.env.EMAIL_USER;
    const reply_to = "qasim@gmail.com";
    const template = "changePassword";
    const name = user.name;
    const link = "/";

    // send email
    try {
      await sendEmail(subject, send_to, sent_from, reply_to, template, {
        name,
        link,
      });
      res.status(200).json({
        message: "change Password Email sent",
      });
    } catch (error) {
      console.log(error);
      res.status(500);
      throw new Error("Email not sent, please try again");
    }
  } else {
    res.status(400).json({
      message: "old password is incorrect, please try again",
    });
  }
});

// login with google
const loginWithGoogle = asyncHandler(async (req, res) => {
  const { userToken } = req.body;

  // Verify the Google ID token
  const ticket = await client.verifyIdToken({
    idToken: userToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();
  const { email, name, sub, picture, email_verified } = payload;
  const password = Date.now() + sub; // Unique password for the user

  let user = await User.findOne({ email });

  if (!user) {
    try {
      const ua = parser(req.headers["user-agent"]);
      const userAgent = [ua.ua];

      // Create a new user if one does not exist
      user = await User.create({
        name,
        email,
        password,
        image: picture,
        isVerified: email_verified,
        userAgent,
      });

      // Generate token
      const token = generateToken(user._id);

      // Send HTTP-only cookie
      res.cookie("token", token, {
        path: "/",
        httpOnly: true,
        expires: new Date(Date.now() + 6000 * 86400), // Consider revising this duration if needed
        sameSite: "none",
        secure: true,
      });

      // Return the newly created user
      const { _id, role, phone, bio } = user;
      return res.status(201).json({
        _id,
        name,
        email,
        password, // Consider removing password from the response for security reasons
        role,
        isVerified: email_verified,
        phone,
        bio,
        image: picture,
        token,
      });
    } catch (error) {
      // Handle error during user creation
      return res
        .status(400)
        .json({ message: "Error creating user", error: error.message });
    }
  }

  // If the user already exists
  const token = generateToken(user._id);

  // Send HTTP-only cookie
  res.cookie("token", token, {
    path: "/",
    httpOnly: true,
    expires: new Date(Date.now() + 6000 * 86400),
    sameSite: "none",
    secure: true,
  });

  // Return existing user data
  const { _id, role, phone, bio } = user;
  return res.status(200).json({
    _id,
    name,
    email,
    password, // Consider removing password from the response for security reasons
    role,
    isVerified: user.isVerified,
    phone,
    bio,
    image: user.image,
    token,
  });
});
// complete the project
module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getUser,
  updateUser,
  deleteUser,
  getUsers,
  loginStatus,
  upgradeRole,
  sendAutomatedEmail,
  sendVerificationEmail,
  verifyUser,
  forgotPassword,
  resetPassword,
  changePassword,
  sendLoginCode,
  loginWithGoogle,
  loginWithCode,
};
