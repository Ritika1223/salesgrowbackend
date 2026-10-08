const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev-only-change-JWT_SECRET";

exports.Validate = async (
  req,
  res,
  next
) => {
  try {

    const authHeader =
      req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message:
          "Token not provided",
      });
    }

    // remove Bearer
    const token =
      authHeader.startsWith(
        "Bearer "
      )
        ? authHeader.split(" ")[1]
        : authHeader;

    jwt.verify(
      token,
      JWT_SECRET,
      async function (
        err,
        decodedToken
      ) {

        if (err) {

          console.log(err);

          return res
            .status(403)
            .json({
              success: false,
              message:
                "TOKEN IS INVALID",
            });
        }

        req.user =
          decodedToken;

        if (
          decodedToken.name !==
          "USER"
        ) {
          return res
            .status(403)
            .json({
              message:
                "Access denied",
            });
        }

        try {
          const uid = decodedToken.sub || decodedToken.id;
          if (uid) {
            const account = await User.findById(uid).select("isDisabled");
            if (!account) {
              return res.status(401).json({
                success: false,
                message: "User not found",
              });
            }
            if (account.isDisabled) {
              return res.status(403).json({
                success: false,
                message: "Your account is inactive. Please contact admin.",
              });
            }
          }
        } catch (lookupErr) {
          console.log(lookupErr);
          return res.status(500).json({
            success: false,
            message: "Server Error",
          });
        }

        next();
      }
    );

  } catch (error) {

    console.log(error);

    return res.status(500).json({
      success: false,
      message:
        "Server Error",
    });

  }
};