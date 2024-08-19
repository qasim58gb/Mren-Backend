const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const userRouter = require("./Router/userRouter");
const errorHandler = require("./Middleware/errorMiddleware");
const cookieParser = require("cookie-parser");
const cors = require("cors");
require("dotenv").config();
const User = require("./Model/userModel");
const Token = require("./Model/tokenModel");
const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(cookieParser());

app.use(
  cors({
    origin: ["http://localhost:3000", "http://localhost:3000"],
    credentials: true,
  })
);
app.get("/", (req, res) => {
  res.send("app is runing");
});

const PORT = process.env.PORT || 5000;
async function insert() {
  await User.create({
    name: "qasim",
    email: "qasim@gmail.com",
    password: "12345678",
  });
}

//Routes

app.use("/api/users", userRouter);

// insert();

app.use(errorHandler);

mongoose
  .connect(process.env.MONGO_URI, {
    // useNewUrlParser: true,
    // useUnifiedTopology: true,
  })
  .then(() => {
    app.listen(PORT, () => {
      console.log(`App is runing on ${PORT}`);
    });
  })
  .catch((err) => {
    console.log(err);
  });
